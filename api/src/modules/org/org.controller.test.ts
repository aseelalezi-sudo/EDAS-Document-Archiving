import { describe, expect, it, vi } from "vitest";
import { OrgController } from "./org.controller";
import type { OrgService } from "./org.service";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const org = {
    tree: vi.fn().mockResolvedValue({ departments: [] }),
    projects: vi.fn().mockResolvedValue([]),
    employees: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    departmentDefaults: vi.fn().mockResolvedValue({ retentionYears: 5 }),
    putDepartmentDefaults: vi.fn().mockResolvedValue({ retentionYears: 7 }),
    createDepartment: vi.fn().mockResolvedValue({ id: "dept-1" }),
    updateDepartment: vi.fn().mockResolvedValue({ id: "dept-1" }),
    deleteDepartment: vi.fn().mockResolvedValue(undefined),
    createSection: vi.fn().mockResolvedValue({ id: "sec-1" }),
    updateSection: vi.fn().mockResolvedValue({ id: "sec-1" }),
    deleteSection: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
    updateProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    createEmployee: vi.fn().mockResolvedValue({ id: "emp-1" }),
    updateEmployee: vi.fn().mockResolvedValue({ id: "emp-1" }),
    deleteEmployee: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new OrgController(org as unknown as OrgService), org };
}

describe("OrgController delegation", () => {
  it("serves the tree and the project list without a principal", async () => {
    const { controller, org } = build();

    await expect(controller.tree()).resolves.toEqual({ departments: [] });
    await expect(controller.projects()).resolves.toEqual([]);
    expect(org.tree).toHaveBeenCalledWith();
    expect(org.projects).toHaveBeenCalledWith();
  });

  it("defaults employee paging to the first page of fifty", async () => {
    const { controller, org } = build();

    await controller.employees(PRINCIPAL as never, {} as never);
    expect(org.employees).toHaveBeenLastCalledWith(PRINCIPAL, 1, 50);

    await controller.employees(PRINCIPAL as never, { page: 3, pageSize: 10 } as never);
    expect(org.employees).toHaveBeenLastCalledWith(PRINCIPAL, 3, 10);
  });

  it("unwraps the defaults value for the put endpoint", async () => {
    const { controller, org } = build();

    await controller.departmentDefaults(PRINCIPAL as never, "dept-1");
    await controller.putDepartmentDefaults(PRINCIPAL as never, "dept-1", { value: { retentionYears: 7 } } as never);

    expect(org.departmentDefaults).toHaveBeenCalledWith(PRINCIPAL, "dept-1");
    expect(org.putDepartmentDefaults).toHaveBeenCalledWith(PRINCIPAL, "dept-1", { retentionYears: 7 });
  });

  it("forwards the department, section, project and employee writes", async () => {
    const { controller, org } = build();

    await controller.createDepartment(PRINCIPAL as never, { name: "المالية" } as never);
    await controller.updateDepartment(PRINCIPAL as never, "dept-1", { name: "المالية" } as never);
    await controller.deleteDepartment(PRINCIPAL as never, "dept-1");
    await controller.createSection(PRINCIPAL as never, { name: "العقود" } as never);
    await controller.updateSection(PRINCIPAL as never, "sec-1", { name: "العقود" } as never);
    await controller.deleteSection(PRINCIPAL as never, "sec-1");
    await controller.createProject(PRINCIPAL as never, { name: "مشروع" } as never);
    await controller.updateProject(PRINCIPAL as never, "proj-1", { name: "مشروع" } as never);
    await controller.deleteProject(PRINCIPAL as never, "proj-1");
    await controller.createEmployee(PRINCIPAL as never, { name: "سارة" } as never);
    await controller.updateEmployee(PRINCIPAL as never, "emp-1", { name: "سارة" } as never);
    await controller.deleteEmployee(PRINCIPAL as never, "emp-1");

    expect(org.createDepartment).toHaveBeenCalledWith(PRINCIPAL, { name: "المالية" });
    expect(org.updateDepartment).toHaveBeenCalledWith(PRINCIPAL, "dept-1", { name: "المالية" });
    expect(org.deleteDepartment).toHaveBeenCalledWith(PRINCIPAL, "dept-1");
    expect(org.createSection).toHaveBeenCalledWith(PRINCIPAL, { name: "العقود" });
    expect(org.updateSection).toHaveBeenCalledWith(PRINCIPAL, "sec-1", { name: "العقود" });
    expect(org.deleteSection).toHaveBeenCalledWith(PRINCIPAL, "sec-1");
    expect(org.createProject).toHaveBeenCalledWith(PRINCIPAL, { name: "مشروع" });
    expect(org.updateProject).toHaveBeenCalledWith(PRINCIPAL, "proj-1", { name: "مشروع" });
    expect(org.deleteProject).toHaveBeenCalledWith(PRINCIPAL, "proj-1");
    expect(org.createEmployee).toHaveBeenCalledWith(PRINCIPAL, { name: "سارة" });
    expect(org.updateEmployee).toHaveBeenCalledWith(PRINCIPAL, "emp-1", { name: "سارة" });
    expect(org.deleteEmployee).toHaveBeenCalledWith(PRINCIPAL, "emp-1");
  });
});
