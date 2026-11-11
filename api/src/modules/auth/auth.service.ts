import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { User, UserRole } from "@prisma/client";
import type { Principal } from "../../common/auth/principal";
import { decodeAccessTokenPayload, principalFromPayload, type KeycloakPayload } from "../../common/auth/keycloak-payload";
import { LOGIN_COOKIE, SESSION_COOKIE, readCookie } from "../../common/auth/session.constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { KeycloakOidcService } from "./keycloak-oidc.service";
import { SessionCryptoService } from "./session-crypto.service";
import { SessionService, type SessionContext } from "./session.service";

export interface ProfileDto {
  id: string;
  username: string;
  name: string;
  nameEn: string | null;
  email: string;
  role: UserRole;
  status: string;
  departmentId: string | null;
  sectionId: string | null;
  jobTitle: string | null;
  jobTitleEn: string | null;
  phone: string | null;
  isNew: boolean;
}

interface PendingLogin {
  state: string;
  verifier: string;
  returnTo: string;
  redirectUri: string;
}

const PENDING_LOGIN_TTL_SECONDS = 600;

/** Keeps the post-login destination inside the SPA: relative paths only, never protocol-relative. */
export function sanitizeReturnTo(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/dashboard";
  return returnTo;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly oidc: KeycloakOidcService,
    private readonly crypto: SessionCryptoService,
    private readonly audit: AuditService,
  ) {}

  oidcConfig() {
    return {
      issuer: this.config.get<string>("KEYCLOAK_ISSUER", ""),
      clientId: this.config.get<string>("KEYCLOAK_CLIENT_ID", "edas-web"),
      audience: this.config.get<string>("KEYCLOAK_AUDIENCE", "edas-api"),
      scopes: "openid profile email",
    };
  }

  async profile(principal: Principal): Promise<ProfileDto> {
    const existing = await this.prisma.user.findUnique({ where: { keycloakSub: principal.sub } });
    if (existing) {
      await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      return { ...this.toDto(existing), isNew: false };
    }
    const { user, created } = await this.provision(principal);
    return { ...this.toDto(user), isNew: created };
  }

  /** Ensures the account row exists before a browser session references it (first login). */
  private async ensureAccount(payload: KeycloakPayload): Promise<{ id: string; departmentId: string | null }> {
    const principal = principalFromPayload(payload, null, this.config.get<string>("KEYCLOAK_CLIENT_ID", "edas-web"));
    const existing = await this.prisma.user.findUnique({
      where: { keycloakSub: principal.sub },
      select: { id: true, departmentId: true },
    });
    if (existing) {
      await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      return existing;
    }
    const { user } = await this.provision(principal);
    return { id: user.id, departmentId: user.departmentId };
  }

  private async provision(principal: Principal): Promise<{ user: User; created: boolean }> {
    const byUsername = await this.prisma.user.findUnique({ where: { username: principal.username } });
    if (byUsername) {
      // The provider sub is normally stable; when a realm is re-imported or restored it can change,
      // so re-link the existing account instead of failing the unique keycloakSub constraint.
      const user =
        byUsername.keycloakSub === principal.sub
          ? byUsername
          : await this.prisma.user.update({
              where: { id: byUsername.id },
              data: { keycloakSub: principal.sub, lastLoginAt: new Date() },
            });
      if (user !== byUsername) this.logger.warn(`Re-linked account ${principal.username} to a new identity-provider subject`);
      return { user, created: false };
    }
    const created = await this.prisma.user.create({
      data: {
        keycloakSub: principal.sub,
        username: principal.username,
        name: principal.name ?? principal.username,
        email: principal.email ?? `${principal.username}@edas.local`,
        role: principal.identityRoles[0] ?? UserRole.EMPLOYEE,
      },
    });
    return { user: created, created: true };
  }

  /** Builds the provider authorize URL and seals the PKCE/state material into a short-lived cookie. */
  async beginLogin(returnTo: string | undefined, origin: string): Promise<{ url: string; pendingCookie: string }> {
    const state = this.oidc.randomString(16);
    const pkce = await this.oidc.createPkcePair();
    const redirectUri = `${origin}/api/v1/auth/callback`;
    const pending: PendingLogin = { state, verifier: pkce.verifier, returnTo: sanitizeReturnTo(returnTo), redirectUri };
    const url = this.oidc.authorizeUrl({ redirectUri, state, codeChallenge: pkce.challenge });
    return { url, pendingCookie: this.crypto.seal(pending) };
  }

  /** Validates the provider callback, exchanges the code server-side and opens a browser session. */
  async completeLogin(params: {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
    cookieHeader: string | undefined;
    context: SessionContext;
  }): Promise<{ sessionId: string; csrfToken: string; redirectTo: string }> {
    if (params.error) throw new BadRequestException(params.errorDescription ?? params.error);
    const pending = this.crypto.open<PendingLogin>(readCookie(params.cookieHeader, LOGIN_COOKIE));
    if (!pending) throw new BadRequestException("Missing login state");
    if (!params.state || params.state !== pending.state) throw new BadRequestException("State mismatch");
    if (!params.code) throw new BadRequestException("Missing authorization code");

    const tokens = await this.oidc.exchangeCode({
      code: params.code,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirectUri,
    });
    const payload = decodeAccessTokenPayload(tokens.access_token);
    const account = await this.ensureAccount(payload);
    const session = await this.sessions.create(tokens, payload.sub, params.context);

    await this.audit.record({
      action: "auth.login",
      entityType: "User",
      entityId: account.id,
      actorId: account.id,
      departmentId: account.departmentId,
      ip: params.context.ip ?? null,
      userAgent: params.context.userAgent ?? null,
    });

    return {
      sessionId: session.id,
      csrfToken: this.oidc.randomString(24),
      redirectTo: `${this.appBaseUrl()}/#${pending.returnTo}`,
    };
  }

  async endSession(cookieHeader: string | undefined): Promise<{ logoutUrl: string }> {
    const sessionId = readCookie(cookieHeader, SESSION_COOKIE);
    let idToken: string | null = null;
    if (sessionId) {
      const ended = await this.sessions.logout(sessionId);
      idToken = ended.idToken;
      if (ended.keycloakSub) {
        const account = await this.prisma.user.findUnique({
          where: { keycloakSub: ended.keycloakSub },
          select: { id: true, departmentId: true },
        });
        if (account) {
          await this.audit.record({
            action: "auth.logout",
            entityType: "User",
            entityId: account.id,
            actorId: account.id,
            departmentId: account.departmentId,
          });
        }
      }
    }
    return {
      logoutUrl: this.oidc.logoutUrl({
        idTokenHint: idToken ?? undefined,
        postLogoutRedirectUri: `${this.appBaseUrl()}/#/login`,
      }),
    };
  }

  get pendingLoginTtlSeconds(): number {
    return PENDING_LOGIN_TTL_SECONDS;
  }

  get sessionTtlSeconds(): number {
    return this.sessions.ttlSeconds;
  }

  private appBaseUrl(): string {
    return this.config.get<string>("APP_BASE_URL", "http://localhost:5173").replace(/\/$/, "");
  }

  private toDto(user: User): Omit<ProfileDto, "isNew"> {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      nameEn: user.nameEn,
      email: user.email,
      role: user.role,
      status: user.status,
      departmentId: user.departmentId,
      sectionId: user.sectionId,
      jobTitle: user.jobTitle,
      jobTitleEn: user.jobTitleEn,
      phone: user.phone,
    };
  }
}