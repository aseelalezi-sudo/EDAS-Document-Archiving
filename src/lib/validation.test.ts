import { describe, expect, it } from "vitest";
import { validators } from "./validation";

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

describe("validators", () => {
  it("requires non-empty values", () => {
    expect(validators(t).required("  ")).toBe("val.required");
    expect(validators(t).required("ok")).toBeUndefined();
  });

  it("enforces a minimum length", () => {
    expect(validators(t).minLen(3)("ab")).toContain("val.minLen");
    expect(validators(t).minLen(3)("abcd")).toBeUndefined();
  });

  it("validates email addresses", () => {
    expect(validators(t).email("a@b.com")).toBeUndefined();
    expect(validators(t).email("nope")).toBe("val.email");
    expect(validators(t).email("")).toBeUndefined();
  });

  it("validates usernames", () => {
    expect(validators(t).username("ahmad.b-1")).toBeUndefined();
    expect(validators(t).username("أحمد")).toBe("val.username");
  });

  it("validates phone numbers", () => {
    expect(validators(t).phone("+966 50 123 4567")).toBeUndefined();
    expect(validators(t).phone("abc")).toBe("val.phone");
  });
});
