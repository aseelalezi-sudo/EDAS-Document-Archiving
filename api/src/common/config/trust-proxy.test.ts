import { describe, expect, it } from "vitest";
import { resolveTrustProxy } from "./trust-proxy";

describe("resolveTrustProxy", () => {
  it("keeps the single-proxy default when unset", () => {
    expect(resolveTrustProxy(undefined)).toBe(1);
    expect(resolveTrustProxy("")).toBe(1);
    expect(resolveTrustProxy("  ")).toBe(1);
  });

  it("parses boolean switches", () => {
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy("false")).toBe(false);
  });

  it("parses a hop count", () => {
    expect(resolveTrustProxy("2")).toBe(2);
    expect(resolveTrustProxy("0")).toBe(0);
  });

  it("passes subnet lists and named settings through", () => {
    expect(resolveTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
    expect(resolveTrustProxy("uniquelocal")).toBe("uniquelocal");
  });
});
