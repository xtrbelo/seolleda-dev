/* eslint-disable max-len */
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {requireRole} from "../auth/roles.js";

const MAX_RANGE_MS = 94 * 86400000;
const PAGE_SIZE = 100;

/** Validate a positive millisecond timestamp.
 * @param {unknown} value Candidate timestamp.
 * @return {number} Valid timestamp.
 */
function milliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpsError("invalid-argument", "Período inválido.");
  }
  return value;
}

export const listSettingsAudit = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "settings");
  const data = request.data as Record<string, unknown> | null;
  const fromMs = milliseconds(data?.fromMs);
  const untilMs = milliseconds(data?.untilMs);
  if (untilMs <= fromMs || untilMs - fromMs > MAX_RANGE_MS) {
    throw new HttpsError("invalid-argument", "Selecione um período de até 93 dias.");
  }
  const snapshot = await firestore.collection("settingsAudit")
    .where("createdAt", ">=", Timestamp.fromMillis(fromMs))
    .where("createdAt", "<", Timestamp.fromMillis(untilMs))
    .orderBy("createdAt", "desc")
    .limit(PAGE_SIZE)
    .get();
  return {
    events: snapshot.docs.map((doc) => {
      const audit = doc.data();
      const changes = audit.changes && typeof audit.changes === "object" ? audit.changes : {};
      return {
        id: doc.id,
        action: audit.action === "store" || audit.action === "terminal" ? audit.action : "other",
        targetId: typeof audit.targetId === "string" ? audit.targetId : "",
        userId: typeof audit.userId === "string" ? audit.userId : "",
        changes,
        createdAtMs: audit.createdAt instanceof Timestamp ? audit.createdAt.toMillis() : 0,
      };
    }),
    hasMore: snapshot.size === PAGE_SIZE,
  };
});
