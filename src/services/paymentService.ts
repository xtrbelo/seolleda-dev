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

type CreateCardPaymentRequest = {
  saleId: string;
  token: string;
  paymentMethodId: string;
  issuerId?: number;
  payerEmail?: string;
};

type CreateCardPaymentCallableRequest = CreateCardPaymentRequest & {
  installments: 1;
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

export type CreateCardPaymentResponse = {
  saleId: string;
  paymentId: string;
  status: string;
  statusDetail: string;
  totalCents: number;
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

export async function createCardPayment(
  request: CreateCardPaymentRequest,
): Promise<CreateCardPaymentResponse> {
  const callable = httpsCallable<
    CreateCardPaymentCallableRequest,
    CreateCardPaymentResponse
  >(functions, "createCardPayment");
  const response = await callable({ ...request, installments: 1 });
  return response.data;
}
