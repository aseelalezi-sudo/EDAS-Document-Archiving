import { describe, expect, it } from "vitest";
import { decodeAccessTokenPayload } from "./keycloak-payload";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("decodeAccessTokenPayload", () => {
  it("reads the payload segment of a token", () => {
    const token = `${encode({ alg: "RS256" })}.${encode({ sub: "sub-1", preferred_username: "amal" })}.signature`;

    expect(decodeAccessTokenPayload(token)).toEqual({ sub: "sub-1", preferred_username: "amal" });
  });

  it("rejects a token without a payload segment", () => {
    expect(() => decodeAccessTokenPayload("header..signature")).toThrow("Invalid access token");
  });

  it("rejects a payload that is not JSON", () => {
    expect(() => decodeAccessTokenPayload("header.bm90LWpzb24.signature")).toThrow("Invalid access token");
  });
});
