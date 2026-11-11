import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserSession } from "@prisma/client";
import type { Principal } from "../../common/auth/principal";
import { decodeAccessTokenPayload, principalFromPayload } from "../../common/auth/keycloak-payload";
import { PrismaService } from "../../common/prisma/prisma.service";
import { KeycloakOidcService, type TokenSet } from "./keycloak-oidc.service";
import { SessionCryptoService } from "./session-crypto.service";

interface SealedToken {
  value: string;
}

export interface SessionContext {
  userAgent?: string | null;
  ip?: string | null;
}

const REFRESH_SKEW_MS = 30_000;

/**
 * Owns the browser session lifecycle: it stores the OIDC tokens server-side (encrypted), refreshes the
 * access token before it expires, and hands the caller a principal for each request.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SessionCryptoService,
    private readonly oidc: KeycloakOidcService,
    private readonly config: ConfigService,
  ) {}

  get ttlSeconds(): number {
    return Number(this.config.get("SESSION_TTL_SECONDS", 28800));
  }

  async create(tokens: TokenSet, keycloakSub: string, context: SessionContext): Promise<{ id: string }> {
    const row = await this.prisma.userSession.create({
      data: {
        keycloakSub,
        accessToken: this.seal(tokens.access_token),
        refreshToken: tokens.refresh_token ? this.seal(tokens.refresh_token) : null,
        idToken: tokens.id_token ? this.seal(tokens.id_token) : null,
        accessExpiresAt: this.expiry(tokens.expires_in),
        refreshExpiresAt: tokens.refresh_expires_in ? this.expiry(tokens.refresh_expires_in) : null,
        userAgent: context.userAgent ?? null,
        ip: context.ip ?? null,
      },
    });
    return { id: row.id };
  }

  async resolve(id: string): Promise<Principal | null> {
    const row = await this.prisma.userSession.findUnique({ where: { id } });
    if (!row || this.expired(row)) {
      if (row) await this.revoke(id);
      return null;
    }

    const accessToken = await this.currentAccessToken(row);
    if (!accessToken) {
      await this.revoke(id);
      return null;
    }

    const payload = decodeAccessTokenPayload(accessToken);
    const account = await this.prisma.user.findUnique({
      where: { keycloakSub: payload.sub },
      select: { status: true, role: true },
    });
    return principalFromPayload(payload, account, this.config.get<string>("KEYCLOAK_CLIENT_ID", "edas-web"));
  }

  /** Revokes the session and returns the stored id token so the caller can pass it as a logout hint. */
  async logout(id: string): Promise<{ idToken: string | null; keycloakSub: string | null }> {
    const row = await this.prisma.userSession.findUnique({ where: { id } });
    await this.revoke(id);
    return { idToken: this.unseal(row?.idToken), keycloakSub: row?.keycloakSub ?? null };
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.userSession.deleteMany({ where: { id } });
  }

  async revokeForSub(keycloakSub: string): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({ where: { keycloakSub } });
    return result.count;
  }

  private async currentAccessToken(row: UserSession, attempt = 1): Promise<string | null> {
    const accessToken = this.unseal(row.accessToken);
    const expiring = row.accessExpiresAt.getTime() - Date.now() <= REFRESH_SKEW_MS;
    if (!expiring) return accessToken;

    const refreshToken = this.unseal(row.refreshToken);
    if (!refreshToken || attempt > 1) return null;
    try {
      const tokens = await this.oidc.refresh(refreshToken);
      await this.prisma.userSession.update({
        where: { id: row.id },
        data: {
          accessToken: this.seal(tokens.access_token),
          refreshToken: this.seal(tokens.refresh_token ?? refreshToken),
          idToken: tokens.id_token ? this.seal(tokens.id_token) : row.idToken,
          accessExpiresAt: this.expiry(tokens.expires_in),
          refreshExpiresAt: tokens.refresh_expires_in ? this.expiry(tokens.refresh_expires_in) : row.refreshExpiresAt,
          lastSeenAt: new Date(),
        },
      });
      return tokens.access_token;
    } catch (error) {
      this.logger.warn(`session refresh failed for ${row.keycloakSub}: ${(error as Error).message}`);
      return null;
    }
  }

  private expired(row: Pick<UserSession, "refreshExpiresAt">): boolean {
    return Boolean(row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= Date.now());
  }

  private seal(value: string): string {
    const payload: SealedToken = { value };
    return this.crypto.seal(payload);
  }

  private unseal(sealed: string | null | undefined): string | null {
    return this.crypto.open<SealedToken>(sealed)?.value ?? null;
  }

  private expiry(seconds: number): Date {
    return new Date(Date.now() + Math.max(0, seconds) * 1000);
  }
}
