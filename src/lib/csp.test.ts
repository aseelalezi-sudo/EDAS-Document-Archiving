import { describe, expect, it } from "vitest";
import { buildCsp, cspApiOrigin } from "./csp";

describe("cspApiOrigin", () => {
  it("returns the origin of an absolute API URL", () => {
    expect(cspApiOrigin("https://api.example.com/api/v1")).toBe("https://api.example.com");
    expect(cspApiOrigin("http://localhost:4000")).toBe("http://localhost:4000");
  });

  it("ignores relative, empty and non-http values", () => {
    expect(cspApiOrigin(undefined)).toBeUndefined();
    expect(cspApiOrigin("")).toBeUndefined();
    expect(cspApiOrigin("/api")).toBeUndefined();
    expect(cspApiOrigin("javascript:alert(1)")).toBeUndefined();
    expect(cspApiOrigin("not a url")).toBeUndefined();
  });
});

describe("buildCsp", () => {
  it("uses a strict script policy for the normal bundle", () => {
    const policy = buildCsp();
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it("allows inline code only for the single-file bundle", () => {
    const policy = buildCsp({ allowInline: true });
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("adds the API origin to connect-src when provided", () => {
    const policy = buildCsp({ apiOrigin: "https://api.example.com" });
    expect(policy).toContain("connect-src 'self' https://api.example.com");
  });

  it("keeps connect-src self-only when no API origin is known", () => {
    expect(buildCsp()).toContain("connect-src 'self';");
  });

  it("allows the preview, font and worker sources the UI needs", () => {
    const policy = buildCsp();
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("font-src 'self' data: https://fonts.gstatic.com");
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
  });
});
