import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

/** @param {object} sale Stored sale.
 * @return {number} Original internal deadline.
 */
export function saleDeadline(sale: Record<string, unknown>): number {
  if (!(sale.expiresAt instanceof Timestamp)) {
    throw new HttpsError("failed-precondition", "Prazo da venda inválido.");
  }
  // Cap legacy sales whose expiresAt was overwritten by the old Pix code.
  const createdLimit = sale.createdAt instanceof Timestamp ?
    sale.createdAt.toMillis() + 15 * 60 * 1000 : sale.expiresAt.toMillis();
  return Math.min(sale.expiresAt.toMillis(), createdLimit);
}
