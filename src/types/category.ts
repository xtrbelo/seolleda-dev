import type { Timestamp } from "firebase/firestore";

export type Category = {
  id: string;
  name: string;
  normalizedName: string;
  description: string;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CategoryInput = {
  name: string;
  description: string;
  active: boolean;
};
