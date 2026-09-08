/* eslint-disable max-len */
import {createHash, randomBytes} from "crypto";
import {FieldValue, Timestamp, type DocumentReference} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {
  CreateSaleData,
  CreateSaleResponse,
  SaleItemSnapshot,
} from "../types/sale.js";

const MAX_DISTINCT_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 1000;
const MAX_ID_LENGTH = 128;
const SALE_EXPIRATION_MINUTES = 15;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a Brazilian CPF (Cadastro de Pessoas Físicas).
 * @param {string} cpf The CPF string to validate.
 * @return {boolean} True if the CPF is valid, false otherwise.
 */
function isValidCPF(cpf: string): boolean {
  if (typeof cpf !== "string") return false;
  const strCPF = cpf.replace(/[^\d]/g, "");
  if (strCPF.length !== 11) return false;
  if (/^(\d)\1+$/.test(strCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(10, 11))) return false;

  return true;
}

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
  if (
    !isRecord(data) ||
    typeof data.terminalId !== "string" ||
    !data.terminalId.trim() ||
    data.terminalId.length > MAX_ID_LENGTH
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
      !item.productId.trim() ||
      item.productId.length > MAX_ID_LENGTH
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

  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new HttpsError("invalid-argument", "Não envie produtos repetidos.");
  }

  const result: CreateSaleData = {terminalId: data.terminalId.trim(), items};

  if ("customerDocument" in data && typeof data.customerDocument === "string") {
    const cpf = data.customerDocument.replace(/[^\d]/g, "");
    if (cpf && !isValidCPF(cpf)) {
      throw new HttpsError("invalid-argument", "CPF inválido.");
    }
    if (cpf) {
      result.customerDocument = cpf;
    }
  }

  if ("customerEmail" in data && typeof data.customerEmail === "string") {
    const email = data.customerEmail.trim().toLowerCase();
    if (email && !EMAIL_REGEX.test(email)) {
      throw new HttpsError("invalid-argument", "E-mail inválido.");
    }
    if (email) {
      result.customerEmail = email;
    }
  }

  return result;
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
      const saleReference = firestore.collection("sales").doc();
      const statusToken = randomBytes(32).toString("base64url");
      const statusTokenHash = createHash("sha256")
        .update(statusToken)
        .digest("hex");
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(
        now.toMillis() + SALE_EXPIRATION_MINUTES * 60 * 1000,
      );
      let response: CreateSaleResponse;
      await firestore.runTransaction(async (transaction) => {
        const terminalRef = firestore.collection("terminals").doc(input.terminalId);
        const productRefs = input.items.map((item) => firestore.collection("products").doc(item.productId));
        const snapshots = await transaction.getAll(terminalRef, ...productRefs);
        const terminalSnapshot = snapshots[0];
        const terminal = terminalSnapshot.data();
        const storeId = terminal?.storeId;
        if (!terminalSnapshot.exists || terminal?.active !== true || typeof storeId !== "string" || !storeId) {
          throw new HttpsError("failed-precondition", "Terminal inválido.");
        }

        const inventoryRefs = input.items.map((item) => firestore.collection("inventory").doc(`${storeId}_${item.productId}`));
        const inventorySnapshots = await transaction.getAll(...inventoryRefs);
        const saleItems: SaleItemSnapshot[] = [];
        const inventoryUpdates: {ref: DocumentReference; data: Record<string, unknown>}[] = [];
        for (let index = 0; index < input.items.length; index += 1) {
          const item = input.items[index];
          const productSnapshot = snapshots[index + 1];
          const inventorySnapshot = inventorySnapshots[index];
          const productData = productSnapshot.data();
          if (!productSnapshot.exists) throw new HttpsError("not-found", "Produto não encontrado.");
          if (productData?.active !== true || typeof productData.salePrice !== "number" || !Number.isFinite(productData.salePrice) || productData.salePrice < 0 || typeof productData.name !== "string" || !productData.name || typeof productData.sku !== "string" || !productData.sku || typeof productData.barcode !== "string" || !productData.barcode) {
            throw new HttpsError("failed-precondition", "Produto indisponível para venda.");
          }
          const inventoryData = inventorySnapshot.data();
          const quantity = inventoryData?.quantity;
          const reservedQuantity = inventoryData?.reservedQuantity ?? 0;
          const availableStock = typeof quantity === "number" && typeof reservedQuantity === "number" ? quantity - reservedQuantity : NaN;
          if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(reservedQuantity) || reservedQuantity < 0 || availableStock < item.quantity) throw new HttpsError("failed-precondition", "Estoque insuficiente.");
          const unitPriceCents = Math.round(productData.salePrice * 100);
          const itemTotalCents = unitPriceCents * item.quantity;
          if (!Number.isSafeInteger(unitPriceCents) || !Number.isSafeInteger(itemTotalCents)) throw new HttpsError("failed-precondition", "Produto indisponível para venda.");
          saleItems.push({productId: item.productId, quantity: item.quantity, name: productData.name, sku: productData.sku, barcode: productData.barcode, unitPriceCents, totalCents: itemTotalCents});
          inventoryUpdates.push({ref: inventoryRefs[index], data: {storeId, productId: item.productId, reservedQuantity: reservedQuantity + item.quantity, updatedAt: FieldValue.serverTimestamp()}});
        }

        const subtotalCents = saleItems.reduce((total, item) => total + item.totalCents, 0);
        if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) throw new HttpsError("failed-precondition", "Total inválido.");
        for (const update of inventoryUpdates) transaction.set(update.ref, update.data, {merge: true});
        const saleData: Record<string, unknown> = {storeId, terminalId: input.terminalId, status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentStatusTokenHash: statusTokenHash, items: saleItems, itemsCount: saleItems.reduce((count, item) => count + item.quantity, 0), subtotalCents, totalCents: subtotalCents, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), expiresAt, reservationStatus: "RESERVED", source: "SELF_CHECKOUT"};
        if (input.customerDocument) saleData.customerDocument = input.customerDocument;
        if (input.customerEmail) saleData.customerEmail = input.customerEmail;
        transaction.create(saleReference, saleData);
        response = {saleId: saleReference.id, statusToken, totalCents: subtotalCents, status: "PENDING_PAYMENT", expiresAt};
      });

      return response!;
    } catch (error) {
      throw getFriendlyError(error);
    }
  },
);
