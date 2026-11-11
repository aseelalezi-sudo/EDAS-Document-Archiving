import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";
import { GroupsService } from "./groups.service";

@Controller("groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateGroupDto) {
    return this.groups.create(principal, dto);
  }

  @Patch(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(principal, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.groups.remove(principal, id);
  }
}
