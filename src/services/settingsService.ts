import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";
export type StoreSettings = { id: string; name: string; address: string; contact: string; active: boolean };
export type TerminalSettings = { id: string; name: string; storeId: string; active: boolean };
export type Settings = { stores: StoreSettings[]; terminals: TerminalSettings[] };
const callable = httpsCallable<Record<string, unknown>, Settings | { ok: boolean; id?: string }>(getFunctions(app, "southamerica-east1"), "manageSettings");
export async function getSettings(): Promise<Settings> {
  const result = await callable({ action: "list" });
  if (!("stores" in result.data)) throw new Error("Resposta inválida.");
  return result.data;
}
export async function saveStore(store: StoreSettings, create: boolean) {
  await callable({ action: "store", name: store.name, address: store.address, contact: store.contact, active: store.active, create, ...(!create ? { id: store.id } : {}) });
}
export async function saveTerminal(terminal: TerminalSettings, create: boolean) {
  await callable({ action: "terminal", name: terminal.name, storeId: terminal.storeId, active: terminal.active, create, ...(!create ? { id: terminal.id } : {}) });
}
