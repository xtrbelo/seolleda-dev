/* eslint-disable max-len */
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {claimStoreIds, hasRole, requireAnyRole} from "../auth/roles.js";

const MAX_RANGE_MS = 94 * 86400000;
const MAX_SALES = 1000;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const LOCAL_DATE = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"});
type PaymentMethod = "PIX" | "CARD" | "UNKNOWN";
type Amounts = {gross: number; refunded: number; disputed: number; net: number};
type Counts = {paid: number; cancelled: number; refunded: number; chargedBack: number};
type Breakdown = {amounts: Amounts; counts: Counts};
type ReportRow = Breakdown & {day: string; storeId: string; paymentMethod: PaymentMethod};

/** Validate a positive millisecond timestamp.
 * @param {unknown} value Candidate timestamp.
 * @return {number} Valid timestamp.
 */
function milliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new HttpsError("invalid-argument", "Período inválido.");
  return value;
}

/** Return the local calendar date for a payment timestamp.
 * @param {Timestamp} value Firestore timestamp.
 * @return {string} Calendar date.
 */
function dayKey(value: Timestamp): string {
  return LOCAL_DATE.format(value.toDate());
}

/** Return the user-facing situation for a sale.
 * @param {Record<string, unknown>} sale Sale data.
 * @param {number} now Current time.
 * @return {string} Situation label.
 */
function situation(sale: Record<string, unknown>, now: number): string {
  if (sale.status === "PAYMENT_REVIEW_REQUIRED" || sale.paymentReconciliationRequired === true) return "review";
  if (sale.status === "PAID") return "paid";
  if (sale.status === "PENDING_PAYMENT") return sale.expiresAt instanceof Timestamp && sale.expiresAt.toMillis() <= now ? "expired" : "pending";
  return sale.status === "EXPIRED" ? "expired" : "other";
}

/** Normalize the persisted payment method for filters and breakdowns.
 * @param {unknown} value Persisted payment method.
 * @return {PaymentMethod} Known report method.
 */
function paymentMethod(value: unknown): PaymentMethod {
  return value === "PIX" || value === "CARD" ? value : "UNKNOWN";
}

/** Create an empty financial accumulator.
 * @return {Breakdown} Empty accumulator.
 */
function emptyBreakdown(): Breakdown {
  return {amounts: {gross: 0, refunded: 0, disputed: 0, net: 0}, counts: {paid: 0, cancelled: 0, refunded: 0, chargedBack: 0}};
}

/** Return confirmed amounts for one sale. Review-only payments never contribute.
 * @param {Record<string, unknown>} sale Sale data.
 * @return {Amounts} Confirmed amounts in cents.
 */
function saleAmounts(sale: Record<string, unknown>): Amounts {
  const empty = {gross: 0, refunded: 0, disputed: 0, net: 0};
  if (sale.paymentReconciliationRequired === true || sale.status === "PAYMENT_REVIEW_REQUIRED") return empty;
  const total = Number(sale.totalCents ?? 0);
  if (!Number.isSafeInteger(total) || total <= 0) return empty;
  const partial = Number(sale.partialRefundedCents ?? 0);
  const partialRefunded = Number.isSafeInteger(partial) && partial > 0 ? Math.min(partial, total) : 0;
  if (sale.status === "PAID" && sale.paymentStatus === "APPROVED") {
    return {gross: total, refunded: partialRefunded, disputed: 0, net: total - partialRefunded};
  }
  const wasConfirmed = sale.paidAt instanceof Timestamp || sale.reservationStatus === "CONSUMED";
  if (!wasConfirmed) return empty;
  if (sale.status === "REFUNDED") return {gross: total, refunded: total, disputed: 0, net: 0};
  if (sale.status === "CHARGED_BACK") {
    const disputed = total - partialRefunded;
    return {gross: total, refunded: partialRefunded, disputed, net: 0};
  }
  return empty;
}

/** Add one sale to a financial accumulator.
 * @param {Breakdown} target Mutable accumulator.
 * @param {Record<string, unknown>} sale Sale data.
 */
function addSale(target: Breakdown, sale: Record<string, unknown>): void {
  const amounts = saleAmounts(sale);
  target.amounts.gross += amounts.gross;
  target.amounts.refunded += amounts.refunded;
  target.amounts.disputed += amounts.disputed;
  target.amounts.net += amounts.net;
  if (sale.status === "PAID") target.counts.paid++;
  else if (sale.status === "CANCELLED") target.counts.cancelled++;
  else if (sale.status === "REFUNDED") target.counts.refunded++;
  else if (sale.status === "CHARGED_BACK") target.counts.chargedBack++;
}

export const getAdminReport = onCall({region: "southamerica-east1"}, async (request) => {
  requireAnyRole(request, ["reports", "inventory"]);
  const data = request.data as Record<string, unknown> | null;
  const fromMs = milliseconds(data?.fromMs);
  const untilMs = milliseconds(data?.untilMs);
  if (untilMs <= fromMs || untilMs - fromMs > MAX_RANGE_MS) throw new HttpsError("invalid-argument", "Selecione um período de até 93 dias.");
  const includeStock = data?.includeStock === true;
  const selectedStore = data?.storeId;
  if (selectedStore !== undefined && (typeof selectedStore !== "string" || !ID.test(selectedStore))) throw new HttpsError("invalid-argument", "Loja inválida.");
  const selectedMethod = data?.paymentMethod;
  if (selectedMethod !== undefined && selectedMethod !== "PIX" && selectedMethod !== "CARD") throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  const admin = hasRole(request, "admin");
  const storeIds = claimStoreIds(request);
  if (!admin && (storeIds.length === 0 || storeIds.length > 30)) throw new HttpsError("permission-denied", "Nenhuma loja foi atribuída a este usuário.");
  if (!admin && typeof selectedStore === "string" && !storeIds.includes(selectedStore)) throw new HttpsError("permission-denied", "Você não tem acesso a esta loja.");
  let salesQuery = firestore.collection("sales").where("createdAt", ">=", Timestamp.fromMillis(fromMs)).where("createdAt", "<", Timestamp.fromMillis(untilMs));
  if (!admin) salesQuery = salesQuery.where("storeId", "in", storeIds);
  const salesSnapshot = await salesQuery.orderBy("createdAt", "desc").limit(MAX_SALES + 1).get();
  if (salesSnapshot.size > MAX_SALES) throw new HttpsError("resource-exhausted", "Reduza o período para obter um relatório completo.");
  const allSales = salesSnapshot.docs.map((doc) => doc.data());
  const availableStores = [...new Set(allSales.map((sale) => String(sale.storeId ?? "")).filter((value) => ID.test(value)))].sort();
  const sales = allSales.filter((sale) =>
    (selectedStore === undefined || sale.storeId === selectedStore) &&
    (selectedMethod === undefined || paymentMethod(sale.paymentMethod) === selectedMethod));
  const now = Date.now();
  const summary = emptyBreakdown();
  const rows = new Map<string, ReportRow>();
  const days = new Map<string, Breakdown & {day: string}>();
  const stores = new Map<string, Breakdown & {storeId: string}>();
  const methods = new Map<PaymentMethod, Breakdown & {paymentMethod: PaymentMethod}>();
  const products = new Map<string, {id: string; name: string; quantity: number; total: number}>();
  let units = 0;
  for (const sale of sales) {
    addSale(summary, sale);
    if (sale.createdAt instanceof Timestamp) {
      const day = dayKey(sale.createdAt);
      const storeId = String(sale.storeId ?? "");
      const method = paymentMethod(sale.paymentMethod);
      const dayEntry = days.get(day) ?? {...emptyBreakdown(), day};
      const storeEntry = stores.get(storeId) ?? {...emptyBreakdown(), storeId};
      const methodEntry = methods.get(method) ?? {...emptyBreakdown(), paymentMethod: method};
      const rowKey = `${day}\u0000${storeId}\u0000${method}`;
      const row = rows.get(rowKey) ?? {...emptyBreakdown(), day, storeId, paymentMethod: method};
      addSale(dayEntry, sale); addSale(storeEntry, sale); addSale(methodEntry, sale); addSale(row, sale);
      days.set(day, dayEntry); stores.set(storeId, storeEntry); methods.set(method, methodEntry); rows.set(rowKey, row);
    }
    if (sale.status === "PAID" && sale.paymentStatus === "APPROVED" && sale.paymentReconciliationRequired !== true && Array.isArray(sale.items)) {
      for (const rawItem of sale.items) {
        const item = rawItem as Record<string, unknown>;
        const id = String(item.productId ?? "");
        const product = products.get(id) ?? {id, name: String(item.name ?? ""), quantity: 0, total: 0};
        const refundedQuantity = Array.isArray(sale.partialRefunds) ? sale.partialRefunds.reduce((sum: number, rawRefund: unknown) => {
          const refund = rawRefund && typeof rawRefund === "object" ? rawRefund as Record<string, unknown> : {};
          if (refund.state !== "CONFIRMED" || !Array.isArray(refund.items)) return sum;
          const refundedItem = refund.items.find((raw: unknown) => raw && typeof raw === "object" &&
            String((raw as Record<string, unknown>).productId ?? "") === id) as Record<string, unknown> | undefined;
          return sum + Number(refundedItem?.quantity ?? 0);
        }, 0) : 0;
        const netQuantity = Math.max(0, Number(item.quantity ?? 0) - refundedQuantity);
        product.quantity += netQuantity;
        product.total += netQuantity * Number(item.unitPriceCents ?? 0);
        products.set(id, product);
        units += netQuantity;
      }
    }
  }
  const paid = summary.counts.paid;
  const report = {
    total: sales.length, paid, revenue: summary.amounts.net, units,
    average: paid ? summary.amounts.net / paid : 0,
    pending: sales.filter((sale) => situation(sale, now) === "pending").length,
    expired: sales.filter((sale) => situation(sale, now) === "expired").length,
    review: sales.filter((sale) => situation(sale, now) === "review").length,
    stockReview: sales.filter((sale) => sale.stockReconciliationRequired === true).length,
    amounts: summary.amounts, counts: summary.counts, availableStores,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    stores: [...stores.values()].sort((a, b) => a.storeId.localeCompare(b.storeId)),
    methods: [...methods.values()].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod)),
    rows: [...rows.values()].sort((a, b) => a.day.localeCompare(b.day) || a.storeId.localeCompare(b.storeId) || a.paymentMethod.localeCompare(b.paymentMethod)),
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
  };
  if (!includeStock) return {report};
  const [productSnapshot, inventorySnapshot] = await Promise.all([
    firestore.collection("products").where("active", "==", true).get(),
    admin ? firestore.collection("inventory").get() : firestore.collection("inventory").where("storeId", "in", storeIds).get(),
  ]);
  const inventory = inventorySnapshot.docs.map((doc) => doc.data());
  return {report, stock: {
    products: productSnapshot.size,
    quantity: inventory.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    low: inventory.filter((item) => Number(item.quantity ?? 0) > 0 && Number(item.quantity ?? 0) <= Number(item.minimumQuantity ?? 0)).length,
    empty: inventory.filter((item) => Number(item.quantity ?? 0) === 0).length,
    negative: inventory.filter((item) => Number(item.quantity ?? 0) < 0).length,
  }};
});
