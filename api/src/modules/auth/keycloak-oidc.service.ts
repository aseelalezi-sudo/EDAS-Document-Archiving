import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Server-side OpenID Connect client. The API — not the browser — performs the authorization-code
 * exchange and token refresh, so the tokens never reach JavaScript.
 */
@Injectable()
export class KeycloakOidcService {
  private readonly logger = new Logger(KeycloakOidcService.name);
  private readonly issuer: string;
  private readonly tokenIssuer: string;
  private readonly clientId: string;
  private readonly clientSecret: string | null;

  constructor(config: ConfigService) {
    this.issuer = config.get<string>("KEYCLOAK_ISSUER", "").replace(/\/$/, "");
    this.tokenIssuer = (config.get<string>("KEYCLOAK_INTERNAL_ISSUER") ?? this.issuer).replace(/\/$/, "");
    this.clientId = config.get<string>("KEYCLOAK_CLIENT_ID", "edas-web");
    this.clientSecret = config.get<string>("KEYCLOAK_CLIENT_SECRET") || null;
  }

  randomString(byteLength = 32): string {
    return base64Url(randomBytes(byteLength));
  }

  async createPkcePair(): Promise<PkcePair> {
    const verifier = this.randomString(32);
    return { verifier, challenge: await this.sha256Base64Url(verifier) };
  }

  authorizeUrl(params: { redirectUri: string; state: string; codeChallenge: string; scopes?: string; prompt?: string }): string {
    const url = new URL(this.endpoint("auth"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", params.scopes ?? "openid profile email");
    url.searchParams.set("state", params.state);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (params.prompt) url.searchParams.set("prompt", params.prompt);
    return url.toString();
  }

  exchangeCode(params: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenSet> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      client_id: this.clientId,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    });
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: "refresh_token", client_id: this.clientId, refresh_token: refreshToken });
  }

  logoutUrl(params: { idTokenHint?: string; postLogoutRedirectUri: string }): string {
    const url = new URL(this.endpoint("logout"));
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("post_logout_redirect_uri", params.postLogoutRedirectUri);
    if (params.idTokenHint) url.searchParams.set("id_token_hint", params.idTokenHint);
    return url.toString();
  }

  private endpoint(suffix: string): string {
    return `${this.issuer}/protocol/openid-connect/${suffix}`;
  }

  private tokenEndpoint(): string {
    return `${this.tokenIssuer}/protocol/openid-connect/token`;
  }

  private async sha256Base64Url(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return base64Url(new Uint8Array(digest));
  }

  private async tokenRequest(fields: Record<string, string>): Promise<TokenSet> {
    const body = new URLSearchParams(fields);
    if (this.clientSecret) body.set("client_secret", this.clientSecret);
    let response: Response;
    try {
      response = await fetch(this.tokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`token request failed: ${(error as Error).message}`);
      throw new BadGatewayException("Identity provider could not be reached");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`token request rejected (${response.status}): ${text.slice(0, 200)}`);
      throw new BadGatewayException(`Identity provider rejected the ${fields.grant_type} request`);
    }
    return (await response.json()) as TokenSet;
  }
}
