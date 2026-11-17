import { describe, expect, it } from "vitest";
import { ACL_ACTIONS, ACL_MANAGER_ROLES, ROLE_CAPABILITIES, can, canManageAcl, capabilitiesFor } from "./permissions";
import { USER_ROLES, isGlobalRole, normalizeRoles } from "./roles";

describe("shared role capabilities", () => {
  it("grants system_admin every action", () => {
    for (const action of ACL_ACTIONS) expect(can("SYSTEM_ADMIN", action)).toBe(true);
  });

  it("restricts auditor to view/export", () => {
    expect([...capabilitiesFor("AUDITOR")].sort()).toEqual(["EXPORT", "VIEW"]);
    expect(can("AUDITOR", "DELETE")).toBe(false);
  });

  it("does not let employees delete or approve", () => {
    expect(can("EMPLOYEE", "DELETE")).toBe(false);
    expect(can("EMPLOYEE", "APPROVE")).toBe(false);
    expect(can("EMPLOYEE", "CREATE")).toBe(true);
  });

  it("defines capabilities for every role", () => {
    for (const role of USER_ROLES) expect(Array.isArray(ROLE_CAPABILITIES[role])).toBe(true);
  });

  it("returns a defensive copy", () => {
    const actions = capabilitiesFor("EMPLOYEE");
    actions.push("DELETE");
    expect(capabilitiesFor("EMPLOYEE")).not.toContain("DELETE");
  });

  it("restricts ACL management to the archivist and system administrator roles", () => {
    expect(ACL_MANAGER_ROLES).toEqual(["SYSTEM_ADMIN", "ARCHIVIST"]);
    expect(canManageAcl("SYSTEM_ADMIN")).toBe(true);
    expect(canManageAcl("ARCHIVIST")).toBe(true);
    expect(canManageAcl("DEPT_MANAGER")).toBe(false);
    expect(canManageAcl("EMPLOYEE")).toBe(false);
  });
});

describe("shared role helpers", () => {
  it("identifies global roles", () => {
    expect(isGlobalRole("SYSTEM_ADMIN")).toBe(true);
    expect(isGlobalRole("AUDITOR")).toBe(true);
    expect(isGlobalRole("EMPLOYEE")).toBe(false);
  });

  it("normalizes and filters role strings", () => {
    expect(normalizeRoles(["dept-manager", "SYSTEM_ADMIN", "bogus"])).toEqual(["DEPT_MANAGER", "SYSTEM_ADMIN"]);
    expect(normalizeRoles("nope")).toEqual([]);
  });
});
