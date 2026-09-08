/* eslint-disable max-len */
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {firestore} from "../lib/firebaseAdmin.js";
import type {SaleItemSnapshot} from "../types/sale.js";

/** Releases reservations from pending sales whose internal deadline passed. */
export const releaseExpiredReservations = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Sao_Paulo", region: "southamerica-east1"},
  async () => {
    const expired = await firestore.collection("sales")
      .where("expiresAt", "<=", Timestamp.now())
      .limit(100)
      .get();
    for (const sale of expired.docs) {
      await firestore.runTransaction(async (transaction) => {
        const saleSnapshot = await transaction.get(sale.ref);
        const data = saleSnapshot.data();
        if (!saleSnapshot.exists || data?.status !== "PENDING_PAYMENT" || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() > Date.now()) return;
        const storeId = data.storeId;
        const items = data.items as SaleItemSnapshot[];
        if (typeof storeId !== "string" || !Array.isArray(items) || items.length === 0) return;
        const refs = items.map((item) => firestore.collection("inventory").doc(`${storeId}_${item.productId}`));
        const inventories = await transaction.getAll(...refs);
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const inventory = inventories[index];
          if (!inventory.exists) continue;
          const reserved = Number(inventory.get("reservedQuantity") ?? 0);
          if (!Number.isSafeInteger(reserved) || reserved < item.quantity) continue;
          transaction.update(refs[index], {reservedQuantity: reserved - item.quantity, updatedAt: FieldValue.serverTimestamp()});
        }
        transaction.update(sale.ref, {status: "EXPIRED", paymentStatus: "EXPIRED", reservationStatus: "RELEASED", expiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      });
    }
  },
);
