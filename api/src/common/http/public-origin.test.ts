import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { publicOrigin } from "./public-origin";

function config(publicUrl?: string): ConfigService {
  return { get: (key: string, fallback?: string) => (key === "API_PUBLIC_URL" ? publicUrl : fallback) } as unknown as ConfigService;
}

function request(options: { host?: string; forwarded?: string | string[]; protocol?: string } = {}): Request {
  return {
    protocol: options.protocol ?? "http",
    headers: options.forwarded === undefined ? {} : { "x-forwarded-proto": options.forwarded },
    get: (name: string) => (name === "host" ? options.host : undefined),
  } as unknown as Request;
}

describe("publicOrigin", () => {
  it("prefers the configured public URL and strips trailing slashes", () => {
    expect(publicOrigin(request({ host: "internal:4000" }), config("https://edas.example//"))).toBe("https://edas.example");
  });

  it("uses the first forwarded protocol when a proxy sent a list", () => {
    expect(publicOrigin(request({ host: "api.example", forwarded: ["https, http"] }), config())).toBe("https://api.example");
    expect(publicOrigin(request({ host: "api.example", forwarded: "https" }), config())).toBe("https://api.example");
  });

  it("falls back to the request protocol and to localhost", () => {
    expect(publicOrigin(request({ host: "api.example", protocol: "http" }), config())).toBe("http://api.example");
    expect(publicOrigin(request({ protocol: "http" }), config())).toBe("http://localhost");
  });
});
