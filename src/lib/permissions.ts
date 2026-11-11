import type { Role } from "../store";
import type { ACLRule, FolderNode, PermAction } from "../types";

/**
 * Folders that are visible to every authenticated user regardless of ACLs.
 * Kept here so the pure permission engine and the store agree on one source.
 */
export const SHARED_FOLDERS = ["root", "f-fav", "f-recent", "f-arch", "f-shared"];

/** Returns every descendant folder id of `folderId` (depth-first, excluding itself). */
export function folderChildrenIds(folderId: string, folders: FolderNode[]): string[] {
  const result: string[] = [];
  const walk = (pid: string) => {
    for (const f of folders) {
      if (f.parentId === pid) {
        result.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(folderId);
  return result;
}

/** Returns the ancestor chain of `folderId`, closest ancestor first. */
export function folderAncestors(folderId: string, folders: FolderNode[]): FolderNode[] {
  const chain: FolderNode[] = [];
  let current = folders.find((f) => f.id === folderId);
  while (current?.parentId) {
    const parent = folders.find((f) => f.id === current!.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export interface InheritedRule {
  rule: ACLRule;
  fromFolderId: string;
  fromFolderName: string;
}

/** ACL rules inherited from ancestor folders. */
export function inheritedRules(folderId: string, folders: FolderNode[], acls: Record<string, ACLRule[]>): InheritedRule[] {
  const result: InheritedRule[] = [];
  for (const anc of folderAncestors(folderId, folders)) {
    for (const r of acls[anc.id] ?? []) {
      result.push({ rule: r, fromFolderId: anc.id, fromFolderName: anc.name });
    }
  }
  return result;
}

/** Inherited + own ACL rules for a folder. */
export function effectiveRules(folderId: string, folders: FolderNode[], acls: Record<string, ACLRule[]>): ACLRule[] {
  return [...inheritedRules(folderId, folders, acls).map((x) => x.rule), ...(acls[folderId] ?? [])];
}

export function hasOwnRules(folderId: string, acls: Record<string, ACLRule[]>): boolean {
  return (acls[folderId] ?? []).length > 0;
}

export interface CanAccessArgs {
  action: PermAction;
  folderId: string;
  docDeptId?: string;
  role: Role;
  userDeptId?: string;
  userId?: string;
  folders: FolderNode[];
  acls: Record<string, ACLRule[]>;
}

/**
 * Pure folder-level permission engine. Mirrors the role/department/ACL rules
 * used across the app so it can be reused and unit-tested in isolation.
 */
export function canAccess({ action, folderId, docDeptId, role, userDeptId, userId, folders, acls }: CanAccessArgs): boolean {
  const matchesRule = (r: ACLRule) =>
    (r.principalType === "user" && r.principalId === userId) ||
    (r.principalType === "department" && r.principalId === userDeptId) ||
    (r.principalType === "role" && r.principalId === role);

  const rules = effectiveRules(folderId, folders, acls);
  if (rules.some((r) => r.effect === "deny" && r.permissions.includes(action) && matchesRule(r))) return false;

  if (role === "system_admin") return true;
  if (role === "auditor") return action === "view";
  if (role === "archivist") return action !== "delete";

  const folder = folders.find((f) => f.id === folderId);
  const isShared = !folder?.owner || SHARED_FOLDERS.includes(folderId);
  const ownDept = !!userDeptId && (docDeptId === userDeptId || folder?.owner === userDeptId);
  if (ownDept) return role === "dept_manager" ? true : action !== "delete";

  if (rules.some((r) => r.effect !== "deny" && r.permissions.includes(action) && matchesRule(r))) return true;

  return isShared && action === "view";
}
