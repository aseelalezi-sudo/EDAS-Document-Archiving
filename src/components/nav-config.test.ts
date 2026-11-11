import { describe, expect, it } from "vitest";
import { NAV, ROLE_ACCESS, hasAccess } from "./nav-config";
import type { Role } from "../store";

const ROLES: Role[] = ["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"];

describe("hasAccess role gating", () => {
  it("grants system_admin the full navigation", () => {
    for (const to of ROLE_ACCESS.system_admin) {
      expect(hasAccess("system_admin", to)).toBe(true);
    }
  });

  it("denies auditor admin and document editing routes", () => {
    expect(hasAccess("auditor", "/admin/users")).toBe(false);
    expect(hasAccess("auditor", "/documents/new")).toBe(false);
    expect(hasAccess("auditor", "/reports/audit-trail")).toBe(true);
  });

  it("denies plain employees the admin area", () => {
    expect(hasAccess("employee", "/admin/users")).toBe(false);
    expect(hasAccess("employee", "/dashboard")).toBe(true);
    expect(hasAccess("employee", "/documents")).toBe(true);
  });

  it("matches nested routes via prefix", () => {
    expect(hasAccess("employee", "/documents/abc-123/edit")).toBe(true);
    expect(hasAccess("employee", "/library/folders/f-legal")).toBe(true);
  });

  it("keeps the audit trail limited to the roles the API allows", () => {
    expect(hasAccess("auditor", "/reports/audit-trail")).toBe(true);
    expect(hasAccess("system_admin", "/reports/audit-trail")).toBe(true);
    expect(hasAccess("dept_manager", "/reports/audit-trail")).toBe(false);
    expect(hasAccess("archivist", "/reports/audit-trail")).toBe(false);
    expect(hasAccess("employee", "/reports/audit-trail")).toBe(false);
  });

  it("does not expose write-heavy screens to the read-only auditor", () => {
    for (const to of ["/documents/new", "/policies", "/org/departments", "/admin/users", "/settings/department-defaults"]) {
      expect(hasAccess("auditor", to), `auditor -> ${to}`).toBe(false);
    }
  });

  it("allows workflow task details but keeps approval chains restricted", () => {
    expect(hasAccess("employee", "/workflow/task-123")).toBe(true);
    expect(hasAccess("employee", "/workflow/chains")).toBe(false);
    expect(hasAccess("supervisor", "/workflow/task-123")).toBe(true);
    expect(hasAccess("supervisor", "/workflow/chains")).toBe(false);
    expect(hasAccess("auditor", "/workflow/task-123")).toBe(false);
  });

  it("gives the supervisor the employee surface and keeps administrative screens closed", () => {
    expect(hasAccess("supervisor", "/documents")).toBe(true);
    expect(hasAccess("supervisor", "/trash")).toBe(true);
    expect(hasAccess("supervisor", "/admin/users")).toBe(false);
    expect(hasAccess("supervisor", "/policies")).toBe(false);
    expect(hasAccess("supervisor", "/reports/audit-trail")).toBe(false);
  });

  it("matches the API roles on the legal-holds screen", () => {
    expect(hasAccess("dept_manager", "/policies/legal-holds")).toBe(true);
    expect(hasAccess("archivist", "/policies/legal-holds")).toBe(true);
    expect(hasAccess("dept_manager", "/policies")).toBe(false);
    expect(hasAccess("employee", "/policies/legal-holds")).toBe(false);
    expect(hasAccess("auditor", "/policies/legal-holds")).toBe(false);
  });

  it("every role can reach the dashboard", () => {
    for (const r of ROLES) {
      expect(hasAccess(r, "/dashboard"), `${r} -> /dashboard`).toBe(true);
    }
  });

  it("exposes a non-empty NAV config with unique routes", () => {
    const routes = NAV.flatMap((g) => g.items.map((i) => i.to));
    expect(routes.length).toBeGreaterThan(0);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
