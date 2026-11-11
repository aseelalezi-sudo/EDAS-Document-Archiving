import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, buildUrl, createApiClient, serverReason } from "./api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? "OK" : "Error",
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(body, status));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "edas_csrf=; max-age=0; path=/";
});

describe("buildUrl", () => {
  it("adds the api prefix and query params", () => {
    expect(buildUrl("/documents", { q: "a b", page: 2 }, "http://api.test")).toBe("http://api.test/api/v1/documents?q=a+b&page=2");
  });

  it("skips empty query values", () => {
    expect(buildUrl("/documents", { q: "", page: undefined }, "http://api.test")).toBe("http://api.test/api/v1/documents");
    expect(buildUrl("/documents", { page: 1 }, "http://api.test/")).toBe("http://api.test/api/v1/documents?page=1");
  });
});

describe("serverReason", () => {
  async function rejectWith(body: unknown, status: number): Promise<unknown> {
    vi.stubGlobal("fetch", mockFetch(body, status));
    try {
      await apiRequest("/documents/1", { baseUrl: "http://api.test" });
    } catch (error) {
      return error;
    }
    return null;
  }

  it("prefers the Arabic reason the server sends", async () => {
    const error = await rejectWith(
      { error: { code: "CONFLICT", message: "Document is checked out by another user", messageAr: "الوثيقة مُستخرجة من مستخدم آخر" } },
      409,
    );
    expect(serverReason(error)).toBe("الوثيقة مُستخرجة من مستخدم آخر");
  });

  it("falls back to the technical message for servers without an Arabic reason", async () => {
    const error = await rejectWith({ error: { code: "FORBIDDEN", message: "Missing capability: audit.verify" } }, 403);
    expect(serverReason(error)).toBe("Missing capability: audit.verify");
  });

  it("stays silent for failures the user should not read", () => {
    expect(serverReason(new ApiError(500, "INTERNAL_ERROR", "boom"))).toBeUndefined();
    expect(serverReason(new Error("offline"))).toBeUndefined();
  });
});

describe("apiRequest", () => {
  it("unwraps the data envelope using the session cookie", async () => {
    const fetchMock = mockFetch({ data: { id: "1" } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ id: string }>("/documents/1", { baseUrl: "http://api.test" })).resolves.toEqual({ id: "1" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws ApiError with code and correlation id", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: { code: "FORBIDDEN", message: "nope" }, correlationId: "c1" }, 403));
    let error: unknown;
    try {
      await apiRequest("/documents/1", { baseUrl: "http://api.test" });
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(403);
    expect(apiError.code).toBe("FORBIDDEN");
    expect(apiError.correlationId).toBe("c1");
  });

  it("echoes the CSRF cookie on mutating requests", async () => {
    document.cookie = "edas_csrf=csrf-1; path=/";
    const fetchMock = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/documents", { baseUrl: "http://api.test", method: "POST", body: { title: "x" } });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("csrf-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("omits the CSRF header on reads", async () => {
    document.cookie = "edas_csrf=csrf-1; path=/";
    const fetchMock = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/documents", { baseUrl: "http://api.test" });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("announces an expired session so the store can sign out", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: { code: "UNAUTHORIZED", message: "expired" }, correlationId: null }, 401));
    const listener = vi.fn();
    window.addEventListener("edas:unauthorized", listener);

    await expect(apiRequest("/auth/me")).rejects.toBeInstanceOf(ApiError);

    window.removeEventListener("edas:unauthorized", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("exposes typed helpers against the cookie session", async () => {
    const fetchMock = mockFetch({ data: { id: "d1", actions: ["VIEW"] } });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient();
    await client.documentPermissions("d1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/documents/d1/permissions");
  });
});
