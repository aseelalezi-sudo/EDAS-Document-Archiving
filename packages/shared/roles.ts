export const USER_ROLES = ["EMPLOYEE", "SUPERVISOR", "DEPT_MANAGER", "ARCHIVIST", "AUDITOR", "SYSTEM_ADMIN"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const GLOBAL_ROLES: readonly UserRole[] = ["SYSTEM_ADMIN", "AUDITOR"];

const ROLE_SET = new Set<string>(USER_ROLES);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

export function normalizeRole(input: string): UserRole | undefined {
  const key = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return isUserRole(key) ? key : undefined;
}

export function normalizeRoles(input: unknown): UserRole[] {
  if (!Array.isArray(input)) return [];
  const result = new Set<UserRole>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const role = normalizeRole(raw);
    if (role) result.add(role);
  }
  return [...result];
}

export function isGlobalRole(role: UserRole): boolean {
  return GLOBAL_ROLES.includes(role);
}
