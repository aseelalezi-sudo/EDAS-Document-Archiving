import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { FoldersService } from "./folders.service";

function buildService(actor: Record<string, unknown>, global: boolean) {
  const prisma = {
    folder: {
      findMany: vi.fn().mockResolvedValue([{ id: "folder-1" }, { id: "folder-2" }]),
      findUnique: vi.fn().mockResolvedValue({ path: "/parent/" }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "folder-new", ...data })),
    },
    aclRule: { findMany: vi.fn().mockResolvedValue([{ id: "acl-1", folderId: "folder-1" }]) },
    $transaction: vi.fn(),
  };
  const access = {
    assert: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(global),
    listScope: vi.fn().mockResolvedValue({ actor, departmentId: null }),
  };
  const audit = { record: vi.fn().mockResolvedValue({ id: "event-1" }) };
  return { service: new FoldersService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("FoldersService.create department scope", () => {
  const employee = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" };

  it("keeps a department account in its own department even when another one is requested", async () => {
    const { service, prisma } = buildService(employee, false);

    await service.create({ sub: "user-1" } as never, { name: "مجلد", scope: "DEPARTMENT", departmentId: "dept-2" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-1" }) }),
    );
  });

  it("lets a global administrator place the folder in the requested department", async () => {
    const { service, prisma } = buildService({ id: "user-2", departmentId: null, role: "SYSTEM_ADMIN" }, true);

    await service.create({ sub: "user-2" } as never, { name: "مجلد", scope: "DEPARTMENT", departmentId: "dept-2" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-2" }) }),
    );
  });

  it("rejects a parent that does not exist", async () => {
    const { service, prisma } = buildService(employee, false);
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ sub: "user-1" } as never, { name: "مجلد", scope: "DEPARTMENT", parentId: "missing" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });
});

describe("FoldersService.listAcls", () => {
  it("loads the ACL map for the whole tree in a single query", async () => {
    const { service, prisma } = buildService({ id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" }, false);

    const rules = await service.listAcls({ sub: "user-1" } as never);

    expect(rules).toEqual([{ id: "acl-1", folderId: "folder-1" }]);
    expect(prisma.aclRule.findMany).toHaveBeenCalledOnce();
    expect(prisma.aclRule.findMany).toHaveBeenCalledWith({
      where: { folderId: { in: ["folder-1", "folder-2"] } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("skips the ACL query when the caller has no folders", async () => {
    const { service, prisma } = buildService({ id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" }, false);
    prisma.folder.findMany.mockResolvedValueOnce([]);

    await expect(service.listAcls({ sub: "user-1" } as never)).resolves.toEqual([]);
    expect(prisma.aclRule.findMany).not.toHaveBeenCalled();
  });
});
