import { describe, expect, it } from "vitest";
import { API_BUILD_VARS, missingApiConfig } from "./build-guard";

describe("missingApiConfig", () => {
  it("lists every connection variable when none is configured", () => {
    expect(missingApiConfig({})).toEqual([...API_BUILD_VARS]);
  });

  it("ignores blank values", () => {
    expect(missingApiConfig({ VITE_API_URL: " ", VITE_OIDC_ISSUER: "", VITE_OIDC_CLIENT_ID: undefined })).toEqual([
      "VITE_API_URL",
      "VITE_OIDC_ISSUER",
      "VITE_OIDC_CLIENT_ID",
    ]);
  });

  it("returns nothing when the whole connection is configured", () => {
    expect(
      missingApiConfig({
        VITE_API_URL: "https://api.example.com",
        VITE_OIDC_ISSUER: "https://id.example.com/realms/edas",
        VITE_OIDC_CLIENT_ID: "edas-web",
      }),
    ).toEqual([]);
  });
});
