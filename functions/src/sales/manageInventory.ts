/* eslint-disable max-len */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";

export const manageInventory = onCall({region: "southamerica-east1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const {storeId, productId, type, quantity, reason, operationId} = request.data ?? {};
  if (![storeId, productId, operationId].every((v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v))) {
    throw new HttpsError("invalid-argument", "Identificador inválido.");
  }
  if (!["ENTRY", "EXIT", "ADJUSTMENT", "MINIMUM"].includes(type) || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000000 || (["ENTRY", "EXIT"].includes(type) && quantity === 0)) {
    throw new HttpsError("invalid-argument", "INVALID_QUANTITY");
  }
  if (type !== "MINIMUM" && (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000)) {
    throw new HttpsError("invalid-argument", "INVALID_REASON");
  }
  const inventoryRef = firestore.collection("inventory").doc(`${storeId}_${productId}`);
  const operationRef = firestore.collection("inventoryOperations").doc(operationId);
  const movementRef = firestore.collection("stockMovements").doc(operationId);
  const payload = {storeId, productId, type, quantity, reason: type === "MINIMUM" ? "" : reason.trim(), userId: request.auth.uid};
  return firestore.runTransaction(async (tx) => {
    const [operation, store, product, inventory] = await tx.getAll(
      operationRef, firestore.collection("stores").doc(storeId),
      firestore.collection("products").doc(productId), inventoryRef,
    );
    if (operation.exists) {
      if (Object.entries(payload).some(([key, value]) => operation.data()?.payload?.[key] !== value)) {
        throw new HttpsError("already-exists", "Operação já utilizada.");
      }
      return {ok: true};
    }
    if (!store.exists || store.data()?.active !== true || !product.exists) {
      throw new HttpsError("failed-precondition", "Loja ou produto indisponível.");
    }
    const current = inventory.exists ? inventory.data()?.quantity : 0;
    const minimum = inventory.exists ? inventory.data()?.minimumQuantity : 0;
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(minimum) || minimum < 0) {
      throw new HttpsError("failed-precondition", "Estoque inválido. Solicite revisão.");
    }
    const next = type === "ENTRY" ? current + quantity : type === "EXIT" ? current - quantity : type === "ADJUSTMENT" ? quantity : current;
    if (type !== "MINIMUM" && next < 0) throw new HttpsError("failed-precondition", "INSUFFICIENT_STOCK");
    if (!Number.isSafeInteger(next)) throw new HttpsError("invalid-argument", "INVALID_QUANTITY");
    if (type === "ADJUSTMENT" && next === current) throw new HttpsError("failed-precondition", "NO_STOCK_CHANGE");
    const timestamp = FieldValue.serverTimestamp();
    tx.set(inventoryRef, {storeId, productId, quantity: next, minimumQuantity: type === "MINIMUM" ? quantity : minimum, updatedAt: timestamp, ...(!inventory.exists ? {createdAt: timestamp} : {})}, {merge: true});
    if (type !== "MINIMUM") {
      const item = product.data()!;
      tx.set(movementRef, {storeId, productId, productName: item.name, productSku: item.sku, productBarcode: item.barcode, type, quantity: type === "ADJUSTMENT" ? Math.abs(next - current) : quantity, previousQuantity: current, newQuantity: next, reason: payload.reason, userId: request.auth!.uid, userEmail: request.auth!.token.email ?? "", createdAt: timestamp});
    }
    tx.set(operationRef, {payload, createdAt: timestamp});
    return {ok: true};
  });
});
