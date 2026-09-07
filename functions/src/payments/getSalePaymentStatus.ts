import {createHash, timingSafeEqual} from "crypto";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import type {GetSalePaymentStatusResponse} from "../types/sale.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Compares an opaque token with its stored SHA-256 digest.
 * @param {string} token Plain token presented by the checkout.
 * @param {unknown} expectedHex Stored SHA-256 digest.
 * @return {boolean} Whether the token is valid.
 */
function tokenMatches(token: string, expectedHex: unknown): boolean {
  if (typeof expectedHex !== "string" || !/^[a-f0-9]{64}$/.test(expectedHex)) {
    return false;
  }
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns only the public payment state for the authorized checkout
 * session.
 */
export const getSalePaymentStatus = onCall(
  {region: "southamerica-east1"},
  async (request): Promise<GetSalePaymentStatusResponse> => {
    const data = request.data as Record<string, unknown> | null;
    const saleId = typeof data?.saleId === "string" ? data.saleId.trim() : "";
    const statusToken = typeof data?.statusToken === "string" ?
      data.statusToken.trim() : "";

    if (!saleId || saleId.length > 128 || saleId.includes("/") ||
        !TOKEN_PATTERN.test(statusToken)) {
      throw new HttpsError("invalid-argument", "Consulta inválida.");
    }

    const snapshot = await firestore.collection("sales").doc(saleId).get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Venda não encontrada.");
    }

    const sale = snapshot.data()!;
    if (!tokenMatches(statusToken, sale.paymentStatusTokenHash)) {
      throw new HttpsError("permission-denied", "Consulta não autorizada.");
    }

    if (sale.paymentStatus === "APPROVED" && sale.status === "PAID") {
      return {state: "APPROVED"};
    }
    if (sale.status === "PAYMENT_REVIEW_REQUIRED") {
      return {state: "REVIEW_REQUIRED"};
    }
    const expiresAtMs = sale.expiresAt instanceof Timestamp ?
      sale.expiresAt.toMillis() : 0;
    if (expiresAtMs > 0 && Date.now() >= expiresAtMs) {
      return {state: "EXPIRED"};
    }
    return {state: "PENDING"};
  },
);
