import type { UserRole } from "./roles";

export const ACL_ACTIONS = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"] as const;

export type AclAction = (typeof ACL_ACTIONS)[number];

export const ACL_PRINCIPALS = ["USER", "ROLE", "DEPARTMENT"] as const;

export type AclPrincipal = (typeof ACL_PRINCIPALS)[number];

export const ACL_EFFECTS = ["ALLOW", "DENY"] as const;

export type AclEffect = (typeof ACL_EFFECTS)[number];

/**
 * Single source of truth for what each role may do by default, before
 * department scoping and per-folder ACL rules are applied. Consumed by the
 * API (authorization) and the SPA (UI gating).
 */
export const ROLE_CAPABILITIES: Record<UserRole, readonly AclAction[]> = {
  EMPLOYEE: ["VIEW", "CREATE", "EDIT", "EXPORT"],
  SUPERVISOR: ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT"],
  DEPT_MANAGER: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"],
  ARCHIVIST: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"],
  AUDITOR: ["VIEW", "EXPORT"],
  SYSTEM_ADMIN: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"],
};

export function capabilitiesFor(role: UserRole): AclAction[] {
  return [...(ROLE_CAPABILITIES[role] ?? [])];
}

export function can(role: UserRole, action: AclAction): boolean {
  return (ROLE_CAPABILITIES[role] ?? []).includes(action);
}
