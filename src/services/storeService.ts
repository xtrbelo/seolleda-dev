import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Store } from "../types/store";

const storesCollection = collection(db, "stores");
const validStoreId = /^[A-Za-z0-9_-]{1,128}$/;

export async function listAccessibleStores(globalAccess: boolean, assignedStoreIds: string[]): Promise<Store[]> {
  const snapshots = globalAccess ? (await getDocs(storesCollection)).docs : await Promise.all(
    [...new Set(assignedStoreIds)].filter((id) => validStoreId.test(id)).slice(0, 30)
      .map((id) => getDoc(doc(storesCollection, id))),
  );
  return snapshots.flatMap((snapshot) => {
    if (!snapshot.exists()) return [];
    const data = snapshot.data();
    return [{
      id: snapshot.id,
      name: typeof data.name === "string" ? data.name : snapshot.id,
      active: data.active === true,
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
    } as Store];
  }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}
