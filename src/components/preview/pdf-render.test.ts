import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pdf render intent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps display intent when animation frames run", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const render = await import("./pdf-render");
    await expect(render.supportsAnimationFrame()).resolves.toBe(true);
    expect(render.pdfRenderIntent(true)).toBe("display");
  });

  it("falls back to print intent when animation frames never run", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const render = await import("./pdf-render");
    const detected = render.supportsAnimationFrame();
    await vi.advanceTimersByTimeAsync(500);
    await expect(detected).resolves.toBe(false);
    expect(render.pdfRenderIntent(false)).toBe("print");
  });
});
