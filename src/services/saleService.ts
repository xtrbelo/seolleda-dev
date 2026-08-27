import { getFunctions, httpsCallable } from "firebase/functions";
import type { Timestamp } from "firebase/firestore";
import { app } from "../lib/firebase";
import type { CartItem } from "../types/cart";

const functions = getFunctions(app, "southamerica-east1");
const terminalId = import.meta.env.VITE_TERMINAL_ID || "default-terminal";

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
};

export type CreateSaleResponse = {
  saleId: string;
  totalCents: number;
  status: "PENDING_PAYMENT";
  expiresAt: Timestamp;
};

export async function createSale(
  items: CartItem[],
): Promise<CreateSaleResponse> {
  const callable = httpsCallable<CreateSaleRequest, CreateSaleResponse>(
    functions,
    "createSale",
  );
  const response = await callable({
    terminalId,
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
  });
  return response.data;
}

export async function getCheckoutProduct(
  barcode: string,
): Promise<CheckoutProduct> {
  const callable = httpsCallable<
    { terminalId: string; barcode: string },
    CheckoutProduct
  >(functions, "getCheckoutProduct");
  const response = await callable({ terminalId, barcode });
  return response.data;
}
