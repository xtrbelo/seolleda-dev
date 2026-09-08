/* eslint-disable max-len */
import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireRole, requireStoreAccess} from "../auth/roles.js";
import {firestore} from "../lib/firebaseAdmin.js";
import {changeMpPayment, getMpPayment} from "./mercadoPagoClient.js";
import {reconcileTerminalPayment, verifyPayment} from "./reconcilePayment.js";

const MP_ACCESS_TOKEN = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");

export const managePayment = onCall({region: "southamerica-east1", secrets: [MP_ACCESS_TOKEN]}, async (request) => {
  requireRole(request, "admin");
  const {saleId, action, reason} = request.data ?? {};
  if (typeof saleId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(saleId) ||
      !["CHECK", "CANCEL", "REFUND"].includes(action) ||
      (action !== "CHECK" && (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500))) {
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
    if (await reconcileTerminalPayment(saleId, payment)) return {status: payment.status, confirmed: true};
    if (action !== "CHECK") {
      const allowed = action === "CANCEL" ? ["pending", "in_process", "authorized"] : ["approved"];
      if (!allowed.includes(payment.status)) throw new HttpsError("failed-precondition", "A situação no provedor não permite esta operação. Consulte o pagamento novamente.");
      const newKey = randomUUID();
      const key = await firestore.runTransaction(async (transaction) => {
        const current = (await transaction.get(ref)).data()!;
        verifyPayment(current, payment, saleId);
        if (["CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(current.status)) throw new HttpsError("failed-precondition", "Pagamento já encerrado. Consulte novamente.");
        const switchingToRefund = current.paymentOperationAction === "CANCEL" && action === "REFUND" && payment.status === "approved";
        if (current.paymentOperationAction && current.paymentOperationAction !== action && !switchingToRefund) throw new HttpsError("failed-precondition", "Existe outra operação registrada. Confira o resultado no provedor antes de prosseguir.");
        if (current.paymentOperationKey && !switchingToRefund) return String(current.paymentOperationKey);
        transaction.set(firestore.collection("paymentOperations").doc(newKey), {
          saleId, paymentId: payment.paymentId, action, reason: reason.trim(),
          userId: request.auth!.uid, totalCents: current.totalCents,
          createdAt: FieldValue.serverTimestamp(),
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
