import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "./log-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logError", () => {
  it("reports the failing context and the original error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("offline");

    logError("document fetch", error);

    expect(spy).toHaveBeenCalledWith("[EDAS] document fetch failed", error);
  });
});
