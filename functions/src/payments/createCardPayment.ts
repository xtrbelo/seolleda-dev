/* eslint-disable max-len */
import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {CreateCardPaymentResponse} from "../types/sale.js";
import {createMpCardPayment} from "./mercadoPagoClient.js";
import {saleDeadline} from "./pixPolicy.js";

const accessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAYER_EMAIL = "seolledadev@gmail.com";

/** Builds the safe response for a persisted card attempt.
 * @param {string} saleId Sale identifier.
 * @param {object} sale Stored sale.
 * @return {CreateCardPaymentResponse} Safe card response.
 */
function responseFor(
  saleId: string, sale: Record<string, unknown>,
): CreateCardPaymentResponse {
  const paymentId = typeof sale.mercadoPagoPaymentId === "string" ?
    sale.mercadoPagoPaymentId : "";
  if (!paymentId || sale.paymentMethod !== "CARD") {
    throw new HttpsError("unavailable", "Pagamento por cartão indisponível.");
  }
  if (Date.now() >= saleDeadline(sale)) {
    throw new HttpsError("deadline-exceeded", "Venda expirada. Inicie outra compra.");
  }
  if (sale.status !== "PENDING_PAYMENT" || sale.paymentStatus === "APPROVED") {
    throw new HttpsError("failed-precondition", "Pagamento indisponível ou já processado.");
  }
  return {
    saleId,
    paymentId,
    status: String(sale.mercadoPagoPaymentStatus ?? "pending"),
    statusDetail: String(sale.mercadoPagoPaymentStatusDetail ?? ""),
    totalCents: Number(sale.totalCents),
  };
}

/** Creates a Mercado Pago credit-card payment from a browser-generated token. */
export const createCardPayment = onCall(
  {region: "southamerica-east1", secrets: [accessToken]},
  async (request): Promise<CreateCardPaymentResponse> => {
    let stage = "validate_input";
    try {
      const data = request.data as Record<string, unknown> | null;
      const saleId = typeof data?.saleId === "string" ? data.saleId.trim() : "";
      const token = typeof data?.token === "string" ? data.token.trim() : "";
      const paymentMethodId = typeof data?.paymentMethodId === "string" ?
        data.paymentMethodId.trim().toLowerCase() : "";
      const email = typeof data?.payerEmail === "string" ?
        data.payerEmail.trim().toLowerCase() : "";
      const installments = typeof data?.installments === "number" ?
        data.installments : NaN;
      const issuerId = data?.issuerId === undefined || data?.issuerId === null ?
        undefined : Number(data.issuerId);

      if (!saleId || saleId.length > 128 || saleId.includes("/")) {
        throw new HttpsError("invalid-argument", "Venda inválida.");
      }
      if (token.length < 16 || token.length > 512 || /\s/.test(token)) {
        throw new HttpsError("invalid-argument", "Token do cartão inválido.");
      }
      if (!/^[a-z0-9_-]{2,32}$/.test(paymentMethodId) ||
          paymentMethodId === "pix") {
        throw new HttpsError("invalid-argument", "Bandeira do cartão inválida.");
      }
      if (!Number.isSafeInteger(installments) || installments < 1 || installments > 24) {
        throw new HttpsError("invalid-argument", "Parcelamento inválido.");
      }
      if (issuerId !== undefined &&
          (!Number.isSafeInteger(issuerId) || issuerId <= 0)) {
        throw new HttpsError("invalid-argument", "Emissor do cartão inválido.");
      }
      if (email && (email.length > 254 || !EMAIL_REGEX.test(email))) {
        throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
      }

      const saleRef = firestore.collection("sales").doc(saleId);
      stage = "prepare_attempt";
      const prepared = await firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(saleRef);
        if (!snap.exists) throw new HttpsError("not-found", "Venda não encontrada.");
        const sale = snap.data()!;
        if (sale.status !== "PENDING_PAYMENT" || sale.paymentStatus === "APPROVED") {
          throw new HttpsError("failed-precondition", "Venda não disponível.");
        }
        if (Date.now() >= saleDeadline(sale)) {
          throw new HttpsError("deadline-exceeded", "Venda expirada. Inicie outra compra.");
        }
        if (!Number.isSafeInteger(sale.totalCents) || sale.totalCents <= 0) {
          throw new HttpsError("failed-precondition", "Total da venda inválido.");
        }
        if (sale.paymentMethod && sale.paymentMethod !== "CARD") {
          throw new HttpsError("failed-precondition", "Outra forma de pagamento já foi iniciada.");
        }
        if (sale.mercadoPagoPaymentId && sale.cardIdempotencyKey) {
          return {cached: responseFor(saleId, sale), attempt: null};
        }
        if (sale.cardIdempotencyKey) {
          throw new HttpsError(
            "failed-precondition", "Tentativa de cartão requer revisão do pagamento.",
          );
        }
        const payerEmail = sale.cardPayerEmail || email || sale.customerEmail ||
          DEFAULT_PAYER_EMAIL;
        if (typeof payerEmail !== "string" || payerEmail.length > 254 ||
            !EMAIL_REGEX.test(payerEmail)) {
          throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
        }
        const idempotencyKey = randomUUID();
        transaction.update(saleRef, {
          cardAttemptId: idempotencyKey,
          cardIdempotencyKey: idempotencyKey,
          cardPayerEmail: payerEmail,
          cardTotalCents: sale.totalCents,
          cardPaymentMethodId: paymentMethodId,
          cardInstallments: installments,
          paymentProvider: "MERCADO_PAGO",
          paymentMethod: "CARD",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          cached: null,
          attempt: {
            payerEmail,
            idempotencyKey,
            totalCents: sale.totalCents,
          },
        };
      });
      if (prepared.cached) return prepared.cached;
      const attempt = prepared.attempt!;
      stage = "mercado_pago";
      const payment = await createMpCardPayment({
        saleId,
        ...attempt,
        token,
        paymentMethodId,
        ...(issuerId === undefined ? {} : {issuerId}),
        installments,
        accessToken: accessToken.value(),
      });
      stage = "persist_payment";
      const saved = await firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(saleRef);
        const sale = snap.data();
        if (!sale || sale.cardIdempotencyKey !== attempt.idempotencyKey) {
          throw new HttpsError("aborted", "Tentativa de pagamento alterada.");
        }
        if (sale.mercadoPagoPaymentId &&
            String(sale.mercadoPagoPaymentId) !== payment.paymentId) {
          throw new HttpsError("aborted", "Pagamento divergente.");
        }
        const update = {
          mercadoPagoPaymentId: payment.paymentId,
          ...(sale.mercadoPagoPaymentStatus ? {} : {
            mercadoPagoPaymentStatus: payment.status,
            mercadoPagoPaymentStatusDetail: payment.statusDetail,
          }),
          cardCreatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.update(saleRef, update);
        return {...sale, ...update};
      });
      return responseFor(saleId, saved);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const message = error instanceof Error ? error.message : "";
      const reason = ["MP_INVALID_ID", "MP_INVALID_RESPONSE", "MP_INVALID_AMOUNT",
        "MP_ID_MISMATCH", "MP_PAYMENT_MISMATCH"].includes(message) ||
        /^MP_HTTP_\d{3}$/.test(message) ? message : "UNCLASSIFIED";
      console.error("createCardPayment: operation failed", {stage, reason});
      throw new HttpsError(
        "internal", "Não foi possível processar o cartão. Tente novamente.",
      );
    }
  },
);
