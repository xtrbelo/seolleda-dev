/**
 * createPixPayment — Callable Cloud Function v2
 *
 * Cria uma cobrança Pix no Mercado Pago via Orders API para uma venda
 * existente em status PENDING_PAYMENT.
 *
 * Contrato:
 *   - Nunca altera inventory ou stockMovements.
 *   - Nunca marca a venda como PAID.
 *   - Nunca expõe o MP_ACCESS_TOKEN ao frontend.
 *   - O valor da cobrança é sempre lido do Firestore (backend), nunca do
 *     payload enviado pelo navegador.
 */

import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {
  CreatePixPaymentData,
  CreatePixPaymentResponse,
} from "../types/sale.js";
import {createMpPixOrder} from "./mercadoPagoClient.js";

// ---------------------------------------------------------------------------
// Secret
// ---------------------------------------------------------------------------

const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

// ---------------------------------------------------------------------------
// Validação de input
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ID_LENGTH = 128;
const PIX_EXPIRATION_MINUTES = 30;

/**
 * Verifica e normaliza o payload recebido do frontend.
 * @param {unknown} data Payload recebido da chamada callable.
 * @return {CreatePixPaymentData} Dados validados e normalizados.
 */
function validateInput(data: unknown): CreatePixPaymentData {
  if (typeof data !== "object" || data === null) {
    throw new HttpsError("invalid-argument", "Dados inválidos.");
  }
  const payload = data as Record<string, unknown>;

  // saleId
  if (
    typeof payload.saleId !== "string" ||
    !payload.saleId.trim() ||
    payload.saleId.length > MAX_ID_LENGTH
  ) {
    throw new HttpsError("invalid-argument", "Venda inválida.");
  }

  // payerEmail — normaliza e valida minimamente
  const rawEmail =
    typeof payload.payerEmail === "string" ? payload.payerEmail : "";
  const payerEmail = rawEmail.trim().toLowerCase();
  if (!EMAIL_REGEX.test(payerEmail)) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }

  return {
    saleId: payload.saleId.trim(),
    payerEmail,
  };
}

/**
 * Converte erros inesperados em HttpsError segura para o cliente.
 * @param {unknown} error Erro capturado.
 * @return {HttpsError} Erro seguro para retornar ao cliente.
 */
function getFriendlyError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  console.error("Unexpected error in createPixPayment", error);
  return new HttpsError(
    "internal",
    "Não foi possível gerar o Pix. Tente novamente.",
  );
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------

export const createPixPayment = onCall(
  {
    region: "southamerica-east1",
    secrets: [MP_ACCESS_TOKEN],
  },
  async (request): Promise<CreatePixPaymentResponse> => {
    try {
      // 1. Valida input do frontend
      const input = validateInput(request.data);
      const {saleId, payerEmail} = input;

      // 2. Busca a venda no Firestore
      const saleRef = firestore.collection("sales").doc(saleId);
      const saleSnap = await saleRef.get();

      if (!saleSnap.exists) {
        throw new HttpsError("not-found", "Venda não encontrada.");
      }

      const sale = saleSnap.data()!;

      // 3. Valida estado da venda
      if (sale.status !== "PENDING_PAYMENT") {
        throw new HttpsError(
          "failed-precondition",
          "Esta venda não está aguardando pagamento.",
        );
      }
      if (sale.paymentStatus !== "PENDING") {
        throw new HttpsError(
          "failed-precondition",
          "Esta venda já possui pagamento em processamento.",
        );
      }
      if (
        typeof sale.totalCents !== "number" ||
        !Number.isInteger(sale.totalCents) ||
        sale.totalCents <= 0
      ) {
        throw new HttpsError("failed-precondition", "Total da venda inválido.");
      }
      if (typeof sale.terminalId !== "string" || !sale.terminalId) {
        throw new HttpsError(
          "failed-precondition",
          "Terminal não identificado.",
        );
      }
      if (typeof sale.storeId !== "string" || !sale.storeId) {
        throw new HttpsError(
          "failed-precondition",
          "Loja não identificada.",
        );
      }

      const {totalCents} = sale;

      // 4. Idempotência local
      // Se já existe uma Order PIX criada para esta venda e ela ainda está
      // dentro do prazo de validade, reutiliza os dados salvos sem criar
      // uma nova cobrança no Mercado Pago.
      if (sale.mercadoPagoOrderId && sale.pixExpiresAt instanceof Timestamp) {
        const expiresAtMs = sale.pixExpiresAt.toMillis();
        const nowMs = Date.now();
        if (expiresAtMs > nowMs) {
          console.info("createPixPayment: reusing existing PIX order", {
            saleId,
            mercadoPagoOrderId: sale.mercadoPagoOrderId,
          });
          return {
            orderId: String(sale.mercadoPagoOrderId),
            paymentId: String(sale.mercadoPagoPaymentId ?? ""),
            status: String(sale.pixStatus ?? ""),
            statusDetail: String(sale.pixStatusDetail ?? ""),
            qrCode: String(sale.pixQrCode ?? ""),
            // qrCodeBase64 não é armazenado — retorna vazio na reutilização
            qrCodeBase64: "",
            ticketUrl: String(sale.pixTicketUrl ?? ""),
            expiresAt: sale.pixExpiresAt,
          };
        }
      }

      // 5. Cria a Order no Mercado Pago
      const accessToken = MP_ACCESS_TOKEN.value();
      let mpResult;
      try {
        mpResult = await createMpPixOrder({
          saleId,
          totalCents,
          payerEmail,
          accessToken,
        });
      } catch {
        console.error("createPixPayment: MP API call failed", {saleId});
        throw new HttpsError(
          "internal",
          "Não foi possível gerar o Pix. Tente novamente.",
        );
      }

      // 6. Calcula timestamps
      const now = Timestamp.now();
      const pixExpiresAt = Timestamp.fromMillis(
        now.toMillis() + PIX_EXPIRATION_MINUTES * 60 * 1000,
      );

      // 7. Salva no Firestore
      // Não altera: status, paymentStatus, inventory, stockMovements.
      // qrCodeBase64 não é salvo (aumentaria o tamanho do documento);
      // está disponível apenas na resposta imediata ao frontend.
      await saleRef.update({
        paymentMethod: "PIX",
        mercadoPagoOrderId: mpResult.orderId,
        mercadoPagoPaymentId: mpResult.paymentId,
        pixStatus: mpResult.paymentStatus,
        pixStatusDetail: mpResult.paymentStatusDetail,
        pixCreatedAt: now,
        pixExpiresAt,
        pixQrCode: mpResult.qrCode,
        pixTicketUrl: mpResult.ticketUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.info("createPixPayment: PIX order created", {
        saleId,
        mercadoPagoOrderId: mpResult.orderId,
      });

      // 8. Retorna apenas campos seguros ao frontend
      return {
        orderId: mpResult.orderId,
        paymentId: mpResult.paymentId,
        status: mpResult.paymentStatus,
        statusDetail: mpResult.paymentStatusDetail,
        qrCode: mpResult.qrCode,
        qrCodeBase64: mpResult.qrCodeBase64,
        ticketUrl: mpResult.ticketUrl,
        expiresAt: pixExpiresAt,
      };
    } catch (error) {
      throw getFriendlyError(error);
    }
  },
);
