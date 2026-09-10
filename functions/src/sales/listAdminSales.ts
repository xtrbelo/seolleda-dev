/* eslint-disable max-len */
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {claimStoreIds, hasRole, requireAnyRole} from "../auth/roles.js";

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
  if (cursor !== undefined && (typeof cursorId !== "string" || !cursorId ||
      cursorId.length > 128 || cursorId.includes("/") ||
      typeof cursorMs !== "number" || !Number.isSafeInteger(cursorMs) ||
      cursorMs <= 0)) throw new HttpsError("invalid-argument", "Cursor inválido.");
  const admin = hasRole(request, "admin");
  const storeIds = claimStoreIds(request);
  let query = firestore.collection("sales").where("createdAt", ">=", Timestamp.fromMillis(fromMs)).where("createdAt", "<", Timestamp.fromMillis(untilMs));
  if (!admin) {
    if (storeIds.length === 0 || storeIds.length > 30) throw new HttpsError("permission-denied", "Nenhuma loja foi atribuída a este usuário.");
    query = query.where("storeId", "in", storeIds);
  }
  query = query.orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc").limit(PAGE_SIZE);
  if (typeof cursorMs === "number" && typeof cursorId === "string") {
    query = query.startAfter(Timestamp.fromMillis(cursorMs), cursorId);
  }
  const snapshot = await query.get();
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
      partialRefundedCents: Number(sale.partialRefundedCents ?? 0),
      partialReturnPendingCount: Number(sale.partialReturnPendingCount ?? 0),
      paymentReviewReason: typeof sale.paymentReviewReason === "string" ? sale.paymentReviewReason : undefined,
      ...(admin ? {
        reservationStatus: typeof sale.reservationStatus === "string" ? sale.reservationStatus : "",
        ...(sale.stockResolution ? {stockResolution: {
          action: String(sale.stockResolution.action ?? ""),
          reason: String(sale.stockResolution.reason ?? ""),
          userId: String(sale.stockResolution.userId ?? ""),
          resolvedAtMs: Number(sale.stockResolution.resolvedAtMs ?? 0),
        }} : {}),
        ...(sale.reservationReconciliation ? {reservationReconciliation: {
          reason: String(sale.reservationReconciliation.reason ?? ""),
          userId: String(sale.reservationReconciliation.userId ?? ""),
          resolvedAtMs: Number(sale.reservationReconciliation.resolvedAtMs ?? 0),
          items: Array.isArray(sale.reservationReconciliation.items) ?
            sale.reservationReconciliation.items.map((item: unknown) => {
              const value = item && typeof item === "object" ?
                item as Record<string, unknown> : {};
              return {
                productId: String(value.productId ?? ""),
                name: String(value.name ?? ""),
                currentReserved: Number(value.currentReserved ?? 0),
                expectedReserved: Number(value.expectedReserved ?? 0),
                adjustment: Number(value.adjustment ?? 0),
              };
            }) : [],
        }} : {}),
        mercadoPagoPaymentStatus: sale.mercadoPagoPaymentStatus ?? "",
        paymentOperationState: sale.paymentOperationState ?? "",
        paymentOperationAction: sale.paymentOperationAction ?? "",
        paymentOperationReason: sale.paymentOperationReason ?? "",
        partialRefunds: Array.isArray(sale.partialRefunds) ? sale.partialRefunds.slice(0, 20).map((refund: unknown) => {
          const value = refund && typeof refund === "object" ? refund as Record<string, unknown> : {};
          return {
            id: String(value.id ?? ""), amountCents: Number(value.amountCents ?? 0),
            expectedRefundedCents: Number(value.expectedRefundedCents ?? 0),
            reason: String(value.reason ?? ""), userId: String(value.userId ?? ""),
            requestedAtMs: Number(value.requestedAtMs ?? 0), confirmedAtMs: Number(value.confirmedAtMs ?? 0),
            state: String(value.state ?? ""), stockState: String(value.stockState ?? ""),
            stockReason: String(value.stockReason ?? ""), stockUserId: String(value.stockUserId ?? ""),
            stockResolvedAtMs: Number(value.stockResolvedAtMs ?? 0),
            items: Array.isArray(value.items) ? value.items.map((item: unknown) => {
              const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return {productId: String(data.productId ?? ""), name: String(data.name ?? ""), sku: String(data.sku ?? ""),
                quantity: Number(data.quantity ?? 0), unitPriceCents: Number(data.unitPriceCents ?? 0), totalCents: Number(data.totalCents ?? 0)};
            }) : [],
            returnedItems: Array.isArray(value.returnedItems) ? value.returnedItems.map((item: unknown) => {
              const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return {productId: String(data.productId ?? ""), quantity: Number(data.quantity ?? 0)};
            }) : [],
          };
        }) : [],
      } : {}),
      items: Array.isArray(sale.items) ? sale.items.map((item) => ({productId: String(item.productId ?? ""), name: String(item.name ?? ""), sku: String(item.sku ?? ""), quantity: Number(item.quantity ?? 0), unitPriceCents: Number(item.unitPriceCents ?? 0), totalCents: Number(item.totalCents ?? 0)})) : [],
    };
  });
  const last = sales[sales.length - 1];
  return {sales, hasMore: snapshot.size === PAGE_SIZE, cursor: last ? {createdAtMs: last.createdAtMs, id: last.id} : undefined};
});
