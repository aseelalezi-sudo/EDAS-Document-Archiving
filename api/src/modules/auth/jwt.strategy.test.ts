import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";

type StrategyLike = {
  clientId: string;
  prisma: unknown;
  validate: (payload: Record<string, unknown>) => Promise<{ roles: string[]; identityRoles: string[]; username: string }>;
};

function strategy(user: Record<string, unknown> | null): StrategyLike {
  const instance = Object.create(JwtStrategy.prototype) as StrategyLike;
  instance.clientId = "edas-web";
  instance.prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
  return instance;
}

describe("JwtStrategy.validate", () => {
  it("reads the effective roles from the EDAS account, not from the token", async () => {
    const instance = strategy({ status: "ACTIVE", role: "ARCHIVIST" });

    const principal = await instance.validate({
      sub: "sub-1",
      preferred_username: "sara",
      realm_access: { roles: ["system_admin", "employee"] },
    });

    expect(principal.roles).toEqual(["ARCHIVIST"]);
    expect(principal.identityRoles).toEqual(["SYSTEM_ADMIN", "EMPLOYEE"]);
    expect(principal.username).toBe("sara");
  });

  it("issues no effective roles for an account that is not provisioned yet", async () => {
    const instance = strategy(null);

    const principal = await instance.validate({ sub: "sub-2", preferred_username: "guest", realm_access: { roles: ["system_admin"] } });

    expect(principal.roles).toEqual([]);
    expect(principal.identityRoles).toEqual(["SYSTEM_ADMIN"]);
  });

  it("rejects a locked account even with a valid token", async () => {
    const instance = strategy({ status: "LOCKED", role: "EMPLOYEE" });

    await expect(
      instance.validate({ sub: "sub-3", preferred_username: "omar", realm_access: { roles: ["employee"] } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("JwtStrategy construction", () => {
  const config = {
    getOrThrow: (key: string) => ({ KEYCLOAK_ISSUER: "http://kc.test/realms/edas/", KEYCLOAK_AUDIENCE: "edas-api" })[key],
    get: (key: string, fallback?: string) => ({ KEYCLOAK_CLIENT_ID: "edas-web" })[key] ?? fallback,
  } as unknown as ConfigService;

  it("builds against the issuer, the audience and the default client id", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", role: "ARCHIVIST" }) } };
    const instance = new JwtStrategy(config, prisma as never);

    const principal = await instance.validate({
      sub: "sub-1",
      preferred_username: "sara",
      resource_access: { "edas-web": { roles: ["archivist", "auditor"] } },
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { keycloakSub: "sub-1" },
      select: { status: true, role: true },
    });
    expect(principal.roles).toEqual(["ARCHIVIST"]);
    expect(principal.identityRoles).toEqual(["ARCHIVIST", "AUDITOR"]);
    expect(principal.username).toBe("sara");
  });

  it("fails fast when the issuer or the audience is missing", () => {
    const prisma = { user: { findUnique: vi.fn() } };

    expect(() => new JwtStrategy({ getOrThrow: () => undefined, get: () => undefined } as never, prisma as never)).toThrow();
  });
});
