import type {Timestamp} from "firebase-admin/firestore";

export type CreateSaleItem = {
  productId: string;
  quantity: number;
};

export type SaleItemSnapshot = CreateSaleItem & {
  name: string;
  sku: string;
  barcode: string;
  unitPriceCents: number;
  totalCents: number;
};

export type CreateSaleData = {
  terminalId: string;
  items: CreateSaleItem[];
  customerDocument?: string;
  customerEmail?: string;
};

export type CreateSaleResponse = {
  saleId: string;
  statusToken: string;
  totalCents: number;
  status: "PENDING_PAYMENT";
  expiresAt: Timestamp;
};

export type GetSalePaymentStatusResponse = {
  state: "PENDING" | "APPROVED" | "REVIEW_REQUIRED" | "EXPIRED";
};

// ---------------------------------------------------------------------------
// PIX Payment
// ---------------------------------------------------------------------------

export type CreatePixPaymentData = {
  saleId: string;
  payerEmail: string;
};

/**
 * Dados retornados ao frontend após criar ou reutilizar uma cobrança Pix.
 * Nunca inclui o Access Token nem campos administrativos.
 */
export type CreatePixPaymentResponse = {
  saleId: string;
  paymentId: string;
  status: string;
  qrCode: string;
  /** Pode estar vazio em ambiente de teste do Mercado Pago. */
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAtMs: number;
  totalCents: number;
};
