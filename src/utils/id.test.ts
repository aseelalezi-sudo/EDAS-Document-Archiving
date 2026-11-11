import { describe, expect, it } from "vitest";
import { uid } from "./id";

describe("uid", () => {
  it("generates unique ids even within the same millisecond", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uid("x")));
    expect(ids.size).toBe(10_000);
  });

  it("applies the given prefix", () => {
    expect(uid("acl")).toMatch(/^acl-/);
    expect(uid()).toMatch(/^id-/);
  });
});
