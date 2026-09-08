import { useSyncExternalStore } from "react";

export type StockAlertPreferences = { low: boolean; empty: boolean; negative: boolean };
export const defaultStockAlerts: StockAlertPreferences = { low: true, empty: true, negative: true };
const storageKey = `seolleda:${import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "unknown"}:stock-alerts`;
const changeEvent = "seolleda-stock-alerts-changed";

function snapshot() {
  try { return localStorage.getItem(storageKey); }
  catch { return null; }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, notify);
  };
}

export function useStockAlertPreferences(): StockAlertPreferences {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (!parsed || typeof parsed !== "object") return defaultStockAlerts;
    const value = parsed as Record<string, unknown>;
    return {
      low: typeof value.low === "boolean" ? value.low : true,
      empty: typeof value.empty === "boolean" ? value.empty : true,
      negative: typeof value.negative === "boolean" ? value.negative : true,
    };
  } catch { return defaultStockAlerts; }
}

export function saveStockAlertPreferences(value: StockAlertPreferences) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new Event(changeEvent));
}
