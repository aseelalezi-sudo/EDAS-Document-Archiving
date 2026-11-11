import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

function context(user?: { roles: UserRole[] }): ExecutionContext {
  return {
    getHandler: () => ({ name: "handler" }),
    getClass: () => ({ name: "Controller" }),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guard(required: UserRole[] | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  return { guard: new RolesGuard(reflector as unknown as Reflector), reflector };
}

describe("RolesGuard", () => {
  it("allows any caller when the route declares no roles", () => {
    const { guard: rolesGuard, reflector } = guard(undefined);

    expect(rolesGuard.canActivate(context())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(expect.any(String), [expect.anything(), expect.anything()]);
  });

  it("allows any caller when the declared role list is empty", () => {
    const { guard: rolesGuard } = guard([]);

    expect(rolesGuard.canActivate(context())).toBe(true);
  });

  it("allows a caller holding one of the declared roles", () => {
    const { guard: rolesGuard } = guard([UserRole.SYSTEM_ADMIN, UserRole.ARCHIVIST]);

    expect(rolesGuard.canActivate(context({ roles: [UserRole.EMPLOYEE, UserRole.ARCHIVIST] }))).toBe(true);
  });

  it("refuses an authenticated caller without the role", () => {
    const { guard: rolesGuard } = guard([UserRole.SYSTEM_ADMIN]);

    expect(() => rolesGuard.canActivate(context({ roles: [UserRole.EMPLOYEE] }))).toThrow(ForbiddenException);
  });

  it("refuses an unauthenticated request", () => {
    const { guard: rolesGuard } = guard([UserRole.EMPLOYEE]);

    expect(() => rolesGuard.canActivate(context())).toThrow(ForbiddenException);
  });
});
