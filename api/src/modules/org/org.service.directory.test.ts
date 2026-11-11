import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { OrgService } from "./org.service";

const PRINCIPAL = { sub: "user-mgr" } as never;
const MANAGER = { id: "user-mgr", departmentId: "dept-fin", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

interface DepartmentRow {
  id: string;
  code?: string;
  name?: string;
  parentId: string | null;
  _count: { children: number; sections: number; users: number; employees: number; projects: number; documents: number };
}
interface SectionRow {
  id: string;
  code?: string;
  name?: string;
  departmentId: string;
  _count: { users: number; employees: number; documents: number };
}
interface ProjectRow {
  id: string;
  code?: string;
  name?: string;
  departmentId: string | null;
  status?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  _count: { documents: number; folders: number };
}
interface EmployeeRow {
  id: string;
  empNo?: string;
  name?: string;
  departmentId: string | null;
  sectionId: string | null;
  userId: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
}

function counts() {
  return { children: 0, sections: 0, users: 0, employees: 0, projects: 0, documents: 0 };
}

function buildService(actor: { id: string; departmentId: string | null; role: string } = MANAGER) {
  const departments: DepartmentRow[] = [
    { id: "dept-fin", code: "FIN", name: "المالية", parentId: null, _count: counts() },
    { id: "dept-fin-audit", code: "FIN-A", name: "المراجعة", parentId: "dept-fin", _count: counts() },
    { id: "dept-legal", code: "LEG", name: "القانونية", parentId: null, _count: counts() },
  ];
  const sections: SectionRow[] = [
    { id: "sec-fin", code: "FIN-1", name: "العقود", departmentId: "dept-fin", _count: { users: 0, employees: 0, documents: 0 } },
  ];
  const projects: ProjectRow[] = [
    { id: "proj-fin", code: "PRJ-1", name: "تحديث", departmentId: "dept-fin", _count: { documents: 0, folders: 0 } },
  ];
  const employees: EmployeeRow[] = [{ id: "emp-fin", empNo: "E1", name: "سارة", departmentId: "dept-fin", sectionId: null, userId: null }];
  const settings = new Map<string, unknown>();

  const prisma = {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    department: {
      findMany: vi.fn(async ({ select }: { select?: unknown } = {}) =>
        select ? departments.map(({ id, parentId }) => ({ id, parentId })) : departments,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => departments.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `dept-${departments.length + 1}`, parentId: null, ...data, _count: counts() } as DepartmentRow;
        departments.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = departments.find((item) => item.id === where.id) as DepartmentRow;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    section: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => sections.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sec-${sections.length + 1}`, ...data, _count: { users: 0, employees: 0, documents: 0 } } as SectionRow;
        sections.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = sections.find((item) => item.id === where.id) as SectionRow;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    project: {
      findMany: vi.fn(async () => projects),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => projects.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `proj-${projects.length + 1}`, ...data, _count: { documents: 0, folders: 0 } } as ProjectRow;
        projects.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = projects.find((item) => item.id === where.id) as ProjectRow;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    employee: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => employees.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `emp-${employees.length + 1}`, ...data } as EmployeeRow;
        employees.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = employees.find((item) => item.id === where.id) as EmployeeRow;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id.startsWith("user-ghost") ? null : { id: where.id })),
    },
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { id: "setting-1", key: where.key, value: settings.get(where.key) } : null,
      ),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        settings.set(where.key, create.value);
        return { id: "setting-1", key: where.key, value: create.value };
      }),
    },
  };

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new OrgService(prisma as never, access as never, audit as never),
    prisma,
    audit,
    departments,
    sections,
    projects,
    employees,
  };
}

function uniqueError(code = "P2002") {
  return new Prisma.PrismaClientKnownRequestError("constraint failed", { code, clientVersion: "6.1.0" });
}

describe("OrgService directory reads", () => {
  it("returns departments ordered with their sections", async () => {
    const { service, prisma } = buildService();

    const result = await service.tree();

    expect(result.items).toHaveLength(3);
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: expect.objectContaining({ sections: expect.objectContaining({ select: expect.any(Object) }) }),
      }),
    );
  });

  it("lists projects with a total", async () => {
    const { service } = buildService();

    const result = await service.projects();

    expect(result.meta).toEqual({ total: 1 });
    expect(result.items[0]).toEqual(expect.objectContaining({ id: "proj-fin" }));
  });
});

describe("OrgService departments", () => {
  it("creates a top-level department as an administrator and records the code", async () => {
    const { service, prisma, audit, departments } = buildService(ADMIN);

    const created = await service.createDepartment(PRINCIPAL, { code: "NEW", name: "إدارة جديدة" } as never);

    expect(prisma.department.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: "NEW", name: "إدارة جديدة", nameEn: undefined, manager: undefined, order: 0, parentId: null },
      }),
    );
    expect(departments.some((row) => row.id === created.id)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "org.department.create", entityType: "Department", detail: { code: "NEW" } }),
    );
  });

  it("rejects a parent that does not exist", async () => {
    const { service, prisma } = buildService(ADMIN);

    await expect(
      service.createDepartment(PRINCIPAL, { code: "NEW", name: "شعبة", parentId: "dept-ghost" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.department.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate code to a conflict", async () => {
    const { service, prisma } = buildService(ADMIN);
    prisma.department.create.mockRejectedValue(uniqueError());

    await expect(service.createDepartment(PRINCIPAL, { code: "FIN", name: "مكرر" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps a broken reference to a readable error and keeps other failures intact", async () => {
    const { service, prisma } = buildService(ADMIN);
    prisma.department.create.mockRejectedValueOnce(uniqueError("P2003"));
    await expect(service.createDepartment(PRINCIPAL, { code: "X", name: "مرجع" } as never)).rejects.toBeInstanceOf(BadRequestException);

    prisma.department.create.mockRejectedValueOnce(new Error("connection reset"));
    await expect(service.createDepartment(PRINCIPAL, { code: "X", name: "شبكة" } as never)).rejects.toThrow("connection reset");
  });

  it("reports a missing department on update", async () => {
    const { service, prisma } = buildService(ADMIN);

    await expect(service.updateDepartment(PRINCIPAL, "dept-ghost", { name: "x" } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("deletes an empty department and records it", async () => {
    const { service, prisma, audit } = buildService(ADMIN);

    await expect(service.deleteDepartment(PRINCIPAL, "dept-legal")).resolves.toEqual({ id: "dept-legal", deleted: true });

    expect(prisma.department.delete).toHaveBeenCalledWith({ where: { id: "dept-legal" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.department.delete", detail: { code: "LEG" } }));
  });

  it("refuses to delete a department that still has dependants", async () => {
    const { service, prisma, departments } = buildService(ADMIN);
    departments[0]._count.documents = 1;

    await expect(service.deleteDepartment(PRINCIPAL, "dept-fin")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.department.delete).not.toHaveBeenCalled();
  });

  it("reports a missing department on delete", async () => {
    const { service } = buildService(ADMIN);

    await expect(service.deleteDepartment(PRINCIPAL, "dept-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrgService sections", () => {
  it("creates a section inside the manager's department with the default order", async () => {
    const { service, prisma, audit } = buildService();

    await service.createSection(PRINCIPAL, { code: "FIN-2", name: "المشتريات", departmentId: "dept-fin" } as never);

    expect(prisma.section.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: "FIN-2", name: "المشتريات", nameEn: undefined, manager: undefined, order: 0, departmentId: "dept-fin" },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "org.section.create", entityType: "Section", detail: { code: "FIN-2" } }),
    );
  });

  it("rejects a section whose department does not exist", async () => {
    const { service, prisma } = buildService();

    await expect(service.createSection(PRINCIPAL, { code: "X", name: "شعبة", departmentId: "dept-ghost" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.section.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate section code to a conflict", async () => {
    const { service, prisma } = buildService();
    prisma.section.create.mockRejectedValue(uniqueError());

    await expect(
      service.createSection(PRINCIPAL, { code: "FIN-1", name: "مكرر", departmentId: "dept-fin" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports a missing section on update", async () => {
    const { service } = buildService();

    await expect(service.updateSection(PRINCIPAL, "sec-ghost", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses moving a section into a department outside the tree", async () => {
    const { service, prisma } = buildService();

    await expect(service.updateSection(PRINCIPAL, "sec-fin", { departmentId: "dept-legal" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.section.update).not.toHaveBeenCalled();
  });

  it("moves a section inside the tree and records the change", async () => {
    const { service, prisma, audit } = buildService();

    await service.updateSection(PRINCIPAL, "sec-fin", { departmentId: "dept-fin-audit", name: "العقود والمراجعة" } as never);

    expect(prisma.section.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sec-fin" }, data: expect.objectContaining({ departmentId: "dept-fin-audit" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.section.update" }));
  });

  it("deletes an empty section and refuses one with dependants", async () => {
    const { service, prisma, audit, sections } = buildService();

    await expect(service.deleteSection(PRINCIPAL, "sec-fin")).resolves.toEqual({ id: "sec-fin", deleted: true });
    expect(prisma.section.delete).toHaveBeenCalledWith({ where: { id: "sec-fin" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.section.delete", detail: { code: "FIN-1" } }));

    sections[0]._count.employees = 2;
    await expect(service.deleteSection(PRINCIPAL, "sec-fin")).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports a missing section on delete", async () => {
    const { service } = buildService();

    await expect(service.deleteSection(PRINCIPAL, "sec-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrgService projects", () => {
  it("lets an administrator create a project without a department", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.createProject(PRINCIPAL, { code: "PRJ-2", name: "مشروع" } as never);

    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: "PRJ-2", name: "مشروع", nameEn: undefined, status: "active", startDate: null, endDate: null, departmentId: null },
      }),
    );
  });

  it("refuses a project outside the manager's departments", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.createProject(PRINCIPAL, { code: "PRJ-3", name: "مشروع", departmentId: "dept-legal" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("parses the start and end dates", async () => {
    const { service, prisma } = buildService();

    await service.createProject(PRINCIPAL, {
      code: "PRJ-4",
      name: "مشروع",
      departmentId: "dept-fin",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    } as never);

    const data = (prisma.project.create.mock.calls[0][0] as { data: { startDate: Date; endDate: Date } }).data;
    expect(data.startDate).toEqual(new Date("2026-01-01"));
    expect(data.endDate).toEqual(new Date("2026-12-31"));
  });

  it("reports a missing project on update", async () => {
    const { service } = buildService();

    await expect(service.updateProject(PRINCIPAL, "proj-ghost", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses moving a project into a foreign department", async () => {
    const { service, prisma } = buildService();

    await expect(service.updateProject(PRINCIPAL, "proj-fin", { departmentId: "dept-legal" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("updates a project and audits the payload", async () => {
    const { service, prisma, audit } = buildService();

    await service.updateProject(PRINCIPAL, "proj-fin", { name: "تحديث 2027", endDate: "2027-06-30" } as never);

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "proj-fin" },
        data: expect.objectContaining({ name: "تحديث 2027", endDate: new Date("2027-06-30") }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.project.update", entityId: "proj-fin" }));
  });

  it("deletes an empty project and refuses one with documents", async () => {
    const { service, prisma, audit, projects } = buildService();

    await expect(service.deleteProject(PRINCIPAL, "proj-fin")).resolves.toEqual({ id: "proj-fin", deleted: true });
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: "proj-fin" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.project.delete", detail: { code: "PRJ-1" } }));

    projects[0]._count.documents = 3;
    await expect(service.deleteProject(PRINCIPAL, "proj-fin")).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports a missing project on delete", async () => {
    const { service } = buildService();

    await expect(service.deleteProject(PRINCIPAL, "proj-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrgService employees", () => {
  it("derives the department from the section so a manager can hire inside it", async () => {
    const { service, prisma } = buildService();

    await service.createEmployee(PRINCIPAL, { empNo: "E2", name: "خالد", sectionId: "sec-fin" } as never);

    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ empNo: "E2", departmentId: null, sectionId: "sec-fin", status: "ACTIVE", userId: null }),
      }),
    );
  });

  it("rejects unknown section and user references", async () => {
    const { service, prisma } = buildService();

    await expect(service.createEmployee(PRINCIPAL, { empNo: "E9", name: "x", sectionId: "sec-ghost" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.createEmployee(PRINCIPAL, { empNo: "E9", name: "x", departmentId: "dept-fin", userId: "user-ghost" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate employee number to a conflict", async () => {
    const { service, prisma } = buildService();
    prisma.employee.create.mockRejectedValue(uniqueError());

    await expect(
      service.createEmployee(PRINCIPAL, { empNo: "E1", name: "مكرر", departmentId: "dept-fin" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports a missing employee on update", async () => {
    const { service } = buildService();

    await expect(service.updateEmployee(PRINCIPAL, "emp-ghost", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates an employee and audits the payload", async () => {
    const { service, prisma, audit } = buildService();

    await service.updateEmployee(PRINCIPAL, "emp-fin", { jobTitle: "رئيس قسم", phone: "0555" } as never);

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "emp-fin" },
        data: expect.objectContaining({ jobTitle: "رئيس قسم", phone: "0555" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.employee.update", entityId: "emp-fin" }));
  });

  it("deletes an employee and reports a missing one", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.deleteEmployee(PRINCIPAL, "emp-fin")).resolves.toEqual({ id: "emp-fin", deleted: true });
    expect(prisma.employee.delete).toHaveBeenCalledWith({ where: { id: "emp-fin" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "org.employee.delete", detail: { empNo: "E1" } }));
    await expect(service.deleteEmployee(PRINCIPAL, "emp-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrgService department defaults", () => {
  it("returns null until defaults are stored", async () => {
    const { service } = buildService();

    await expect(service.departmentDefaults(PRINCIPAL, "dept-fin")).resolves.toEqual({
      departmentId: "dept-fin",
      value: null,
      actorId: "user-mgr",
    });
  });

  it("returns the stored defaults", async () => {
    const { service } = buildService();
    await service.putDepartmentDefaults(PRINCIPAL, "dept-fin", { classification: "INTERNAL" });

    await expect(service.departmentDefaults(PRINCIPAL, "dept-fin")).resolves.toEqual({
      departmentId: "dept-fin",
      value: { classification: "INTERNAL" },
      actorId: "user-mgr",
    });
  });

  it("refuses defaults for another department and for a missing one", async () => {
    const { service } = buildService();

    await expect(service.departmentDefaults(PRINCIPAL, "dept-legal")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.putDepartmentDefaults(PRINCIPAL, "dept-legal", {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.departmentDefaults(PRINCIPAL, "dept-ghost")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("upserts the defaults under the department key and records the value", async () => {
    const { service, prisma, audit } = buildService(ADMIN);

    const result = await service.putDepartmentDefaults(PRINCIPAL, "dept-legal", { retentionYears: 7 });

    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: "dept-defaults.dept-legal" },
      update: { value: { retentionYears: 7 } },
      create: { key: "dept-defaults.dept-legal", value: { retentionYears: 7 } },
    });
    expect(result).toEqual({ departmentId: "dept-legal", value: { retentionYears: 7 } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org.department.defaults",
        entityType: "Department",
        entityId: "dept-legal",
        detail: { value: { retentionYears: 7 } },
      }),
    );
  });
});
