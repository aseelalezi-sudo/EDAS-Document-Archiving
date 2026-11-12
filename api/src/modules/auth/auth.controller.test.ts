import { BadRequestException, Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { arabicReason } from "../../common/errors/error-reasons-ar";
import { CSRF_COOKIE, LOGIN_COOKIE, SESSION_COOKIE } from "../../common/auth/session.constants";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };

function build(values: Record<string, string> = {}) {
  const auth = {
    oidcConfig: vi.fn().mockReturnValue({ issuer: "https://kc.example/realms/edas", clientId: "edas-spa" }),
    beginLogin: vi.fn().mockResolvedValue({ url: "https://kc.example/auth", pendingCookie: "pending-1" }),
    pendingLoginTtlSeconds: 600,
    completeLogin: vi.fn().mockResolvedValue({ sessionId: "sess-1", csrfToken: "csrf-1", redirectTo: "/#/documents" }),
    sessionTtlSeconds: 3600,
    endSession: vi.fn().mockResolvedValue({ logoutUrl: "https://kc.example/logout" }),
    profile: vi.fn().mockResolvedValue({ id: "user-1", name: "سارة" }),
  };
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  };
  return { controller: new AuthController(auth as unknown as AuthService, config as never), auth };
}

function fakeResponse() {
  const res = { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
}

function fakeRequest(options: { host?: string; noHost?: boolean; protocol?: string; cookie?: string; agent?: string; ip?: string } = {}) {
  return {
    protocol: options.protocol ?? "https",
    ip: options.ip,
    headers: { cookie: options.cookie },
    get: (name: string) =>
      name === "host" ? (options.noHost ? undefined : (options.host ?? "api.example")) : name === "user-agent" ? options.agent : undefined,
  } as never;
}

describe("AuthController login flow", () => {
  it("exposes the public OIDC configuration", () => {
    const { controller, auth } = build();

    expect(controller.configInfo()).toEqual({ issuer: "https://kc.example/realms/edas", clientId: "edas-spa" });
    expect(auth.oidcConfig).toHaveBeenCalledWith();
  });

  it("starts the login with the trimmed public origin and sets the pending cookie", async () => {
    const { controller, auth } = build({ API_PUBLIC_URL: "https://edas.example/" });
    const response = fakeResponse();

    await controller.login("/#/documents", fakeRequest(), response as never);

    expect(auth.beginLogin).toHaveBeenCalledWith("/#/documents", "https://edas.example");
    expect(response.cookie).toHaveBeenCalledWith(LOGIN_COOKIE, "pending-1", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 600_000,
    });
    expect(response.redirect).toHaveBeenCalledWith("https://kc.example/auth");
  });

  it("derives the login origin from the request when no public URL is configured", async () => {
    const { controller, auth } = build();

    await controller.login(undefined, fakeRequest({ protocol: "http", host: "api.internal:4000" }), fakeResponse() as never);

    expect(auth.beginLogin).toHaveBeenCalledWith(undefined, "http://api.internal:4000");
  });

  it("defaults the host when the request carries none", async () => {
    const { controller, auth } = build();

    await controller.login(undefined, fakeRequest({ protocol: "http", noHost: true }), fakeResponse() as never);

    expect(auth.beginLogin).toHaveBeenCalledWith(undefined, "http://localhost");
  });
});

describe("AuthController callback", () => {
  it("stores the session and CSRF cookies and clears the pending one", async () => {
    const { controller, auth } = build();
    const response = fakeResponse();

    await controller.callback(
      "code-1",
      "state-1",
      undefined,
      undefined,
      fakeRequest({ cookie: "edas_login=pending-1", agent: "Mozilla/5.0", ip: "10.0.0.1" }),
      response as never,
    );

    expect(auth.completeLogin).toHaveBeenCalledWith({
      code: "code-1",
      state: "state-1",
      error: undefined,
      errorDescription: undefined,
      cookieHeader: "edas_login=pending-1",
      context: { userAgent: "Mozilla/5.0", ip: "10.0.0.1" },
    });
    expect(response.cookie).toHaveBeenNthCalledWith(1, SESSION_COOKIE, "sess-1", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 3_600_000,
    });
    expect(response.cookie).toHaveBeenNthCalledWith(2, CSRF_COOKIE, "csrf-1", {
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 3_600_000,
    });
    expect(response.clearCookie).toHaveBeenCalledWith(LOGIN_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
    expect(response.redirect).toHaveBeenCalledWith("/#/documents");
  });

  it("turns a provider error into an Arabic redirect and clears the pending cookie", async () => {
    const { controller, auth } = build({ APP_BASE_URL: "https://edas.example/" });
    const failure = new BadRequestException("Approval not found");
    auth.completeLogin.mockRejectedValue(failure);
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const response = fakeResponse();

    await controller.callback(undefined, undefined, "access_denied", "user cancelled", fakeRequest(), response as never);

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Approval not found"));
    expect(response.clearCookie).toHaveBeenCalledWith(LOGIN_COOKIE, expect.anything());
    expect(response.redirect).toHaveBeenCalledWith(
      `https://edas.example/#/auth/callback?error=${encodeURIComponent(arabicReason("Approval not found", 400))}`,
    );
  });

  it("reports an unexpected failure with a 500 reason", async () => {
    const { controller, auth } = build();
    auth.completeLogin.mockRejectedValue(new Error("OIDC discovery exploded"));
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const response = fakeResponse();

    await controller.callback("code", "state", undefined, undefined, fakeRequest(), response as never);

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("OIDC discovery exploded"));
    expect(response.redirect).toHaveBeenCalledWith(
      `http://localhost:5173/#/auth/callback?error=${encodeURIComponent(arabicReason("OIDC discovery exploded", 500))}`,
    );
  });
});

describe("AuthController session handling", () => {
  it("ends the session and clears both cookies", async () => {
    const { controller, auth } = build();
    const response = fakeResponse();

    await expect(controller.logout(fakeRequest({ cookie: "edas_session=sess-1" }), response as never)).resolves.toEqual({
      logoutUrl: "https://kc.example/logout",
    });
    expect(auth.endSession).toHaveBeenCalledWith("edas_session=sess-1");
    expect(response.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.anything());
    expect(response.clearCookie).toHaveBeenCalledWith(CSRF_COOKIE, expect.anything());
  });

  it("returns the profile of the current principal", async () => {
    const { controller, auth } = build();

    await expect(controller.me(PRINCIPAL as never)).resolves.toEqual({ id: "user-1", name: "سارة" });
    expect(auth.profile).toHaveBeenCalledWith(PRINCIPAL);
  });

  it("marks cookies secure in production and honours an explicit override", async () => {
    const production = build({ NODE_ENV: "production", SESSION_COOKIE_SAMESITE: "strict" });
    const productionResponse = fakeResponse();
    await production.controller.login(undefined, fakeRequest(), productionResponse as never);
    expect(productionResponse.cookie).toHaveBeenCalledWith(
      LOGIN_COOKIE,
      "pending-1",
      expect.objectContaining({ secure: true, sameSite: "strict" }),
    );

    const overridden = build({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "false" });
    const overrideResponse = fakeResponse();
    await overridden.controller.login(undefined, fakeRequest(), overrideResponse as never);
    expect(overrideResponse.cookie).toHaveBeenCalledWith(LOGIN_COOKIE, "pending-1", expect.objectContaining({ secure: false }));
  });

  it("falls back to lax cookies when the configuration returns nothing", async () => {
    const auth = {
      beginLogin: vi.fn().mockResolvedValue({ url: "https://kc.example/auth", pendingCookie: "pending-1" }),
      pendingLoginTtlSeconds: 600,
    };
    const controller = new AuthController(auth as never, { get: () => undefined } as never);
    const response = fakeResponse();

    await controller.login(undefined, fakeRequest(), response as never);

    expect(response.cookie).toHaveBeenCalledWith(LOGIN_COOKIE, "pending-1", expect.objectContaining({ secure: false, sameSite: "lax" }));
  });
});

describe("AuthController callback failures", () => {
  it("reports a failure that is not an error object", async () => {
    const { controller, auth } = build();
    auth.completeLogin.mockRejectedValue("provider offline");
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const response = fakeResponse();

    await controller.callback("code", "state", undefined, undefined, fakeRequest(), response as never);

    expect(errorLog).toHaveBeenCalledWith("Login callback failed: Login failed");
    expect(response.redirect).toHaveBeenCalledWith(
      `http://localhost:5173/#/auth/callback?error=${encodeURIComponent(arabicReason("Login failed", 500))}`,
    );
  });
});
