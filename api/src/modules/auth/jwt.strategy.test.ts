import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
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
