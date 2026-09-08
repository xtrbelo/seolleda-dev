/* eslint-disable max-len */
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {hasRole, requireAnyRole} from "../auth/roles.js";

const MAX_RANGE_MS = 94 * 86400000;
const PAGE_SIZE = 100;

/** Validates a positive millisecond timestamp.
 * @param {unknown} value Candidate timestamp.
 * @return {number} Valid timestamp.
 */
function milliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new HttpsError("invalid-argument", "Período inválido.");
  return value;
}

export const listAdminSales = onCall({region: "southamerica-east1"}, async (request) => {
  requireAnyRole(request, ["sales", "reports"]);
  const data = request.data as Record<string, unknown> | null;
  const fromMs = milliseconds(data?.fromMs);
  const untilMs = milliseconds(data?.untilMs);
  if (untilMs <= fromMs || untilMs - fromMs > MAX_RANGE_MS) throw new HttpsError("invalid-argument", "Selecione um período de até 93 dias.");
  const cursor = data?.cursor;
  const cursorMs = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>).createdAtMs : undefined;
  const cursorId = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>).id : undefined;
  if (cursor !== undefined && (typeof cursorId !== "string" || !cursorId || typeof cursorMs !== "number")) throw new HttpsError("invalid-argument", "Cursor inválido.");
  let query = firestore.collection("sales").where("createdAt", ">=", Timestamp.fromMillis(fromMs)).where("createdAt", "<", Timestamp.fromMillis(untilMs)).orderBy("createdAt", "desc").limit(PAGE_SIZE);
  if (typeof cursorMs === "number" && typeof cursorId === "string") query = query.startAfter(Timestamp.fromMillis(cursorMs));
  const snapshot = await query.get();
  const admin = hasRole(request, "admin");
  const sales = snapshot.docs.map((doc) => {
    const sale = doc.data();
    return {
      id: doc.id, status: String(sale.status ?? ""),
      paymentStatus: typeof sale.paymentStatus === "string" ? sale.paymentStatus : undefined,
      paymentMethod: typeof sale.paymentMethod === "string" ? sale.paymentMethod : undefined,
      ...(admin && typeof sale.mercadoPagoPaymentId === "string" ? {mercadoPagoPaymentId: sale.mercadoPagoPaymentId} : {}),
      storeId: String(sale.storeId ?? ""), terminalId: String(sale.terminalId ?? ""), totalCents: Number(sale.totalCents ?? 0),
      createdAtMs: sale.createdAt instanceof Timestamp ? sale.createdAt.toMillis() : 0,
      paidAtMs: sale.paidAt instanceof Timestamp ? sale.paidAt.toMillis() : undefined,
      expiresAtMs: sale.expiresAt instanceof Timestamp ? sale.expiresAt.toMillis() : undefined,
      paymentReconciliationRequired: sale.paymentReconciliationRequired === true,
      stockReconciliationRequired: sale.stockReconciliationRequired === true,
      paymentReviewReason: typeof sale.paymentReviewReason === "string" ? sale.paymentReviewReason : undefined,
      items: Array.isArray(sale.items) ? sale.items.map((item) => ({productId: String(item.productId ?? ""), name: String(item.name ?? ""), sku: String(item.sku ?? ""), quantity: Number(item.quantity ?? 0), unitPriceCents: Number(item.unitPriceCents ?? 0), totalCents: Number(item.totalCents ?? 0)})) : [],
    };
  });
  const last = sales[sales.length - 1];
  return {sales, hasMore: snapshot.size === PAGE_SIZE, cursor: last ? {createdAtMs: last.createdAtMs, id: last.id} : undefined};
});
