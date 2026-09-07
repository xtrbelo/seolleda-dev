import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";

const functions = getFunctions(app, "southamerica-east1");

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type CreatePixPaymentRequest = {
  saleId: string;
  payerEmail?: string;
};

export type CreatePixPaymentResponse = {
  saleId: string;
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  totalCents: number;
  expiresAtMs: number;
};

// ---------------------------------------------------------------------------
// Callable
// ---------------------------------------------------------------------------

/**
 * Gera uma cobrança Pix direta para uma venda existente via Mercado Pago.
 *
 * O valor da cobrança é sempre calculado no backend.
 */
export async function createPixPayment(
  saleId: string,
  payerEmail?: string,
): Promise<CreatePixPaymentResponse> {
  const callable = httpsCallable<
    CreatePixPaymentRequest,
    CreatePixPaymentResponse
  >(functions, "createPixPayment");

  const response = await callable({ saleId, payerEmail });
  return response.data;
}
