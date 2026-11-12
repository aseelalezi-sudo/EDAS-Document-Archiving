import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OrgService } from "./org.service";

function buildService() {
  const prisma = {
    department: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const access = {
    resolveActor: vi.fn().mockResolvedValue({ id: "user-1", departmentId: null, role: "SYSTEM_ADMIN" }),
    isGlobal: vi.fn().mockReturnValue(true),
  };
  const audit = { record: vi.fn() };
  const service = new OrgService(prisma as never, access as never, audit as never);
  return { service, prisma, audit };
}

const department = {
  id: "dept-a",
  code: "A",
  name: "Alpha",
  nameEn: null,
  manager: null,
  parentId: null,
  _count: { users: 0, employees: 0, documents: 0 },
};

describe("OrgService department tree", () => {
  it("moves a department to a new parent", async () => {
    const { service, prisma, audit } = buildService();
    prisma.department.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "dept-a" ? department : where.id === "dept-b" ? { id: "dept-b", parentId: null } : null),
    );
    prisma.department.update.mockResolvedValue({ ...department, parentId: "dept-b" });

    const result = await service.updateDepartment({ sub: "user-1" } as never, "dept-a", { parentId: "dept-b" });

    expect(prisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dept-a" }, data: expect.objectContaining({ parentId: "dept-b" }) }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "dept-a", parentId: "dept-b" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.department.update", entityId: "dept-a" }));
  });

  it("moves a department back to the root when the parent is cleared", async () => {
    const { service, prisma } = buildService();
    prisma.department.findUnique.mockResolvedValue({ ...department, parentId: "dept-b" });
    prisma.department.update.mockResolvedValue({ ...department, parentId: null });

    await service.updateDepartment({ sub: "user-1" } as never, "dept-a", { parentId: null });

    expect(prisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dept-a" }, data: expect.objectContaining({ parentId: null }) }),
    );
  });

  it("rejects moving a department under its own descendant", async () => {
    const { service, prisma } = buildService();
    prisma.department.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "dept-a") return Promise.resolve({ ...department, parentId: null });
      if (where.id === "dept-b") return Promise.resolve({ id: "dept-b", parentId: "dept-c" });
      if (where.id === "dept-c") return Promise.resolve({ id: "dept-c", parentId: "dept-a" });
      return Promise.resolve(null);
    });

    await expect(service.updateDepartment({ sub: "user-1" } as never, "dept-a", { parentId: "dept-b" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("rejects making a department its own parent", async () => {
    const { service, prisma } = buildService();
    prisma.department.findUnique.mockResolvedValue(department);

    await expect(service.updateDepartment({ sub: "user-1" } as never, "dept-a", { parentId: "dept-a" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });
});

const FINANCE_TREE = [
  { id: "dept-fin", parentId: null },
  { id: "dept-fin-audit", parentId: "dept-fin" },
  { id: "dept-legal", parentId: null },
];

function directoryService(actor: { id: string; departmentId: string | null; role: string }) {
  const prisma = {
    department: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === "dept-legal" || where.id.startsWith("dept-fin") ? { id: where.id, parentId: null } : null),
        ),
      findMany: vi.fn().mockResolvedValue(FINANCE_TREE),
      create: vi.fn().mockResolvedValue({ id: "dept-new" }),
      update: vi.fn().mockResolvedValue({ id: "dept-fin" }),
      delete: vi.fn().mockResolvedValue({ id: "dept-fin" }),
    },
    section: {
      findUnique: vi.fn().mockResolvedValue({ id: "sec-1", departmentId: "dept-legal" }),
      update: vi.fn().mockResolvedValue({ id: "sec-1" }),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({ id: "proj-1", departmentId: "dept-legal", _count: { documents: 0, folders: 0 } }),
      create: vi.fn().mockResolvedValue({ id: "proj-new", code: "P1" }),
      update: vi.fn().mockResolvedValue({ id: "proj-1" }),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue({ id: "emp-1", departmentId: "dept-legal", sectionId: null }),
      findMany: vi.fn().mockResolvedValue([{ id: "emp-1", name: "سارة", email: "sara@edas.gov", phone: "0111", userId: null }]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue({ id: "emp-new", empNo: "E9" }),
      update: vi.fn().mockResolvedValue({ id: "emp-1" }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2" }) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const isGlobal = actor.role === "SYSTEM_ADMIN" || actor.role === "AUDITOR";
  const access = { resolveActor: vi.fn().mockResolvedValue(actor), isGlobal: vi.fn().mockReturnValue(isGlobal) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new OrgService(prisma as never, access as never, audit as never);
  return { service, prisma, audit };
}

const MANAGER = { id: "user-mgr", departmentId: "dept-fin", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };
const WORKER = { id: "user-emp", departmentId: "dept-fin", role: "EMPLOYEE" };

describe("OrgService department scoping", () => {
  it("refuses a top-level department from a manager", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.createDepartment({ sub: "user-mgr" } as never, { code: "X", name: "كيان" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.department.create).not.toHaveBeenCalled();
  });

  it("lets a manager create a department inside their own tree", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await service.createDepartment({ sub: "user-mgr" } as never, { code: "X", name: "شعبة", parentId: "dept-fin-audit" } as never);

    expect(prisma.department.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: "dept-fin-audit" }) }),
    );
  });

  it("refuses a department outside the manager's tree", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(
      service.updateDepartment({ sub: "user-mgr" } as never, "dept-legal", { name: "تم العبث" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("accepts a descendant department of the manager", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await service.updateDepartment({ sub: "user-mgr" } as never, "dept-fin-audit", { name: "مراجعة داخلية" } as never);

    expect(prisma.department.update).toHaveBeenCalled();
  });

  it("refuses to detach a department from its parent for a manager", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.updateDepartment({ sub: "user-mgr" } as never, "dept-fin-audit", { parentId: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("refuses to move a department under a foreign parent", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.updateDepartment({ sub: "user-mgr" } as never, "dept-fin", { parentId: "dept-legal" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("keeps every department reachable for a system administrator", async () => {
    const { service, prisma } = directoryService(ADMIN);

    await service.createDepartment({ sub: "user-admin" } as never, { code: "X", name: "إدارة" } as never);

    expect(prisma.department.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ parentId: null }) }));
    expect(prisma.department.findMany).not.toHaveBeenCalled();
  });

  it("refuses a section that belongs to another department", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.updateSection({ sub: "user-mgr" } as never, "sec-1", { name: "تم العبث" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.section.findUnique).toHaveBeenCalledWith({ where: { id: "sec-1" } });
  });

  it("refuses to create an employee with no department for a manager", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.createEmployee({ sub: "user-mgr" } as never, { empNo: "E1", name: "موظف" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it("refuses to delete an employee of another department", async () => {
    const { service } = directoryService(MANAGER);

    await expect(service.deleteEmployee({ sub: "user-mgr" } as never, "emp-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to reassign an employee into a foreign section", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.employee.findUnique.mockResolvedValue({ id: "emp-1", departmentId: "dept-fin", sectionId: null });
    prisma.section.findUnique.mockResolvedValue({ id: "sec-9", departmentId: "dept-legal" });

    await expect(service.updateEmployee({ sub: "user-mgr" } as never, "emp-1", { sectionId: "sec-9" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("hides employee contact details from a role without directory access", async () => {
    const { service } = directoryService(WORKER);

    const result = await service.employees({ sub: "user-emp", roles: ["EMPLOYEE"] } as never);

    expect(result.items).toEqual([{ id: "emp-1", name: "سارة", userId: null, email: null, phone: null }]);
    expect(result.meta.total).toBe(1);
  });

  it("shows contact details to the roles that administer the directory", async () => {
    const { service } = directoryService(MANAGER);

    const result = await service.employees({ sub: "user-mgr", roles: ["DEPT_MANAGER"] } as never);

    expect(result.items[0]).toEqual(expect.objectContaining({ email: "sara@edas.gov", phone: "0111" }));
  });

  it("paginates the directory and reports the total across all pages", async () => {
    const { service, prisma } = directoryService(MANAGER);

    const result = await service.employees({ sub: "user-mgr", roles: ["DEPT_MANAGER"] } as never, 3, 5);

    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 5 }));
    expect(result.meta).toEqual({ page: 3, pageSize: 5, total: 1 });
  });

  it("refuses a new department under a foreign parent", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(
      service.createDepartment({ sub: "user-mgr" } as never, { code: "X", name: "شعبة", parentId: "dept-legal" } as never),
    ).rejects.toThrow("You can only create departments inside your own department tree");
    expect(prisma.department.findMany).toHaveBeenCalled();
  });

  it("refuses to move a section into a foreign department", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.section.findUnique.mockResolvedValue({ id: "sec-1", departmentId: "dept-fin" });

    await expect(
      service.updateSection({ sub: "user-mgr" } as never, "sec-1", { departmentId: "dept-legal" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.section.update).not.toHaveBeenCalled();
  });

  it("creates a project inside the managed tree with its dates", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await service.createProject(
      { sub: "user-mgr" } as never,
      {
        code: "P1",
        name: "مشروع",
        departmentId: "dept-fin-audit",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      } as never,
    );

    const { data } = prisma.project.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ departmentId: "dept-fin-audit", startDate: new Date("2026-01-01"), endDate: new Date("2026-06-30") });
  });

  it("refuses a project in a foreign department with its own reason", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(
      service.createProject({ sub: "user-mgr" } as never, { code: "P1", name: "مشروع", departmentId: "dept-legal" } as never),
    ).rejects.toThrow("This department is outside the departments you manage");
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("refuses to move a project into a foreign department", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.project.findUnique.mockResolvedValue({ id: "proj-1", departmentId: "dept-fin" });

    await expect(
      service.updateProject({ sub: "user-mgr" } as never, "proj-1", { departmentId: "dept-legal" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("updates a project's dates without moving it", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.project.findUnique.mockResolvedValue({ id: "proj-1", departmentId: "dept-fin" });

    await service.updateProject({ sub: "user-mgr" } as never, "proj-1", { startDate: "2026-02-01", endDate: "2026-03-01" } as never);

    const { data } = prisma.project.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ startDate: new Date("2026-02-01"), endDate: new Date("2026-03-01") });
  });

  it("refuses to create an employee in a foreign department with its own reason", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(
      service.createEmployee({ sub: "user-mgr" } as never, { empNo: "E1", name: "موظف", departmentId: "dept-legal" } as never),
    ).rejects.toThrow("This employee is outside the departments you manage");
    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it("rejects an employee linked to a missing user account", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.createEmployee(
        { sub: "user-mgr" } as never,
        { empNo: "E1", name: "موظف", departmentId: "dept-fin", userId: "ghost" } as never,
      ),
    ).rejects.toThrow("User not found");
  });

  it("keeps an employee inside its department when the target section names none", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.employee.findUnique.mockResolvedValue({ id: "emp-1", departmentId: "dept-fin", sectionId: null });
    prisma.section.findUnique.mockImplementation(({ select }: { select?: { id?: boolean } }) =>
      Promise.resolve(select?.id ? { id: "sec-9" } : { id: "sec-9", departmentId: null }),
    );

    await service.updateEmployee({ sub: "user-mgr" } as never, "emp-1", { sectionId: "sec-9" } as never);

    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "emp-1" } }));
  });

  it("treats a manager without a department as owning nothing", async () => {
    const { service } = directoryService({ id: "user-x", departmentId: null, role: "DEPT_MANAGER" });

    await expect(service.createDepartment({ sub: "user-x" } as never, { code: "X", name: "كيان" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("stops walking a department hierarchy that loops back on itself", async () => {
    const { service, prisma } = directoryService({ id: "user-loop", departmentId: "dept-a", role: "DEPT_MANAGER" });
    prisma.department.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "dept-a" || where.id === "dept-b" ? { id: where.id } : null),
    );
    prisma.department.findMany.mockResolvedValue([
      { id: "dept-a", parentId: "dept-b" },
      { id: "dept-b", parentId: "dept-a" },
    ]);

    await service.createDepartment({ sub: "user-loop" } as never, { code: "X", name: "شعبة", parentId: "dept-b" } as never);

    expect(prisma.department.create).toHaveBeenCalled();
  });

  it("records an audit event without an actor id", async () => {
    const { service, audit } = directoryService({ id: "", departmentId: null, role: "SYSTEM_ADMIN" });

    await service.createProject({ sub: "" } as never, { code: "P9", name: "مشروع" } as never);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.project.create", actorId: null }));
  });

  it("renames a section without moving it", async () => {
    const { service, prisma } = directoryService(MANAGER);
    prisma.section.findUnique.mockResolvedValue({ id: "sec-1", departmentId: "dept-fin" });

    await service.updateSection({ sub: "user-mgr" } as never, "sec-1", { name: "شعبة المراجعة" } as never);

    expect(prisma.section.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sec-1" }, data: expect.objectContaining({ name: "شعبة المراجعة" }) }),
    );
  });

  it("refuses a project without a department for a manager", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await expect(service.createProject({ sub: "user-mgr" } as never, { code: "P2", name: "مشروع" } as never)).rejects.toThrow(
      "Only a system administrator can create a project without a department",
    );
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("lets a system administrator move a project to no department", async () => {
    const { service, prisma } = directoryService(ADMIN);

    await service.updateProject({ sub: "user-admin" } as never, "proj-1", { departmentId: null } as never);

    const { data } = prisma.project.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.departmentId).toBeNull();
  });

  it("updates only the start date of a project", async () => {
    const { service, prisma } = directoryService(ADMIN);

    await service.updateProject({ sub: "user-admin" } as never, "proj-1", { startDate: "2026-04-01" } as never);

    const { data } = prisma.project.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ startDate: new Date("2026-04-01"), endDate: undefined });
  });

  it("accepts an employee linked to an existing user account", async () => {
    const { service, prisma } = directoryService(MANAGER);

    await service.createEmployee(
      { sub: "user-mgr" } as never,
      {
        empNo: "E2",
        name: "موظف",
        departmentId: "dept-fin",
        userId: "user-2",
      } as never,
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-2" }, select: { id: true } });
    expect(prisma.employee.create).toHaveBeenCalled();
  });
});
