import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SessionCryptoService } from "./session-crypto.service";

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
}

describe("SessionCryptoService", () => {
  it("round-trips a sealed payload", () => {
    const crypto = new SessionCryptoService(config({ SESSION_SECRET: "a".repeat(32) }));

    const sealed = crypto.seal({ value: "token-1" });

    expect(sealed).not.toContain("token-1");
    expect(crypto.open<{ value: string }>(sealed)).toEqual({ value: "token-1" });
  });

  it("rejects a tampered payload instead of returning garbage", () => {
    const crypto = new SessionCryptoService(config({ SESSION_SECRET: "b".repeat(32) }));
    const sealed = crypto.seal({ value: "secret" });
    const tampered = `${sealed.slice(0, -2)}AA`;

    expect(crypto.open(tampered)).toBeNull();
    expect(crypto.open(null)).toBeNull();
    expect(crypto.open("short")).toBeNull();
  });

  it("lets two instances sharing SESSION_SECRET read each other's payloads", () => {
    const first = new SessionCryptoService(config({ SESSION_SECRET: "c".repeat(48) }));
    const second = new SessionCryptoService(config({ SESSION_SECRET: "c".repeat(48) }));

    expect(second.open<{ value: string }>(first.seal({ value: "shared" }))).toEqual({ value: "shared" });
  });

  it("refuses a SESSION_SECRET shorter than 32 characters", () => {
    expect(() => new SessionCryptoService(config({ SESSION_SECRET: "too-short" }))).toThrow(/SESSION_SECRET/);
  });
});