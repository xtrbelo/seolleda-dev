import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";
import type {
  CreateSaleData,
  CreateSaleResponse,
  SaleItemSnapshot,
} from "../types/sale.js";

const MAX_DISTINCT_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 1000;
const SALE_EXPIRATION_MINUTES = 15;

/** Returns whether a value can be safely inspected as an object.
 * @param {unknown} value Value to inspect.
 * @return {boolean} Whether the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates and reduces untrusted callable input to the accepted sale shape.
 * @param {unknown} data Untrusted callable payload.
 * @return {CreateSaleData} Validated sale input.
 */
function validateInput(data: unknown): CreateSaleData {
  if (
    !isRecord(data) ||
    typeof data.terminalId !== "string" ||
    !data.terminalId.trim()
  ) {
    throw new HttpsError("invalid-argument", "Terminal inválido.");
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new HttpsError("invalid-argument", "Carrinho vazio.");
  }
  if (data.items.length > MAX_DISTINCT_ITEMS) {
    throw new HttpsError("invalid-argument", "O carrinho possui itens demais.");
  }

  const items = data.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.productId !== "string" ||
      !item.productId.trim()
    ) {
      throw new HttpsError("invalid-argument", "Produto inválido.");
    }
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_QUANTITY_PER_ITEM
    ) {
      throw new HttpsError("invalid-argument", "Quantidade inválida.");
    }
    return {productId: item.productId.trim(), quantity: item.quantity};
  });

  const productIds = new Set(items.map((item) => item.productId));
  if (productIds.size !== items.length) {
    throw new HttpsError("invalid-argument", "Não envie produtos repetidos.");
  }
  return {terminalId: data.terminalId.trim(), items};
}

/** Hides unexpected backend details from callable clients.
 * @param {unknown} error Error raised while creating the sale.
 * @return {HttpsError} Safe error for the callable client.
 */
function getFriendlyError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  return new HttpsError("internal", "Não foi possível iniciar a compra.");
}

export const createSale = onCall(
  {region: "southamerica-east1"},
  async (request): Promise<CreateSaleResponse> => {
    let input: CreateSaleData;
    try {
      input = validateInput(request.data);

      const terminalSnapshot = await firestore
        .collection("terminals")
        .doc(input.terminalId)
        .get();
      if (
        !terminalSnapshot.exists ||
        terminalSnapshot.data()?.active !== true
      ) {
        throw new HttpsError("failed-precondition", "Terminal inválido.");
      }
      const terminal = terminalSnapshot.data();
      const storeId = terminal?.storeId;
      if (typeof storeId !== "string" || !storeId) {
        throw new HttpsError("failed-precondition", "Terminal inválido.");
      }

      const productSnapshots = await Promise.all(
        input.items.map((item) =>
          firestore.collection("products").doc(item.productId).get(),
        ),
      );
      const inventorySnapshots = await Promise.all(
        input.items.map((item) =>
          firestore
            .collection("inventory")
            .where("storeId", "==", storeId)
            .where("productId", "==", item.productId)
            .limit(1)
            .get(),
        ),
      );

      const saleItems: SaleItemSnapshot[] = [];
      for (let index = 0; index < input.items.length; index += 1) {
        const productData = productSnapshots[index].data();
        if (!productSnapshots[index].exists) {
          throw new HttpsError("not-found", "Produto não encontrado.");
        }
        if (productData?.active !== true) {
          throw new HttpsError(
            "failed-precondition",
            "Produto indisponível para venda.",
          );
        }
        if (
          typeof productData.salePrice !== "number" ||
          !Number.isFinite(productData.salePrice) ||
          productData.salePrice < 0 ||
          typeof productData.name !== "string" ||
          typeof productData.sku !== "string" ||
          typeof productData.barcode !== "string" ||
          !productData.sku ||
          !productData.barcode
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Produto indisponível para venda.",
          );
        }

        const inventoryData = inventorySnapshots[index].docs[0]?.data();
        const availableStock =
          typeof inventoryData?.quantity === "number" ?
            inventoryData.quantity :
            0;
        if (availableStock < input.items[index].quantity) {
          throw new HttpsError("failed-precondition", "Estoque insuficiente.");
        }

        const unitPriceCents = Math.round(productData.salePrice * 100);
        const itemTotalCents = unitPriceCents * input.items[index].quantity;
        if (
          !Number.isSafeInteger(unitPriceCents) ||
          !Number.isSafeInteger(itemTotalCents)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Produto indisponível para venda.",
          );
        }
        saleItems.push({
          productId: input.items[index].productId,
          quantity: input.items[index].quantity,
          name: productData.name,
          sku: productData.sku,
          barcode: productData.barcode,
          unitPriceCents,
          totalCents: itemTotalCents,
        });
      }

      const subtotalCents = saleItems.reduce(
        (total, item) => total + item.totalCents,
        0,
      );
      const saleReference = firestore.collection("sales").doc();
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(
        now.toMillis() + SALE_EXPIRATION_MINUTES * 60 * 1000,
      );
      const sale = {
        storeId,
        terminalId: input.terminalId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        items: saleItems,
        itemsCount: saleItems.reduce((count, item) => count + item.quantity, 0),
        subtotalCents,
        totalCents: subtotalCents,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt,
        source: "SELF_CHECKOUT",
      };
      await saleReference.set(sale);

      return {
        saleId: saleReference.id,
        totalCents: subtotalCents,
        status: "PENDING_PAYMENT",
        expiresAt,
      };
    } catch (error) {
      throw getFriendlyError(error);
    }
  },
);
