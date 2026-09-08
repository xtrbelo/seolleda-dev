import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import {getFunctions, httpsCallable} from "firebase/functions";
import { app, db } from "../lib/firebase";
import type { Product, ProductInput } from "../types/product";

const productsCollection = collection(db, "products");

export function normalizeProductName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeSku(sku: string) {
  return sku.trim().replace(/\s+/g, "").toLocaleLowerCase();
}

export function normalizeBarcode(barcode: string) {
  return barcode.trim();
}

function cleanProductInput(input: ProductInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const sku = input.sku.trim().replace(/\s+/g, " ");
  const barcode = normalizeBarcode(input.barcode);

  if (name.length < 2) throw new Error("PRODUCT_INVALID_NAME");
  if (!sku) throw new Error("PRODUCT_INVALID_SKU");
  if (!/^\d+$/.test(barcode)) throw new Error("PRODUCT_INVALID_BARCODE");
  if (!input.categoryId || !input.categoryName)
    throw new Error("PRODUCT_INVALID_CATEGORY");
  if (!Number.isFinite(input.costPrice) || input.costPrice < 0)
    throw new Error("PRODUCT_INVALID_COST");
  if (!Number.isFinite(input.salePrice) || input.salePrice < 0)
    throw new Error("PRODUCT_INVALID_SALE");

  return {
    ...input,
    name,
    normalizedName: normalizeProductName(name),
    sku,
    normalizedSku: normalizeSku(sku),
    barcode,
    description: input.description.trim(),
  };
}

const manageProducts = httpsCallable(getFunctions(app, "southamerica-east1"), "manageProducts");

export async function listProducts(): Promise<Product[]> {
  const snapshot = await getDocs(productsCollection);

  return snapshot.docs
    .map(
      (productDocument) =>
        ({
          id: productDocument.id,
          ...productDocument.data(),
        }) as Product,
    )
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export async function getProductByBarcode(
  barcode: string,
): Promise<Product | null> {
  const snapshot = await getDocs(
    query(
      productsCollection,
      where("barcode", "==", normalizeBarcode(barcode)),
      limit(1),
    ),
  );
  const productDocument = snapshot.docs[0];
  return productDocument
    ? ({ id: productDocument.id, ...productDocument.data() } as Product)
    : null;
}

export async function createProduct(input: ProductInput) {
  const cleanInput = cleanProductInput(input);
  await manageProducts({action: "create", product: cleanInput});
}

export async function updateProduct(productId: string, input: ProductInput) {
  const cleanInput = cleanProductInput(input);
  await manageProducts({action: "update", id: productId, product: cleanInput});
}

export async function updateProductStatus(productId: string, active: boolean) {
  await manageProducts({action: "status", id: productId, active});
}
