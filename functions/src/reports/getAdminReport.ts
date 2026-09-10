/* eslint-disable max-len */
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {claimStoreIds, hasRole, requireAnyRole} from "../auth/roles.js";

const MAX_RANGE_MS = 94 * 86400000;
const MAX_SALES = 1000;
const LOCAL_DATE = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"});

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

export const getAdminReport = onCall({region: "southamerica-east1"}, async (request) => {
  requireAnyRole(request, ["reports", "inventory"]);
  const data = request.data as Record<string, unknown> | null;
  const fromMs = milliseconds(data?.fromMs);
  const untilMs = milliseconds(data?.untilMs);
  if (untilMs <= fromMs || untilMs - fromMs > MAX_RANGE_MS) throw new HttpsError("invalid-argument", "Selecione um período de até 93 dias.");
  const includeStock = data?.includeStock === true;
  const admin = hasRole(request, "admin");
  const storeIds = claimStoreIds(request);
  if (!admin && (storeIds.length === 0 || storeIds.length > 30)) throw new HttpsError("permission-denied", "Nenhuma loja foi atribuída a este usuário.");
  let salesQuery = firestore.collection("sales").where("createdAt", ">=", Timestamp.fromMillis(fromMs)).where("createdAt", "<", Timestamp.fromMillis(untilMs));
  if (!admin) {
    salesQuery = salesQuery.where("storeId", "in", storeIds);
  }
  const salesSnapshot = await salesQuery.orderBy("createdAt", "desc").limit(MAX_SALES + 1).get();
  if (salesSnapshot.size > MAX_SALES) throw new HttpsError("resource-exhausted", "Reduza o período para obter um relatório completo.");
  const sales = salesSnapshot.docs.map((doc) => doc.data());
  const now = Date.now();
  const paid = sales.filter((sale) => sale.status === "PAID" && sale.paymentStatus === "APPROVED" && sale.paymentReconciliationRequired !== true);
  const days = new Map<string, {day: string; count: number; total: number}>();
  const products = new Map<string, {id: string; name: string; quantity: number; total: number}>();
  let revenue = 0;
  let units = 0;
  for (const sale of paid) {
    const refundedCents = Number(sale.partialRefundedCents ?? 0);
    const netTotal = Math.max(0, Number(sale.totalCents ?? 0) - (Number.isSafeInteger(refundedCents) ? refundedCents : 0));
    revenue += netTotal;
    if (sale.createdAt instanceof Timestamp) {
      const day = dayKey(sale.createdAt);
      const entry = days.get(day) ?? {day, count: 0, total: 0};
      entry.count++;
      entry.total += netTotal;
      days.set(day, entry);
    }
    if (Array.isArray(sale.items)) {
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
  const report = {
    total: sales.length, paid: paid.length, revenue, units,
    average: paid.length ? revenue / paid.length : 0,
    pending: sales.filter((sale) => situation(sale, now) === "pending").length,
    expired: sales.filter((sale) => situation(sale, now) === "expired").length,
    review: sales.filter((sale) => situation(sale, now) === "review").length,
    stockReview: sales.filter((sale) => sale.stockReconciliationRequired === true).length,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
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
