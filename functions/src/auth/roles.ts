/* eslint-disable max-len */
import {HttpsError} from "firebase-functions/v2/https";

export type AdminRole = "admin" | "catalog" | "inventory" | "sales" | "reports" | "settings";

/** Extracts role claims from an authenticated callable request.
 * @param {object} request Callable request.
 * @return {string[]} Role names.
 */
function claimRoles(request: {auth?: {token?: Record<string, unknown>}}): string[] {
  const token = request.auth?.token;
  if (!token) return [];
  if (token.admin === true) return ["admin"];
  return Array.isArray(token.roles) ? token.roles.filter(
    (role): role is string => typeof role === "string",
  ) : [];
}

/** Checks whether a callable request has a role or administrator claim.
 * @param {object} request Callable request.
 * @param {AdminRole} role Required role.
 * @return {boolean} Whether the request has the role.
 */
export function hasRole(request: {auth?: {token?: Record<string, unknown>}}, role: AdminRole): boolean {
  const roles = claimRoles(request);
  return roles.includes("admin") || roles.includes(role);
}

/** Rejects a callable request that lacks the required role.
 * @param {object} request Callable request.
 * @param {AdminRole} role Required role.
 * @return {void}
 */
export function requireRole(request: {auth?: {token?: Record<string, unknown>}}, role: AdminRole): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  if (!hasRole(request, role)) throw new HttpsError("permission-denied", "Você não tem permissão para esta operação.");
}

/** Rejects a request unless it has at least one permitted role.
 * @param {object} request Callable request.
 * @param {AdminRole[]} roles Permitted roles.
 * @return {void}
 */
export function requireAnyRole(request: {auth?: {token?: Record<string, unknown>}}, roles: AdminRole[]): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  if (!roles.some((role) => hasRole(request, role))) throw new HttpsError("permission-denied", "Você não tem permissão para esta operação.");
}

/** Return the store identifiers assigned to the authenticated user.
 * @param {object} request Callable request.
 * @return {string[]} Assigned store identifiers.
 */
export function claimStoreIds(request: {auth?: {token?: Record<string, unknown>}}): string[] {
  const value = request.auth?.token?.storeIds;
  return Array.isArray(value) ? value.filter((storeId): storeId is string => typeof storeId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(storeId)) : [];
}

/** Check whether the request may operate on a store.
 * @param {object} request Callable request.
 * @param {string} storeId Store identifier.
 * @return {boolean} Whether access is granted.
 */
export function hasStoreAccess(request: {auth?: {token?: Record<string, unknown>}}, storeId: string): boolean {
  return hasRole(request, "admin") || claimStoreIds(request).includes(storeId);
}

/** Reject a request that lacks access to a store.
 * @param {object} request Callable request.
 * @param {string} storeId Store identifier.
 * @return {void}
 */
export function requireStoreAccess(request: {auth?: {token?: Record<string, unknown>}}, storeId: string): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  if (!hasStoreAccess(request, storeId)) throw new HttpsError("permission-denied", "Você não tem acesso a esta loja.");
}
