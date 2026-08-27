/* eslint-disable max-len */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {CreateSaleData, CreateSaleResponse, SaleItemSnapshot} from "../types/sale.js";

const MAX_DISTINCT_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 1000;
const MAX_ID_LENGTH = 128;
const SALE_EXPIRATION_MINUTES = 15;
const MIN_SALE_INTERVAL_MS = 1000;

/** Checks whether an untrusted value can be inspected as an object.
 * @param {unknown} value Value to inspect.
 * @return {boolean} Whether the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates the untrusted callable payload.
 * @param {unknown} data Callable payload.
 * @return {CreateSaleData} Sanitized sale data.
 */
function validateInput(data: unknown): CreateSaleData {
  if (!isRecord(data) || typeof data.terminalId !== "string" ||
      !data.terminalId.trim() || data.terminalId.length > MAX_ID_LENGTH) {
    throw new HttpsError("invalid-argument", "Terminal inválido.");
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new HttpsError("invalid-argument", "Carrinho vazio.");
  }
  if (data.items.length > MAX_DISTINCT_ITEMS) {
    throw new HttpsError("invalid-argument", "O carrinho possui itens demais.");
  }
  const items = data.items.map((item) => {
    if (!isRecord(item) || typeof item.productId !== "string" ||
        !item.productId.trim() || item.productId.length > MAX_ID_LENGTH) {
      throw new HttpsError("invalid-argument", "Produto inválido.");
    }
    if (typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) || item.quantity <= 0 ||
        item.quantity > MAX_QUANTITY_PER_ITEM) {
      throw new HttpsError("invalid-argument", "Quantidade inválida.");
    }
    return {productId: item.productId.trim(), quantity: item.quantity};
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new HttpsError("invalid-argument", "Não envie produtos repetidos.");
  }
  return {terminalId: data.terminalId.trim(), items};
}

/** Converts unexpected failures to safe client errors.
 * @param {unknown} error Caught error.
 * @return {HttpsError} Error safe to return to the caller.
 */
function getFriendlyError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  console.error("Unexpected error while creating a sale", error);
  return new HttpsError("internal", "Não foi possível iniciar a compra.");
}

export const createSale = onCall(
  {region: "southamerica-east1"},
  async (request): Promise<CreateSaleResponse> => {
    try {
      const input = validateInput(request.data);
      const terminalReference = firestore.collection("terminals").doc(input.terminalId);
      const saleReference = firestore.collection("sales").doc();

      return await firestore.runTransaction(async (transaction) => {
        const terminalSnapshot = await transaction.get(terminalReference);
        const terminal = terminalSnapshot.data();
        const storeId = terminal?.storeId;
        if (!terminalSnapshot.exists || terminal?.active !== true ||
            typeof storeId !== "string" || !storeId) {
          throw new HttpsError("failed-precondition", "Terminal inválido.");
        }
        const lastSaleAt = terminal.lastSaleAt;
        if (lastSaleAt instanceof Timestamp &&
            Timestamp.now().toMillis() - lastSaleAt.toMillis() <
              MIN_SALE_INTERVAL_MS) {
          throw new HttpsError(
            "resource-exhausted",
            "Aguarde um instante antes de iniciar outra compra.",
          );
        }

        const productReferences = input.items.map((item) =>
          firestore.collection("products").doc(item.productId));
        const productSnapshots = await transaction.getAll(...productReferences);
        const inventoryQueries = input.items.map((item) =>
          firestore.collection("inventory")
            .where("storeId", "==", storeId)
            .where("productId", "==", item.productId)
            .limit(1));
        const inventorySnapshots = [];
        for (const inventoryQuery of inventoryQueries) {
          inventorySnapshots.push(await transaction.get(inventoryQuery));
        }
        const saleItems: SaleItemSnapshot[] = [];

        for (let index = 0; index < input.items.length; index += 1) {
          const item = input.items[index];
          const productData = productSnapshots[index].data();
          const inventoryDocument = inventorySnapshots[index].docs[0];
          const inventoryData = inventoryDocument?.data();
          if (!productSnapshots[index].exists) {
            throw new HttpsError("not-found", "Produto não encontrado.");
          }
          if (productData?.active !== true ||
              typeof productData.salePrice !== "number" ||
              !Number.isFinite(productData.salePrice) || productData.salePrice < 0 ||
              typeof productData.name !== "string" || !productData.name ||
              typeof productData.sku !== "string" || !productData.sku ||
              typeof productData.barcode !== "string" || !productData.barcode) {
            throw new HttpsError("failed-precondition", "Produto indisponível para venda.");
          }
          const availableStock = inventoryData?.quantity;
          if (!Number.isInteger(availableStock) || availableStock < item.quantity) {
            throw new HttpsError("failed-precondition", "Estoque insuficiente.");
          }
          const unitPriceCents = Math.round(productData.salePrice * 100);
          const itemTotalCents = unitPriceCents * item.quantity;
          if (!Number.isSafeInteger(unitPriceCents) ||
              !Number.isSafeInteger(itemTotalCents)) {
            throw new HttpsError("failed-precondition", "Produto indisponível para venda.");
          }
          saleItems.push({productId: item.productId,
            inventoryId: inventoryDocument.id, quantity: item.quantity,
            name: productData.name, sku: productData.sku,
            barcode: productData.barcode, unitPriceCents, totalCents: itemTotalCents});
        }

        const subtotalCents = saleItems.reduce((total, item) => total + item.totalCents, 0);
        if (!Number.isSafeInteger(subtotalCents)) {
          throw new HttpsError("failed-precondition", "Total inválido.");
        }
        const now = Timestamp.now();
        const expiresAt = Timestamp.fromMillis(
          now.toMillis() + SALE_EXPIRATION_MINUTES * 60 * 1000);
        for (let index = 0; index < input.items.length; index += 1) {
          const inventoryDocument = inventorySnapshots[index].docs[0];
          transaction.update(inventoryDocument.ref, {
            quantity: inventoryDocument.data().quantity - input.items[index].quantity,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.create(saleReference, {
          storeId, terminalId: input.terminalId, status: "PENDING_PAYMENT",
          paymentStatus: "PENDING", inventoryReservationStatus: "RESERVED",
          items: saleItems,
          itemsCount: saleItems.reduce((count, item) => count + item.quantity, 0),
          subtotalCents, totalCents: subtotalCents,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          expiresAt, source: "SELF_CHECKOUT",
        });
        transaction.update(terminalReference, {
          lastSaleAt: FieldValue.serverTimestamp(),
        });
        return {saleId: saleReference.id, totalCents: subtotalCents,
          status: "PENDING_PAYMENT", expiresAt};
      });
    } catch (error) {
      throw getFriendlyError(error);
    }
  },
);
