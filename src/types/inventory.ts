import type { Timestamp } from "firebase/firestore";

export type Inventory = {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  minimumQuantity: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
