import type { Timestamp } from "firebase/firestore";

export type Store = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
