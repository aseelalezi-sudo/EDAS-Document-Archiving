import { describe, expect, it } from "vitest";
import { settledOutcome } from "./settled";

const fulfilled = { status: "fulfilled", value: true } as const;
const rejected = { status: "rejected", reason: new Error("denied") } as const;

describe("settledOutcome", () => {
  it("keeps only fulfilled ids and reports a partial failure", () => {
    const outcome = settledOutcome(["a", "b", "c"], [fulfilled, rejected, fulfilled]);

    expect(outcome.doneIds).toEqual(["a", "c"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.failure?.reason).toBeInstanceOf(Error);
  });

  it("reports success only when every request succeeded", () => {
    expect(settledOutcome(["a", "b"], [fulfilled, fulfilled])).toEqual({ doneIds: ["a", "b"], failure: undefined, ok: true });
  });

  it("reports zero when every request failed", () => {
    const outcome = settledOutcome(["a", "b"], [rejected, rejected]);

    expect(outcome.doneIds).toEqual([]);
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe(rejected);
  });
});
