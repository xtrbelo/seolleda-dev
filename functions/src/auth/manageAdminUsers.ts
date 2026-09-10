/* eslint-disable max-len */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import type {UserRecord} from "firebase-admin/auth";
import {adminAuth} from "../lib/firebaseAdmin.js";
import {hasAdministrativeRole, requireRole, type AdminRole} from "./roles.js";

const ALL_ROLES: AdminRole[] = ["master", "admin", "catalog", "inventory", "sales", "reports", "settings"];
const STORE_SCOPED_ROLES: AdminRole[] = ["inventory", "sales", "reports"];
const STORE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Validate bounded text.
 * @param {unknown} value Input value.
 * @param {number} max Maximum length.
 * @param {number} min Minimum length.
 * @return {string} Trimmed text.
 */
function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new HttpsError("invalid-argument", "Texto inválido.");
  return value.trim();
}

/** Validate an account e-mail.
 * @param {unknown} value Input value.
 * @return {string} Normalized e-mail.
 */
function email(value: unknown): string {
  const normalized = text(value, 320, 3).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new HttpsError("invalid-argument", "E-mail inválido.");
  return normalized;
}

/** Validate managed role claims.
 * @param {unknown} value Input value.
 * @return {AdminRole[]} Roles without duplicates.
 */
function roles(value: unknown): AdminRole[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > ALL_ROLES.length ||
      value.some((role) => typeof role !== "string" || !ALL_ROLES.includes(role as AdminRole))) {
    throw new HttpsError("invalid-argument", "Selecione ao menos uma permissão válida.");
  }
  const result = [...new Set(value as AdminRole[])];
  if (result.length !== value.length || (hasAdministrativeRole(result) && result.length !== 1)) throw new HttpsError("invalid-argument", "Combinação de permissões inválida.");
  return result;
}

/** Validate store access claims for the selected roles.
 * @param {unknown} value Input value.
 * @param {AdminRole[]} selectedRoles Valid roles.
 * @return {string[]} Store identifiers.
 */
function stores(value: unknown, selectedRoles: AdminRole[]): string[] {
  if (!Array.isArray(value) || value.length > 30 || value.some((storeId) => typeof storeId !== "string" || !STORE_ID.test(storeId))) {
    throw new HttpsError("invalid-argument", "Selecione lojas válidas.");
  }
  const result = [...new Set(value as string[])];
  if (result.length !== value.length || (hasAdministrativeRole(selectedRoles) && result.length > 0) ||
      (selectedRoles.some((role) => STORE_SCOPED_ROLES.includes(role)) && result.length === 0)) {
    throw new HttpsError("invalid-argument", "Selecione ao menos uma loja para os papéis operacionais.");
  }
  return result;
}

/** Return only valid managed roles from an Auth record.
 * @param {Record<string, unknown>} claims Existing custom claims.
 * @return {AdminRole[]} Managed roles.
 */
function recordRoles(claims: Record<string, unknown>): AdminRole[] {
  const result = Array.isArray(claims.roles) ? [...new Set(claims.roles.filter(
    (role): role is AdminRole => typeof role === "string" && ALL_ROLES.includes(role as AdminRole),
  ))] : [];
  if (result.includes("master")) return result;
  return claims.admin === true ? ["admin"] : result;
}

/** Return only valid store identifiers from an Auth record.
 * @param {Record<string, unknown>} claims Existing custom claims.
 * @return {string[]} Store identifiers.
 */
function recordStores(claims: Record<string, unknown>): string[] {
  if (!Array.isArray(claims.storeIds)) return [];
  return [...new Set(claims.storeIds.filter((storeId): storeId is string => typeof storeId === "string" && STORE_ID.test(storeId)))].slice(0, 30);
}

/** Replace only the claims managed by this panel.
 * @param {Record<string, unknown>} current Existing custom claims.
 * @param {AdminRole[]} selectedRoles New roles.
 * @param {string[]} selectedStores New store identifiers.
 * @return {Record<string, unknown>} Complete custom claims payload.
 */
function updatedClaims(current: Record<string, unknown>, selectedRoles: AdminRole[], selectedStores: string[]): Record<string, unknown> {
  const result = {...current};
  delete result.admin;
  delete result.roles;
  delete result.storeIds;
  result.roles = selectedRoles;
  if (!hasAdministrativeRole(selectedRoles) && selectedStores.length > 0) result.storeIds = selectedStores;
  return result;
}

/** Return the bounded account data exposed to the admin panel.
 * @param {UserRecord} user Firebase Auth user.
 * @return {object} Serialized account.
 */
function serialize(user: UserRecord) {
  const claims = user.customClaims ?? {};
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    roles: recordRoles(claims),
    storeIds: recordStores(claims),
    createdAtMs: Date.parse(user.metadata.creationTime) || 0,
    lastSignInAtMs: Date.parse(user.metadata.lastSignInTime) || 0,
  };
}

/** Require the caller to remain an enabled administrator in Firebase Auth.
 * @param {string} uid Authenticated caller identifier.
 */
async function requireLiveAdmin(uid: string): Promise<void> {
  let actor: UserRecord;
  try {
    actor = await adminAuth.getUser(uid);
  } catch {
    throw new HttpsError("permission-denied", "Acesso administrativo não confirmado.");
  }
  if (actor.disabled || !hasAdministrativeRole(recordRoles(actor.customClaims ?? {}))) {
    throw new HttpsError("permission-denied", "Acesso administrativo não confirmado.");
  }
}

/** Translate expected Admin Auth failures without exposing provider diagnostics.
 * @param {unknown} error Provider error.
 */
function authFailure(error: unknown): never {
  const code = error && typeof error === "object" ? String((error as {code?: unknown}).code ?? "") : "";
  if (code === "auth/email-already-exists") throw new HttpsError("already-exists", "Já existe uma conta com este e-mail.");
  if (code === "auth/user-not-found") throw new HttpsError("not-found", "Usuário não encontrado.");
  if (error instanceof HttpsError) throw error;
  throw new HttpsError("unavailable", "Não foi possível concluir a gestão do usuário. Tente novamente.");
}

export const manageAdminUsers = onCall({region: "southamerica-east1"}, async (request) => {
  requireRole(request, "admin");
  const input = request.data as Record<string, unknown> | null;
  try {
    await requireLiveAdmin(request.auth!.uid);
    if (input?.action === "list") {
      const pageToken = input.pageToken === undefined ? undefined : text(input.pageToken, 4096, 1);
      const result = await adminAuth.listUsers(100, pageToken);
      return {users: result.users.map(serialize), nextPageToken: result.pageToken};
    }
    if (input?.action === "create") {
      const selectedRoles = roles(input.roles);
      const selectedStores = stores(input.storeIds, selectedRoles);
      if (selectedRoles.includes("master")) requireRole(request, "settings");
      const created = await adminAuth.createUser({email: email(input.email), displayName: text(input.displayName, 100, 2), disabled: false});
      try {
        await adminAuth.setCustomUserClaims(created.uid, updatedClaims({}, selectedRoles, selectedStores));
      } catch (error) {
        await adminAuth.deleteUser(created.uid).catch(() => undefined);
        throw error;
      }
      console.info("manageAdminUsers: account created", {actorUid: request.auth!.uid, targetUid: created.uid, roles: selectedRoles, storeIds: selectedStores});
      return {user: {...serialize(created), roles: selectedRoles, storeIds: selectedStores}};
    }
    if (input?.action === "update") {
      const uid = text(input.uid, 128, 1);
      const hasControlCharacter = uid.split("").some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      });
      if (hasControlCharacter) throw new HttpsError("invalid-argument", "Usuário inválido.");
      if (uid === request.auth!.uid) throw new HttpsError("failed-precondition", "Sua própria conta não pode ser alterada neste painel.");
      if (typeof input.disabled !== "boolean") throw new HttpsError("invalid-argument", "Situação inválida.");
      const selectedRoles = roles(input.roles);
      const selectedStores = stores(input.storeIds, selectedRoles);
      const current = await adminAuth.getUser(uid);
      const currentClaims = current.customClaims ?? {};
      if (selectedRoles.includes("master") || recordRoles(currentClaims).includes("master")) requireRole(request, "settings");
      await adminAuth.setCustomUserClaims(uid, updatedClaims(currentClaims, selectedRoles, selectedStores));
      let updated: UserRecord;
      try {
        updated = await adminAuth.updateUser(uid, {displayName: text(input.displayName, 100, 2), disabled: input.disabled});
      } catch (error) {
        await adminAuth.setCustomUserClaims(uid, currentClaims).catch(() => undefined);
        throw error;
      }
      await adminAuth.revokeRefreshTokens(uid);
      console.info("manageAdminUsers: account updated", {actorUid: request.auth!.uid, targetUid: uid, roles: selectedRoles, storeIds: selectedStores, disabled: input.disabled});
      return {user: {...serialize(updated), roles: selectedRoles, storeIds: selectedStores}};
    }
    throw new HttpsError("invalid-argument", "Operação inválida.");
  } catch (error) {
    authFailure(error);
  }
});
