import { sendPasswordResetEmail } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../lib/firebase";

export const ADMIN_ROLES = ["admin", "catalog", "inventory", "sales", "reports", "settings"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
export type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  emailVerified: boolean;
  roles: AdminRole[];
  storeIds: string[];
  createdAtMs: number;
  lastSignInAtMs: number;
};
export type AdminUserInput = {displayName: string; roles: AdminRole[]; storeIds: string[]; disabled: boolean};
type ListResponse = {users: AdminUser[]; nextPageToken?: string};
type UserResponse = {user: AdminUser};
const callable = httpsCallable<Record<string, unknown>, ListResponse | UserResponse>(getFunctions(app, "southamerica-east1"), "manageAdminUsers");

export async function listAdminUsers(pageToken?: string): Promise<ListResponse> {
  const result = await callable({action: "list", ...(pageToken ? {pageToken} : {})});
  if (!("users" in result.data)) throw new Error("Resposta inválida.");
  return result.data;
}

export async function createAdminUser(email: string, input: AdminUserInput): Promise<AdminUser> {
  const result = await callable({action: "create", email, displayName: input.displayName, roles: input.roles, storeIds: input.storeIds});
  if (!("user" in result.data)) throw new Error("Resposta inválida.");
  return result.data.user;
}

export async function updateAdminUser(uid: string, input: AdminUserInput): Promise<AdminUser> {
  const result = await callable({action: "update", uid, displayName: input.displayName, roles: input.roles, storeIds: input.storeIds, disabled: input.disabled});
  if (!("user" in result.data)) throw new Error("Resposta inválida.");
  return result.data.user;
}

export async function sendAdminUserAccess(email: string): Promise<void> {
  auth.languageCode = "pt-BR";
  await sendPasswordResetEmail(auth, email, {url: `${window.location.origin}/admin/login`});
}
