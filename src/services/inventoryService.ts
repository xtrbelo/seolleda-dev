import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Inventory } from "../types/inventory";
import type { Product } from "../types/product";
import type { StockMovement, StockMovementType } from "../types/stockMovement";

const inventoryCollection = collection(db, "inventory");
const movementsCollection = collection(db, "stockMovements");

export async function listInventory(storeId: string): Promise<Inventory[]> {
  const snapshot = await getDocs(
    query(inventoryCollection, where("storeId", "==", storeId)),
  );
  return snapshot.docs.map(
    (inventoryDocument) =>
      ({ id: inventoryDocument.id, ...inventoryDocument.data() }) as Inventory,
  );
}

export async function listStockMovements(
  storeId: string,
  productId: string,
): Promise<StockMovement[]> {
  const snapshot = await getDocs(
    query(
      movementsCollection,
      where("storeId", "==", storeId),
      where("productId", "==", productId),
    ),
  );
  return snapshot.docs
    .map(
      (movementDocument) =>
        ({
          id: movementDocument.id,
          ...movementDocument.data(),
        }) as StockMovement,
    )
    .sort((first, second) => {
      const firstTime = first.createdAt?.toMillis() ?? 0;
      const secondTime = second.createdAt?.toMillis() ?? 0;
      return secondTime - firstTime;
    });
}

export async function updateMinimumQuantity(
  storeId: string,
  productId: string,
  minimumQuantity: number,
) {
  if (!Number.isInteger(minimumQuantity) || minimumQuantity < 0) {
    throw new Error("INVALID_MINIMUM_QUANTITY");
  }
  const existing = await getDocs(
    query(
      inventoryCollection,
      where("storeId", "==", storeId),
      where("productId", "==", productId),
    ),
  );
  if (existing.empty) {
    await setDoc(doc(db, "inventory", `${storeId}_${productId}`), {
      storeId,
      productId,
      quantity: 0,
      minimumQuantity,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(existing.docs[0].ref, {
    minimumQuantity,
    updatedAt: serverTimestamp(),
  });
}

type MovementInput = {
  storeId: string;
  product: Product;
  type: StockMovementType;
  quantity: number;
  reason: string;
  userId: string;
  userEmail: string;
};

export async function recordStockMovement(input: MovementInput) {
  const invalidQuantity =
    !Number.isInteger(input.quantity) ||
    (input.type === "ADJUSTMENT" ? input.quantity < 0 : input.quantity <= 0);
  if (invalidQuantity) {
    throw new Error("INVALID_QUANTITY");
  }
  if (!input.reason.trim()) throw new Error("INVALID_REASON");

  const movementReference = doc(movementsCollection);
  const inventoryReference = doc(
    db,
    "inventory",
    `${input.storeId}_${input.product.id}`,
  );

  await runTransaction(db, async (transaction) => {
    const inventoryDocument = await transaction.get(inventoryReference);
    const currentQuantity = inventoryDocument.exists()
      ? Number(inventoryDocument.data().quantity) || 0
      : 0;
    const minimumQuantity = inventoryDocument.exists()
      ? Number(inventoryDocument.data().minimumQuantity) || 0
      : 0;
    const newQuantity =
      input.type === "ENTRY"
        ? currentQuantity + input.quantity
        : input.type === "EXIT"
          ? currentQuantity - input.quantity
          : input.type === "ADJUSTMENT"
            ? input.quantity
            : currentQuantity;
    const movementQuantity =
      input.type === "ADJUSTMENT"
        ? Math.abs(newQuantity - currentQuantity)
        : input.quantity;

    if (newQuantity < 0) throw new Error("INSUFFICIENT_STOCK");
    if (input.type === "ADJUSTMENT" && movementQuantity === 0) {
      throw new Error("NO_STOCK_CHANGE");
    }

    transaction.set(
      inventoryReference,
      {
        storeId: input.storeId,
        productId: input.product.id,
        quantity: newQuantity,
        minimumQuantity,
        ...(inventoryDocument.exists()
          ? { updatedAt: serverTimestamp() }
          : { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      },
      { merge: true },
    );
    transaction.set(movementReference, {
      storeId: input.storeId,
      productId: input.product.id,
      productName: input.product.name,
      productSku: input.product.sku,
      productBarcode: input.product.barcode,
      type: input.type,
      quantity: movementQuantity,
      previousQuantity: currentQuantity,
      newQuantity,
      reason: input.reason.trim(),
      userId: input.userId,
      userEmail: input.userEmail,
      createdAt: serverTimestamp(),
    });
  });
}
