import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SessionCleanupService } from "./session-cleanup.service";
import { SessionCryptoService } from "./session-crypto.service";
import { SessionService } from "./session.service";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const ACCESS = jwt({ sub: "sub-1", preferred_username: "sara", realm_access: { roles: ["employee"] } });

function buildService() {
  const prisma = {
    userSession: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "session-1", ...data })),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", role: "EMPLOYEE" }) },
  };
  const config = { get: (key: string, fallback?: string) => (key === "SESSION_SECRET" ? "s".repeat(32) : fallback) } as unknown as ConfigService;
  const crypto = new SessionCryptoService(config);
  const oidc = { refresh: vi.fn() };
  const service = new SessionService(prisma as never, crypto, oidc as never, config);
  return { service, prisma, oidc, crypto };
}

function sealed(crypto: SessionCryptoService, value: string): string {
  return crypto.seal({ value });
}

function open(crypto: SessionCryptoService, value: string): string | null {
  return crypto.open<{ value: string }>(value)?.value ?? null;
}

describe("SessionService.create", () => {
  it("stores the tokens sealed and derives the expiry from the provider", async () => {
    const { service, prisma, crypto } = buildService();

    const result = await service.create(
      { access_token: ACCESS, refresh_token: "rt-1", id_token: "id-1", expires_in: 900, refresh_expires_in: 1800, token_type: "Bearer" },
      "sub-1",
      { userAgent: "browser", ip: "127.0.0.1" },
    );

    expect(result.id).toBe("session-1");
    const data = prisma.userSession.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.keycloakSub).toBe("sub-1");
    expect(open(crypto, String(data.accessToken))).toBe(ACCESS);
    expect(open(crypto, String(data.refreshToken))).toBe("rt-1");
    expect(open(crypto, String(data.idToken))).toBe("id-1");
  });
});

describe("SessionService.resolve", () => {
  it("builds the principal from a live access token", async () => {
    const { service, prisma, crypto } = buildService();
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      keycloakSub: "sub-1",
      accessToken: sealed(crypto, ACCESS),
      refreshToken: sealed(crypto, "rt-1"),
      accessExpiresAt: new Date(Date.now() + 600_000),
      refreshExpiresAt: new Date(Date.now() + 1_800_000),
    });

    await expect(service.resolve("session-1")).resolves.toMatchObject({ sub: "sub-1", username: "sara" });
    expect(prisma.userSession.update).not.toHaveBeenCalled();
  });

  it("refreshes an expiring access token and rewrites the stored material", async () => {
    const { service, prisma, oidc, crypto } = buildService();
    const refreshed = jwt({ sub: "sub-1", preferred_username: "sara", realm_access: { roles: ["employee"] } });
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      keycloakSub: "sub-1",
      accessToken: sealed(crypto, ACCESS),
      refreshToken: sealed(crypto, "rt-1"),
      idToken: sealed(crypto, "id-1"),
      accessExpiresAt: new Date(Date.now() - 1000),
      refreshExpiresAt: new Date(Date.now() + 1_800_000),
    });
    oidc.refresh.mockResolvedValue({ access_token: refreshed, refresh_token: "rt-2", expires_in: 900, token_type: "Bearer" });

    await expect(service.resolve("session-1")).resolves.toMatchObject({ sub: "sub-1" });
    expect(oidc.refresh).toHaveBeenCalledWith("rt-1");
    const update = prisma.userSession.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(open(crypto, String(update.data.accessToken))).toBe(refreshed);
    expect(open(crypto, String(update.data.refreshToken))).toBe("rt-2");
  });

  it("revokes the session when the provider refuses the refresh", async () => {
    const { service, prisma, oidc, crypto } = buildService();
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      keycloakSub: "sub-1",
      accessToken: sealed(crypto, ACCESS),
      refreshToken: sealed(crypto, "rt-1"),
      accessExpiresAt: new Date(Date.now() - 1000),
      refreshExpiresAt: new Date(Date.now() + 1_800_000),
    });
    oidc.refresh.mockRejectedValue(new Error("refresh rejected"));

    await expect(service.resolve("session-1")).resolves.toBeNull();
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("revokes a session whose refresh window has closed", async () => {
    const { service, prisma, crypto } = buildService();
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      keycloakSub: "sub-1",
      accessToken: sealed(crypto, ACCESS),
      accessExpiresAt: new Date(Date.now() + 600_000),
      refreshExpiresAt: new Date(Date.now() - 1),
    });

    await expect(service.resolve("session-1")).resolves.toBeNull();
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("treats an unknown session id as unauthenticated", async () => {
    const { service, prisma } = buildService();
    prisma.userSession.findUnique.mockResolvedValue(null);

    await expect(service.resolve("missing")).resolves.toBeNull();
  });
});

describe("SessionService revocation", () => {
  it("returns the id token as a logout hint before dropping the row", async () => {
    const { service, prisma, crypto } = buildService();
    prisma.userSession.findUnique.mockResolvedValue({ id: "session-1", keycloakSub: "sub-1", idToken: sealed(crypto, "id-1") });

    await expect(service.logout("session-1")).resolves.toEqual({ idToken: "id-1", keycloakSub: "sub-1" });
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("removes every session of a user revoked by an administrator", async () => {
    const { service, prisma } = buildService();
    prisma.userSession.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.revokeForSub("sub-1")).resolves.toBe(2);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { keycloakSub: "sub-1" } });
  });
});

describe("SessionService.purgeExpired", () => {
  it("deletes rows past their refresh window and rows that only had an access token", async () => {
    const { service, prisma } = buildService();
    prisma.userSession.deleteMany.mockResolvedValue({ count: 4 });
    const now = new Date("2026-11-11T00:00:00.000Z");

    await expect(service.purgeExpired(now)).resolves.toBe(4);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ refreshExpiresAt: { lt: now } }, { refreshExpiresAt: null, accessExpiresAt: { lt: now } }],
      },
    });
  });
});

describe("SessionCleanupService", () => {
  it("runs the purge on each tick and survives a failure", async () => {
    const purgeExpired = vi.fn().mockResolvedValueOnce(2).mockRejectedValueOnce(new Error("db down"));
    const cleanup = new SessionCleanupService({ purgeExpired } as never);

    await cleanup.tick();
    await cleanup.tick();

    expect(purgeExpired).toHaveBeenCalledTimes(2);
  });
});