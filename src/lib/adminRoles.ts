export const ADMINISTRATOR_ROLES = ["master", "admin"] as const;

export function hasAdministrativeAccess(roles: readonly string[]): boolean {
  return ADMINISTRATOR_ROLES.some((role) => roles.includes(role));
}

export function hasRoleAccess(roles: readonly string[], requiredRole: string): boolean {
  if (roles.includes("master")) return true;
  if (roles.includes("admin")) return requiredRole !== "settings";
  return roles.includes(requiredRole);
}
