import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { CreateUserDto, ResetPasswordDto, UpdateSelfDto, UpdateUserDto } from "./dto/user.dto";
import { UpdatePreferenceDto } from "./dto/preference.dto";
import { ListUsersQuery } from "./dto/list-users.query";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR, UserRole.DEPT_MANAGER)
  list(@CurrentUser() principal: Principal, @Query() query: ListUsersQuery) {
    return this.users.list(principal, query);
  }

  @Get(":id")
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR, UserRole.DEPT_MANAGER)
  findOne(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.users.findOne(principal, id);
  }

  @Patch("me")
  updateSelf(@CurrentUser() principal: Principal, @Body() dto: UpdateSelfDto) {
    return this.users.updateSelf(principal, dto);
  }

  @Get("me/preferences")
  preferences(@CurrentUser() principal: Principal) {
    return this.users.preferences(principal);
  }

  @Put("me/preferences/:key")
  putPreference(@CurrentUser() principal: Principal, @Param("key") key: string, @Body() dto: UpdatePreferenceDto) {
    return this.users.putPreference(principal, key, dto);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateUserDto) {
    return this.users.create(principal, dto);
  }

  @Patch(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(principal, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.users.remove(principal, id);
  }

  @Post(":id/reset-password")
  @Roles(UserRole.SYSTEM_ADMIN)
  resetPassword(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(principal, id, dto);
  }

  @Post(":id/revoke-sessions")
  @Roles(UserRole.SYSTEM_ADMIN)
  revokeSessions(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.users.revokeSessions(principal, id);
  }

  @Get(":id/sessions")
  @Roles(UserRole.SYSTEM_ADMIN)
  sessions(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.users.sessions(principal, id);
  }
}
