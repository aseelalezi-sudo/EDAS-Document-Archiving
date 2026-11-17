import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { AccessService, departmentMatch, documentDepartmentFilter } from "./access.service";
import type { Actor } from "./access.service";

function buildService(
  user: Record<string, unknown> | null,
  parents: Record<string, string | null> = {},
  inherit: Record<string, boolean> = {},
) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    rolePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    aclRule: { findMany: vi.fn().mockResolvedValue([]) },
    folder: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(async (args: { where: { id: string } }) => ({
        id: args.where.id,
        scope: "DEPARTMENT",
        departmentId: null,
        sectionId: null,
        ownerId: null,
        parentId: parents[args.where.id] ?? null,
        aclInherit: inherit[args.where.id] ?? true,
      })),
    },
  };
  return { service: new AccessService(prisma as never), prisma };
}

describe("AccessService.resolveActor", () => {
  it("takes the role and department from the provisioned EDAS account", async () => {
    const { service } = buildService({ id: "user-1", role: "ARCHIVIST", departmentId: "dept-1" });

    const actor = await service.resolveActor({
      sub: "sub-1",
      username: "zoe",
      roles: ["SYSTEM_ADMIN"],
      identityRoles: ["SYSTEM_ADMIN"],
    } as never);

    expect(actor).toEqual({ id: "user-1", role: "ARCHIVIST", departmentId: "dept-1" });
  });

  it("rejects a token that has no EDAS account instead of inheriting the identity provider role", async () => {
    const { service } = buildService(null);

    await expect(
      service.resolveActor({ sub: "ghost", username: "ghost", roles: [], identityRoles: ["SYSTEM_ADMIN"] } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a department-scoped account that has no department", async () => {
    const { service } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: null });

    await expect(
      service.resolveActor({ sub: "sub-1", username: "zoe", roles: [], identityRoles: ["EMPLOYEE"] } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not require a department from a global role", async () => {
    const { service } = buildService({ id: "user-1", role: "AUDITOR", departmentId: null });

    await expect(service.resolveActor({ sub: "sub-1", username: "zoe", roles: [], identityRoles: ["AUDITOR"] } as never)).resolves.toEqual({
      id: "user-1",
      role: "AUDITOR",
      departmentId: null,
    });
  });
});

describe("departmentMatch", () => {
  it("matches nothing when the scope is explicitly null", () => {
    expect(departmentMatch(null)).toEqual({ in: [] });
  });

  it("leaves the filter open when the scope is omitted", () => {
    expect(departmentMatch(undefined)).toBeUndefined();
  });

  it("leaves unfiltered what a global actor may see", async () => {
    const { service } = buildService({ id: "user-1", role: "SYSTEM_ADMIN", departmentId: null });

    await expect(
      service.listScope({ sub: "sub-1", username: "zoe", roles: [], identityRoles: ["SYSTEM_ADMIN"] } as never),
    ).resolves.toMatchObject({
      departmentId: undefined,
    });
  });
});

describe("AccessService.assertDepartmentScope", () => {
  const employee: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };
  const manager: Actor = { id: "user-2", role: "DEPT_MANAGER", departmentId: "dept-1" };

  it("lets a global role reach any document", async () => {
    const { service, prisma } = buildService({ id: "user-3", role: "AUDITOR", departmentId: null });

    await expect(
      service.assertDepartmentScope({ id: "user-3", role: "AUDITOR", departmentId: null }, { departmentId: "dept-9" }),
    ).resolves.toBeUndefined();
    expect(prisma.folder.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the folder department when the document carries none", async () => {
    const { service, prisma } = buildService(null);
    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-1", parentId: null, aclInherit: true } as never);

    await expect(service.assertDepartmentScope(manager, { departmentId: null, folderId: "folder-1" })).resolves.toBeUndefined();
    expect(prisma.folder.findUnique).toHaveBeenCalledWith({
      where: { id: "folder-1" },
      select: { id: true, parentId: true, scope: true, departmentId: true, sectionId: true, ownerId: true, aclInherit: true },
    });

    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-2", parentId: null, aclInherit: true } as never);
    await expect(service.assertDepartmentScope(employee, { departmentId: null, folderId: "folder-1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("lets the owner bypass the department anchor", async () => {
    const { service } = buildService(null);

    await expect(service.assertDepartmentScope(employee, { departmentId: "dept-9", ownerId: "user-1" })).resolves.toBeUndefined();
    await expect(
      service.assertDepartmentScope(employee, { departmentId: null, folderId: null, ownerId: "user-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects a document that has no department anchor for a scoped account", async () => {
    const { service } = buildService(null);

    await expect(service.assertDepartmentScope(employee, { departmentId: null, folderId: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("documentDepartmentFilter", () => {
  it("shows a department its own documents plus the ones anchored only in a folder", () => {
    expect(documentDepartmentFilter("dept-1")).toEqual({
      OR: [{ departmentId: "dept-1" }, { departmentId: null, folder: { departmentId: "dept-1" } }],
    });
  });

  it("matches nothing for an account without a department", () => {
    expect(documentDepartmentFilter(null)).toEqual({ departmentId: { in: [] } });
  });
});

describe("AccessService.permissionsFor", () => {
  it("prefers the stored role policy over the shared default matrix", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.rolePolicy.findUnique.mockResolvedValue({ actions: ["VIEW", "DELETE"] });
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const permissions = await service.permissionsFor(actor);

    expect([...permissions].sort()).toEqual(["DELETE", "VIEW"]);
  });

  it("never lets a folder allow rule exceed the role ceiling", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["APPROVE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };
    const base = await service.permissionsFor(actor);

    const scoped = await service.permissionsFor(actor, "folder-1");

    expect(base.has("APPROVE")).toBe(false);
    expect(scoped.has("APPROVE")).toBe(false);
    expect([...scoped].every((action) => base.has(action))).toBe(true);
  });

  it("lets a deny rule revoke a role capability inside the folder", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([
      { principalType: "ROLE", principalId: "employee", actions: ["EDIT", "EXPORT"], effect: "DENY" },
      { principalType: "USER", principalId: "user-1", actions: ["APPROVE"], effect: "ALLOW" },
    ]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-1");

    expect(scoped.has("EDIT")).toBe(false);
    expect(scoped.has("EXPORT")).toBe(false);
    expect(scoped.has("VIEW")).toBe(true);
    expect(scoped.has("APPROVE")).toBe(false);
  });

  it("treats a rule without an effect as an allow but still caps it at the role", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["DELETE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-1");

    expect(scoped.has("DELETE")).toBe(false);
    expect(scoped.has("VIEW")).toBe(true);
  });

  it("reads the rules of the folder and every ancestor in one query", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      {
        "folder-child": "folder-parent",
        "folder-parent": "folder-root",
      },
    );
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await service.permissionsFor(actor, "folder-child");

    expect(prisma.aclRule.findMany).toHaveBeenCalledWith({
      where: { folderId: { in: ["folder-child", "folder-parent", "folder-root"] } },
    });
  });

  it("lets a deny rule on an ancestor folder revoke the action on a descendant", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      {
        "folder-child": "folder-parent",
      },
    );
    prisma.aclRule.findMany.mockResolvedValue([
      { principalType: "ROLE", principalId: "employee", actions: ["DELETE", "VIEW"], effect: "DENY" },
    ]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-child");

    expect(scoped.has("DELETE")).toBe(false);
    expect(scoped.has("VIEW")).toBe(false);
    expect(scoped.has("EDIT")).toBe(true);
  });

  it("does not let an allow rule on an ancestor folder grant beyond the role", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      {
        "folder-child": "folder-parent",
      },
    );
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["APPROVE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-child");

    expect(scoped.has("APPROVE")).toBe(false);
  });

  it("stops walking a folder chain that points back at itself", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      {
        "folder-a": "folder-b",
        "folder-b": "folder-a",
      },
    );
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await expect(service.permissionsFor(actor, "folder-a")).resolves.toBeInstanceOf(Set);
    expect(prisma.folder.findUnique).toHaveBeenCalledTimes(3);
  });

  it("stops inheriting rules at a folder that disables acl inheritance", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      { "folder-child": "folder-parent", "folder-parent": "folder-root" },
      { "folder-child": false },
    );
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await service.permissionsFor(actor, "folder-child");

    expect(prisma.aclRule.findMany).toHaveBeenCalledWith({ where: { folderId: { in: ["folder-child"] } } });
    expect(prisma.folder.findUnique).toHaveBeenCalledTimes(2);
  });

  it("still applies deny rules of the folder that disables inheritance", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      { "folder-child": "folder-parent" },
      { "folder-child": false },
    );
    prisma.aclRule.findMany.mockResolvedValue([
      { principalType: "USER", principalId: "user-1", actions: ["VIEW"], effect: "DENY" },
    ]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-child");

    expect(scoped.has("VIEW")).toBe(false);
  });

  it("keeps inheriting while the folder leaves acl inheritance on", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      { "folder-child": "folder-parent", "folder-parent": "folder-root" },
    );
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await service.permissionsFor(actor, "folder-child");

    expect(prisma.aclRule.findMany).toHaveBeenCalledWith({
      where: { folderId: { in: ["folder-child", "folder-parent", "folder-root"] } },
    });
  });
});

describe("AccessService.assert", () => {
  const principal = { sub: "sub-1", username: "zoe", roles: [], identityRoles: [] } as never;

  it("keeps a department account inside its own folders", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-2", parentId: null, aclInherit: true } as never);

    await expect(service.assert(principal, "CREATE", "folder-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows shared folders that belong to no department", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue({ departmentId: null, parentId: null, aclInherit: true } as never);

    await expect(service.assert(principal, "VIEW", "folder-1")).resolves.toMatchObject({ id: "user-1" });
  });

  it("lets a global role use a folder of any department", async () => {
    const { service } = buildService({ id: "user-1", role: "SYSTEM_ADMIN", departmentId: null });

    await expect(service.assert(principal, "VIEW", "folder-1")).resolves.toMatchObject({ id: "user-1" });
  });

  it("refuses an action the account does not hold and skips the folder check without a folder", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.rolePolicy.findUnique.mockResolvedValue({ actions: [] });

    await expect(service.assert(principal, "VIEW")).rejects.toThrow("Missing permission: VIEW");
    expect(prisma.folder.findUnique).not.toHaveBeenCalled();
  });
});

describe("AccessService scopes", () => {
  it("returns the department of a scoped account for the list filter", async () => {
    const { service } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });

    await expect(service.listScope({ sub: "sub-1", username: "zoe", roles: [], identityRoles: [] } as never)).resolves.toEqual({
      actor: { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      departmentId: "dept-1",
    });
  });

  it("falls back to an empty capability set for a role the shared matrix does not know", async () => {
    const { service } = buildService({ id: "user-1", role: "GHOST", departmentId: "dept-1" });

    await expect(service.permissionsFor({ id: "user-1", role: "GHOST", departmentId: "dept-1" } as never)).resolves.toEqual(new Set());
  });

  it("matches a department rule and ignores a rule that targets nobody in the request", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "DEPT_MANAGER", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([
      { principalType: "DEPARTMENT", principalId: "dept-1", actions: ["EDIT"], effect: "DENY" },
      { principalType: "USER", principalId: "user-9", actions: ["DELETE"], effect: "DENY" },
    ]);
    const actor: Actor = { id: "user-1", role: "DEPT_MANAGER", departmentId: "dept-1" };

    const scoped = await service.permissionsFor(actor, "folder-1");

    expect(scoped.has("EDIT")).toBe(false);
    expect(scoped.has("DELETE")).toBe(true);
  });

  it("stops walking when an ancestor row disappears", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    const target = {
      id: "folder-1",
      scope: "DEPARTMENT",
      departmentId: "dept-1",
      sectionId: null,
      ownerId: null,
      parentId: "missing",
      aclInherit: true,
    };
    prisma.folder.findUnique
      .mockResolvedValueOnce(target as never)
      .mockResolvedValueOnce(target as never)
      .mockResolvedValueOnce(null as never);

    await expect(service.permissionsFor({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" }, "folder-1")).resolves.toContainEqual(
      "VIEW",
    );
  });

  it("stops the chain when the folder row does not exist", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(null as never);

    const scoped = await service.permissionsFor({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" }, "folder-missing");

    expect(scoped).toEqual(new Set());
    expect(prisma.aclRule.findMany).not.toHaveBeenCalled();
  });
});

describe("AccessService folder scope", () => {
  const employee: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1", sectionId: "section-1" };

  function folder(overrides: Record<string, unknown> = {}) {
    return {
      id: "folder-1",
      parentId: null,
      scope: "DEPARTMENT",
      departmentId: "dept-1",
      sectionId: null,
      ownerId: null,
      aclInherit: true,
      ...overrides,
    };
  }

  it("lets a public folder be reached across departments", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "PUBLIC", departmentId: "dept-2" }) as never);

    const permissions = await service.permissionsFor(employee, "folder-1");

    expect(permissions.has("VIEW")).toBe(true);
  });

  it("keeps a private folder for its owner and denies everyone else", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "PRIVATE", ownerId: "user-1" }) as never);
    await expect(service.permissionsFor(employee, "folder-1")).resolves.toContainEqual("VIEW");

    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "PRIVATE", ownerId: "user-2" }) as never);
    await expect(service.permissionsFor(employee, "folder-1")).resolves.toEqual(new Set());
  });

  it("treats a legacy private folder without an owner as department scoped", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "PRIVATE", ownerId: null }) as never);

    await expect(service.permissionsFor(employee, "folder-1")).resolves.toContainEqual("VIEW");
  });

  it("denies a section folder when the actor has no section", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "SECTION", sectionId: "section-1" }) as never);

    await expect(service.permissionsFor({ ...employee, sectionId: null }, "folder-1")).resolves.toEqual(new Set());
  });

  it("matches section folders to the actor section and denies another section", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "SECTION", sectionId: "section-1" }) as never);
    await expect(service.permissionsFor(employee, "folder-1")).resolves.toContainEqual("VIEW");

    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "SECTION", sectionId: "section-2" }) as never);
    await expect(service.permissionsFor(employee, "folder-1")).resolves.toEqual(new Set());
  });

  it("denies a department folder that belongs to another department", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ departmentId: "dept-2" }) as never);

    await expect(service.permissionsFor(employee, "folder-1")).resolves.toEqual(new Set());
  });

  it("fails closed when the folder row does not exist", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(null as never);

    await expect(service.assert({ sub: "sub-1", username: "zoe", roles: [], identityRoles: [] } as never, "VIEW", "missing")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("filters the visible folder ids by scope and deny rules", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findMany.mockResolvedValue([
      folder({ id: "own", departmentId: "dept-1" }),
      folder({ id: "other", departmentId: "dept-2" }),
      folder({ id: "public", scope: "PUBLIC", departmentId: "dept-2" }),
      folder({ id: "private-own", scope: "PRIVATE", ownerId: "user-1" }),
      folder({ id: "private-other", scope: "PRIVATE", ownerId: "user-2" }),
      folder({ id: "section-own", scope: "SECTION", sectionId: "section-1" }),
      folder({ id: "section-other", scope: "SECTION", sectionId: "section-2" }),
    ] as never);
    prisma.aclRule.findMany.mockResolvedValue([
      { folderId: "public", principalType: "ROLE", principalId: "EMPLOYEE", actions: ["VIEW"], effect: "DENY" },
    ]);

    await expect(service.visibleFolderIds(employee)).resolves.toEqual([
      "own",
      "private-own",
      "section-own",
    ]);
  });

  it("returns no visible folders when the role cannot view at all", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findMany.mockResolvedValue([folder()] as never);
    prisma.rolePolicy.findUnique.mockResolvedValue({ actions: ["CREATE"] });

    await expect(service.visibleFolderIds(employee)).resolves.toEqual([]);
  });

  it("stops extending the chain at a folder that disables inheritance", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findMany.mockResolvedValue([
      folder({ id: "folder-1", aclInherit: false, parentId: "folder-parent" }),
      folder({ id: "folder-parent", aclInherit: true, parentId: null }),
    ] as never);

    await expect(service.visibleFolderIds(employee)).resolves.toEqual(["folder-1", "folder-parent"]);
  });

  it("falls back to the department when a section folder has no section anchor", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "SECTION", sectionId: null }) as never);

    await expect(service.permissionsFor(employee, "folder-1")).resolves.toContainEqual("VIEW");
  });

  it("returns no folders without querying rules when the tree is empty", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findMany.mockResolvedValue([] as never);

    await expect(service.visibleFolderIds(employee)).resolves.toEqual([]);
    expect(prisma.aclRule.findMany).not.toHaveBeenCalled();
  });

  it("returns null for a global actor without loading folders", async () => {
    const { service, prisma } = buildService({ id: "user-9", role: "SYSTEM_ADMIN", departmentId: null });

    await expect(service.visibleFolderIds({ id: "user-9", role: "SYSTEM_ADMIN", departmentId: null })).resolves.toBeNull();
    expect(prisma.folder.findMany).not.toHaveBeenCalled();
  });

  it("rejects a private folder owned by someone else even inside the same department", async () => {
    const { service, prisma } = buildService(null);
    prisma.folder.findUnique.mockResolvedValue(folder({ scope: "PRIVATE", ownerId: "user-2" }) as never);

    await expect(service.assertDepartmentScope(employee, { departmentId: "dept-1", folderId: "folder-1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("AccessService.assertDepartmentScope with folder scope", () => {
  const employee: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

  function buildScopeService(row: Record<string, unknown>) {
    const prisma = {
      user: { findUnique: vi.fn() },
      rolePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      aclRule: { findMany: vi.fn().mockResolvedValue([]) },
      folder: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(row) },
    };
    return new AccessService(prisma as never);
  }

  it("lets an authenticated user read a public folder across departments", async () => {
    const service = buildScopeService({ scope: "PUBLIC", departmentId: "dept-2", sectionId: null, ownerId: null });

    await expect(service.assertDepartmentScope(employee, { departmentId: "dept-2", folderId: "folder-1" })).resolves.toBeUndefined();
  });

  it("lets the owner of a private folder read its documents", async () => {
    const service = buildScopeService({ scope: "PRIVATE", departmentId: "dept-2", sectionId: null, ownerId: "user-1" });

    await expect(service.assertDepartmentScope(employee, { departmentId: "dept-2", folderId: "folder-1" })).resolves.toBeUndefined();
  });

  it("keeps a section folder inside its section and department", async () => {
    const service = buildScopeService({ scope: "SECTION", departmentId: "dept-1", sectionId: "section-2", ownerId: null });

    await expect(service.assertDepartmentScope(employee, { departmentId: "dept-1", folderId: "folder-1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("AccessService.documentVisibilityFilter", () => {
  const employee: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1", sectionId: "section-1" };

  it("returns no filter for a global actor", async () => {
    const { service } = buildService({ id: "user-9", role: "SYSTEM_ADMIN", departmentId: null });

    await expect(service.documentVisibilityFilter({ id: "user-9", role: "SYSTEM_ADMIN", departmentId: null })).resolves.toBeUndefined();
  });

  it("falls back to an empty folder list and blank department when a scoped actor has no department", async () => {
    const { service } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: null });
    vi.spyOn(service, "visibleFolderIds").mockResolvedValue(null);

    await expect(service.documentVisibilityFilter({ id: "user-1", role: "EMPLOYEE", departmentId: null })).resolves.toEqual({
      OR: [
        { folderId: { in: [] } },
        { folderId: null, departmentId: "" },
      ],
    });
  });

  it("restricts scoped actors to visible folders plus their unfiled department documents", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.folder.findMany.mockResolvedValue([
      {
        id: "folder-1",
        parentId: null,
        scope: "PUBLIC",
        departmentId: "dept-2",
        sectionId: null,
        ownerId: null,
        aclInherit: true,
      },
    ] as never);

    await expect(service.documentVisibilityFilter(employee)).resolves.toEqual({
      OR: [
        { folderId: { in: ["folder-1"] } },
        { folderId: null, departmentId: "dept-1" },
      ],
    });
  });
});
