import { describe, expect, it } from "vitest";
import { defaultACLs, folders } from "../data";
import { SHARED_FOLDERS, canAccess, effectiveRules, folderAncestors, folderChildrenIds, hasOwnRules, inheritedRules } from "./permissions";
import type { ACLRule } from "../types";

const acls = defaultACLs as Record<string, ACLRule[]>;

describe("folder hierarchy helpers", () => {
  it("returns descendant folder ids depth-first, excluding self", () => {
    const children = folderChildrenIds("f-legal", folders);
    expect(children).toContain("f-contracts");
    expect(children).not.toContain("f-legal");
  });

  it("walks up the ancestor chain closest-first", () => {
    const ancestors = folderAncestors("f-contracts", folders);
    expect(ancestors.map((f) => f.id)).toEqual(["root", "f-legal"]);
  });

  it("collects inherited ACL rules with their source folder", () => {
    const inherited = inheritedRules("f-contracts", folders, acls);
    expect(inherited.every((x) => x.fromFolderId === "f-legal")).toBe(true);
    expect(inherited.some((x) => x.rule.id === "a4")).toBe(true);
  });

  it("merges inherited and own rules", () => {
    const rules = effectiveRules("f-contracts", folders, acls);
    expect(rules.find((r) => r.id === "a4")).toBeDefined();
    expect(rules.find((r) => r.id === "a8")).toBeDefined();
  });

  it("detects folders that define their own rules", () => {
    expect(hasOwnRules("f-legal", acls)).toBe(true);
    expect(hasOwnRules("f-eng", acls)).toBe(true);
    expect(hasOwnRules("root", acls)).toBe(false);
  });
});

describe("canAccess permission engine", () => {
  const base = { folders, acls };

  it("grants system_admin everything", () => {
    expect(canAccess({ ...base, action: "delete", folderId: "f-legal", role: "system_admin" })).toBe(true);
  });

  it("limits auditor to view only", () => {
    expect(canAccess({ ...base, action: "view", folderId: "f-legal", role: "auditor", userDeptId: "hr" })).toBe(true);
    expect(canAccess({ ...base, action: "edit", folderId: "f-legal", role: "auditor", userDeptId: "hr" })).toBe(false);
  });

  it("lets archivist do everything except delete", () => {
    expect(canAccess({ ...base, action: "edit", folderId: "f-legal", role: "archivist", userDeptId: "hr" })).toBe(true);
    expect(canAccess({ ...base, action: "delete", folderId: "f-legal", role: "archivist", userDeptId: "hr" })).toBe(false);
  });

  it("blocks employees from deleting documents in their own department", () => {
    expect(canAccess({ ...base, action: "view", folderId: "f-fin", docDeptId: "fin", role: "employee", userDeptId: "fin" })).toBe(true);
    expect(canAccess({ ...base, action: "delete", folderId: "f-fin", docDeptId: "fin", role: "employee", userDeptId: "fin" })).toBe(false);
  });

  it("treats a supervisor like an employee in its own department (edit but no delete)", () => {
    expect(canAccess({ ...base, action: "edit", folderId: "f-fin", docDeptId: "fin", role: "supervisor", userDeptId: "fin" })).toBe(true);
    expect(canAccess({ ...base, action: "delete", folderId: "f-fin", docDeptId: "fin", role: "supervisor", userDeptId: "fin" })).toBe(
      false,
    );
  });

  it("denies cross-department access without an ACL grant", () => {
    expect(canAccess({ ...base, action: "view", folderId: "f-eng", docDeptId: "eng", role: "employee", userDeptId: "fin" })).toBe(false);
  });

  it("honours department ACL grants for other departments", () => {
    const args = { ...base, folderId: "f-legal", docDeptId: "legal" as const, role: "dept_manager" as const, userDeptId: "proc" };
    expect(canAccess({ ...args, action: "view" })).toBe(true);
    expect(canAccess({ ...args, action: "download" })).toBe(true);
    expect(canAccess({ ...args, action: "edit" })).toBe(false);
  });

  it("treats shared folders as viewable by any authenticated user", () => {
    expect(SHARED_FOLDERS).toContain("root");
    expect(canAccess({ ...base, action: "view", folderId: "f-shared", role: "employee", userDeptId: "fin" })).toBe(true);
    expect(canAccess({ ...base, action: "edit", folderId: "f-shared", role: "employee", userDeptId: "fin" })).toBe(false);
  });

  it("matches user-principal ACL rules", () => {
    const scoped: Record<string, ACLRule[]> = {
      ...acls,
      "f-eng": [{ id: "u1", principalType: "user", principalId: "u-9", principalName: "Test", permissions: ["view"] }],
    };
    expect(
      canAccess({ folders, acls: scoped, action: "view", folderId: "f-eng", role: "employee", userDeptId: "fin", userId: "u-9" }),
    ).toBe(true);
    expect(
      canAccess({ folders, acls: scoped, action: "view", folderId: "f-eng", role: "employee", userDeptId: "fin", userId: "u-1" }),
    ).toBe(false);
  });

  it("lets a deny rule revoke an action the department would otherwise allow", () => {
    const blocked: Record<string, ACLRule[]> = {
      "f-fin": [
        { id: "d1", principalType: "department", principalId: "fin", principalName: "Finance", permissions: ["download"], effect: "deny" },
      ],
    };
    const args = { folders, acls: blocked, folderId: "f-fin", docDeptId: "fin" as const, role: "employee" as const, userDeptId: "fin" };

    expect(canAccess({ ...args, action: "download" })).toBe(false);
    expect(canAccess({ ...args, action: "view" })).toBe(true);
  });

  it("does not let an allow rule exceed the employee role ceiling", () => {
    const allowed: Record<string, ACLRule[]> = {
      "f-eng": [{ id: "u2", principalType: "user", principalId: "u-1", principalName: "Test", permissions: ["delete"] }],
    };

    expect(
      canAccess({
        folders,
        acls: allowed,
        action: "delete",
        folderId: "f-eng",
        docDeptId: "eng",
        role: "employee",
        userDeptId: "fin",
        userId: "u-1",
      }),
    ).toBe(false);
  });

  it("applies a deny rule inherited from the parent folder", () => {
    const blocked: Record<string, ACLRule[]> = {
      "f-legal": [
        { id: "d2", principalType: "role", principalId: "employee", principalName: "Employee", permissions: ["view"], effect: "deny" },
      ],
    };

    expect(
      canAccess({
        folders,
        acls: blocked,
        action: "view",
        folderId: "f-contracts",
        docDeptId: "legal",
        role: "employee",
        userDeptId: "legal",
      }),
    ).toBe(false);
  });
});
