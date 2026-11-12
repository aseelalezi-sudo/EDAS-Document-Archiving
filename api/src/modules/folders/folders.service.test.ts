import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FoldersService } from "./folders.service";

const PRINCIPAL = { sub: "user-1" } as never;

function buildService(
  actor: Record<string, unknown> = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" },
  global = false,
  scopeDepartment: string | null | undefined = null,
) {
  const prisma = {
    folder: {
      findMany: vi.fn().mockResolvedValue([{ id: "folder-1" }, { id: "folder-2" }]),
      findUnique: vi.fn().mockResolvedValue({ id: "folder-1", path: "/parent/", departmentId: "dept-1" }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "folder-new", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "folder-1", departmentId: "dept-1", ...data })),
      delete: vi.fn().mockResolvedValue({ id: "folder-1" }),
    },
    aclRule: {
      findMany: vi.fn().mockResolvedValue([{ id: "acl-1", folderId: "folder-1" }]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  const access = {
    assert: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(global),
    listScope: vi.fn().mockResolvedValue({ actor, departmentId: scopeDepartment }),
  };
  const audit = { record: vi.fn().mockResolvedValue({ id: "event-1" }) };
  return { service: new FoldersService(prisma as never, access as never, audit as never), prisma, access, audit };
}

describe("FoldersService.tree", () => {
  it("scopes the tree to the caller department", async () => {
    const { service, prisma, access } = buildService(undefined, false, "dept-1");

    const result = await service.tree(PRINCIPAL);

    expect(access.listScope).toHaveBeenCalledWith(PRINCIPAL);
    expect(prisma.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-1" }, orderBy: { name: "asc" } }),
    );
    expect(result).toMatchObject({ departmentId: "dept-1", actorId: "user-1" });
    expect(result.items).toHaveLength(2);
  });

  it("lists every folder for a global account", async () => {
    const { service, prisma, access } = buildService({ id: "user-2", departmentId: null, role: "SYSTEM_ADMIN" }, true);
    access.listScope.mockResolvedValue({
      actor: { id: "user-2", departmentId: null, role: "SYSTEM_ADMIN" },
      departmentId: undefined,
    });

    const result = await service.tree(PRINCIPAL);

    expect(prisma.folder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result).toMatchObject({ departmentId: null, actorId: "user-2" });
  });

  it("returns no rows for an account without a department", async () => {
    const { service, prisma } = buildService({ id: "user-3", departmentId: null, role: "EMPLOYEE" }, false, null);

    await service.tree(PRINCIPAL);

    expect(prisma.folder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { departmentId: { in: [] } } }));
  });
});

describe("FoldersService.get", () => {
  it("returns the folder with its rule count and ACL", async () => {
    const { service, prisma, access } = buildService();

    await service.get(PRINCIPAL, "folder-1");

    expect(access.assert).toHaveBeenCalledWith(PRINCIPAL, "VIEW", "folder-1");
    expect(prisma.folder.findUnique).toHaveBeenCalledWith({
      where: { id: "folder-1" },
      include: { acl: true, _count: { select: { documents: true, children: true } } },
    });
  });

  it("reports a missing folder", async () => {
    const { service, prisma } = buildService();
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.get(PRINCIPAL, "folder-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.create", () => {
  const employee = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" };

  it("creates a root folder with the default type and audits it", async () => {
    const { service, prisma, audit } = buildService(employee, false);

    const created = await service.create(PRINCIPAL, { name: "عقود", scope: "DEPARTMENT" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "عقود",
          type: "DEPARTMENT",
          departmentId: "dept-1",
          path: expect.stringMatching(/^\/[0-9a-f-]{36}\/$/),
        }),
      }),
    );
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.parentId).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "folder.create",
        entityType: "Folder",
        entityId: created.id,
        actorId: "user-1",
        departmentId: "dept-1",
        detail: { name: "عقود", parentId: undefined },
      }),
    );
  });

  it("inherits the parent path and keeps the requested type", async () => {
    const { service, prisma } = buildService(employee, false);

    await service.create(PRINCIPAL, { name: "عقود 2026", type: "PROJECT", scope: "PROJECT", parentId: "parent-1" } as never);

    expect(prisma.folder.findUnique).toHaveBeenCalledWith({ where: { id: "parent-1" }, select: { path: true } });
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ path: expect.stringMatching(/^\/parent\/[0-9a-f-]{36}\/$/), type: "PROJECT" }),
      }),
    );
  });

  it("keeps a department account in its own department even when another one is requested", async () => {
    const { service, prisma } = buildService(employee, false);

    await service.create(PRINCIPAL, { name: "مجلد", scope: "DEPARTMENT", departmentId: "dept-2" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-1" }) }),
    );
  });

  it("lets a global administrator place the folder in the requested department", async () => {
    const { service, prisma } = buildService({ id: "user-2", departmentId: null, role: "SYSTEM_ADMIN" }, true);

    await service.create(PRINCIPAL, { name: "مجلد", scope: "DEPARTMENT", departmentId: "dept-2" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-2" }) }),
    );
  });

  it("creates a folder without a department for a scoped account that has none", async () => {
    const { service, prisma } = buildService({ id: "user-1", departmentId: null, role: "EMPLOYEE" }, false);

    await service.create(PRINCIPAL, { name: "مجلد", scope: "DEPARTMENT" } as never);

    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: undefined }) }),
    );
  });

  it("rejects a parent that does not exist", async () => {
    const { service, prisma } = buildService(employee, false);
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.create(PRINCIPAL, { name: "مجلد", scope: "DEPARTMENT", parentId: "missing" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });
});

describe("FoldersService.update", () => {
  it("writes the editable fields and audits the patch", async () => {
    const { service, prisma, access, audit } = buildService();

    await service.update(PRINCIPAL, "folder-1", { name: "عقود 2026", scope: "PROJECT", aclInherit: false } as never);

    expect(access.assert).toHaveBeenCalledWith(PRINCIPAL, "EDIT", "folder-1");
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: "folder-1" },
      data: { name: "عقود 2026", nameEn: undefined, scope: "PROJECT", aclInherit: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "folder.update",
        entityType: "Folder",
        entityId: "folder-1",
        departmentId: "dept-1",
        detail: { name: "عقود 2026", scope: "PROJECT", aclInherit: false },
      }),
    );
  });

  it("refuses to update a folder that vanished", async () => {
    const { service, prisma } = buildService();
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.update(PRINCIPAL, "folder-1", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });
});

describe("FoldersService.remove", () => {
  it("deletes the rules and the folder, then audits", async () => {
    const { service, prisma, audit } = buildService();
    prisma.folder.findUnique.mockResolvedValue({ id: "folder-1", _count: { children: 0, documents: 0 } });

    await expect(service.remove(PRINCIPAL, "folder-1")).resolves.toEqual({ id: "folder-1", deleted: true });

    expect(prisma.aclRule.deleteMany).toHaveBeenCalledWith({ where: { folderId: "folder-1" } });
    expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: "folder-1" } });
    expect(audit.record).toHaveBeenCalledWith({
      action: "folder.delete",
      entityType: "Folder",
      entityId: "folder-1",
      actorId: "user-1",
    });
  });

  it("refuses a folder that still holds children or documents", async () => {
    const children = buildService();
    children.prisma.folder.findUnique.mockResolvedValue({ id: "folder-1", _count: { children: 1, documents: 0 } });
    await expect(children.service.remove(PRINCIPAL, "folder-1")).rejects.toBeInstanceOf(BadRequestException);

    const documents = buildService();
    documents.prisma.folder.findUnique.mockResolvedValue({ id: "folder-1", _count: { children: 0, documents: 3 } });
    await expect(documents.service.remove(PRINCIPAL, "folder-1")).rejects.toBeInstanceOf(BadRequestException);

    expect(documents.prisma.folder.delete).not.toHaveBeenCalled();
  });

  it("reports a folder that vanished", async () => {
    const { service, prisma } = buildService();
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.remove(PRINCIPAL, "folder-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.getAcl", () => {
  it("returns the rules in creation order", async () => {
    const { service, prisma, access } = buildService();

    await expect(service.getAcl(PRINCIPAL, "folder-1")).resolves.toEqual([{ id: "acl-1", folderId: "folder-1" }]);

    expect(access.assert).toHaveBeenCalledWith(PRINCIPAL, "VIEW", "folder-1");
    expect(prisma.aclRule.findMany).toHaveBeenCalledWith({ where: { folderId: "folder-1" }, orderBy: { createdAt: "asc" } });
  });

  it("reports a missing folder", async () => {
    const { service, prisma } = buildService();
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.getAcl(PRINCIPAL, "folder-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.putAcl", () => {
  it("replaces the rules, defaults the effect to ALLOW and audits the count", async () => {
    const { service, prisma, access, audit } = buildService();

    await expect(
      service.putAcl(PRINCIPAL, "folder-1", {
        rules: [
          { principalType: "USER", principalId: "user-2", actions: ["VIEW"] },
          { principalType: "DEPARTMENT", principalId: "dept-2", actions: ["VIEW", "DOWNLOAD"], effect: "DENY" },
        ],
      } as never),
    ).resolves.toEqual([{ id: "acl-1", folderId: "folder-1" }]);

    expect(access.assert).toHaveBeenCalledWith(PRINCIPAL, "EDIT", "folder-1");
    expect(prisma.aclRule.deleteMany).toHaveBeenCalledWith({ where: { folderId: "folder-1" } });
    expect(prisma.aclRule.createMany).toHaveBeenCalledWith({
      data: [
        { folderId: "folder-1", principalType: "USER", principalId: "user-2", actions: ["VIEW"], effect: "ALLOW" },
        { folderId: "folder-1", principalType: "DEPARTMENT", principalId: "dept-2", actions: ["VIEW", "DOWNLOAD"], effect: "DENY" },
      ],
      skipDuplicates: true,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "folder.acl.update",
        entityId: "folder-1",
        actorId: "user-1",
        detail: { rules: 2, effect: ["USER:user-2:ALLOW", "DEPARTMENT:dept-2:DENY"] },
      }),
    );
  });

  it("reports a missing folder without touching the rules", async () => {
    const { service, prisma } = buildService();
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.putAcl(PRINCIPAL, "folder-1", { rules: [] } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aclRule.deleteMany).not.toHaveBeenCalled();
  });
});

describe("FoldersService.listAcls", () => {
  it("loads the ACL map for the whole tree in a single query", async () => {
    const { service, prisma } = buildService({ id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" }, false);

    const rules = await service.listAcls(PRINCIPAL);

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

    await expect(service.listAcls(PRINCIPAL)).resolves.toEqual([]);
    expect(prisma.aclRule.findMany).not.toHaveBeenCalled();
  });
});
