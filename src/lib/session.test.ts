import type { ProfileDto } from "@edas/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  config: {
    apiBaseUrl: "http://api.test",
    oidc: { issuer: "http://kc.test/realms/edas", clientId: "edas-web", scopes: "openid profile email" },
    useApi: true,
  },
}));

import { beginLogin, clearSession, endSession, restoreSession } from "./session";

const profile: ProfileDto = {
  id: "u-1",
  username: "admin",
  name: "مدير النظام",
  nameEn: "System Admin",
  email: "admin@edas.test",
  role: "SYSTEM_ADMIN",
  status: "ACTIVE",
  departmentId: "dept-1",
  sectionId: null,
  jobTitle: null,
  jobTitleEn: null,
  phone: null,
  isNew: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = "edas_csrf=; max-age=0; path=/";
});

afterEach(() => vi.unstubAllGlobals());

describe("beginLogin", () => {
  it("sends the browser to the API login endpoint with a same-origin return path", () => {
    expect(beginLogin("/library")).toBe("http://api.test/api/v1/auth/login?returnTo=%2Flibrary");
    expect(beginLogin()).toBe("http://api.test/api/v1/auth/login?returnTo=%2Fdashboard");
  });

  it("never trusts a cross-origin return path", () => {
    expect(beginLogin("//evil.example")).toBe("http://api.test/api/v1/auth/login?returnTo=%2Fdashboard");
    expect(beginLogin("https://evil.example")).toBe("http://api.test/api/v1/auth/login?returnTo=%2Fdashboard");
  });
});

describe("restoreSession", () => {
  it("resolves the profile from the session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: profile }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toMatchObject({ id: "u-1", username: "admin" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
  });

  it("returns null when the session is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { code: "UNAUTHORIZED", message: "expired" }, correlationId: null }, 401)),
    );

    await expect(restoreSession()).resolves.toBeNull();
  });

  it("returns null when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(restoreSession()).resolves.toBeNull();
  });
});

describe("clearSession", () => {
  it("drops persisted user state but keeps device preferences", () => {
    localStorage.setItem("edas.v1.user", "{}");
    localStorage.setItem("edas.v1.docs", "[]");
    localStorage.setItem("edas.v1.theme", '"dark"');

    clearSession();

    expect(localStorage.getItem("edas.v1.user")).toBeNull();
    expect(localStorage.getItem("edas.v1.docs")).toBeNull();
    expect(localStorage.getItem("edas.v1.theme")).toBe('"dark"');
  });
});

describe("endSession", () => {
  it("clears local state and returns the provider logout url", async () => {
    localStorage.setItem("edas.v1.user", "{}");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ data: { logoutUrl: "http://kc.test/realms/edas/protocol/openid-connect/logout?client_id=edas-web" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(endSession()).resolves.toContain("protocol/openid-connect/logout");
    expect(localStorage.getItem("edas.v1.user")).toBeNull();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/auth/logout");
  });

  it("still clears local state when the API is unreachable", async () => {
    localStorage.setItem("edas.v1.user", "{}");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(endSession()).resolves.toBeNull();
    expect(localStorage.getItem("edas.v1.user")).toBeNull();
  });
});
