import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import type { Principal } from "./principal";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: Principal }>();
    const user = request.user;
    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
