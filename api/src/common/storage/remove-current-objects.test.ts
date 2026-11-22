import { describe, expect, it, vi } from "vitest";
import { removeCurrentObjects } from "./remove-current-objects";

describe("current object cleanup", () => {
  it("retries only failed keys and reports failures that persist", async () => {
    const attempts = new Map<string, number>();
    const remove = vi.fn(async (key: string) => {
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      if (key === "busy" && attempt === 1 || key === "unavailable") throw new Error("Storage unavailable");
    });
    const failed = await removeCurrentObjects({ remove }, ["ok", "ok", "busy", "unavailable"]);
    expect(failed).toEqual(["unavailable"]);
    expect(Object.fromEntries(attempts)).toEqual({ ok: 1, busy: 2, unavailable: 2 });
  });
});
