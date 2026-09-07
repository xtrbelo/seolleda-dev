import { getFunctions, httpsCallable } from "firebase/functions";
import type { Timestamp } from "firebase/firestore";
import { app } from "../lib/firebase";
import type { CartItem } from "../types/cart";

const functions = getFunctions(app, "southamerica-east1");
const terminalId = import.meta.env.VITE_TERMINAL_ID;

function getTerminalId() {
  if (!terminalId?.trim()) {
    throw new Error("VITE_TERMINAL_ID_NOT_CONFIGURED");
  }
  return terminalId.trim();
}

export type CheckoutProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  salePrice: number;
  availableStock: number;
};

type CreateSaleRequest = {
  terminalId: string;
  items: Array<Pick<CartItem, "productId" | "quantity">>;
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

export type SalePaymentState =
  | "PENDING"
  | "APPROVED"
  | "REVIEW_REQUIRED"
  | "EXPIRED";

export async function getSalePaymentStatus(
  saleId: string,
  statusToken: string,
): Promise<SalePaymentState> {
  const callable = httpsCallable<
    { saleId: string; statusToken: string },
    { state: SalePaymentState }
  >(functions, "getSalePaymentStatus");
  const response = await callable({ saleId, statusToken });
  return response.data.state;
}

export async function createSale(
  items: CartItem[],
  customerDocument?: string,
  customerEmail?: string
): Promise<CreateSaleResponse> {
  const callable = httpsCallable<CreateSaleRequest, CreateSaleResponse>(
    functions,
    "createSale",
  );

  const payload: CreateSaleRequest = {
    terminalId: getTerminalId(),
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
  };

  if (customerDocument) {
    payload.customerDocument = customerDocument.replace(/[^\d]/g, "");
  }

  if (customerEmail) {
    payload.customerEmail = customerEmail.trim().toLowerCase();
  }

  const response = await callable(payload);
  return response.data;
}

export async function getCheckoutProduct(
  barcode: string,
): Promise<CheckoutProduct> {
  const callable = httpsCallable<
    { terminalId: string; barcode: string },
    CheckoutProduct
  >(functions, "getCheckoutProduct");
  const response = await callable({ terminalId: getTerminalId(), barcode });
  return response.data;
}
