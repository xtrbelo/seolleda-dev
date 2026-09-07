import {randomUUID} from "crypto";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {CreatePixPaymentResponse} from "../types/sale.js";
import {createMpPixPayment, getMpPayment} from "./mercadoPagoClient.js";
import {saleDeadline} from "./pixPolicy.js";

const accessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAYER_EMAIL = "seolledadev@gmail.com";

/** @param {string} saleId Sale identifier.
 * @param {object} sale Stored sale.
 * @return {CreatePixPaymentResponse} Public QR data.
 */
function responseFor(
  saleId: string, sale: Record<string, unknown>,
): CreatePixPaymentResponse {
  const deadline = saleDeadline(sale);
  const expiresAtMs = sale.pixExpiresAt instanceof Timestamp ?
    Math.min(deadline, sale.pixExpiresAt.toMillis()) : deadline;
  if (Date.now() >= expiresAtMs) {
    throw new HttpsError(
      "deadline-exceeded", "Venda expirada. Inicie outra compra.",
    );
  }
  const providerStatus = String(sale.mercadoPagoPaymentStatus ??
    String(sale.paymentStatus ?? "pending").toLowerCase());
  if (!["pending", "in_process"].includes(providerStatus) ||
      sale.paymentStatus === "APPROVED" || sale.status !== "PENDING_PAYMENT") {
    throw new HttpsError(
      "failed-precondition", "Pagamento indisponível ou já processado.",
    );
  }
  if (!sale.pixQrCode) {
    throw new HttpsError(
      "unavailable", "QR Pix indisponível. Tente novamente.",
    );
  }
  return {
    saleId,
    paymentId: String(sale.mercadoPagoPaymentId),
    status: providerStatus,
    qrCode: String(sale.pixQrCode),
    qrCodeBase64: String(sale.pixQrCodeBase64 ?? ""),
    ticketUrl: String(sale.pixTicketUrl ?? ""),
    totalCents: Number(sale.totalCents),
    expiresAtMs,
  };
}

export const createPixPayment = onCall(
  {region: "southamerica-east1", secrets: [accessToken]},
  async (request): Promise<CreatePixPaymentResponse> => {
    let stage = "validate_input";
    try {
      const data = request.data as Record<string, unknown> | null;
      const saleId = typeof data?.saleId === "string" ? data.saleId.trim() : "";
      const email = typeof data?.payerEmail === "string" ?
        data.payerEmail.trim().toLowerCase() : "";
      if (!saleId || saleId.length > 128 || saleId.includes("/")) {
        throw new HttpsError("invalid-argument", "Venda inválida.");
      }
      if (email && (email.length > 254 || !EMAIL_REGEX.test(email))) {
        throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
      }
      const saleRef = firestore.collection("sales").doc(saleId);
      // One immutable attempt per sale. Transactions serialize callers;
      // the provider key protects concurrent POSTs and uncertain retries.
      stage = "prepare_attempt";
      const prepared = await firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(saleRef);
        if (!snap.exists) {
          throw new HttpsError("not-found", "Venda não encontrada.");
        }
        const sale = snap.data()!;
        if (sale.status !== "PENDING_PAYMENT" ||
            sale.paymentStatus === "APPROVED") {
          throw new HttpsError("failed-precondition", "Venda não disponível.");
        }
        if (Date.now() >= saleDeadline(sale)) {
          throw new HttpsError(
            "deadline-exceeded", "Venda expirada. Inicie outra compra.",
          );
        }
        if (!Number.isSafeInteger(sale.totalCents) || sale.totalCents <= 0) {
          throw new HttpsError(
            "failed-precondition", "Total da venda inválido.",
          );
        }
        if (sale.mercadoPagoPaymentId && sale.pixQrCode) {
          return {cached: responseFor(saleId, sale), attempt: null};
        }
        // Never guess the payload of an ambiguous legacy attempt.
        if ((sale.pixAttemptId || sale.pixIdempotencyKey) &&
            (!sale.pixPayerEmail || sale.pixTotalCents !== sale.totalCents ||
             !sale.pixAttemptId || !sale.pixIdempotencyKey)) {
          throw new HttpsError(
            "failed-precondition",
            "Tentativa antiga requer revisão do pagamento.",
          );
        }
        const payerEmail = sale.pixPayerEmail || email || sale.customerEmail ||
          DEFAULT_PAYER_EMAIL;
        if (typeof payerEmail !== "string" || payerEmail.length > 254 ||
            !EMAIL_REGEX.test(payerEmail)) {
          throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
        }
        const pixAttemptId = sale.pixAttemptId || randomUUID();
        const idempotencyKey = sale.pixIdempotencyKey || pixAttemptId;
        transaction.update(saleRef, {
          pixAttemptId,
          pixIdempotencyKey: idempotencyKey,
          pixPayerEmail: payerEmail,
          pixTotalCents: sale.totalCents,
          paymentProvider: "MERCADO_PAGO",
          paymentMethod: "PIX",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          cached: null,
          attempt: {
            payerEmail, idempotencyKey, totalCents: sale.totalCents,
            paymentId: sale.mercadoPagoPaymentId as string | undefined,
          },
        };
      });
      if (prepared.cached) return prepared.cached;
      const attempt = prepared.attempt!;
      stage = "mercado_pago";
      const payment = attempt.paymentId ?
        await getMpPayment(String(attempt.paymentId), accessToken.value()) :
        await createMpPixPayment({
          saleId, ...attempt, accessToken: accessToken.value(),
        });
      if (payment.externalReference !== saleId ||
          payment.totalCents !== attempt.totalCents ||
          payment.currency !== "BRL" || payment.paymentMethod !== "pix") {
        throw new HttpsError("internal", "Pagamento divergente.");
      }
      // Never overwrite webhook approval with a delayed creation response.
      stage = "persist_payment";
      const saved = await firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(saleRef);
        const sale = snap.data();
        if (!sale || sale.pixIdempotencyKey !== attempt.idempotencyKey) {
          throw new HttpsError("aborted", "Tentativa de pagamento alterada.");
        }
        if (sale.mercadoPagoPaymentId) {
          if (String(sale.mercadoPagoPaymentId) !== payment.paymentId) {
            throw new HttpsError("aborted", "Pagamento divergente.");
          }
        }
        const update = {
          mercadoPagoPaymentId: payment.paymentId,
          ...(sale.mercadoPagoPaymentStatus ? {} : {
            mercadoPagoPaymentStatus: payment.status,
            mercadoPagoPaymentStatusDetail: payment.statusDetail,
          }),
          pixQrCode: payment.qrCode,
          pixQrCodeBase64: payment.qrCodeBase64,
          pixTicketUrl: payment.ticketUrl,
          pixCreatedAt: FieldValue.serverTimestamp(),
          pixExpiresAt: Timestamp.fromMillis(Math.min(
            saleDeadline(sale), payment.expiresAtMs ?? Infinity,
          )),
          mercadoPagoExpiresAt: payment.expiresAtMs === null ? null :
            Timestamp.fromMillis(payment.expiresAtMs),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.update(saleRef, update);
        return {...sale, ...update};
      });
      return responseFor(saleId, saved);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const message = error instanceof Error ? error.message : "";
      const knownErrors = [
        "MP_INVALID_ID", "MP_INVALID_RESPONSE", "MP_INVALID_AMOUNT",
        "MP_ID_MISMATCH", "MP_PAYMENT_MISMATCH",
      ];
      const reason = knownErrors.includes(message) ||
        /^MP_HTTP_\d{3}$/.test(message) ? message :
        error instanceof Error && error.name === "TimeoutError" ?
          "TIMEOUT" : "UNCLASSIFIED";
      const code = typeof error === "object" && error !== null &&
        "code" in error ? error.code : undefined;
      console.error("createPixPayment: operation failed", {
        stage, reason,
        ...(typeof code === "number" && Number.isInteger(code) ?
          {code} : {}),
      });
      throw new HttpsError(
        "internal", "Não foi possível gerar o Pix. Tente novamente.",
      );
    }
  },
);
