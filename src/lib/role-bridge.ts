import type { AclAction, ProfileDto, UserRole } from "@edas/shared";
import type { Role, User } from "../store";
import type { PermAction } from "../types";

/**
 * The API role names (UPPER_SNAKE) map onto the SPA's UI roles (lower_snake).
 * A supervisor keeps the employee UI surface (no delete) and gains the approval
 * workflows; the API still enforces every action server-side.
 */
export const ROLE_FROM_API: Record<UserRole, Role> = {
  EMPLOYEE: "employee",
  SUPERVISOR: "supervisor",
  DEPT_MANAGER: "dept_manager",
  ARCHIVIST: "archivist",
  AUDITOR: "auditor",
  SYSTEM_ADMIN: "system_admin",
};

/** UI permission actions (PermAction) ↔ API ACL actions (AclAction). */
export const PERM_TO_ACL: Record<PermAction, AclAction> = {
  view: "VIEW",
  edit: "EDIT",
  delete: "DELETE",
  download: "EXPORT",
};

const ACL_TO_PERM: Record<AclAction, PermAction | null> = {
  VIEW: "view",
  EDIT: "edit",
  DELETE: "delete",
  EXPORT: "download",
  CREATE: null,
  APPROVE: null,
};

const AVATAR_COLORS = [
  "bg-navy-600",
  "bg-teal-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-purple-600",
  "bg-sky-600",
  "bg-indigo-600",
];

export function roleFromApi(role: UserRole): Role {
  return ROLE_FROM_API[role] ?? "employee";
}

const ROLE_TO_API: Record<Role, UserRole> = {
  employee: "EMPLOYEE",
  supervisor: "SUPERVISOR",
  dept_manager: "DEPT_MANAGER",
  archivist: "ARCHIVIST",
  auditor: "AUDITOR",
  system_admin: "SYSTEM_ADMIN",
};

export function roleToApi(role: Role): UserRole {
  return ROLE_TO_API[role] ?? "EMPLOYEE";
}

export function aclActionFor(perm: PermAction): AclAction {
  return PERM_TO_ACL[perm];
}

export function permsFromAclActions(actions: AclAction[]): PermAction[] {
  const result = new Set<PermAction>();
  for (const action of actions) {
    const perm = ACL_TO_PERM[action];
    if (perm) result.add(perm);
  }
  return [...result];
}

export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

export function avatarColor(seed: string): string {
  return colorFor(seed);
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function profileToAppUser(profile: ProfileDto): User {
  return {
    id: profile.id,
    name: profile.name,
    nameEn: profile.nameEn ?? profile.name,
    username: profile.username,
    email: profile.email,
    jobTitle: profile.jobTitle ?? "",
    jobTitleEn: profile.jobTitleEn ?? profile.jobTitle ?? "",
    department: profile.departmentId ?? "",
    section: profile.sectionId ?? "",
    phone: profile.phone ?? "",
    role: roleFromApi(profile.role),
    initials: initialsFromName(profile.name),
    color: colorFor(profile.id || profile.username),
    isNew: profile.isNew,
  };
}
