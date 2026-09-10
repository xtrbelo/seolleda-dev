/* eslint-disable max-len */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";
import type {MpPayment} from "./mercadoPagoClient.js";
import {verifyPayment} from "./reconcilePayment.js";

export type PartialRefundItem = {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type PartialRefund = {
  id: string;
  amountCents: number;
  expectedRefundedCents: number;
  items: PartialRefundItem[];
  reason: string;
  userId: string;
  requestedAtMs: number;
  confirmedAtMs?: number;
  state: "REQUESTED" | "CONFIRMED";
  stockState: "WAITING_PAYMENT" | "PENDING" | "RESOLVED";
  returnedItems?: {productId: string; quantity: number}[];
  stockReason?: string;
  stockUserId?: string;
  stockResolvedAtMs?: number;
};

export type PartialRefundReconciliation = {
  handled: boolean;
  confirmed: boolean;
  partialRefundedCents: number;
  partialRefund?: PartialRefund;
};

/** Return the persisted partial refund history or reject corrupt state.
 * @param {Record<string, unknown>} sale Sale data.
 * @return {PartialRefund[]} Validated history.
 */
export function partialRefunds(sale: Record<string, unknown>): PartialRefund[] {
  if (sale.partialRefunds === undefined) return [];
  if (!Array.isArray(sale.partialRefunds) || sale.partialRefunds.length > 20) throw new Error("INVALID_PARTIAL_REFUNDS");
  const values = sale.partialRefunds as PartialRefund[];
  if (values.some((refund) => !refund || typeof refund.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(refund.id) ||
      !Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0 ||
      !Number.isSafeInteger(refund.expectedRefundedCents) || refund.expectedRefundedCents <= 0 ||
      !Number.isSafeInteger(refund.requestedAtMs) || refund.requestedAtMs <= 0 ||
      !["REQUESTED", "CONFIRMED"].includes(refund.state) ||
      !["WAITING_PAYMENT", "PENDING", "RESOLVED"].includes(refund.stockState) ||
      !Array.isArray(refund.items) || refund.items.length === 0 || refund.items.length > 100 ||
      refund.items.some((item) => !item || typeof item.productId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item.productId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitPriceCents) ||
        item.unitPriceCents <= 0 || !Number.isSafeInteger(item.totalCents) || item.totalCents !== item.quantity * item.unitPriceCents) ||
      new Set(refund.items.map((item) => item.productId)).size !== refund.items.length ||
      refund.items.reduce((sum, item) => sum + item.totalCents, 0) !== refund.amountCents)) throw new Error("INVALID_PARTIAL_REFUNDS");
  let accumulated = 0;
  values.forEach((refund, index) => {
    accumulated += refund.amountCents;
    if (!Number.isSafeInteger(accumulated) || refund.expectedRefundedCents !== accumulated ||
        (refund.state === "REQUESTED" && (refund.stockState !== "WAITING_PAYMENT" || index !== values.length - 1)) ||
        (refund.state === "CONFIRMED" && refund.stockState === "WAITING_PAYMENT")) throw new Error("INVALID_PARTIAL_REFUNDS");
  });
  return values;
}

/** Reconcile a provider refund with the single persisted pending operation.
 * @param {string} saleId Sale identifier.
 * @param {MpPayment} payment Fresh provider state.
 * @return {Promise<PartialRefundReconciliation>} Reconciliation result.
 */
export async function reconcilePartialRefundPayment(saleId: string, payment: MpPayment): Promise<PartialRefundReconciliation> {
  if (payment.refundedCents === 0) return {handled: false, confirmed: false, partialRefundedCents: 0};
  return firestore.runTransaction(async (transaction) => {
    const saleRef = firestore.collection("sales").doc(saleId);
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists) throw new Error("SALE_NOT_FOUND");
    const sale = snapshot.data()!;
    verifyPayment(sale, payment, saleId);
    const refunds = partialRefunds(sale);
    const totalCents = Number(sale.totalCents);
    const recorded = Number(sale.partialRefundedCents ?? 0);
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isSafeInteger(recorded) || recorded < 0 || recorded > totalCents) throw new Error("INVALID_PARTIAL_REFUND_TOTAL");
    if (refunds.length === 0 && payment.status === "refunded") {
      return {handled: false, confirmed: false, partialRefundedCents: recorded};
    }
    const requested = refunds.filter((refund) => refund.state === "REQUESTED");
    const mismatch = !["approved", "refunded"].includes(payment.status) ||
      (payment.status === "refunded" && payment.refundedCents !== totalCents) ||
      requested.length > 1 || payment.refundedCents < recorded ||
      (requested.length === 0 && payment.refundedCents !== recorded) ||
      (requested.length === 1 && payment.refundedCents > requested[0].expectedRefundedCents);
    if (mismatch || (refunds.length === 0 && payment.refundedCents > 0)) {
      transaction.update(saleRef, {
        paymentReconciliationRequired: true,
        paymentReviewReason: "PARTIAL_REFUND_MISMATCH",
        mercadoPagoPaymentStatus: payment.status,
        mercadoPagoPaymentStatusDetail: payment.statusDetail,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {handled: true, confirmed: false, partialRefundedCents: recorded};
    }
    if (requested.length === 0 || payment.refundedCents < requested[0].expectedRefundedCents) {
      return {handled: false, confirmed: false, partialRefundedCents: recorded};
    }
    const pending = requested[0];
    const confirmedAt = Timestamp.now();
    const confirmed: PartialRefund = {...pending, state: "CONFIRMED", stockState: "PENDING", confirmedAtMs: confirmedAt.toMillis()};
    const updated = refunds.map((refund) => refund.id === pending.id ? confirmed : refund);
    const oldPendingCount = Number(sale.partialReturnPendingCount ?? 0);
    const persistedPendingCount = refunds.filter((refund) => refund.state === "CONFIRMED" && refund.stockState === "PENDING").length;
    if (!Number.isSafeInteger(oldPendingCount) || oldPendingCount < 0 || oldPendingCount !== persistedPendingCount) throw new Error("INVALID_PARTIAL_RETURN_COUNT");
    const completed = payment.refundedCents === totalCents;
    const operationRef = firestore.collection("paymentOperations").doc(`partial_${pending.id}`);
    transaction.update(operationRef, {
      state: "CONFIRMED", providerStatus: payment.status,
      providerRefundedCents: payment.refundedCents, confirmedAt,
    });
    transaction.update(saleRef, {
      partialRefunds: updated,
      partialRefundedCents: payment.refundedCents,
      partialReturnPendingCount: oldPendingCount + 1,
      ...(oldPendingCount === 0 ? {partialStockReviewBase: sale.stockReconciliationRequired === true} : {}),
      status: completed ? "REFUNDED" : "PAID",
      paymentStatus: completed ? "REFUNDED" : "APPROVED",
      paymentReconciliationRequired: false,
      paymentReviewReason: FieldValue.delete(),
      stockReconciliationRequired: true,
      paymentOperationState: "CONFIRMED",
      mercadoPagoPaymentStatus: payment.status,
      mercadoPagoPaymentStatusDetail: payment.statusDetail,
      paymentCheckedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {handled: true, confirmed: true, partialRefundedCents: payment.refundedCents, partialRefund: confirmed};
  });
}
