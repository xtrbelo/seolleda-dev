/* eslint-disable max-len */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";

type CheckoutProductResponse = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  salePrice: number;
  availableStock: number;
};

export const getCheckoutProduct = onCall(
  {region: "southamerica-east1"},
  async (request): Promise<CheckoutProductResponse> => {
    const data = request.data as Record<string, unknown> | null;
    const barcode =
      typeof data?.barcode === "string" ? data.barcode.trim() : "";
    const terminalId =
      typeof data?.terminalId === "string" ? data.terminalId.trim() : "";
    if (!/^\d+$/.test(barcode) || barcode.length > 64) {
      throw new HttpsError("invalid-argument", "Código de barras inválido.");
    }
    if (!terminalId || terminalId.length > 128) {
      throw new HttpsError("invalid-argument", "Terminal inválido.");
    }
    const terminalSnapshot = await firestore
      .collection("terminals")
      .doc(terminalId)
      .get();
    const terminal = terminalSnapshot.data();
    const storeId = terminal?.storeId;
    if (
      !terminalSnapshot.exists ||
      terminal?.active !== true ||
      typeof storeId !== "string" ||
      !storeId
    ) {
      throw new HttpsError("failed-precondition", "Terminal inválido.");
    }
    const productQuery = await firestore
      .collection("products")
      .where("barcode", "==", barcode)
      .where("active", "==", true)
      .limit(1)
      .get();
    const productSnapshot = productQuery.docs[0];
    const product = productSnapshot?.data();
    if (
      !productSnapshot ||
      typeof product?.name !== "string" ||
      typeof product.sku !== "string" ||
      typeof product.barcode !== "string" ||
      typeof product.salePrice !== "number" ||
      !Number.isFinite(product.salePrice) ||
      product.salePrice < 0
    ) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const inventorySnapshot = await firestore
      .collection("inventory")
      .where("storeId", "==", storeId)
      .where("productId", "==", productSnapshot.id)
      .limit(1)
      .get();
    const quantity = inventorySnapshot.docs[0]?.data().quantity;
    return {
      id: productSnapshot.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      salePrice: product.salePrice,
      availableStock: Number.isInteger(quantity) && quantity > 0 ? quantity : 0,
    };
  },
);
