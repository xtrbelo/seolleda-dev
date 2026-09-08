/* eslint-disable max-len */
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {requireRole} from "../auth/roles.js";

type ProductInput = {name?: unknown; description?: unknown; sku?: unknown; barcode?: unknown; categoryId?: unknown; categoryName?: unknown; costPrice?: unknown; salePrice?: unknown; active?: unknown};

/** Validate and trim a bounded text value.
 * @param {unknown} value Candidate value.
 * @param {number} min Minimum length.
 * @param {number} max Maximum length.
 * @param {string} label Field label.
 * @return {string} Trimmed text.
 */
function text(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return value.trim();
}

/** Validate the product payload received by the callable.
 * @param {unknown} value Candidate product.
 * @return {object} Normalized product.
 */
function productInput(value: unknown): {name: string; normalizedName: string; description: string; sku: string; normalizedSku: string; barcode: string; categoryId: string; categoryName: string; costPrice: number; salePrice: number; active: boolean} {
  const input = value as ProductInput | null;
  const name = text(input?.name, 2, 120, "Nome").replace(/\s+/g, " ");
  const sku = text(input?.sku, 1, 64, "SKU").replace(/\s+/g, " ");
  const barcode = text(input?.barcode, 1, 64, "Código de barras");
  if (!/^\d+$/.test(barcode)) throw new HttpsError("invalid-argument", "Código de barras inválido.");
  const categoryId = text(input?.categoryId, 1, 128, "Categoria");
  const categoryName = text(input?.categoryName, 1, 120, "Categoria");
  const costPrice = input?.costPrice;
  const salePrice = input?.salePrice;
  if (typeof costPrice !== "number" || !Number.isFinite(costPrice) || costPrice < 0 || typeof salePrice !== "number" || !Number.isFinite(salePrice) || salePrice < 0) throw new HttpsError("invalid-argument", "Preço inválido.");
  if (typeof input?.active !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
  return {name, normalizedName: name.toLocaleLowerCase(), description: text(input?.description, 0, 2000, "Descrição"), sku, normalizedSku: sku.replace(/\s+/g, "").toLocaleLowerCase(), barcode, categoryId, categoryName, costPrice, salePrice, active: input.active};
}

/** Validate a Firestore document identifier.
 * @param {unknown} value Candidate identifier.
 * @return {string} Safe identifier.
 */
function identifier(value: unknown): string {
  const id = text(value, 1, 128, "Produto");
  if (id.includes("/") || id === "." || id === "..") throw new HttpsError("invalid-argument", "Identificação inválida.");
  return id;
}

/** Encode a unique-key value as a safe Firestore document identifier.
 * @param {string} type Key type.
 * @param {string} value Key value.
 * @return {string} Document identifier.
 */
function keyId(type: "sku" | "barcode", value: string): string {
  return `${type}_${Buffer.from(value).toString("base64url")}`;
}

/** Reject a duplicate in legacy product documents before claiming a key.
 * @param {string} field Product field.
 * @param {string} value Normalized field value.
 * @param {string|undefined} productId Current product identifier.
 * @return {Promise<void>} Resolves when no duplicate exists.
 */
async function rejectLegacyDuplicate(field: "normalizedSku" | "barcode", value: string, productId?: string): Promise<void> {
  const snapshot = await firestore.collection("products").where(field, "==", value).limit(2).get();
  if (snapshot.docs.some((doc) => doc.id !== productId)) throw new HttpsError("already-exists", field === "normalizedSku" ? "PRODUCT_DUPLICATE_SKU" : "PRODUCT_DUPLICATE_BARCODE");
}

export const manageProducts = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "catalog");
  const input = request.data as {action?: unknown; id?: unknown; product?: unknown; active?: unknown} | null;
  const action = input?.action;
  if (action === "status") {
    const id = identifier(input?.id);
    if (typeof input?.active !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
    await firestore.collection("products").doc(id).update({active: input.active, updatedAt: FieldValue.serverTimestamp()});
    return {ok: true, id};
  }
  if (action !== "create" && action !== "update") throw new HttpsError("invalid-argument", "Operação inválida.");
  const id = action === "update" ? identifier(input?.id) : firestore.collection("products").doc().id;
  const product = productInput(input?.product);
  await Promise.all([rejectLegacyDuplicate("normalizedSku", product.normalizedSku, action === "update" ? id : undefined), rejectLegacyDuplicate("barcode", product.barcode, action === "update" ? id : undefined)]);
  const productRef = firestore.collection("products").doc(id);
  const skuRef = firestore.collection("productKeys").doc(keyId("sku", product.normalizedSku));
  const barcodeRef = firestore.collection("productKeys").doc(keyId("barcode", product.barcode));
  await firestore.runTransaction(async (tx) => {
    const [existing, skuKey, barcodeKey] = await tx.getAll(productRef, skuRef, barcodeRef);
    if (action === "update" && !existing.exists) throw new HttpsError("not-found", "Produto não encontrado.");
    if (skuKey.exists && skuKey.get("productId") !== id) throw new HttpsError("already-exists", "PRODUCT_DUPLICATE_SKU");
    if (barcodeKey.exists && barcodeKey.get("productId") !== id) throw new HttpsError("already-exists", "PRODUCT_DUPLICATE_BARCODE");
    if (action === "update") {
      const old = existing.data() ?? {};
      if (typeof old.normalizedSku === "string" && old.normalizedSku !== product.normalizedSku) tx.delete(firestore.collection("productKeys").doc(keyId("sku", old.normalizedSku)));
      if (typeof old.barcode === "string" && old.barcode !== product.barcode) tx.delete(firestore.collection("productKeys").doc(keyId("barcode", old.barcode)));
      tx.update(productRef, {...product, updatedAt: FieldValue.serverTimestamp()});
    } else {
      tx.create(productRef, {...product, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    }
    tx.set(skuRef, {productId: id, type: "sku", value: product.normalizedSku, createdAt: FieldValue.serverTimestamp()});
    tx.set(barcodeRef, {productId: id, type: "barcode", value: product.barcode, createdAt: FieldValue.serverTimestamp()});
  });
  return {ok: true, id};
});
