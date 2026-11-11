import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { AccessService, type Actor } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type {
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateProjectDto,
  CreateSectionDto,
  UpdateDepartmentDto,
  UpdateEmployeeDto,
  UpdateProjectDto,
  UpdateSectionDto,
} from "./dto/org.dto";

const DEPARTMENT_SELECT = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  manager: true,
  parentId: true,
  _count: { select: { users: true, employees: true, documents: true } },
} satisfies Prisma.DepartmentSelect;

const SECTION_SELECT = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  manager: true,
  departmentId: true,
  _count: { select: { users: true, employees: true, documents: true } },
} satisfies Prisma.SectionSelect;

const PROJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  status: true,
  startDate: true,
  endDate: true,
  departmentId: true,
  _count: { select: { documents: true, folders: true } },
} satisfies Prisma.ProjectSelect;

const EMPLOYEE_SELECT = {
  id: true,
  empNo: true,
  name: true,
  nameEn: true,
  jobTitle: true,
  jobTitleEn: true,
  email: true,
  phone: true,
  status: true,
  departmentId: true,
  sectionId: true,
  userId: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async tree() {
    const departments = await this.prisma.department.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        ...DEPARTMENT_SELECT,
        sections: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: SECTION_SELECT,
        },
      },
    });
    return { items: departments };
  }

  async projects() {
    const items = await this.prisma.project.findMany({ orderBy: { name: "asc" }, select: PROJECT_SELECT });
    return { items, meta: { total: items.length } };
  }

  async employees(principal: Principal, page = 1, pageSize = 50) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        orderBy: { name: "asc" },
        select: EMPLOYEE_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count(),
    ]);
    const showContact = principal.roles.some(
      (role) => role === UserRole.SYSTEM_ADMIN || role === UserRole.DEPT_MANAGER || role === UserRole.ARCHIVIST,
    );
    return {
      items: showContact
        ? items
        : items.map(({ email: _email, phone: _phone, ...employee }) => ({ ...employee, email: null, phone: null })),
      meta: { page, pageSize, total },
    };
  }

  async createDepartment(principal: Principal, dto: CreateDepartmentDto) {
    const actor = await this.access.resolveActor(principal);
    if (!(await this.owns(actor, dto.parentId))) {
      throw new ForbiddenException(
        dto.parentId
          ? "You can only create departments inside your own department tree"
          : "Only a system administrator can create a top-level department",
      );
    }
    if (dto.parentId) await this.assertDepartment(dto.parentId);
    const department = await this.prisma.department
      .create({
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          manager: dto.manager,
          order: dto.order ?? 0,
          parentId: dto.parentId ?? null,
        },
        select: DEPARTMENT_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.department.create", "Department", department.id, { code: department.code });
    return department;
  }

  async updateDepartment(principal: Principal, id: string, dto: UpdateDepartmentDto) {
    const actor = await this.access.resolveActor(principal);
    await this.assertDepartment(id);
    await this.assertManages(actor, id, "This department");
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) throw new BadRequestException("Department cannot be its own parent");
      if (dto.parentId) {
        await this.assertDepartment(dto.parentId);
        await this.assertManages(actor, dto.parentId, "The parent department");
        await this.assertNoCycle(id, dto.parentId);
      } else {
        await this.assertDetaches(actor);
      }
    }
    const department = await this.prisma.department
      .update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          manager: dto.manager,
          order: dto.order,
          parentId: dto.parentId,
        },
        select: DEPARTMENT_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.department.update", "Department", id, { ...dto });
    return department;
  }

  async deleteDepartment(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, sections: true, users: true, employees: true, projects: true, documents: true } },
      },
    });
    if (!department) throw new NotFoundException("Department not found");
    await this.assertManages(actor, id, "This department");
    const counts = department._count;
    if (Object.values(counts).some((count) => count > 0)) throw new ConflictException("Department is in use");

    await this.prisma.department.delete({ where: { id } });
    await this.record(principal, "org.department.delete", "Department", id, { code: department.code });
    return { id, deleted: true };
  }

  async createSection(principal: Principal, dto: CreateSectionDto) {
    const actor = await this.access.resolveActor(principal);
    await this.assertDepartment(dto.departmentId);
    await this.assertManages(actor, dto.departmentId, "This department");
    const section = await this.prisma.section
      .create({
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          manager: dto.manager,
          order: dto.order ?? 0,
          departmentId: dto.departmentId,
        },
        select: SECTION_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.section.create", "Section", section.id, { code: section.code });
    return section;
  }

  async updateSection(principal: Principal, id: string, dto: UpdateSectionDto) {
    const actor = await this.access.resolveActor(principal);
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException("Section not found");
    await this.assertManages(actor, section.departmentId, "This section");
    if (dto.departmentId) {
      await this.assertDepartment(dto.departmentId);
      await this.assertManages(actor, dto.departmentId, "The target department");
    }

    const updated = await this.prisma.section
      .update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          manager: dto.manager,
          order: dto.order,
          departmentId: dto.departmentId,
        },
        select: SECTION_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.section.update", "Section", id, { ...dto });
    return updated;
  }

  async deleteSection(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { _count: { select: { users: true, employees: true, documents: true } } },
    });
    if (!section) throw new NotFoundException("Section not found");
    await this.assertManages(actor, section.departmentId, "This section");
    if (Object.values(section._count).some((count) => count > 0)) throw new ConflictException("Section is in use");

    await this.prisma.section.delete({ where: { id } });
    await this.record(principal, "org.section.delete", "Section", id, { code: section.code });
    return { id, deleted: true };
  }

  async createProject(principal: Principal, dto: CreateProjectDto) {
    const actor = await this.access.resolveActor(principal);
    if (dto.departmentId) await this.assertDepartment(dto.departmentId);
    if (!(await this.owns(actor, dto.departmentId))) {
      throw new ForbiddenException(
        dto.departmentId
          ? "This department is outside the departments you manage"
          : "Only a system administrator can create a project without a department",
      );
    }
    const project = await this.prisma.project
      .create({
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          status: dto.status ?? "active",
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          departmentId: dto.departmentId ?? null,
        },
        select: PROJECT_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.project.create", "Project", project.id, { code: project.code });
    return project;
  }

  async updateProject(principal: Principal, id: string, dto: UpdateProjectDto) {
    const actor = await this.access.resolveActor(principal);
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException("Project not found");
    await this.assertManages(actor, project.departmentId, "This project");
    if (dto.departmentId !== undefined) {
      if (dto.departmentId) await this.assertDepartment(dto.departmentId);
      await this.assertManages(actor, dto.departmentId, "The target department");
    }

    const updated = await this.prisma.project
      .update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          nameEn: dto.nameEn,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          departmentId: dto.departmentId,
        },
        select: PROJECT_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.project.update", "Project", id, { ...dto });
    return updated;
  }

  async deleteProject(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { documents: true, folders: true } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    await this.assertManages(actor, project.departmentId, "This project");
    if (Object.values(project._count).some((count) => count > 0)) throw new ConflictException("Project is in use");

    await this.prisma.project.delete({ where: { id } });
    await this.record(principal, "org.project.delete", "Project", id, { code: project.code });
    return { id, deleted: true };
  }

  async createEmployee(principal: Principal, dto: CreateEmployeeDto) {
    const actor = await this.access.resolveActor(principal);
    await this.assertEmployeeRefs(dto.departmentId, dto.sectionId, dto.userId);
    const departmentId = await this.employeeDepartment(dto.departmentId, dto.sectionId);
    if (!(await this.owns(actor, departmentId))) {
      throw new ForbiddenException(
        departmentId ? "This employee is outside the departments you manage" : "You can only create employees inside your own department",
      );
    }
    const employee = await this.prisma.employee
      .create({
        data: {
          empNo: dto.empNo,
          name: dto.name,
          nameEn: dto.nameEn,
          jobTitle: dto.jobTitle,
          jobTitleEn: dto.jobTitleEn,
          email: dto.email,
          phone: dto.phone,
          status: dto.status ?? "ACTIVE",
          departmentId: dto.departmentId ?? null,
          sectionId: dto.sectionId ?? null,
          userId: dto.userId ?? null,
        },
        select: EMPLOYEE_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.employee.create", "Employee", employee.id, { empNo: employee.empNo });
    return employee;
  }

  async updateEmployee(principal: Principal, id: string, dto: UpdateEmployeeDto) {
    const actor = await this.access.resolveActor(principal);
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException("Employee not found");
    await this.assertManages(actor, await this.employeeDepartment(employee.departmentId, employee.sectionId), "This employee");
    await this.assertEmployeeRefs(dto.departmentId, dto.sectionId, dto.userId);
    if (dto.departmentId || dto.sectionId) {
      const target = dto.departmentId ?? (await this.employeeDepartment(null, dto.sectionId)) ?? employee.departmentId;
      await this.assertManages(actor, target, "The target department");
    }

    const updated = await this.prisma.employee
      .update({
        where: { id },
        data: {
          empNo: dto.empNo,
          name: dto.name,
          nameEn: dto.nameEn,
          jobTitle: dto.jobTitle,
          jobTitleEn: dto.jobTitleEn,
          email: dto.email,
          phone: dto.phone,
          status: dto.status,
          departmentId: dto.departmentId,
          sectionId: dto.sectionId,
          userId: dto.userId,
        },
        select: EMPLOYEE_SELECT,
      })
      .catch(rethrowUnique);
    await this.record(principal, "org.employee.update", "Employee", id, { ...dto });
    return updated;
  }

  async departmentDefaults(principal: Principal, id: string) {
    const actor = await this.assertDefaultsAccess(principal, id);
    const setting = await this.prisma.setting.findUnique({ where: { key: defaultsKey(id) } });
    return { departmentId: id, value: setting?.value ?? null, actorId: actor.id };
  }

  async putDepartmentDefaults(principal: Principal, id: string, value: unknown) {
    await this.assertDefaultsAccess(principal, id);
    const setting = await this.prisma.setting.upsert({
      where: { key: defaultsKey(id) },
      update: { value: value as Prisma.InputJsonValue },
      create: { key: defaultsKey(id), value: value as Prisma.InputJsonValue },
    });
    await this.record(principal, "org.department.defaults", "Department", id, { value: value as Prisma.InputJsonValue });
    return { departmentId: id, value: setting.value };
  }

  async deleteEmployee(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException("Employee not found");
    await this.assertManages(actor, await this.employeeDepartment(employee.departmentId, employee.sectionId), "This employee");

    await this.prisma.employee.delete({ where: { id } });
    await this.record(principal, "org.employee.delete", "Employee", id, { empNo: employee.empNo });
    return { id, deleted: true };
  }

  private async assertDepartment(id: string) {
    const department = await this.prisma.department.findUnique({ where: { id }, select: { id: true } });
    if (!department) throw new BadRequestException("Department not found");
  }

  /** Departments a manager may administer: their own department and everything below it. Global roles get `null` (no limit). */
  private async managedDepartmentIds(actor: Actor): Promise<Set<string> | null> {
    if (this.access.isGlobal(actor)) return null;
    const departments = await this.prisma.department.findMany({ select: { id: true, parentId: true } });
    const childrenOf = new Map<string, string[]>();
    for (const department of departments) {
      if (!department.parentId) continue;
      childrenOf.set(department.parentId, [...(childrenOf.get(department.parentId) ?? []), department.id]);
    }
    const managed = new Set<string>();
    const queue: string[] = actor.departmentId ? [actor.departmentId] : [];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (managed.has(current)) continue;
      managed.add(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }
    return managed;
  }

  private async owns(actor: Actor, departmentId: string | null | undefined): Promise<boolean> {
    const managed = await this.managedDepartmentIds(actor);
    if (!managed) return true;
    return Boolean(departmentId) && managed.has(departmentId as string);
  }

  private async assertManages(actor: Actor, departmentId: string | null | undefined, label: string) {
    if (!(await this.owns(actor, departmentId))) {
      throw new ForbiddenException(`${label} is outside the departments you manage`);
    }
  }

  private async assertDetaches(actor: Actor) {
    const managed = await this.managedDepartmentIds(actor);
    if (managed) throw new ForbiddenException("Only a system administrator can detach a department from its parent");
  }

  private async employeeDepartment(departmentId: string | null | undefined, sectionId: string | null | undefined): Promise<string | null> {
    if (departmentId) return departmentId;
    if (!sectionId) return null;
    const section = await this.prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } });
    return section?.departmentId ?? null;
  }

  private async assertNoCycle(id: string, parentId: string) {
    let current: string | null = parentId;
    while (current) {
      if (current === id) throw new BadRequestException("Department cannot be moved under its own descendant");
      const parent: { parentId: string | null } | null = await this.prisma.department.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = parent?.parentId ?? null;
    }
  }

  private async assertDefaultsAccess(principal: Principal, id: string) {
    await this.assertDepartment(id);
    const actor = await this.access.resolveActor(principal);
    if (this.access.isGlobal(actor)) return actor;
    if (actor.departmentId !== id) throw new ForbiddenException("You can only manage defaults for your own department");
    return actor;
  }

  private async assertEmployeeRefs(departmentId?: string, sectionId?: string, userId?: string) {
    if (departmentId) await this.assertDepartment(departmentId);
    if (sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId }, select: { id: true } });
      if (!section) throw new BadRequestException("Section not found");
    }
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new BadRequestException("User not found");
    }
  }

  private async record(principal: Principal, action: string, entityType: string, entityId: string, detail: Prisma.InputJsonObject) {
    const actor = await this.access.resolveActor(principal);
    await this.audit.record({ action, entityType, entityId, actorId: actor.id || null, departmentId: actor.departmentId, detail });
  }
}

function defaultsKey(departmentId: string): string {
  return `dept-defaults.${departmentId}`;
}
function rethrowUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException("A record with this code already exists");
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    throw new BadRequestException("Referenced record does not exist");
  }
  throw error;
}
