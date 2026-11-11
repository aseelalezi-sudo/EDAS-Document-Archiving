import { Body, Controller, Delete, Get, Param, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR, UserRole.DEPT_MANAGER)
  list() {
    return this.roles.list();
  }

  @Patch(":role")
  @Roles(UserRole.SYSTEM_ADMIN)
  update(@CurrentUser() principal: Principal, @Param("role") role: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(principal, role, dto.actions);
  }

  @Delete(":role")
  @Roles(UserRole.SYSTEM_ADMIN)
  reset(@CurrentUser() principal: Principal, @Param("role") role: string) {
    return this.roles.reset(principal, role);
  }
}
