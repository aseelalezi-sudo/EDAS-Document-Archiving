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
    const bytes = Buffer.from(sealed, "base64url");
    bytes[bytes.length - 1] ^= 1;
    const tampered = bytes.toString("base64url");

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

  it("falls back to a per-process key when SESSION_SECRET is absent", () => {
    const first = new SessionCryptoService(config({}));
    const second = new SessionCryptoService(config({}));

    const sealed = first.seal({ value: "ephemeral" });

    expect(first.open<{ value: string }>(sealed)).toEqual({ value: "ephemeral" });
    expect(second.open(sealed)).toBeNull();
  });

  it("ignores a blank SESSION_SECRET instead of deriving a key from whitespace", () => {
    const first = new SessionCryptoService(config({ SESSION_SECRET: "   " }));
    const second = new SessionCryptoService(config({ SESSION_SECRET: "   " }));

    expect(second.open(first.seal({ value: "blank" }))).toBeNull();
  });
});
