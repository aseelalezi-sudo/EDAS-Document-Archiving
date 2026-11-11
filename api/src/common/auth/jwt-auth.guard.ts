import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { SessionService } from "../../modules/auth/session.service";
import type { Principal } from "./principal";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { CSRF_COOKIE, CSRF_HEADER, MUTATING_METHODS, SESSION_COOKIE, readCookie } from "./session.constants";

type RequestWithUser = Request & { user?: Principal };

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (this.hasBearer(request)) return (await super.canActivate(context)) as boolean;

    const sessionId = readCookie(request.headers.cookie, this.config.get<string>("SESSION_COOKIE_NAME", SESSION_COOKIE));
    if (!sessionId) return (await super.canActivate(context)) as boolean;

    const principal = await this.sessions.resolve(sessionId);
    if (!principal) throw new UnauthorizedException("Session expired or invalid");
    if (MUTATING_METHODS.has(request.method)) this.assertCsrf(request);
    request.user = principal;
    return true;
  }

  private hasBearer(request: Request): boolean {
    const header = request.headers.authorization;
    return typeof header === "string" && header.startsWith("Bearer ");
  }

  private assertCsrf(request: Request): void {
    const cookieToken = readCookie(request.headers.cookie, CSRF_COOKIE);
    const header = request.headers[CSRF_HEADER];
    const headerToken = Array.isArray(header) ? header[0] : header;
    if (!cookieToken || !headerToken || headerToken !== cookieToken) {
      throw new ForbiddenException("Invalid CSRF token");
    }
  }
}