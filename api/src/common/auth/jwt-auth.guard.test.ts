import { describe, expect, it, vi } from "vitest";
import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

const principal = { sub: "sub-1", username: "sara", roles: [], identityRoles: [] };

function config(): ConfigService {
  return { get: (key: string, fallback?: string) => (key === "SESSION_COOKIE_NAME" ? "edas_session" : fallback) } as unknown as ConfigService;
}

function reflector(isPublic: boolean): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function build(isPublic = false) {
  const sessions = { resolve: vi.fn() };
  const guard = new JwtAuthGuard(reflector(isPublic), sessions as never, config());
  return { guard, sessions };
}

describe("JwtAuthGuard cookie sessions", () => {
  it("lets public routes through without touching the session store", async () => {
    const { guard, sessions } = build(true);

    await expect(guard.canActivate(context({ method: "GET", headers: {} }))).resolves.toBe(true);
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it("authenticates a GET request from the session cookie", async () => {
    const { guard, sessions } = build();
    sessions.resolve.mockResolvedValue(principal);
    const request: Record<string, unknown> = { method: "GET", headers: { cookie: "edas_session=session-1" } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(sessions.resolve).toHaveBeenCalledWith("session-1");
    expect(request.user).toEqual(principal);
  });

  it("rejects an expired or revoked session", async () => {
    const { guard, sessions } = build();
    sessions.resolve.mockResolvedValue(null);

    await expect(
      guard.canActivate(context({ method: "GET", headers: { cookie: "edas_session=gone" } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("requires a matching CSRF token on mutating cookie requests", async () => {
    const { guard, sessions } = build();
    sessions.resolve.mockResolvedValue(principal);

    await expect(
      guard.canActivate(context({ method: "POST", headers: { cookie: "edas_session=session-1" } })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      guard.canActivate(
        context({ method: "POST", headers: { cookie: "edas_session=session-1; edas_csrf=token-1", "x-csrf-token": "wrong" } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts a mutating request that echoes the CSRF cookie", async () => {
    const { guard, sessions } = build();
    sessions.resolve.mockResolvedValue(principal);

    await expect(
      guard.canActivate(
        context({ method: "DELETE", headers: { cookie: "edas_session=session-1; edas_csrf=token-1", "x-csrf-token": "token-1" } }),
      ),
    ).resolves.toBe(true);
  });
});