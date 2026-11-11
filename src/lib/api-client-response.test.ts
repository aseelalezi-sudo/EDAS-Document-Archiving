import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./api-client";

function response(body: string, status = 200, statusText = "OK"): Response {
  return {
    ok: status < 400,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "edas_csrf=; max-age=0; path=/";
});

describe("apiRequest response handling", () => {
  it("returns undefined for a successful response without a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("", 204, "No Content")));

    await expect(apiRequest("/documents/1", { baseUrl: "http://api.test" })).resolves.toBeUndefined();
  });

  it("keeps a non-JSON success payload as text before unwrapping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("plain value")));

    await expect(apiRequest("/documents/1", { baseUrl: "http://api.test" })).resolves.toBeUndefined();
  });

  it("prefixes a path that lacks a leading slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify({ data: { ok: true } })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("documents", { baseUrl: "http://api.test/" });

    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/documents");
  });

  it("uses a plain-text error body as the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("storage is offline", 502, "Bad Gateway")));

    await expect(apiRequest("/documents", { baseUrl: "http://api.test" })).rejects.toMatchObject({
      status: 502,
      code: "HTTP_ERROR",
      message: "storage is offline",
    });
  });

  it("falls back to the status text when the error body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("", 503, "Service Unavailable")));

    const error = await apiRequest("/documents", { baseUrl: "http://api.test" }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "HTTP_ERROR", message: "Service Unavailable", correlationId: null });
  });

  it("reads an error envelope without a code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(JSON.stringify({ error: { message: "nope" } }), 400, "Bad Request")));

    await expect(apiRequest("/documents", { baseUrl: "http://api.test" })).rejects.toMatchObject({
      status: 400,
      code: "HTTP_ERROR",
      message: "nope",
    });
  });

  it("omits the CSRF header when the cookie is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify({ data: {} })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/documents", { baseUrl: "http://api.test", method: "DELETE" });

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("decodes an encoded CSRF cookie value", async () => {
    document.cookie = "edas_csrf=a%20b; path=/";
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify({ data: {} })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/documents", { baseUrl: "http://api.test", method: "POST", body: {} });

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-CSRF-Token": "a b" });
  });
});
