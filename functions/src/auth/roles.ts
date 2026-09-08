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
