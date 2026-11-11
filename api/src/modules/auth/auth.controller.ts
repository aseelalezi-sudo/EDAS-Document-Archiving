import { Controller, Get, HttpException, Logger, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Public } from "../../common/auth/public.decorator";
import { CSRF_COOKIE, LOGIN_COOKIE, SESSION_COOKIE } from "../../common/auth/session.constants";
import { arabicReason } from "../../common/errors/error-reasons-ar";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly secureCookies: boolean;
  private readonly sameSite: "lax" | "strict" | "none";

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    const configured = config.get<string>("SESSION_COOKIE_SECURE");
    this.secureCookies = configured ? configured === "true" : config.get<string>("NODE_ENV") === "production";
    this.sameSite = (config.get<string>("SESSION_COOKIE_SAMESITE", "lax") as "lax" | "strict" | "none") ?? "lax";
  }

  @Public()
  @Get("config")
  configInfo() {
    return this.auth.oidcConfig();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get("login")
  async login(@Query("returnTo") returnTo: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { url, pendingCookie } = await this.auth.beginLogin(returnTo, this.origin(req));
    res.cookie(LOGIN_COOKIE, pendingCookie, this.cookieOptions(this.auth.pendingLoginTtlSeconds));
    res.redirect(url);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.auth.completeLogin({
        code,
        state,
        error,
        errorDescription,
        cookieHeader: req.headers.cookie,
        context: { userAgent: req.get("user-agent") ?? null, ip: req.ip ?? null },
      });
      const maxAge = this.auth.sessionTtlSeconds;
      res.cookie(SESSION_COOKIE, result.sessionId, this.cookieOptions(maxAge));
      res.cookie(CSRF_COOKIE, result.csrfToken, { ...this.cookieOptions(maxAge), httpOnly: false });
      this.clearCookie(res, LOGIN_COOKIE);
      res.redirect(result.redirectTo);
    } catch (failure) {
      this.clearCookie(res, LOGIN_COOKIE);
      const reason = failure instanceof Error ? failure.message : "Login failed";
      this.logger.error(`Login callback failed: ${reason}`);
      const status = failure instanceof HttpException ? failure.getStatus() : 500;
      res.redirect(`${this.spaBaseUrl()}/#/auth/callback?error=${encodeURIComponent(arabicReason(reason, status))}`);
    }
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { logoutUrl } = await this.auth.endSession(req.headers.cookie);
    this.clearCookie(res, SESSION_COOKIE);
    this.clearCookie(res, CSRF_COOKIE);
    return { logoutUrl };
  }

  @Get("me")
  me(@CurrentUser() principal: Principal) {
    return this.auth.profile(principal);
  }

  private origin(req: Request): string {
    const configured = this.config.get<string>("API_PUBLIC_URL");
    if (configured) return configured.replace(/\/$/, "");
    return `${req.protocol}://${req.get("host") ?? "localhost"}`;
  }

  private spaBaseUrl(): string {
    return this.config.get<string>("APP_BASE_URL", "http://localhost:5173").replace(/\/$/, "");
  }

  private cookieOptions(maxAgeSeconds: number) {
    return {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: this.sameSite,
      path: "/",
      maxAge: maxAgeSeconds * 1000,
    };
  }

  private clearCookie(res: Response, name: string): void {
    res.clearCookie(name, { httpOnly: true, secure: this.secureCookies, sameSite: this.sameSite, path: "/" });
  }
}