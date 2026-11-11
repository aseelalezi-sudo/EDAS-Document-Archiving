import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

function fetchSpy() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: {} }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callOf(fetchMock: ReturnType<typeof fetchSpy>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, body: init.body as string | undefined };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "edas_csrf=; max-age=0; path=/";
});

describe("createApiClient helpers", () => {
  it("maps auth and document reads to their endpoints", async () => {
    const fetchMock = fetchSpy();
    const client = createApiClient();

    await client.oidcConfig();
    await client.me();
    await client.foldersTree();
    await client.listDocuments({ q: "عقد", page: 2, status: undefined });
    await client.getDocument("d1");
    await client.documentPermissions("d1");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/v1/auth/config",
      "/api/v1/auth/me",
      "/api/v1/folders/tree",
      "/api/v1/documents?q=%D8%B9%D9%82%D8%AF&page=2",
      "/api/v1/documents/d1",
      "/api/v1/documents/d1/permissions",
    ]);
  });

  it("sends writes with the verb, body and CSRF header", async () => {
    document.cookie = "edas_csrf=csrf-1; path=/";
    const fetchMock = fetchSpy();
    const client = createApiClient();

    await client.createDocument({ title: "عقد" });
    await client.post("/folders", { name: "مجلد" });
    await client.patch("/folders/f1", { name: "جديد" });
    await client.put("/folders/f1/acl", { rules: [] });
    await client.del("/folders/f1");

    const calls = fetchMock.mock.calls.map((_call, index) => callOf(fetchMock, index));

    expect(calls[0]).toMatchObject({
      url: "/api/v1/documents",
      init: expect.objectContaining({ method: "POST" }),
      headers: expect.objectContaining({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-1" }),
      body: JSON.stringify({ title: "عقد" }),
    });
    expect(calls.map((call) => call.init.method)).toEqual(["POST", "POST", "PATCH", "PUT", "DELETE"]);
  });

  it("maps upload, download and preview helpers", async () => {
    const fetchMock = fetchSpy();
    const client = createApiClient();
    const controller = new AbortController();

    await client.presignUpload({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    await client.registerFile({
      storageKey: "documents/2026/a.pdf",
      originalName: "a.pdf",
      mimeType: "application/pdf",
      checksumSha256: "abc",
    });
    await client.downloadUrl("f1");
    await client.downloadUrl("f1", true);
    await client.preview("f1", { signal: controller.signal });
    await client.retryPreview("f1");
    await client.previewCapabilities();
    await client.cleanupPreviewCache();

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit).method ?? "GET"])).toEqual([
      ["/api/v1/files/presign-upload", "POST"],
      ["/api/v1/files", "POST"],
      ["/api/v1/files/f1/download", "GET"],
      ["/api/v1/files/f1/download?inline=true", "GET"],
      ["/api/v1/preview/files/f1", "GET"],
      ["/api/v1/preview/files/f1/retry", "POST"],
      ["/api/v1/preview/capabilities", "GET"],
      ["/api/v1/preview/cache/cleanup", "POST"],
    ]);
    expect((fetchMock.mock.calls[4][1] as RequestInit).signal).toBe(controller.signal);
    expect((fetchMock.mock.calls[7][1] as RequestInit).body).toBe(JSON.stringify({ olderThanDays: 30 }));
    expect(client.previewContentUrl("f1", "preview")).toBe("/api/v1/preview/files/f1/content?kind=preview");
    expect(client.previewContentUrl("f1", "original")).toBe("/api/v1/preview/files/f1/content?kind=original");
  });
});
