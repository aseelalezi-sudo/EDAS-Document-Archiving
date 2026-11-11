import { afterEach, describe, expect, it, vi } from "vitest";
import { BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KeycloakOidcService } from "./keycloak-oidc.service";

function config(values: Record<string, string> = {}): ConfigService {
  const base: Record<string, string> = {
    KEYCLOAK_ISSUER: "http://kc.test/realms/edas/",
    KEYCLOAK_CLIENT_ID: "edas-web",
    ...values,
  };
  return { get: (key: string, fallback?: string) => base[key] ?? fallback } as unknown as ConfigService;
}

afterEach(() => vi.unstubAllGlobals());

describe("KeycloakOidcService", () => {
  it("builds an S256 authorize url against the issuer without a trailing slash", () => {
    const url = new URL(
      new KeycloakOidcService(config()).authorizeUrl({
        redirectUri: "http://api.test/api/v1/auth/callback",
        state: "state-1",
        codeChallenge: "challenge-1",
      }),
    );

    expect(url.origin + url.pathname).toBe("http://kc.test/realms/edas/protocol/openid-connect/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("edas-web");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("exchanges an authorization code server-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at", expires_in: 900, token_type: "Bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await new KeycloakOidcService(config()).exchangeCode({
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "http://api.test/api/v1/auth/callback",
    });

    expect(tokens.access_token).toBe("at");
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("http://kc.test/realms/edas/protocol/openid-connect/token");
    const body = String(init.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code_verifier=verifier-1");
  });

  it("adds the client secret only when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at", expires_in: 900, token_type: "Bearer" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new KeycloakOidcService(config({ KEYCLOAK_CLIENT_SECRET: "s3cret" })).refresh("rt-1");

    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_secret=s3cret");
  });

  it("surfaces a provider rejection as a bad gateway", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })));

    await expect(new KeycloakOidcService(config()).refresh("rt-1")).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("calls the internal issuer server-side while keeping the public authorize url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at", expires_in: 900, token_type: "Bearer" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new KeycloakOidcService(config({ KEYCLOAK_INTERNAL_ISSUER: "http://keycloak:8080/realms/edas" }));

    const authorize = new URL(service.authorizeUrl({ redirectUri: "http://api.test/cb", state: "s", codeChallenge: "c" }));
    expect(authorize.host).toBe("kc.test");

    await service.refresh("rt-1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://keycloak:8080/realms/edas/protocol/openid-connect/token");
  });

  it("builds the end-session url with the post-logout redirect", () => {
    const url = new URL(
      new KeycloakOidcService(config()).logoutUrl({
        idTokenHint: "id-1",
        postLogoutRedirectUri: "http://app.test/#/login",
      }),
    );

    expect(url.pathname).toBe("/realms/edas/protocol/openid-connect/logout");
    expect(url.searchParams.get("id_token_hint")).toBe("id-1");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://app.test/#/login");
  });
});