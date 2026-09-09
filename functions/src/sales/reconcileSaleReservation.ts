/* eslint-disable max-len */
import {createHash} from "crypto";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireRole, requireStoreAccess} from "../auth/roles.js";
import {firestore} from "../lib/firebaseAdmin.js";
import type {SaleItemSnapshot} from "../types/sale.js";

const MAX_ACTIVE_SALES = 500;
const TERMINAL_STATUSES = ["EXPIRED", "CANCELLED", "REFUNDED", "CHARGED_BACK"];

type Difference = {
  productId: string;
  name: string;
  currentReserved: number;
  expectedReserved: number;
  adjustment: number;
};

/** Bind an APPLY request to the exact values shown in PREVIEW.
 * @param {Difference[]} differences Ordered reservation comparison.
 * @return {string} Non-secret SHA-256 digest.
 */
function previewToken(differences: Difference[]): string {
  return createHash("sha256").update(JSON.stringify(differences.map((item) => [
    item.productId, item.currentReserved, item.expectedReserved,
  ]))).digest("hex");
}

/** Validate immutable sale item snapshots used to calculate reservations.
 * @param {unknown} value Candidate items.
 * @return {SaleItemSnapshot[]} Valid items.
 */
function validItems(value: unknown): SaleItemSnapshot[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100 ||
      value.some((item) => !item || typeof item.productId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(item.productId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0) ||
      new Set(value.map((item) => item.productId)).size !== value.length) {
    throw new HttpsError("failed-precondition", "Há uma venda reservada com itens inconsistentes. A conciliação automática foi interrompida.");
  }
  return value as SaleItemSnapshot[];
}

/** Format an immutable reconciliation response.
 * @param {Record<string, unknown>} data Persisted reconciliation.
 * @return {object} Client-safe response.
 */
function persistedResult(data: Record<string, unknown>) {
  const resolvedAt = data.resolvedAt;
  if (!(resolvedAt instanceof Timestamp) || !Array.isArray(data.items)) {
    throw new HttpsError("failed-precondition", "O registro anterior de conciliação está inconsistente.");
  }
  return {
    resolved: true,
    items: data.items,
    resolution: {
      reason: String(data.reason ?? ""), userId: String(data.userId ?? ""),
      resolvedAtMs: resolvedAt.toMillis(), items: data.items,
    },
  };
}

export const reconcileSaleReservation = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "admin");
  const {saleId, action, reason, confirmed, previewToken: presentedToken} = request.data ?? {};
  if (typeof saleId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(saleId) ||
      !["PREVIEW", "APPLY"].includes(action) ||
      (action === "APPLY" && (confirmed !== true || typeof reason !== "string" ||
        reason.trim().length < 5 || reason.trim().length > 500 ||
        typeof presentedToken !== "string" || !/^[a-f0-9]{64}$/.test(presentedToken)))) {
    throw new HttpsError("invalid-argument", "Informe a venda e, para aplicar, confirme a conciliação com um motivo de 5 a 500 caracteres.");
  }
  const normalizedReason = action === "APPLY" ? (reason as string).trim() : "";
  const saleRef = firestore.collection("sales").doc(saleId);
  const reconciliationRef = firestore.collection("reservationReconciliations").doc(saleId);
  return firestore.runTransaction(async (tx) => {
    const [saleSnapshot, reconciliation] = await tx.getAll(saleRef, reconciliationRef);
    if (!saleSnapshot.exists) throw new HttpsError("not-found", "Venda não encontrada.");
    const sale = saleSnapshot.data()!;
    requireStoreAccess(request, sale.storeId);
    if (reconciliation.exists) return persistedResult(reconciliation.data()!);
    if (!TERMINAL_STATUSES.includes(sale.status) || sale.reservationStatus !== "RELEASE_REVIEW_REQUIRED" ||
        sale.stockReconciliationRequired !== true || sale.paymentReconciliationRequired === true || sale.reservationReconciliation) {
      throw new HttpsError("failed-precondition", "A venda não possui uma pendência de reserva elegível para conciliação.");
    }
    if (typeof sale.storeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sale.storeId)) {
      throw new HttpsError("failed-precondition", "Loja da venda inválida.");
    }
    const targetItems = validItems(sale.items);
    const targetProducts = new Map(targetItems.map((item) => [item.productId, item]));
    const expected = new Map(targetItems.map((item) => [item.productId, 0]));
    const activeQuery = firestore.collection("sales")
      .where("storeId", "==", sale.storeId)
      .where("reservationStatus", "==", "RESERVED")
      .limit(MAX_ACTIVE_SALES + 1);
    const activeSales = await tx.get(activeQuery);
    if (activeSales.size > MAX_ACTIVE_SALES) {
      throw new HttpsError("resource-exhausted", "Há mais de 500 vendas reservadas nesta loja. Aguarde a limpeza automática antes de conciliar.");
    }
    for (const activeSale of activeSales.docs) {
      const active = activeSale.data();
      if (active.storeId !== sale.storeId || active.reservationStatus !== "RESERVED") {
        throw new HttpsError("failed-precondition", "A consulta de reservas retornou uma venda inconsistente.");
      }
      for (const item of validItems(active.items)) {
        if (!targetProducts.has(item.productId)) continue;
        const next = (expected.get(item.productId) ?? 0) + item.quantity;
        if (!Number.isSafeInteger(next) || next > 1000000000) {
          throw new HttpsError("failed-precondition", "O total de reservas excede o limite operacional.");
        }
        expected.set(item.productId, next);
      }
    }
    const inventoryRefs = targetItems.map((item) =>
      firestore.collection("inventory").doc(`${sale.storeId}_${item.productId}`));
    const inventories = await tx.getAll(...inventoryRefs);
    const differences: Difference[] = targetItems.map((item, index) => {
      const snapshot = inventories[index];
      const inventory = snapshot.data();
      const quantity = inventory?.quantity;
      const currentReserved = inventory?.reservedQuantity ?? 0;
      const expectedReserved = expected.get(item.productId) ?? 0;
      if (!snapshot.exists || inventory?.storeId !== sale.storeId || inventory?.productId !== item.productId ||
          !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(currentReserved) ||
          currentReserved < 0 || currentReserved > 1000000000 || expectedReserved > quantity) {
        throw new HttpsError("failed-precondition", "O estoque possui saldo incompatível com as vendas abertas. Corrija o saldo antes de conciliar as reservas.");
      }
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 200) : item.productId;
      return {productId: item.productId, name,
        currentReserved, expectedReserved, adjustment: expectedReserved - currentReserved};
    });
    const currentToken = previewToken(differences);
    if (action === "PREVIEW") return {resolved: false, items: differences, previewToken: currentToken};
    if (presentedToken !== currentToken) {
      throw new HttpsError("failed-precondition", "As reservas mudaram desde a análise. Analise novamente antes de confirmar.");
    }
    const resolvedAt = Timestamp.now();
    for (let index = 0; index < differences.length; index += 1) {
      if (differences[index].adjustment !== 0) {
        tx.update(inventoryRefs[index], {reservedQuantity: differences[index].expectedReserved, updatedAt: resolvedAt});
      }
    }
    const resolution = {reason: normalizedReason, userId: request.auth!.uid,
      resolvedAtMs: resolvedAt.toMillis(), items: differences};
    tx.set(reconciliationRef, {
      saleId, storeId: sale.storeId, reason: resolution.reason, userId: resolution.userId,
      activeSalesCount: activeSales.size, items: differences, resolvedAt,
    });
    tx.update(saleRef, {
      reservationStatus: "RELEASED", stockReconciliationRequired: false,
      reservationReconciliation: resolution, updatedAt: resolvedAt,
    });
    return {resolved: true, items: differences, resolution};
  });
});
