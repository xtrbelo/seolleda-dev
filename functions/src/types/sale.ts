import type {Timestamp} from "firebase-admin/firestore";

export type CreateSaleItem = {
  productId: string;
  quantity: number;
};

export type SaleItemSnapshot = CreateSaleItem & {
  inventoryId: string;
  name: string;
  sku: string;
  barcode: string;
  unitPriceCents: number;
  totalCents: number;
};

export type CreateSaleData = {
  terminalId: string;
  items: CreateSaleItem[];
};

export type CreateSaleResponse = {
  saleId: string;
  totalCents: number;
  status: "PENDING_PAYMENT";
  expiresAt: Timestamp;
};
