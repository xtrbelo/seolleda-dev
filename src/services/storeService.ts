import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Store } from "../types/store";

const storesCollection = collection(db, "stores");

export async function getOrCreateDefaultStore(): Promise<Store> {
  const existingSnapshot = await getDocs(
    query(storesCollection, where("name", "==", "Loja Principal"), limit(1)),
  );
  if (!existingSnapshot.empty) {
    const storeDocument = existingSnapshot.docs[0];
    return { id: storeDocument.id, ...storeDocument.data() } as Store;
  }

  const defaultStoreReference = doc(db, "stores", "default-store");
  return runTransaction(db, async (transaction) => {
    const storeDocument = await transaction.get(defaultStoreReference);
    if (storeDocument.exists()) {
      return { id: storeDocument.id, ...storeDocument.data() } as Store;
    }

    const store = {
      name: "Loja Principal",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(defaultStoreReference, store);
    return { id: defaultStoreReference.id, ...store } as Store;
  });
}
