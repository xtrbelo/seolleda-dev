/* eslint-disable max-len */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {firestore} from "../lib/firebaseAdmin.js";

export const releaseExpiredSales = onSchedule(
  {region: "southamerica-east1", schedule: "every 5 minutes"},
  async () => {
    const expiredSales = await firestore.collection("sales")
      .where("status", "==", "PENDING_PAYMENT")
      .where("inventoryReservationStatus", "==", "RESERVED")
      .where("expiresAt", "<=", Timestamp.now()).limit(100).get();
    await Promise.all(expiredSales.docs.map(async (saleSnapshot) => {
      await firestore.runTransaction(async (transaction) => {
        const currentSale = await transaction.get(saleSnapshot.ref);
        const sale = currentSale.data();
        if (!currentSale.exists || sale?.status !== "PENDING_PAYMENT" ||
            sale.inventoryReservationStatus !== "RESERVED" ||
            !(sale.expiresAt instanceof Timestamp) ||
            sale.expiresAt.toMillis() > Date.now() ||
            typeof sale.storeId !== "string" || !Array.isArray(sale.items)) return;
        const items = sale.items as Array<Record<string, unknown>>;
        const refs = items.map((item) => firestore.collection("inventory")
          .doc(typeof item.inventoryId === "string" ? item.inventoryId :
            `${sale.storeId}_${String(item.productId)}`));
        const snapshots = await transaction.getAll(...refs);
        items.forEach((item, index) => {
          const quantity = item.quantity;
          const currentQuantity = snapshots[index].data()?.quantity;
          if (!Number.isInteger(quantity) || !Number.isInteger(currentQuantity)) {
            throw new Error(`Invalid reservation data in sale ${currentSale.id}`);
          }
          transaction.update(refs[index], {quantity: currentQuantity + quantity,
            updatedAt: FieldValue.serverTimestamp()});
        });
        transaction.update(currentSale.ref, {status: "EXPIRED",
          inventoryReservationStatus: "RELEASED", updatedAt: FieldValue.serverTimestamp()});
      });
    }));
  },
);
