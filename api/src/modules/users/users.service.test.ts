import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { UsersService } from "./users.service";

function buildService() {
  const prisma = { user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() } };
  const access = { resolveActor: vi.fn() };
  const audit = { record: vi.fn() };
  const keycloak = { createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(), listSessions: vi.fn() };
  const browserSessions = { revokeForSub: vi.fn().mockResolvedValue(0) };
  const service = new UsersService(prisma as never, access as never, audit as never, keycloak as never, browserSessions as never);
  return { service, prisma, access, audit, keycloak, browserSessions };
}

const createInput = {
  name: "أحمد علي",
  username: "ahmad",
  email: "ahmad@edas.local",
  password: "Password123",
  role: UserRole.EMPLOYEE,
};

describe("UsersService", () => {
  it("rejects duplicate usernames or emails before touching Keycloak", async () => {
    const { service, prisma, access, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "actor-1", departmentId: null, role: UserRole.SYSTEM_ADMIN });
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });

    await expect(service.create({ sub: "actor-1" } as never, createInput)).rejects.toBeInstanceOf(ConflictException);
    expect(keycloak.createUser).not.toHaveBeenCalled();
  });

  it("creates the account in Keycloak then mirrors it in the database", async () => {
    const { service, prisma, access, audit, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "actor-1", departmentId: null, role: UserRole.SYSTEM_ADMIN });
    prisma.user.findFirst.mockResolvedValue(null);
    keycloak.createUser.mockResolvedValue("kc-sub-1");
    prisma.user.create.mockResolvedValue({ id: "user-1", username: "ahmad" });

    const result = await service.create({ sub: "actor-1" } as never, createInput);

    expect(result).toEqual({ id: "user-1", username: "ahmad" });
    expect(keycloak.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "ahmad", firstName: "أحمد", lastName: "علي", role: UserRole.EMPLOYEE }),
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ keycloakSub: "kc-sub-1" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.create" }));
  });

  it("blocks changing your own role", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "me", departmentId: null, role: UserRole.SYSTEM_ADMIN });
    prisma.user.findUnique.mockResolvedValue({ id: "me", role: UserRole.EMPLOYEE, keycloakSub: null });

    await expect(service.update({ sub: "me" } as never, "me", { role: UserRole.SYSTEM_ADMIN })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks deleting your own account", async () => {
    const { service, access, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "me", departmentId: null, role: UserRole.SYSTEM_ADMIN });
    await expect(service.remove({ sub: "me" } as never, "me")).rejects.toBeInstanceOf(BadRequestException);
    expect(keycloak.deleteUser).not.toHaveBeenCalled();
  });

  it("maps identity-provider sessions for a linked user", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", keycloakSub: "kc-sub-1" });
    keycloak.listSessions.mockResolvedValue([
      { id: "s1", ipAddress: "10.0.0.1", start: 1700000000000, lastAccess: 1700000600000, clients: { "edas-web": "EDAS Web" } },
    ]);

    const result = await service.sessions({ sub: "actor-1", roles: [UserRole.SYSTEM_ADMIN] } as never, "user-1");

    expect(result.count).toBe(1);
    expect(result.sessions[0]).toEqual({
      id: "s1",
      ipAddress: "10.0.0.1",
      started: new Date(1700000000000).toISOString(),
      lastAccess: new Date(1700000600000).toISOString(),
      clients: ["EDAS Web"],
    });
  });

  it("returns zero sessions for a user not linked to the identity provider", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", keycloakSub: null });

    const result = await service.sessions({ sub: "actor-1", roles: [UserRole.SYSTEM_ADMIN] } as never, "user-1");

    expect(result).toEqual({ count: 0, sessions: [] });
    expect(keycloak.listSessions).not.toHaveBeenCalled();
  });

  it("updates a self-service profile that is not linked to the identity provider", async () => {
    const { service, prisma, access, audit, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: UserRole.EMPLOYEE });
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", keycloakSub: null });
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await service.updateSelf({ sub: "ghost" } as never, { name: undefined, phone: "+962" } as never);

    expect(keycloak.updateUser).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.update-self", actorId: null, entityId: "user-1", detail: { phone: "+962" } }),
    );
  });

  it("splits a missing name into empty identity-provider parts", async () => {
    const { service, prisma, access, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: "dept-1", role: UserRole.EMPLOYEE });
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", keycloakSub: "kc-sub-1" });
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await service.updateSelf({ sub: "user-1" } as never, {} as never);

    expect(keycloak.updateUser).toHaveBeenCalledWith("kc-sub-1", {
      email: undefined,
      firstName: undefined,
      lastName: undefined,
    });
  });

  it("deletes a user that has no identity-provider account", async () => {
    const { service, prisma, access, audit, keycloak } = buildService();
    access.resolveActor.mockResolvedValue({ id: "actor-1", departmentId: null, role: UserRole.SYSTEM_ADMIN });
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", username: "ahmad", keycloakSub: null });
    prisma.user.delete.mockResolvedValue({});

    await expect(service.remove({ sub: "actor-1" } as never, "user-1")).resolves.toEqual({ id: "user-1", deleted: true });
    expect(keycloak.deleteUser).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.delete", actorId: "actor-1" }));
  });

  it("maps a session without clients or timestamps", async () => {
    const { service, prisma, keycloak } = buildService();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", keycloakSub: "kc-sub-1" });
    keycloak.listSessions.mockResolvedValue([{ id: "s2" }]);

    const result = await service.sessions({ sub: "actor-1", roles: [UserRole.SYSTEM_ADMIN] } as never, "user-1");

    expect(result.sessions[0]).toEqual({ id: "s2", ipAddress: null, started: null, lastAccess: null, clients: [] });
  });
});
