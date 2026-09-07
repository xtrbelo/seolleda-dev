import { collection, getDocs, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../lib/firebase";
import type { Inventory } from "../types/inventory";
import type { Product } from "../types/product";
import type { StockMovement, StockMovementType } from "../types/stockMovement";

const manage = httpsCallable(getFunctions(app, "southamerica-east1"), "manageInventory");
export async function listInventory(storeId: string): Promise<Inventory[]> {
  const snapshot = await getDocs(query(collection(db, "inventory"), where("storeId", "==", storeId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Inventory);
}
export async function getInventoryForProduct(storeId: string, productId: string): Promise<Inventory | null> {
  return (await listInventory(storeId)).find((item) => item.productId === productId) ?? null;
}
export async function listStockMovements(storeId: string, productId: string): Promise<StockMovement[]> {
  const snapshot = await getDocs(query(collection(db, "stockMovements"), where("storeId", "==", storeId), where("productId", "==", productId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as StockMovement)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}
export async function updateMinimumQuantity(storeId: string, productId: string, minimumQuantity: number) {
  await manage({ storeId, productId, type: "MINIMUM", quantity: minimumQuantity, operationId: crypto.randomUUID() });
}
type MovementInput = { storeId: string; product: Product; type: StockMovementType; quantity: number; reason: string; userId: string; userEmail: string; operationId: string };
export async function recordStockMovement(input: MovementInput) {
  await manage({ storeId: input.storeId, productId: input.product.id, type: input.type, quantity: input.quantity, reason: input.reason, operationId: input.operationId });
}
