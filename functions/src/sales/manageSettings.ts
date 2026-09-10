/* eslint-disable max-len */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";
import {requireRole} from "../auth/roles.js";

/** Validate bounded text.
 * @param {unknown} value Input.
 * @param {number} max Maximum length.
 * @param {number} min Minimum length.
 * @return {string} Trimmed value.
 */
function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new HttpsError("invalid-argument", "Texto inválido.");
  return value.trim();
}
/** Validate document identifier.
 * @param {unknown} value Input.
 * @return {string} Identifier.
 */
function identifier(value: unknown): string {
  const id = text(value, 128, 1);
  if (id.includes("/") || id === "." || id === "..") throw new HttpsError("invalid-argument", "Identificação inválida.");
  return id;
}
export const manageSettings = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "settings");
  const input = request.data ?? {};
  if (input.action === "list") {
    const [stores, terminals] = await Promise.all([
      firestore.collection("stores").limit(501).get(),
      firestore.collection("terminals").limit(501).get(),
    ]);
    if (stores.size > 500 || terminals.size > 500) throw new HttpsError("resource-exhausted", "Limite de consulta atingido. Solicite suporte.");
    return {
      stores: stores.docs.map((doc) => {
        const data = doc.data();
        return {id: doc.id, name: data.name ?? "", address: data.address ?? "", contact: data.contact ?? "", active: data.active === true};
      }),
      terminals: terminals.docs.map((doc) => {
        const data = doc.data();
        return {id: doc.id, name: data.name ?? doc.id, storeId: data.storeId ?? "", active: data.active === true};
      }),
    };
  }
  if (!["store", "terminal"].includes(input.action)) throw new HttpsError("invalid-argument", "Operação inválida.");
  const create = input.create === true;
  if (input.action === "terminal" && typeof input.create !== "boolean") throw new HttpsError("invalid-argument", "Operação inválida.");
  if (input.action === "store" && input.create !== undefined && typeof input.create !== "boolean") throw new HttpsError("invalid-argument", "Operação inválida.");
  const collection = input.action === "store" ? "stores" : "terminals";
  const id = create ? firestore.collection(collection).doc().id : identifier(input.id);
  const name = text(input.name, 120, 2);
  const actor = request.auth!.uid;
  const auditRef = firestore.collection("settingsAudit").doc();
  if (input.action === "store") {
    const address = text(input.address, 300);
    const contact = text(input.contact, 120);
    const ref = firestore.collection("stores").doc(id);
    await firestore.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (create && existing.exists) throw new HttpsError("already-exists", "Já existe uma loja com esta identificação.");
      if (!create && !existing.exists) throw new HttpsError("not-found", "Loja não encontrada.");
      if (create && input.active === true) throw new HttpsError("failed-precondition", "Uma nova loja deve começar inativa.");
      if (!create && input.active !== undefined && typeof input.active !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
      const active = create ? false : typeof input.active === "boolean" ? input.active : existing.data()?.active === true;
      if (!active) {
        const activeTerminals = await tx.get(firestore.collection("terminals")
          .where("storeId", "==", id).where("active", "==", true).limit(1));
        if (!activeTerminals.empty) throw new HttpsError("failed-precondition", "Desative os terminais desta loja antes de desativá-la.");
      }
      const update = {name, address, contact, active};
      const timestamp = FieldValue.serverTimestamp();
      if (create) tx.create(ref, {...update, createdAt: timestamp, updatedAt: timestamp});
      else tx.update(ref, {...update, updatedAt: timestamp});
      tx.set(auditRef, {action: "store", targetId: id, userId: actor, changes: {...update, operation: create ? "created" : "updated"}, createdAt: timestamp});
    });
  } else {
    const storeId = identifier(input.storeId);
    if (typeof input.active !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
    const ref = firestore.collection("terminals").doc(id);
    await firestore.runTransaction(async (tx) => {
      const [existing, store] = await tx.getAll(ref, firestore.collection("stores").doc(storeId));
      if (create && existing.exists) throw new HttpsError("already-exists", "Já existe um terminal com esta identificação.");
      if (!create && !existing.exists) throw new HttpsError("not-found", "Terminal não encontrado.");
      if (!create && existing.data()?.active === true && existing.data()?.storeId !== storeId) {
        throw new HttpsError("failed-precondition", "Desative o terminal antes de mudar sua loja.");
      }
      if (!store.exists || (input.active && store.data()?.active !== true)) throw new HttpsError("failed-precondition", "Selecione uma loja ativa para ativar o terminal.");
      const update = {name, storeId, active: input.active};
      const timestamp = FieldValue.serverTimestamp();
      tx.set(ref, {...update, updatedAt: timestamp, ...(!existing.exists ? {createdAt: timestamp} : {})}, {merge: true});
      tx.set(auditRef, {action: "terminal", targetId: id, userId: actor, changes: {...update, operation: create ? "created" : "updated"}, createdAt: timestamp});
    });
  }
  return {ok: true, id};
});
