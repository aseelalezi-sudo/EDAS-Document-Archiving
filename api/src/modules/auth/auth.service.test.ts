import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService, sanitizeReturnTo } from "./auth.service";
import { SessionCryptoService } from "./session-crypto.service";
import { LOGIN_COOKIE } from "../../common/auth/session.constants";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const config = {
  get: (key: string, fallback?: string) =>
    ({
      KEYCLOAK_ISSUER: "http://kc.test/realms/edas",
      KEYCLOAK_CLIENT_ID: "edas-web",
      KEYCLOAK_AUDIENCE: "edas-api",
      SESSION_SECRET: "s".repeat(32),
      APP_BASE_URL: "http://app.test",
    })[key] ?? fallback,
} as unknown as ConfigService;

function buildService() {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "user-1", departmentId: "dept-1" }),
    },
  };
  const crypto = new SessionCryptoService(config);
  const oidc = {
    randomString: vi.fn((size = 32) => "x".repeat(size)),
    createPkcePair: vi.fn().mockResolvedValue({ verifier: "verifier-1", challenge: "challenge-1" }),
    authorizeUrl: vi.fn().mockReturnValue("http://kc.test/auth?state=xxxx"),
    exchangeCode: vi.fn(),
    logoutUrl: vi.fn().mockReturnValue("http://kc.test/logout"),
  };
  const sessions = { create: vi.fn(), logout: vi.fn(), ttlSeconds: 28800 };
  const audit = { record: vi.fn().mockResolvedValue({ id: "audit-1" }) };
  const service = new AuthService(prisma as never, config, sessions as never, oidc as never, crypto, audit as never);
  return { service, prisma, crypto, oidc, sessions, audit };
}

describe("sanitizeReturnTo", () => {
  it("keeps same-origin paths and rejects open redirects", () => {
    expect(sanitizeReturnTo("/documents")).toBe("/documents");
    expect(sanitizeReturnTo("//evil.example")).toBe("/dashboard");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/dashboard");
    expect(sanitizeReturnTo(undefined)).toBe("/dashboard");
  });
});

describe("AuthService.beginLogin", () => {
  it("seals the PKCE state into a pending cookie and returns the authorize url", async () => {
    const { service, crypto, oidc } = buildService();

    const result = await service.beginLogin("/documents", "http://api.test");

    expect(result.url).toBe("http://kc.test/auth?state=xxxx");
    expect(oidc.authorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "http://api.test/api/v1/auth/callback", codeChallenge: "challenge-1" }),
    );
    expect(crypto.open(result.pendingCookie)).toMatchObject({
      verifier: "verifier-1",
      returnTo: "/documents",
      redirectUri: "http://api.test/api/v1/auth/callback",
    });
  });

  it("sanitizes a hostile return path before sealing it", async () => {
    const { service, crypto } = buildService();

    const result = await service.beginLogin("//evil.example", "http://api.test");

    expect(crypto.open<{ returnTo: string }>(result.pendingCookie)?.returnTo).toBe("/dashboard");
  });
});

describe("AuthService.completeLogin", () => {
  it("exchanges the code and redirects back into the SPA", async () => {
    const { service, crypto, oidc, sessions, prisma, audit } = buildService();
    const pending = await service.beginLogin("/documents", "http://api.test");
    const state = crypto.open<{ state: string }>(pending.pendingCookie)?.state;
    oidc.exchangeCode.mockResolvedValue({ access_token: jwt({ sub: "sub-1" }), expires_in: 900, token_type: "Bearer" });
    sessions.create.mockResolvedValue({ id: "session-1" });

    const result = await service.completeLogin({
      code: "code-1",
      state,
      cookieHeader: `${LOGIN_COOKIE}=${pending.pendingCookie}`,
      context: { userAgent: "browser", ip: "127.0.0.1" },
    });

    expect(oidc.exchangeCode).toHaveBeenCalledWith({
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "http://api.test/api/v1/auth/callback",
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ keycloakSub: "sub-1" }) }),
    );
    expect((prisma.user.create as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
      (sessions.create as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ access_token: expect.any(String) }), "sub-1", {
      userAgent: "browser",
      ip: "127.0.0.1",
    });
    expect(result).toMatchObject({ sessionId: "session-1", redirectTo: "http://app.test/#/documents" });
    expect(result.csrfToken).toHaveLength(24);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login", entityId: "user-1", actorId: "user-1", departmentId: "dept-1" }),
    );
  });

  it("rejects a mismatched state", async () => {
    const { service } = buildService();
    const pending = await service.beginLogin("/documents", "http://api.test");

    await expect(
      service.completeLogin({
        code: "code-1",
        state: "bogus",
        cookieHeader: `${LOGIN_COOKIE}=${pending.pendingCookie}`,
        context: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a callback without the pending cookie", async () => {
    const { service } = buildService();

    await expect(service.completeLogin({ code: "code-1", state: "any", cookieHeader: undefined, context: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("surfaces the provider error instead of calling the token endpoint", async () => {
    const { service, oidc } = buildService();

    await expect(
      service.completeLogin({ error: "access_denied", errorDescription: "Denied", cookieHeader: undefined, context: {} }),
    ).rejects.toThrow(/Denied/);
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });
});

describe("AuthService.endSession", () => {
  it("revokes the browser session and returns the provider logout url", async () => {
    const { service, sessions, oidc } = buildService();
    sessions.logout.mockResolvedValue({ idToken: "id-1", keycloakSub: null });

    const result = await service.endSession("edas_session=session-1");

    expect(sessions.logout).toHaveBeenCalledWith("session-1");
    expect(oidc.logoutUrl).toHaveBeenCalledWith({
      idTokenHint: "id-1",
      postLogoutRedirectUri: "http://app.test/#/login",
    });
    expect(result.logoutUrl).toBe("http://kc.test/logout");
  });

  it("audits the logout against the account behind the session", async () => {
    const { service, sessions, prisma, audit } = buildService();
    sessions.logout.mockResolvedValue({ idToken: "id-1", keycloakSub: "sub-1" });
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", departmentId: "dept-1" });

    await service.endSession("edas_session=session-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { keycloakSub: "sub-1" },
      select: { id: true, departmentId: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.logout", entityId: "user-1", actorId: "user-1", departmentId: "dept-1" }),
    );
  });

  it("still builds a logout url when no session cookie is present", async () => {
    const { service, sessions, audit } = buildService();

    const result = await service.endSession(undefined);

    expect(sessions.logout).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result.logoutUrl).toBe("http://kc.test/logout");
  });
});