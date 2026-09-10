/* eslint-disable max-len */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireRole, requireStoreAccess} from "../auth/roles.js";
import {firestore} from "../lib/firebaseAdmin.js";
import {partialRefunds, type PartialRefund} from "../payments/partialRefund.js";
import type {SaleItemSnapshot} from "../types/sale.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ReturnItem = {productId: string; quantity: number};

/** Validate a requested partial physical return.
 * @param {unknown} rawItems Untrusted return selection.
 * @param {PartialRefund} refund Confirmed provider refund.
 * @return {ReturnItem[]} Valid positive quantities.
 */
function returnItems(rawItems: unknown, refund: PartialRefund): ReturnItem[] {
  if (!Array.isArray(rawItems) || rawItems.length > refund.items.length) throw new HttpsError("invalid-argument", "Informe quantidades de devolução válidas.");
  const values = rawItems.map((raw) => raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
  if (values.some((item) => typeof item.productId !== "string" || !ID.test(item.productId) ||
      !Number.isSafeInteger(item.quantity) || Number(item.quantity) <= 0) ||
      new Set(values.map((item) => item.productId)).size !== values.length) {
    throw new HttpsError("invalid-argument", "Informe quantidades de devolução válidas, sem produtos repetidos.");
  }
  return values.map((item) => {
    const original = refund.items.find((candidate) => candidate.productId === item.productId);
    const quantity = Number(item.quantity);
    if (!original || quantity > original.quantity) throw new HttpsError("failed-precondition", "A devolução excede os itens deste reembolso.");
    return {productId: original.productId, quantity};
  });
}

/** Resolve the stock effect of one confirmed partial refund.
 * @param {object} params Validated operation parameters.
 * @return {Promise<object>} Persisted resolution.
 */
async function resolvePartial(params: {
  saleId: string; refundId: string; rawItems: unknown; reason: string;
  userId: string; userEmail: string; request: Parameters<typeof requireStoreAccess>[0];
}) {
  const saleRef = firestore.collection("sales").doc(params.saleId);
  const resolutionRef = firestore.collection("saleStockResolutions").doc(`partial_${params.saleId}_${params.refundId}`);
  const operationRef = firestore.collection("paymentOperations").doc(`partial_${params.refundId}`);
  return firestore.runTransaction(async (tx) => {
    const [saleSnapshot, resolutionSnapshot, operationSnapshot] = await tx.getAll(saleRef, resolutionRef, operationRef);
    if (!saleSnapshot.exists) throw new HttpsError("not-found", "Venda não encontrada.");
    const sale = saleSnapshot.data()!;
    requireStoreAccess(params.request, sale.storeId);
    const refunds = partialRefunds(sale);
    const refund = refunds.find((item) => item.id === params.refundId);
    if (!refund || refund.state !== "CONFIRMED") throw new HttpsError("failed-precondition", "O reembolso parcial ainda não foi confirmado.");
    const selected = returnItems(params.rawItems, refund);
    const payload = {action: "RESOLVE_PARTIAL", refundId: params.refundId, returnedItems: selected,
      reason: params.reason, userId: params.userId};
    if (resolutionSnapshot.exists) {
      const previous = resolutionSnapshot.data()!;
      const same = previous.reason === payload.reason && previous.userId === payload.userId &&
        JSON.stringify(previous.returnedItems ?? []) === JSON.stringify(payload.returnedItems);
      if (!same) throw new HttpsError("already-exists", "Esta devolução parcial já foi encerrada. Atualize a consulta.");
      return {resolution: {...payload, resolvedAtMs: previous.resolvedAt.toMillis()}};
    }
    if (refund.stockState !== "PENDING" || !operationSnapshot.exists || operationSnapshot.get("saleId") !== params.saleId ||
        operationSnapshot.get("state") !== "CONFIRMED" || sale.reservationStatus !== "CONSUMED" ||
        !["PAID", "REFUNDED"].includes(sale.status) || sale.paymentReconciliationRequired === true) {
      throw new HttpsError("failed-precondition", "A devolução parcial não possui uma pendência elegível.");
    }
    const saleItems = sale.items as SaleItemSnapshot[];
    if (typeof sale.storeId !== "string" || !ID.test(sale.storeId) || !Array.isArray(saleItems) || saleItems.length === 0 ||
        refund.items.some((item) => !item || typeof item.productId !== "string" || !ID.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0) ||
        refund.items.some((item) => !saleItems.some((saleItem) => saleItem.productId === item.productId))) {
      throw new HttpsError("failed-precondition", "Itens da devolução estão inconsistentes.");
    }
    const inventoryRefs = refund.items.map((item) => firestore.collection("inventory").doc(`${sale.storeId}_${item.productId}`));
    const movementRefs = refund.items.map((item) => firestore.collection("stockMovements").doc(`sale_${params.saleId}_${item.productId}`));
    const returnRefs = refund.items.map((item) => firestore.collection("stockMovements").doc(`partial_return_${params.saleId}_${params.refundId}_${item.productId}`));
    const snapshots = await tx.getAll(...inventoryRefs, ...movementRefs, ...returnRefs);
    const quantities = refund.items.map((item, index) => {
      const inventory = snapshots[index];
      const movement = snapshots[refund.items.length + index].data();
      const original = saleItems.find((saleItem) => saleItem.productId === item.productId)!;
      const returned = selected.find((value) => value.productId === item.productId)?.quantity ?? 0;
      if (!inventory.exists || snapshots[2 * refund.items.length + index].exists || !movement || movement.type !== "SALE" ||
          movement.storeId !== sale.storeId || movement.productId !== item.productId || movement.quantity !== original.quantity ||
          !Number.isSafeInteger(movement.previousQuantity) || !Number.isSafeInteger(movement.newQuantity) ||
          movement.previousQuantity - movement.newQuantity !== original.quantity) {
        throw new HttpsError("failed-precondition", "Não foi possível comprovar a baixa original ou a devolução já possui movimentação.");
      }
      const data = inventory.data()!;
      const current = data.quantity;
      const reserved = data.reservedQuantity ?? 0;
      const next = current + returned;
      if (data.storeId !== sale.storeId || data.productId !== item.productId || !Number.isSafeInteger(current) ||
          !Number.isSafeInteger(reserved) || reserved < 0 || !Number.isSafeInteger(next) || next < reserved) {
        throw new HttpsError("failed-precondition", "O saldo exige conferência no Estoque antes de encerrar esta devolução.");
      }
      return {current, next, returned};
    });
    const resolvedAt = Timestamp.now();
    refund.items.forEach((item, index) => {
      if (quantities[index].returned === 0) return;
      tx.update(inventoryRefs[index], {quantity: quantities[index].next, updatedAt: FieldValue.serverTimestamp()});
      tx.set(returnRefs[index], {
        storeId: sale.storeId, saleId: params.saleId, refundId: params.refundId, productId: item.productId,
        productName: item.name ?? "", productSku: item.sku ?? "", productBarcode: item.barcode ?? "",
        type: "REFUND", quantity: quantities[index].returned, previousQuantity: quantities[index].current,
        newQuantity: quantities[index].next, reason: params.reason, userId: params.userId,
        userEmail: params.userEmail, createdAt: resolvedAt,
      });
    });
    const resolvedRefund: PartialRefund = {...refund, stockState: "RESOLVED", returnedItems: selected,
      stockReason: params.reason, stockUserId: params.userId, stockResolvedAtMs: resolvedAt.toMillis()};
    const updatedRefunds = refunds.map((item) => item.id === refund.id ? resolvedRefund : item);
    const oldPending = Number(sale.partialReturnPendingCount ?? 0);
    const persistedPending = refunds.filter((item) => item.state === "CONFIRMED" && item.stockState === "PENDING").length;
    if (!Number.isSafeInteger(oldPending) || oldPending <= 0 || oldPending !== persistedPending) throw new HttpsError("failed-precondition", "O contador de devoluções pendentes está inconsistente.");
    const remaining = oldPending - 1;
    const allReturned = saleItems.every((item) => updatedRefunds.reduce((sum, partial) =>
      sum + (partial.returnedItems?.find((returned) => returned.productId === item.productId)?.quantity ?? 0), 0) === item.quantity);
    const stockReconciliationRequired = remaining > 0 || sale.partialStockReviewBase === true;
    const reservationStatus = sale.status === "REFUNDED" && allReturned ? "RETURNED" : sale.reservationStatus;
    const summary = {...payload, resolvedAtMs: resolvedAt.toMillis(), stockReconciliationRequired, reservationStatus};
    tx.set(resolutionRef, {...payload, saleId: params.saleId, storeId: sale.storeId, physicallyChecked: true, resolvedAt});
    tx.update(operationRef, {stockState: "RESOLVED", returnedItems: selected, stockReason: params.reason,
      stockUserId: params.userId, stockResolvedAt: resolvedAt});
    tx.update(saleRef, {
      partialRefunds: updatedRefunds, partialReturnPendingCount: remaining,
      stockReconciliationRequired,
      ...(remaining === 0 ? {partialStockReviewBase: FieldValue.delete()} : {}),
      ...(reservationStatus !== sale.reservationStatus ? {reservationStatus} : {}),
      updatedAt: resolvedAt,
    });
    return {resolution: summary};
  });
}

export const resolveSaleStock = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "admin");
  const {saleId, action, reason, physicallyChecked, refundId, returnItems: rawReturnItems} = request.data ?? {};
  if (typeof saleId !== "string" || !ID.test(saleId) || physicallyChecked !== true ||
      typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500 ||
      !["RETURN_ALL", "NO_RETURN", "RESOLVE_PARTIAL"].includes(action) ||
      (action === "RESOLVE_PARTIAL" && (typeof refundId !== "string" || !REQUEST_ID.test(refundId)))) {
    throw new HttpsError("invalid-argument", "Confirme a conferência física e informe um motivo de 5 a 500 caracteres.");
  }
  if (action === "RESOLVE_PARTIAL") {
    return resolvePartial({saleId, refundId, rawItems: rawReturnItems, reason: reason.trim(),
      userId: request.auth!.uid, userEmail: request.auth!.token.email ?? "", request});
  }
  const payload = {action: String(action), reason: reason.trim(), userId: request.auth!.uid};
  const saleRef = firestore.collection("sales").doc(saleId);
  const resolutionRef = firestore.collection("saleStockResolutions").doc(saleId);
  return firestore.runTransaction(async (tx) => {
    const [saleSnapshot, resolution] = await tx.getAll(saleRef, resolutionRef);
    if (!saleSnapshot.exists) throw new HttpsError("not-found", "Venda não encontrada.");
    const sale = saleSnapshot.data()!;
    requireStoreAccess(request, sale.storeId);
    if (resolution.exists) {
      const previous = resolution.data()!;
      if (Object.entries(payload).some(([key, value]) => previous[key] !== value)) {
        throw new HttpsError("already-exists", "Esta venda já teve a conferência encerrada. Atualize a consulta para ver o resultado.");
      }
      return {resolution: {action: previous.action, reason: previous.reason, userId: previous.userId,
        resolvedAtMs: previous.resolvedAt.toMillis()}};
    }
    if (partialRefunds(sale).length > 0 || !["REFUNDED", "CHARGED_BACK"].includes(sale.status) ||
        sale.reservationStatus !== "CONSUMED" || sale.stockReconciliationRequired !== true ||
        sale.paymentReconciliationRequired === true || sale.stockResolution) {
      throw new HttpsError("failed-precondition", "A venda não possui uma pendência de devolução integral elegível.");
    }
    const items = sale.items as SaleItemSnapshot[];
    if (typeof sale.storeId !== "string" || !ID.test(sale.storeId) || !Array.isArray(items) || items.length === 0 || items.length > 100 ||
        items.some((item) => !item || typeof item.productId !== "string" || !ID.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0) || new Set(items.map((item) => item.productId)).size !== items.length) {
      throw new HttpsError("failed-precondition", "Itens da venda inconsistentes. Solicite revisão.");
    }
    const inventoryRefs = items.map((item) => firestore.collection("inventory").doc(`${sale.storeId}_${item.productId}`));
    const movementRefs = items.map((item) => firestore.collection("stockMovements").doc(`sale_${saleId}_${item.productId}`));
    const returnRefs = items.map((item) => firestore.collection("stockMovements").doc(`return_${saleId}_${item.productId}`));
    const snapshots = await tx.getAll(...inventoryRefs, ...movementRefs, ...returnRefs);
    const quantities = items.map((item, i) => {
      const inventory = snapshots[i];
      const movement = snapshots[items.length + i].data();
      if (!inventory.exists || snapshots[2 * items.length + i].exists || !movement || movement.type !== "SALE" ||
          movement.storeId !== sale.storeId || movement.productId !== item.productId || movement.quantity !== item.quantity ||
          !Number.isSafeInteger(movement.previousQuantity) || !Number.isSafeInteger(movement.newQuantity) ||
          movement.previousQuantity - movement.newQuantity !== item.quantity) {
        throw new HttpsError("failed-precondition", "Não foi possível comprovar a baixa original ou já existe uma devolução registrada.");
      }
      const data = inventory.data()!;
      const current = data.quantity;
      const reserved = data.reservedQuantity ?? 0;
      const next = action === "RETURN_ALL" ? current + item.quantity : current;
      if (data.storeId !== sale.storeId || data.productId !== item.productId || !Number.isSafeInteger(current) ||
          !Number.isSafeInteger(reserved) || reserved < 0 || !Number.isSafeInteger(next) || next < reserved) {
        throw new HttpsError("failed-precondition", "O saldo ainda exige ajuste e conferência no Estoque antes de encerrar esta pendência.");
      }
      return {current, next};
    });
    const resolvedAt = Timestamp.now();
    const summary = {...payload, resolvedAtMs: resolvedAt.toMillis()};
    if (action === "RETURN_ALL") {
      items.forEach((item, i) => {
        tx.update(inventoryRefs[i], {quantity: quantities[i].next, updatedAt: FieldValue.serverTimestamp()});
        tx.set(returnRefs[i], {
          storeId: sale.storeId, saleId, productId: item.productId, productName: item.name ?? "", productSku: item.sku ?? "",
          productBarcode: item.barcode ?? "", type: "REFUND", quantity: item.quantity, previousQuantity: quantities[i].current,
          newQuantity: quantities[i].next, reason: payload.reason, userId: payload.userId,
          userEmail: request.auth!.token.email ?? "", createdAt: resolvedAt,
        });
      });
    }
    tx.set(resolutionRef, {...payload, saleId, storeId: sale.storeId, items, physicallyChecked: true,
      previousReservationStatus: sale.reservationStatus, resolvedAt});
    tx.update(saleRef, {stockReconciliationRequired: false, stockResolution: summary,
      ...(action === "RETURN_ALL" ? {reservationStatus: "RETURNED"} : {}), updatedAt: resolvedAt});
    return {resolution: summary};
  });
});
