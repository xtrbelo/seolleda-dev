/* eslint-disable max-len */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../lib/firebaseAdmin.js";

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
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
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
  const id = input.action === "terminal" && input.create === true ?
    firestore.collection("terminals").doc().id : identifier(input.id);
  const name = text(input.name, 120, 2);
  const actor = request.auth.uid;
  const auditRef = firestore.collection("settingsAudit").doc();
  if (input.action === "store") {
    const address = text(input.address, 300);
    const contact = text(input.contact, 120);
    const ref = firestore.collection("stores").doc(id);
    await firestore.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists) throw new HttpsError("not-found", "Loja não encontrada.");
      const update = {name, address, contact};
      tx.update(ref, {...update, updatedAt: FieldValue.serverTimestamp()});
      tx.set(auditRef, {action: "store", targetId: id, userId: actor, changes: update, createdAt: FieldValue.serverTimestamp()});
    });
  } else {
    const storeId = identifier(input.storeId);
    if (typeof input.active !== "boolean" || typeof input.create !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
    const ref = firestore.collection("terminals").doc(id);
    await firestore.runTransaction(async (tx) => {
      const [existing, store] = await tx.getAll(ref, firestore.collection("stores").doc(storeId));
      if (input.create && existing.exists) throw new HttpsError("already-exists", "Já existe um terminal com esta identificação.");
      if (!input.create && !existing.exists) throw new HttpsError("not-found", "Terminal não encontrado.");
      if (!store.exists || (input.active && store.data()?.active !== true)) throw new HttpsError("failed-precondition", "Selecione uma loja ativa para ativar o terminal.");
      const update = {name, storeId, active: input.active};
      tx.set(ref, {...update, updatedAt: FieldValue.serverTimestamp(), ...(!existing.exists ? {createdAt: FieldValue.serverTimestamp()} : {})}, {merge: true});
      tx.set(auditRef, {action: "terminal", targetId: id, userId: actor, changes: update, createdAt: FieldValue.serverTimestamp()});
    });
  }
  return {ok: true, id};
});
