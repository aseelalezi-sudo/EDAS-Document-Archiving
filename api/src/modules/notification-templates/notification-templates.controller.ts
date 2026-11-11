import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { CreateNotificationTemplateDto, UpdateNotificationTemplateDto } from "./dto/notification-template.dto";
import { NotificationTemplatesService } from "./notification-templates.service";

@Controller("notification-templates")
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.AUDITOR)
  list() {
    return this.templates.list();
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateNotificationTemplateDto) {
    return this.templates.create(principal, dto);
  }

  @Patch(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  update(@CurrentUser() principal: Principal, @Param("id") id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.templates.update(principal, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.SYSTEM_ADMIN)
  remove(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.templates.remove(principal, id);
  }

  @Post(":id/reset")
  @Roles(UserRole.SYSTEM_ADMIN)
  reset(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.templates.reset(principal, id);
  }
}
