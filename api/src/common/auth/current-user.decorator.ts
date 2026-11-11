import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Principal } from "./principal";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const request = ctx.switchToHttp().getRequest<{ user: Principal }>();
  return request.user;
});
