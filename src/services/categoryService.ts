import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Category, CategoryInput } from "../types/category";

const categoriesCollection = collection(db, "categories");

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export async function listCategories(): Promise<Category[]> {
  const snapshot = await getDocs(categoriesCollection);

  return snapshot.docs
    .map(
      (categoryDocument) =>
        ({
          id: categoryDocument.id,
          ...categoryDocument.data(),
        }) as Category,
    )
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

async function categoryNameExists(normalizedName: string, categoryId?: string) {
  const nameQuery = query(
    categoriesCollection,
    where("normalizedName", "==", normalizedName),
    limit(2),
  );
  const snapshot = await getDocs(nameQuery);

  return snapshot.docs.some(
    (categoryDocument) => categoryDocument.id !== categoryId,
  );
}

export async function createCategory(input: CategoryInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCategoryName(name);

  if (await categoryNameExists(normalizedName)) {
    throw new Error("CATEGORY_DUPLICATE");
  }

  await addDoc(categoriesCollection, {
    name,
    normalizedName,
    description: input.description.trim(),
    active: input.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCategory(categoryId: string, input: CategoryInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCategoryName(name);

  if (await categoryNameExists(normalizedName, categoryId)) {
    throw new Error("CATEGORY_DUPLICATE");
  }

  await updateDoc(doc(db, "categories", categoryId), {
    name,
    normalizedName,
    description: input.description.trim(),
    active: input.active,
    updatedAt: serverTimestamp(),
  });
}

export async function updateCategoryStatus(
  categoryId: string,
  active: boolean,
) {
  await updateDoc(doc(db, "categories", categoryId), {
    active,
    updatedAt: serverTimestamp(),
  });
}
