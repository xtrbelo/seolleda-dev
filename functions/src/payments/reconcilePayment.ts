/* eslint-disable max-len */
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";
import type {MpPayment} from "./mercadoPagoClient.js";
import type {SaleItemSnapshot} from "../types/sale.js";

/** Verify the immutable provider link before any administrative operation.
 * @param {object} sale Persisted sale.
 * @param {MpPayment} payment Provider payment.
 * @param {string} saleId Sale identifier.
 */
export function verifyPayment(sale: Record<string, unknown>, payment: MpPayment, saleId: string): void {
  const methodMatches = sale.paymentMethod === "PIX" ? payment.paymentMethod === "pix" :
    sale.paymentMethod === "CARD" && payment.paymentType === "credit_card" && payment.paymentMethod !== "pix";
  if (String(sale.mercadoPagoPaymentId) !== payment.paymentId || payment.externalReference !== saleId ||
      sale.totalCents !== payment.totalCents || payment.currency !== "BRL" ||
      sale.paymentProvider !== "MERCADO_PAGO" || !methodMatches) throw new Error("PAYMENT_MISMATCH");
}

/** Reconcile terminal provider states without restoring physically sold goods.
 * @param {string} saleId Sale identifier.
 * @param {MpPayment} payment Fresh server-side provider response.
 * @return {Promise<boolean>} Whether this is a terminal notification.
 */
export async function reconcileTerminalPayment(saleId: string, payment: MpPayment): Promise<boolean> {
  if (!["cancelled", "refunded", "charged_back"].includes(payment.status)) return false;
  await firestore.runTransaction(async (transaction) => {
    const ref = firestore.collection("sales").doc(saleId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("SALE_NOT_FOUND");
    const sale = snapshot.data()!;
    verifyPayment(sale, payment, saleId);
    if (sale.status === "REFUNDED" || sale.status === "CHARGED_BACK" ||
        (sale.status === "CANCELLED" && payment.status === "cancelled")) return;
    let reservationStatus = sale.reservationStatus ?? "RELEASE_REVIEW_REQUIRED";
    let stockReview = sale.stockReconciliationRequired === true;
    if (reservationStatus === "RESERVED") {
      const items = sale.items as SaleItemSnapshot[];
      const valid = typeof sale.storeId === "string" && sale.storeId && !sale.storeId.includes("/") &&
        Array.isArray(items) && items.length > 0 && items.every((item) => item &&
          typeof item.productId === "string" && item.productId && !item.productId.includes("/") &&
          Number.isSafeInteger(item.quantity) && item.quantity > 0) &&
        new Set(items.map((item) => item.productId)).size === items.length;
      if (valid) {
        const refs = items.map((item) => firestore.collection("inventory").doc(`${sale.storeId}_${item.productId}`));
        const inventories = await transaction.getAll(...refs);
        const consistent = inventories.every((inventory, i) => inventory.exists &&
          Number.isSafeInteger(inventory.get("reservedQuantity")) && inventory.get("reservedQuantity") >= items[i].quantity);
        if (consistent) {
          inventories.forEach((inventory, i) => transaction.update(refs[i], {
            reservedQuantity: inventory.get("reservedQuantity") - items[i].quantity,
            updatedAt: FieldValue.serverTimestamp(),
          }));
          reservationStatus = "RELEASED";
        } else reservationStatus = "RELEASE_REVIEW_REQUIRED";
      } else reservationStatus = "RELEASE_REVIEW_REQUIRED";
    }
    stockReview = stockReview || reservationStatus === "RELEASE_REVIEW_REQUIRED" || reservationStatus === "CONSUMED";
    if (sale.paymentOperationKey) {
      transaction.update(firestore.collection("paymentOperations").doc(sale.paymentOperationKey), {
        providerStatus: payment.status, confirmedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(ref, {
      status: payment.status === "refunded" ? "REFUNDED" : payment.status === "cancelled" ? "CANCELLED" : "CHARGED_BACK",
      paymentStatus: payment.status.toUpperCase(), paymentReconciliationRequired: false,
      paymentReviewReason: FieldValue.delete(), reservationStatus,
      stockReconciliationRequired: stockReview,
      mercadoPagoPaymentStatus: payment.status, mercadoPagoPaymentStatusDetail: payment.statusDetail,
      ...(sale.paymentOperationKey ? {paymentOperationState: "CONFIRMED"} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return true;
}
