import type { Timestamp } from "firebase/firestore";

export type Product = {
  id: string;
  name: string;
  normalizedName: string;
  description: string;
  sku: string;
  normalizedSku: string;
  barcode: string;
  categoryId: string;
  categoryName: string;
  costPrice: number;
  salePrice: number;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type ProductInput = {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  categoryId: string;
  categoryName: string;
  costPrice: number;
  salePrice: number;
  active: boolean;
};
