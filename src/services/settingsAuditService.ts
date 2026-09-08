import {Timestamp} from "firebase/firestore";
import {getFunctions, httpsCallable} from "firebase/functions";
import {app} from "../lib/firebase";

export type AuditEvent = {id: string; action: "store" | "terminal" | "other"; targetId: string; userId: string; changes: Record<string, unknown>; createdAt?: Timestamp};
type Response = {events: Array<Omit<AuditEvent, "createdAt"> & {createdAtMs: number}>; hasMore: boolean};
const callable = httpsCallable<{fromMs: number; untilMs: number}, Response>(getFunctions(app, "southamerica-east1"), "listSettingsAudit");

export async function listSettingsAudit(from: Date, until: Date) {
  const result = await callable({fromMs: from.getTime(), untilMs: until.getTime()});
  return {events: result.data.events.map((event) => ({...event, createdAt: event.createdAtMs ? Timestamp.fromMillis(event.createdAtMs) : undefined})), hasMore: result.data.hasMore};
}
