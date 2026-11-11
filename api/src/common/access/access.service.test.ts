import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { AccessService, documentDepartmentFilter } from "./access.service";
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
      findUnique: vi.fn(async (args: { where: { id: string } }) => ({
        departmentId: "dept-folder",
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
    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-1", parentId: null, aclInherit: true });

    await expect(service.assertDepartmentScope(manager, { departmentId: null, folderId: "folder-1" })).resolves.toBeUndefined();
    expect(prisma.folder.findUnique).toHaveBeenCalledWith({ where: { id: "folder-1" }, select: { departmentId: true } });

    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-2", parentId: null, aclInherit: true });
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

  it("keeps folder rules additive on top of the role capabilities", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["APPROVE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };
    const base = await service.permissionsFor(actor);

    const scoped = await service.permissionsFor(actor, "folder-1");

    expect(base.has("APPROVE")).toBe(false);
    expect(scoped.has("APPROVE")).toBe(true);
    expect([...base].every((action) => scoped.has(action))).toBe(true);
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
    expect(scoped.has("APPROVE")).toBe(true);
  });

  it("treats a rule without an effect as an allow", async () => {
    const { service, prisma } = buildService({ id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" });
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["DELETE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await expect(service.permissionsFor(actor, "folder-1")).resolves.toContainEqual("DELETE");
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

  it("lets an allow rule on an ancestor folder grant the action on a descendant", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      {
        "folder-child": "folder-parent",
      },
    );
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["APPROVE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await expect(service.permissionsFor(actor, "folder-child")).resolves.toContainEqual("APPROVE");
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
    expect(prisma.folder.findUnique).toHaveBeenCalledTimes(2);
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
    expect(prisma.folder.findUnique).toHaveBeenCalledTimes(1);
  });

  it("still applies the rules of the folder that disables inheritance", async () => {
    const { service, prisma } = buildService(
      { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" },
      { "folder-child": "folder-parent" },
      { "folder-child": false },
    );
    prisma.aclRule.findMany.mockResolvedValue([{ principalType: "USER", principalId: "user-1", actions: ["APPROVE"] }]);
    const actor: Actor = { id: "user-1", role: "EMPLOYEE", departmentId: "dept-1" };

    await expect(service.permissionsFor(actor, "folder-child")).resolves.toContainEqual("APPROVE");
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
    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-2", parentId: null, aclInherit: true });

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
});
