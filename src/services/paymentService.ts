import { getFunctions, httpsCallable } from "firebase/functions";
import type { Timestamp } from "firebase/firestore";
import { app } from "../lib/firebase";

const functions = getFunctions(app, "southamerica-east1");

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type CreatePixPaymentRequest = {
  saleId: string;
  payerEmail: string;
};

export type CreatePixPaymentResponse = {
  orderId: string;
  paymentId: string;
  status: string;
  statusDetail: string;
  qrCode: string;
  /** Pode estar vazio em ambiente de teste do Mercado Pago. */
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: Timestamp;
};

// ---------------------------------------------------------------------------
// Callable
// ---------------------------------------------------------------------------

/**
 * Gera uma cobrança Pix para uma venda existente.
 *
 * O valor da cobrança é sempre calculado no backend — nunca enviamos
 * preço ou total a partir do frontend.
 *
 * O MP_ACCESS_TOKEN permanece exclusivamente no backend (Cloud Function);
 * o frontend nunca tem acesso a ele.
 */
export async function createPixPayment(
  saleId: string,
  payerEmail: string,
): Promise<CreatePixPaymentResponse> {
  const callable = httpsCallable<
    CreatePixPaymentRequest,
    CreatePixPaymentResponse
  >(functions, "createPixPayment");

  const response = await callable({ saleId, payerEmail });
  return response.data;
}
