/* eslint-disable max-len */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireRole, requireStoreAccess} from "../auth/roles.js";
import {firestore} from "../lib/firebaseAdmin.js";
import type {SaleItemSnapshot} from "../types/sale.js";

export const resolveSaleStock = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "admin");
  const {saleId, action, reason, physicallyChecked} = request.data ?? {};
  if (typeof saleId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(saleId) ||
      !["RETURN_ALL", "NO_RETURN"].includes(action) || physicallyChecked !== true ||
      typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) {
    throw new HttpsError("invalid-argument", "Confirme a conferência física e informe um motivo de 5 a 500 caracteres.");
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
    if (!["REFUNDED", "CHARGED_BACK"].includes(sale.status) || sale.reservationStatus !== "CONSUMED" ||
        sale.stockReconciliationRequired !== true || sale.paymentReconciliationRequired === true || sale.stockResolution) {
      throw new HttpsError("failed-precondition", "A venda não possui uma pendência de devolução elegível.");
    }
    const items = sale.items as SaleItemSnapshot[];
    if (typeof sale.storeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sale.storeId) ||
        !Array.isArray(items) || items.length === 0 || items.length > 100 ||
        items.some((item) => !item || typeof item.productId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0) ||
        new Set(items.map((item) => item.productId)).size !== items.length) {
      throw new HttpsError("failed-precondition", "Itens da venda inconsistentes. Solicite revisão.");
    }
    const inventoryRefs = items.map((item) => firestore.collection("inventory").doc(`${sale.storeId}_${item.productId}`));
    const movementRefs = items.map((item) => firestore.collection("stockMovements").doc(`sale_${saleId}_${item.productId}`));
    const returnRefs = items.map((item) => firestore.collection("stockMovements").doc(`return_${saleId}_${item.productId}`));
    const snapshots = await tx.getAll(...inventoryRefs, ...movementRefs, ...returnRefs);
    // Validate every item before scheduling any write.
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
      if (data.storeId !== sale.storeId || data.productId !== item.productId ||
          !Number.isSafeInteger(current) || !Number.isSafeInteger(reserved) || reserved < 0 ||
          !Number.isSafeInteger(next) || next < reserved) {
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
          storeId: sale.storeId, saleId, productId: item.productId,
          productName: item.name ?? "", productSku: item.sku ?? "", productBarcode: item.barcode ?? "",
          type: "REFUND", quantity: item.quantity, previousQuantity: quantities[i].current,
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
