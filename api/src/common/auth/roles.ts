import { UserRole } from "@prisma/client";
import { USER_ROLES, normalizeRoles as normalizeSharedRoles } from "@edas/shared";
import type { UserRole as SharedRole } from "@edas/shared";

export const ALL_ROLES = USER_ROLES as unknown as UserRole[];

export function normalizeRoles(input: unknown): UserRole[] {
  return normalizeSharedRoles(input) as unknown as UserRole[];
}

export type { SharedRole };
