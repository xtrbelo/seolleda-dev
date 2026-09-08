/* eslint-disable max-len */
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {firestore} from "../lib/firebaseAdmin.js";
import type {SaleItemSnapshot} from "../types/sale.js";

const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 10;

/** Releases reservations from pending sales whose internal deadline passed. */
export const releaseExpiredReservations = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Sao_Paulo", region: "southamerica-east1"},
  async () => {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const expired = await firestore.collection("sales")
        .where("status", "==", "PENDING_PAYMENT")
        .where("expiresAt", "<=", Timestamp.now())
        .orderBy("expiresAt", "asc")
        .limit(BATCH_SIZE)
        .get();
      if (expired.empty) return;
      for (const sale of expired.docs) {
        await firestore.runTransaction(async (transaction) => {
          const saleSnapshot = await transaction.get(sale.ref);
          const data = saleSnapshot.data();
          if (!saleSnapshot.exists || data?.status !== "PENDING_PAYMENT" ||
              !(data.expiresAt instanceof Timestamp) ||
              data.expiresAt.toMillis() > Date.now()) return;
          const storeId = data.storeId;
          const items = data.items as SaleItemSnapshot[];
          const validItems = data.reservationStatus === "RESERVED" &&
            typeof storeId === "string" && storeId &&
            !storeId.includes("/") && Array.isArray(items) && items.length > 0 &&
            items.every((item) => item && typeof item.productId === "string" &&
              item.productId && !item.productId.includes("/") &&
              Number.isSafeInteger(item.quantity) && item.quantity > 0) &&
            new Set(items.map((item) => item.productId)).size === items.length;
          if (!validItems) {
            transaction.update(sale.ref, {
              status: "EXPIRED", paymentStatus: "EXPIRED",
              reservationStatus: "RELEASE_REVIEW_REQUIRED",
              stockReconciliationRequired: true,
              expiredAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            return;
          }
          const refs = items.map((item) => firestore.collection("inventory")
            .doc(`${storeId}_${item.productId}`));
          const inventories = await transaction.getAll(...refs);
          let reviewRequired = false;
          for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const inventory = inventories[index];
            const reserved = inventory.exists ?
              Number(inventory.get("reservedQuantity") ?? 0) : NaN;
            if (!Number.isSafeInteger(reserved) || reserved < item.quantity) {
              reviewRequired = true;
              continue;
            }
            transaction.update(refs[index], {
              reservedQuantity: reserved - item.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          transaction.update(sale.ref, {
            status: "EXPIRED", paymentStatus: "EXPIRED",
            reservationStatus: reviewRequired ?
              "RELEASE_REVIEW_REQUIRED" : "RELEASED",
            ...(reviewRequired ? {stockReconciliationRequired: true} : {}),
            expiredAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      }
      if (expired.size < BATCH_SIZE) return;
    }
  },
);
