import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";

const ADMIN = { sub: "actor-1", roles: [UserRole.SYSTEM_ADMIN] } as never;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    username: "ahmad",
    name: "أحمد علي",
    nameEn: "Ahmad Ali",
    email: "ahmad@edas.local",
    role: UserRole.EMPLOYEE,
    status: UserStatus.ACTIVE,
    departmentId: "dept-1",
    sectionId: null,
    jobTitle: "موظف",
    jobTitleEn: "Employee",
    phone: "0555",
    failedAttempts: 0,
    activeSessions: 2,
    lastLoginAt: null,
    keycloakSub: "kc-sub-1",
    ...overrides,
  };
}

function buildService() {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([userRow()]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(userRow()),
      findUnique: vi.fn().mockResolvedValue(userRow()),
      create: vi.fn().mockResolvedValue(userRow()),
      update: vi.fn().mockResolvedValue(userRow()),
      delete: vi.fn().mockResolvedValue(userRow()),
    },
    setting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(async ({ create }: { create: { key: string; value: unknown } }) => ({ id: "setting-1", ...create })),
    },
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );

  const access = { resolveActor: vi.fn().mockResolvedValue({ id: "actor-1", departmentId: "dept-admin", role: UserRole.SYSTEM_ADMIN }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const keycloak = {
    createUser: vi.fn().mockResolvedValue("kc-sub-new"),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    setRole: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    logoutUser: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
  };
  const browserSessions = { revokeForSub: vi.fn().mockResolvedValue(2) };

  return {
    service: new UsersService(prisma as never, access as never, audit as never, keycloak as never, browserSessions as never),
    prisma,
    access,
    audit,
    keycloak,
    browserSessions,
  };
}

function p2003() {
  return new Prisma.PrismaClientKnownRequestError("foreign key", { code: "P2003", clientVersion: "6.1.0" });
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.1.0" });
}

describe("UsersService listing and lookup", () => {
  it("pages the whole directory for a global reader with the search OR block", async () => {
    const { service, prisma } = buildService();

    const result = await service.list(ADMIN, { page: 2, pageSize: 10, q: "أحمد", departmentId: "dept-2" } as never);

    const args = prisma.user.findMany.mock.calls[0][0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({
      departmentId: "dept-2",
      OR: [
        { name: { contains: "أحمد", mode: "insensitive" } },
        { username: { contains: "أحمد", mode: "insensitive" } },
        { email: { contains: "أحمد", mode: "insensitive" } },
      ],
    });
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 1 });
  });

  it("scopes a non-global reader to their own department", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ departmentId: "dept-5" });

    await service.list({ sub: "kc-actor", roles: [UserRole.DEPT_MANAGER] } as never, {} as never);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { keycloakSub: "kc-actor" }, select: { departmentId: true } });
    const args = prisma.user.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ departmentId: "dept-5" });
  });

  it("refuses a scoped reader whose account has no department", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ departmentId: null });

    await expect(service.list({ sub: "kc-actor", roles: [UserRole.EMPLOYEE] } as never, {} as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("treats an auditor as a global reader", async () => {
    const { service, prisma } = buildService();

    await service.list({ sub: "auditor", roles: [UserRole.AUDITOR] } as never, {} as never);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalled();
  });

  it("returns a user inside the scope and reports a missing one", async () => {
    const { service, prisma } = buildService();

    await expect(service.findOne(ADMIN, "user-1")).resolves.toMatchObject({ id: "user-1" });
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.findOne(ADMIN, "user-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService creation rollback", () => {
  it("removes the identity-provider account when the database mirror fails", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(p2002());

    await expect(
      service.create(ADMIN, {
        name: "أحمد علي",
        username: "ahmad",
        email: "ahmad@edas.local",
        password: "Password123",
        role: UserRole.EMPLOYEE,
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(keycloak.deleteUser).toHaveBeenCalledWith("kc-sub-new");
  });

  it("maps a missing reference to a validation error and keeps other failures", async () => {
    const failing = buildService();
    failing.prisma.user.findFirst.mockResolvedValue(null);
    failing.prisma.user.create.mockRejectedValueOnce(p2003());
    await expect(
      failing.service.create(ADMIN, {
        name: "أحمد",
        username: "ahmad",
        email: "ahmad@edas.local",
        password: "Password123",
        role: UserRole.EMPLOYEE,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    const broken = buildService();
    broken.prisma.user.findFirst.mockResolvedValue(null);
    broken.prisma.user.create.mockRejectedValueOnce(new Error("connection reset"));
    await expect(
      broken.service.create(ADMIN, {
        name: "أحمد",
        username: "ahmad",
        email: "ahmad@edas.local",
        password: "Password123",
        role: UserRole.EMPLOYEE,
      } as never),
    ).rejects.toThrow("connection reset");
  });
});

describe("UsersService update", () => {
  it("reports a missing user", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.update(ADMIN, "user-ghost", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("mirrors the changes in Keycloak, including the new role and required actions", async () => {
    const { service, prisma, keycloak, audit } = buildService();

    await service.update(ADMIN, "user-1", {
      name: "أحمد محمد علي",
      username: "ahmad",
      email: "new@edas.local",
      role: UserRole.DEPT_MANAGER,
      status: UserStatus.ACTIVE,
      requirePasswordChange: true,
      requireTwoFactor: true,
    } as never);

    expect(keycloak.updateUser).toHaveBeenCalledWith("kc-sub-1", {
      username: "ahmad",
      email: "new@edas.local",
      firstName: "أحمد",
      lastName: "محمد علي",
      enabled: true,
      requiredActions: ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
    });
    expect(keycloak.setRole).toHaveBeenCalledWith("kc-sub-1", UserRole.DEPT_MANAGER);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ nameEn: "أحمد محمد علي", failedAttempts: 0 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.update", entityId: "user-1" }));
  });

  it("skips Keycloak for an unlinked user and keeps the role when it did not change", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findUnique.mockResolvedValue(userRow({ keycloakSub: null, role: UserRole.EMPLOYEE }));

    await service.update(ADMIN, "user-1", { role: UserRole.EMPLOYEE } as never);

    expect(keycloak.updateUser).not.toHaveBeenCalled();
    expect(keycloak.setRole).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("maps a duplicate username to a conflict during the update", async () => {
    const { service, prisma } = buildService();
    prisma.user.update.mockRejectedValue(p2002());

    await expect(service.update(ADMIN, "user-1", { username: "taken" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates the caller's own profile through the identity provider", async () => {
    const { service, prisma, keycloak, audit } = buildService();
    prisma.user.findUnique.mockResolvedValue(userRow({ id: "actor-1" }));

    await service.updateSelf(
      { sub: "actor-1" } as never,
      {
        name: "سارة محمد",
        nameEn: "Sara",
        email: "sara@edas.local",
        jobTitle: "رئيسة",
        jobTitleEn: "Head",
        phone: "0555",
      } as never,
    );

    expect(keycloak.updateUser).toHaveBeenCalledWith("kc-sub-1", {
      email: "sara@edas.local",
      firstName: "سارة",
      lastName: "محمد",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.update-self",
        detail: { name: "سارة محمد", nameEn: "Sara", email: "sara@edas.local", jobTitle: "رئيسة", jobTitleEn: "Head", phone: "0555" },
      }),
    );
  });

  it("rejects an empty self name without inventing one", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findUnique.mockResolvedValue(userRow({ id: "actor-1" }));

    await service.updateSelf({ sub: "actor-1" } as never, { name: "   " } as never);

    expect(keycloak.updateUser).toHaveBeenCalledWith("kc-sub-1", {
      email: undefined,
      firstName: undefined,
      lastName: undefined,
    });
  });

  it("reports a missing self profile and a missing preference scope", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateSelf({ sub: "actor-1" } as never, {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService preferences", () => {
  it("strips the internal prefix from stored preference keys", async () => {
    const { service, prisma } = buildService();
    prisma.setting.findMany.mockResolvedValue([
      { key: "user-pref.actor-1.table", value: { page: 2 } },
      { key: "user-pref.actor-1.lang", value: "ar" },
    ]);

    const result = await service.preferences(ADMIN);

    expect(prisma.setting.findMany).toHaveBeenCalledWith({ where: { key: { startsWith: "user-pref.actor-1." } } });
    expect(result.items).toEqual({ table: { page: 2 }, lang: "ar" });
  });

  it("sanitises the key, upserts the value and records it", async () => {
    const { service, prisma, audit } = buildService();

    const result = await service.putPreference(ADMIN, "table/size!*", { value: { size: 50 } } as never);

    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: "user-pref.actor-1.tablesize" },
      update: { value: { size: 50 } },
      create: { key: "user-pref.actor-1.tablesize", value: { size: 50 } },
    });
    expect(result).toEqual({ key: "tablesize", value: { size: 50 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.preference", detail: { key: "tablesize" } }));
  });

  it("rejects a key that is empty after sanitising", async () => {
    const { service, prisma } = buildService();

    await expect(service.putPreference(ADMIN, "!@#$", { value: 1 } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
});

describe("UsersService deletion and credentials", () => {
  it("deletes the database row and the identity-provider account", async () => {
    const { service, prisma, keycloak, audit } = buildService();

    await expect(service.remove(ADMIN, "user-1")).resolves.toEqual({ id: "user-1", deleted: true });

    expect(keycloak.deleteUser).toHaveBeenCalledWith("kc-sub-1");
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.delete", detail: { username: "ahmad" } }));
  });

  it("reports a missing user and a row that still owns records", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.remove(ADMIN, "user-ghost")).rejects.toBeInstanceOf(NotFoundException);

    const blocked = buildService();
    blocked.prisma.user.delete.mockRejectedValue(p2003());
    await expect(blocked.service.remove(ADMIN, "user-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps unexpected deletion failures intact", async () => {
    const { service, prisma } = buildService();
    prisma.user.delete.mockRejectedValue(new Error("connection reset"));

    await expect(service.remove(ADMIN, "user-1")).rejects.toThrow("connection reset");
  });

  it("resets the password only for a linked account", async () => {
    const { service, prisma, keycloak, audit } = buildService();

    await expect(service.resetPassword(ADMIN, "user-1", { password: "NewPass123" } as never)).resolves.toEqual({
      id: "user-1",
      updated: true,
    });
    expect(keycloak.resetPassword).toHaveBeenCalledWith("kc-sub-1", "NewPass123");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.reset-password" }));

    prisma.user.findUnique.mockResolvedValue(userRow({ keycloakSub: null }));
    await expect(service.resetPassword(ADMIN, "user-1", { password: "NewPass123" } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports a missing user on password reset", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.resetPassword(ADMIN, "user-ghost", { password: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("revokes identity-provider and browser sessions and zeroes the counter", async () => {
    const { service, prisma, keycloak, browserSessions, audit } = buildService();

    await expect(service.revokeSessions(ADMIN, "user-1")).resolves.toEqual({ id: "user-1", sessions: 0 });

    expect(keycloak.logoutUser).toHaveBeenCalledWith("kc-sub-1");
    expect(browserSessions.revokeForSub).toHaveBeenCalledWith("kc-sub-1");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { activeSessions: 0 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.revoke-sessions" }));

    keycloak.logoutUser.mockClear();
    browserSessions.revokeForSub.mockClear();
    prisma.user.findUnique.mockResolvedValue(userRow({ keycloakSub: null }));
    await service.revokeSessions(ADMIN, "user-1");
    expect(keycloak.logoutUser).not.toHaveBeenCalled();
    expect(browserSessions.revokeForSub).not.toHaveBeenCalled();
  });

  it("reports a missing user when revoking sessions", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.revokeSessions(ADMIN, "user-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("UsersService session mapping", () => {
  it("falls back to an empty list when the provider refuses the session list", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", keycloakSub: "kc-sub-1" });
    keycloak.listSessions.mockRejectedValue(new Error("not found"));

    await expect(service.sessions(ADMIN, "user-1")).resolves.toEqual({ count: 0, sessions: [] });
  });

  it("maps missing optional session fields to null", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", keycloakSub: "kc-sub-1" });
    keycloak.listSessions.mockResolvedValue([{ id: "s1", ipAddress: null, start: "2026-01-01", lastAccess: null, clients: {} }]);

    const result = await service.sessions(ADMIN, "user-1");

    expect(result.sessions[0]).toEqual({ id: "s1", ipAddress: null, started: null, lastAccess: null, clients: [] });
  });

  it("reports a user outside the scope before calling the provider", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.sessions(ADMIN, "user-ghost")).rejects.toBeInstanceOf(NotFoundException);
    expect(keycloak.listSessions).not.toHaveBeenCalled();
  });
});
