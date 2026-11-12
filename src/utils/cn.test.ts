import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names and drops falsy entries", () => {
    expect(cn("flex", false, null, undefined, "gap-2")).toBe("flex gap-2");
  });

  it("lets a later utility win over a conflicting one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-ink-500", "text-rose-600")).toBe("text-rose-600");
  });

  it("merges conditional objects and arrays", () => {
    expect(cn(["rounded-lg", { hidden: false, block: true }], "rounded-lg")).toBe("block rounded-lg");
  });
});
