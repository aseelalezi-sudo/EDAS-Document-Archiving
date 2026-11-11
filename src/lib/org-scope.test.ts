import { describe, expect, it } from "vitest";
import type { Department, Employee, Project, Section } from "../types";
import { canManage, canWriteOrg, employeeDepartmentId, orgScope, projectDepartmentId } from "./org-scope";

function department(id: string, parentId: string | null = null): Department {
  return { id, parentId, name: id, nameEn: id, code: id.toUpperCase(), manager: "", employees: 0, docs: 0, status: "active" };
}

const TREE = [department("eng"), department("eng-design", "eng"), department("eng-design-ux", "eng-design"), department("hr")];

describe("orgScope", () => {
  it("leaves a system administrator unlimited", () => {
    expect(orgScope("system_admin", "hr", TREE)).toBeNull();
    expect(canManage(null, undefined)).toBe(true);
  });

  it("gives a manager their department and everything below it", () => {
    const scope = orgScope("dept_manager", "eng", TREE);
    expect([...(scope ?? [])].sort()).toEqual(["eng", "eng-design", "eng-design-ux"]);
    expect(canManage(scope, "hr")).toBe(false);
    expect(canManage(scope, "eng-design-ux")).toBe(true);
  });

  it("manages nothing without a department", () => {
    const scope = orgScope("dept_manager", "", TREE);
    expect(scope?.size).toBe(0);
    expect(canManage(scope, "eng")).toBe(false);
  });

  it("refuses rows that belong to no department", () => {
    expect(canManage(orgScope("dept_manager", "eng", TREE), null)).toBe(false);
  });

  it("gives read-only roles no writable department", () => {
    for (const role of ["employee", "archivist", "auditor"] as const) {
      expect(canWriteOrg(role)).toBe(false);
      expect(orgScope(role, "eng", TREE)?.size).toBe(0);
    }
    expect(canWriteOrg("dept_manager")).toBe(true);
  });

  it("survives a self-referencing parent", () => {
    const scope = orgScope("dept_manager", "loop", [department("loop", "loop")]);
    expect([...(scope ?? [])]).toEqual(["loop"]);
  });
});

describe("row department resolution", () => {
  const sections: Section[] = [
    { id: "it-sec", deptId: "eng", name: "sec", nameEn: "sec", code: "SEC", head: "", employees: 0, status: "active" },
  ];
  const employee = { deptId: "", sectionId: "" } as Employee;
  const project = (departments: string[]): Project => ({
    id: "prj",
    name: "prj",
    nameEn: "prj",
    code: "PRJ",
    manager: "",
    status: "active",
    startDate: "",
    endDate: "",
    departments,
    members: 0,
    docs: 0,
  });

  it("prefers the employee department", () => {
    expect(employeeDepartmentId({ ...employee, deptId: "hr" }, sections)).toBe("hr");
  });

  it("falls back to the section department", () => {
    expect(employeeDepartmentId({ ...employee, sectionId: "it-sec" }, sections)).toBe("eng");
    expect(employeeDepartmentId({ ...employee, sectionId: "missing" }, sections)).toBeNull();
  });

  it("reads the owning department of a project", () => {
    expect(projectDepartmentId(project(["eng", "hr"]))).toBe("eng");
    expect(projectDepartmentId(project([]))).toBeNull();
  });
});
