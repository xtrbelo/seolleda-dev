import type { Timestamp } from "firebase/firestore";

export type StockMovementType =
  | "ENTRY"
  | "EXIT"
  | "ADJUSTMENT"
  | "SALE"
  | "REFUND";

export type StockMovement = {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  userId: string;
  userEmail: string;
  createdAt: Timestamp | null;
};
