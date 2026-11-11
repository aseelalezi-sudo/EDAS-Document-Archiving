import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { ListNotificationsQuery } from "./dto/list-notifications.query";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(principal, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() principal: Principal) {
    return this.notifications.unreadCount(principal);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() principal: Principal) {
    return this.notifications.markAllRead(principal);
  }

  @Post(":id/read")
  markRead(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.notifications.markRead(principal, id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.DEPT_MANAGER, UserRole.ARCHIVIST)
  create(@CurrentUser() principal: Principal, @Body() dto: CreateNotificationDto) {
    return this.notifications.create(principal, dto);
  }
}
