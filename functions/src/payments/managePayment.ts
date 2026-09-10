/* eslint-disable max-len */
import {randomUUID} from "crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireRole, requireStoreAccess} from "../auth/roles.js";
import {firestore} from "../lib/firebaseAdmin.js";
import type {SaleItemSnapshot} from "../types/sale.js";
import {changeMpPayment, getMpPayment} from "./mercadoPagoClient.js";
import {partialRefunds, reconcilePartialRefundPayment, type PartialRefund, type PartialRefundItem} from "./partialRefund.js";
import {reconcileTerminalPayment, verifyPayment} from "./reconcilePayment.js";

const MP_ACCESS_TOKEN = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const SALE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate and price a partial item selection from immutable sale snapshots.
 * @param {Record<string, unknown>} sale Persisted sale.
 * @param {unknown} rawItems Untrusted request items.
 * @param {PartialRefund[]} refunds Existing operations.
 * @return {PartialRefundItem[]} Priced selection.
 */
function pricePartialItems(sale: Record<string, unknown>, rawItems: unknown, refunds: PartialRefund[]): PartialRefundItem[] {
  const saleItems = sale.items as SaleItemSnapshot[];
  if (!Array.isArray(saleItems) || saleItems.length === 0 || saleItems.length > 100 ||
      saleItems.some((item) => !item || typeof item.productId !== "string" || !SALE_ID.test(item.productId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents <= 0 ||
        !Number.isSafeInteger(item.totalCents) || item.totalCents !== item.quantity * item.unitPriceCents) ||
      new Set(saleItems.map((item) => item.productId)).size !== saleItems.length ||
      saleItems.reduce((sum, item) => sum + item.totalCents, 0) !== sale.totalCents) {
    throw new HttpsError("failed-precondition", "Os itens persistidos da venda estão inconsistentes.");
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > saleItems.length) {
    throw new HttpsError("invalid-argument", "Selecione ao menos um item para o reembolso parcial.");
  }
  const requested = rawItems.map((raw) => raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
  if (requested.some((item) => typeof item.productId !== "string" || !SALE_ID.test(item.productId) ||
      !Number.isSafeInteger(item.quantity) || Number(item.quantity) <= 0) ||
      new Set(requested.map((item) => item.productId)).size !== requested.length) {
    throw new HttpsError("invalid-argument", "Informe produtos e quantidades válidos, sem repetição.");
  }
  const used = new Map<string, number>();
  refunds.forEach((refund) => refund.items.forEach((item) => used.set(item.productId, (used.get(item.productId) ?? 0) + item.quantity)));
  return requested.map((selection) => {
    const original = saleItems.find((item) => item.productId === selection.productId);
    const quantity = Number(selection.quantity);
    if (!original || quantity > original.quantity - (used.get(original.productId) ?? 0)) {
      throw new HttpsError("failed-precondition", "A quantidade solicitada excede o saldo ainda disponível para reembolso.");
    }
    const totalCents = original.unitPriceCents * quantity;
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new HttpsError("failed-precondition", "Não foi possível calcular o valor do reembolso.");
    return {productId: original.productId, name: original.name ?? "", sku: original.sku ?? "", barcode: original.barcode ?? "",
      quantity, unitPriceCents: original.unitPriceCents, totalCents};
  });
}

/** Compare immutable retry fields.
 * @param {PartialRefund} previous Persisted operation.
 * @param {PartialRefundItem[]} items Current priced items.
 * @param {string} reason Current reason.
 * @param {string} userId Current administrator.
 * @return {boolean} Whether this is the same request.
 */
function samePartialRequest(previous: PartialRefund, items: PartialRefundItem[], reason: string, userId: string): boolean {
  return previous.reason === reason && previous.userId === userId &&
    JSON.stringify(previous.items.map(({productId, quantity}) => ({productId, quantity}))) ===
    JSON.stringify(items.map(({productId, quantity}) => ({productId, quantity})));
}

export const managePayment = onCall({region: "southamerica-east1", secrets: [MP_ACCESS_TOKEN]}, async (request) => {
  requireRole(request, "admin");
  const {saleId, action, reason, requestId, items: rawItems} = request.data ?? {};
  const partialAction = action === "PARTIAL_REFUND";
  if (typeof saleId !== "string" || !SALE_ID.test(saleId) ||
      !["CHECK", "CANCEL", "REFUND", "PARTIAL_REFUND"].includes(action) ||
      (action !== "CHECK" && (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500)) ||
      (partialAction && (typeof requestId !== "string" || !REQUEST_ID.test(requestId)))) {
    throw new HttpsError("invalid-argument", "Informe a venda, a operação e um motivo de 5 a 500 caracteres.");
  }
  const ref = firestore.collection("sales").doc(saleId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Venda não encontrada.");
  const sale = snapshot.data()!;
  requireStoreAccess(request, sale.storeId);
  if (!sale.mercadoPagoPaymentId) throw new HttpsError("failed-precondition", "Aguarde o vínculo da cobrança com o provedor.");
  try {
    const token = MP_ACCESS_TOKEN.value();
    let payment = await getMpPayment(String(sale.mercadoPagoPaymentId), token);
    verifyPayment(sale, payment, saleId);
    const partialReconciliation = await reconcilePartialRefundPayment(saleId, payment);
    if (partialReconciliation.handled) {
      if (!partialReconciliation.confirmed && partialAction) throw new HttpsError("failed-precondition", "O valor reembolsado no provedor diverge do histórico. Faça a conferência antes de uma nova operação.");
      return {status: payment.status, confirmed: partialReconciliation.confirmed,
        partialRefundedCents: partialReconciliation.partialRefundedCents,
        partialRefund: partialReconciliation.partialRefund};
    }
    if (partialAction) {
      if (payment.status !== "approved") {
        const persisted = partialRefunds((await ref.get()).data()!).find((refund) => refund.id === requestId);
        if (persisted?.state === "CONFIRMED" && payment.refundedCents === persisted.expectedRefundedCents) {
          return {status: payment.status, confirmed: true, partialRefundedCents: payment.refundedCents, partialRefund: persisted};
        }
        throw new HttpsError("failed-precondition", "A situação no provedor não permite reembolso parcial.");
      }
      const prepared = await firestore.runTransaction(async (transaction) => {
        const operationRef = firestore.collection("paymentOperations").doc(`partial_${requestId}`);
        const [currentSnapshot, operationSnapshot] = await transaction.getAll(ref, operationRef);
        if (!currentSnapshot.exists) throw new HttpsError("not-found", "Venda não encontrada.");
        const current = currentSnapshot.data()!;
        requireStoreAccess(request, current.storeId);
        verifyPayment(current, payment, saleId);
        const refunds = partialRefunds(current);
        const selectedItems = pricePartialItems(current, rawItems, refunds.filter((refund) => refund.id !== requestId));
        const previous = refunds.find((refund) => refund.id === requestId);
        if (previous) {
          if (!samePartialRequest(previous, selectedItems, reason.trim(), request.auth!.uid)) {
            throw new HttpsError("already-exists", "Esta identificação já pertence a outra solicitação.");
          }
          return previous;
        }
        if (current.status !== "PAID" || current.reservationStatus !== "CONSUMED" || current.paymentReconciliationRequired === true) {
          throw new HttpsError("failed-precondition", "Somente uma venda paga e conciliada pode receber reembolso parcial.");
        }
        if (current.paymentOperationAction && current.paymentOperationAction !== "PARTIAL_REFUND") {
          throw new HttpsError("failed-precondition", "Existe outra operação de pagamento registrada para esta venda.");
        }
        if (operationSnapshot.exists) throw new HttpsError("already-exists", "Esta identificação já foi utilizada.");
        const itemEntryCount = refunds.reduce((sum, refund) => sum + refund.items.length, 0);
        if (refunds.length >= 20 || itemEntryCount + selectedItems.length > 200 || refunds.some((refund) => refund.state === "REQUESTED")) {
          throw new HttpsError("failed-precondition", "Existe uma solicitação pendente ou o limite de operações parciais desta venda foi atingido.");
        }
        const amountCents = selectedItems.reduce((sum, item) => sum + item.totalCents, 0);
        const recorded = Number(current.partialRefundedCents ?? 0);
        const confirmedTotal = refunds.filter((refund) => refund.state === "CONFIRMED").reduce((sum, refund) => sum + refund.amountCents, 0);
        if (!Number.isSafeInteger(recorded) || recorded < 0 || confirmedTotal !== recorded || recorded + amountCents > current.totalCents) {
          throw new HttpsError("failed-precondition", "O valor acumulado dos reembolsos é inconsistente.");
        }
        const requestedAt = Timestamp.now();
        const partialRefund: PartialRefund = {
          id: requestId, amountCents, expectedRefundedCents: recorded + amountCents,
          items: selectedItems, reason: reason.trim(), userId: request.auth!.uid,
          requestedAtMs: requestedAt.toMillis(), state: "REQUESTED", stockState: "WAITING_PAYMENT",
        };
        transaction.set(operationRef, {
          saleId, paymentId: payment.paymentId, action: "PARTIAL_REFUND", requestId,
          amountCents, expectedRefundedCents: partialRefund.expectedRefundedCents,
          items: selectedItems, reason: partialRefund.reason, userId: partialRefund.userId,
          userEmail: request.auth!.token.email ?? "", state: "REQUESTED", createdAt: requestedAt,
        });
        transaction.update(ref, {
          partialRefunds: [...refunds, partialRefund], paymentOperationKey: `partial_${requestId}`,
          paymentOperationAction: "PARTIAL_REFUND", paymentOperationReason: partialRefund.reason,
          paymentOperationState: "REQUESTED", updatedAt: FieldValue.serverTimestamp(),
        });
        return partialRefund;
      });
      if (prepared.state === "CONFIRMED") {
        return {status: payment.status, confirmed: true, partialRefundedCents: payment.refundedCents, partialRefund: prepared};
      }
      await changeMpPayment(payment.paymentId, "REFUND", token, prepared.id, prepared.amountCents);
      payment = await getMpPayment(payment.paymentId, token);
      verifyPayment(sale, payment, saleId);
      const result = await reconcilePartialRefundPayment(saleId, payment);
      if (!result.confirmed) {
        const persisted = partialRefunds((await ref.get()).data()!).find((refund) => refund.id === prepared.id);
        if (persisted?.state === "CONFIRMED") {
          return {status: payment.status, confirmed: true, partialRefundedCents: persisted.expectedRefundedCents, partialRefund: persisted};
        }
      }
      return {status: payment.status, confirmed: result.confirmed,
        partialRefundedCents: result.partialRefundedCents, partialRefund: result.partialRefund ?? prepared};
    }
    if (await reconcileTerminalPayment(saleId, payment)) return {status: payment.status, confirmed: true};
    if (action !== "CHECK") {
      const allowed = action === "CANCEL" ? ["pending", "in_process", "authorized"] : ["approved"];
      if (!allowed.includes(payment.status)) throw new HttpsError("failed-precondition", "A situação no provedor não permite esta operação. Consulte o pagamento novamente.");
      const newKey = randomUUID();
      const key = await firestore.runTransaction(async (transaction) => {
        const current = (await transaction.get(ref)).data()!;
        verifyPayment(current, payment, saleId);
        if (partialRefunds(current).length > 0 && action === "REFUND") throw new HttpsError("failed-precondition", "Conclua o reembolso pelos itens restantes no fluxo parcial.");
        if (["CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(current.status)) throw new HttpsError("failed-precondition", "Pagamento já encerrado. Consulte novamente.");
        const switchingToRefund = current.paymentOperationAction === "CANCEL" && action === "REFUND" && payment.status === "approved";
        if (current.paymentOperationAction && current.paymentOperationAction !== action && !switchingToRefund) throw new HttpsError("failed-precondition", "Existe outra operação registrada. Confira o resultado no provedor antes de prosseguir.");
        if (current.paymentOperationKey && !switchingToRefund) return String(current.paymentOperationKey);
        transaction.set(firestore.collection("paymentOperations").doc(newKey), {
          saleId, paymentId: payment.paymentId, action, reason: reason.trim(), userId: request.auth!.uid,
          totalCents: current.totalCents, createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(ref, {
          paymentOperationKey: newKey, paymentOperationAction: action,
          paymentOperationReason: reason.trim(), paymentOperationState: "REQUESTED",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return newKey;
      });
      await changeMpPayment(payment.paymentId, action, token, key);
      payment = await getMpPayment(payment.paymentId, token);
      verifyPayment(sale, payment, saleId);
      if (await reconcileTerminalPayment(saleId, payment)) return {status: payment.status, confirmed: true};
    }
    await firestore.runTransaction(async (transaction) => {
      const current = (await transaction.get(ref)).data()!;
      verifyPayment(current, payment, saleId);
      if (["CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(current.status)) return;
      transaction.update(ref, {
        mercadoPagoPaymentStatus: payment.status, mercadoPagoPaymentStatusDetail: payment.statusDetail,
        paymentCheckedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {status: payment.status, confirmed: false};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "Não foi possível confirmar o resultado. Consulte novamente; para repetir a operação será usada a mesma identificação, evitando duplicidade.");
  }
});
