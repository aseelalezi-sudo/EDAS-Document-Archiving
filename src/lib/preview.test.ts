import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ config: { apiBaseUrl: "https://api.example.com" } }));

import { absoluteApiUrl, fetchPreviewBlob } from "./preview";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("preview helpers", () => {
  it("resolves API relative preview URLs against the configured base", () => {
    expect(absoluteApiUrl("/api/v1/preview/files/file-1/content?kind=preview")).toBe(
      "https://api.example.com/api/v1/preview/files/file-1/content?kind=preview",
    );
    expect(absoluteApiUrl("https://cdn.example.com/file.pdf")).toBe("https://cdn.example.com/file.pdf");
  });

  it("downloads preview content with the session cookie instead of leaving it public", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["%PDF-1.7"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchPreviewBlob("/api/v1/preview/files/file-1/content?kind=original");

    expect(blob.size).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/preview/files/file-1/content?kind=original",
      expect.objectContaining({ credentials: "include" }),
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeUndefined();
  });

  it("forwards an abort signal so a closed preview cancels its request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["%PDF-1.7"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await fetchPreviewBlob("/api/v1/preview/files/file-1/content?kind=original", controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });

  it("rejects when the preview endpoint refuses the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    await expect(fetchPreviewBlob("/api/v1/preview/files/file-1/content?kind=original")).rejects.toThrow(/403/);
  });
});
