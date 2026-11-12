import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ROLE_CAPABILITIES } from "@edas/shared";
import { RolesService } from "./roles.service";

function buildService() {
  const prisma = {
    rolePolicy: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    user: { groupBy: vi.fn(), count: vi.fn() },
  };
  const access = { resolveActor: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new RolesService(prisma as never, access as never, audit as never);
  return { service, prisma, access, audit };
}

describe("RolesService", () => {
  it("returns the shared defaults for every built-in role", async () => {
    const { service, prisma } = buildService();
    prisma.rolePolicy.findMany.mockResolvedValue([]);
    prisma.user.groupBy.mockResolvedValue([{ role: "EMPLOYEE", _count: { _all: 2 } }]);

    const result = await service.list();

    expect(result.meta.total).toBe(6);
    expect(result.items.map((item) => item.role)).toEqual([
      "EMPLOYEE",
      "SUPERVISOR",
      "DEPT_MANAGER",
      "ARCHIVIST",
      "AUDITOR",
      "SYSTEM_ADMIN",
    ]);
    const employee = result.items.find((item) => item.role === "EMPLOYEE");
    expect(employee?.actions).toEqual([...ROLE_CAPABILITIES.EMPLOYEE]);
    expect(employee?.customized).toBe(false);
    expect(employee?.userCount).toBe(2);
  });

  it("persists an override and audits it", async () => {
    const { service, prisma, access, audit } = buildService();
    access.resolveActor.mockResolvedValue({ id: "actor-1", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.rolePolicy.upsert.mockResolvedValue({
      role: "AUDITOR",
      actions: ["VIEW", "APPROVE"],
      updatedAt: new Date("2026-10-22T10:00:00.000Z"),
    });
    prisma.user.count.mockResolvedValue(3);

    const result = await service.update({ sub: "actor-1" } as never, "AUDITOR", ["VIEW", "APPROVE"]);

    expect(result).toEqual({
      role: "AUDITOR",
      actions: ["VIEW", "APPROVE"],
      customized: true,
      userCount: 3,
      updatedAt: "2026-10-22T10:00:00.000Z",
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "role.update", entityId: "AUDITOR" }));
  });

  it("restores the shared defaults on reset", async () => {
    const { service, prisma, access, audit } = buildService();
    access.resolveActor.mockResolvedValue({ id: "actor-1", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.rolePolicy.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.count.mockResolvedValue(1);

    const result = await service.reset({ sub: "actor-1" } as never, "AUDITOR");

    expect(result.customized).toBe(false);
    expect(result.actions).toEqual([...ROLE_CAPABILITIES.AUDITOR]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "role.reset" }));
  });

  it("rejects unknown roles, fixed admin capabilities, and a missing VIEW permission", async () => {
    const { service } = buildService();
    await expect(service.update({ sub: "actor-1" } as never, "SUPERUSER", ["VIEW"])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update({ sub: "actor-1" } as never, "SYSTEM_ADMIN", ["VIEW"])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update({ sub: "actor-1" } as never, "AUDITOR", ["EXPORT"])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update({ sub: "actor-1" } as never, "AUDITOR", ["VIEW", "FLY"] as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.reset({ sub: "actor-1" } as never, "SUPERUSER")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marks a stored policy as customised and reports its update time", async () => {
    const { service, prisma } = buildService();
    prisma.rolePolicy.findMany.mockResolvedValue([
      { role: "EMPLOYEE", actions: ["VIEW"], updatedAt: new Date("2026-10-22T10:00:00.000Z") },
    ]);
    prisma.user.groupBy.mockResolvedValue([]);

    const result = await service.list();

    expect(result.items.find((item) => item.role === "EMPLOYEE")).toEqual({
      role: "EMPLOYEE",
      actions: ["VIEW"],
      customized: true,
      userCount: 0,
      updatedAt: "2026-10-22T10:00:00.000Z",
    });
  });

  it("leaves the audit actor empty for an account without an id", async () => {
    const { service, prisma, access, audit } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: "SYSTEM_ADMIN" });
    prisma.rolePolicy.upsert.mockResolvedValue({
      role: "AUDITOR",
      actions: ["VIEW"],
      updatedAt: new Date("2026-10-22T10:00:00.000Z"),
    });
    prisma.user.count.mockResolvedValue(0);

    await service.update({ sub: "ghost" } as never, "AUDITOR", ["VIEW"]);
    await service.reset({ sub: "ghost" } as never, "AUDITOR");

    expect(prisma.rolePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ updatedById: null }),
        update: expect.objectContaining({ updatedById: null }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "role.update", actorId: null }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "role.reset", actorId: null }));
  });
});
