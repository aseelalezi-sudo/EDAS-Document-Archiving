import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewObjectUrl } from "./preview";

const createObjectURL = vi.fn(() => "blob:preview-1");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("%PDF-1.7", { status: 200, headers: { "Content-Type": "application/pdf" } })),
  );
});

afterEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.unstubAllGlobals();
});

describe("usePreviewObjectUrl", () => {
  it("stays idle without a path", () => {
    const { result } = renderHook(() => usePreviewObjectUrl(null));

    expect(result.current).toEqual({ url: null, loading: false, error: false });
  });

  it("downloads the resource once and exposes a blob URL", async () => {
    const { result } = renderHook(() => usePreviewObjectUrl("/api/v1/preview/files/file-1/content?kind=preview"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.url).toBe("blob:preview-1"));
    expect(result.current).toEqual({ url: "blob:preview-1", loading: false, error: false });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("reports a refused download instead of leaving the spinner on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const { result } = renderHook(() => usePreviewObjectUrl("/api/v1/preview/files/file-1/content?kind=original"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current).toEqual({ url: null, loading: false, error: true });
  });

  it("aborts the request and revokes the URL when the viewer unmounts", async () => {
    const { result, unmount } = renderHook(() => usePreviewObjectUrl("/api/v1/preview/files/file-1/content?kind=preview"));
    await waitFor(() => expect(result.current.url).toBe("blob:preview-1"));

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    const signal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal;
    expect(signal?.aborted).toBe(true);
  });
});
