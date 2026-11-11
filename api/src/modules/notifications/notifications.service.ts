import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationLevel, Prisma, UserRole } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { ListNotificationsQuery } from "./dto/list-notifications.query";

export interface NotifyInput {
  userId?: string | null;
  title: string;
  message: string;
  level?: NotificationLevel;
  entityType?: string | null;
  entityId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async push(input: NotifyInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        title: input.title,
        message: input.message,
        level: input.level ?? NotificationLevel.INFO,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  }

  async pushToRole(role: UserRole, input: Omit<NotifyInput, "userId">): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { role, status: "ACTIVE" },
      select: { id: true },
    });
    if (users.length === 0) {
      await this.push({ ...input, userId: null });
      return 0;
    }
    await this.prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: input.title,
        message: input.message,
        level: input.level ?? NotificationLevel.INFO,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });
    return users.length;
  }

  async list(principal: Principal, query: ListNotificationsQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const scope: Prisma.NotificationWhereInput = {
      OR: [{ userId: actor.id || "__none__" }, { userId: null }],
    };
    const where: Prisma.NotificationWhereInput = query.unreadOnly ? { AND: [scope, { read: false }] } : scope;

    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { AND: [scope, { read: false }] } }),
    ]);

    return { items, meta: { page, pageSize, total, unread } };
  }

  async unreadCount(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const count = await this.prisma.notification.count({
      where: { read: false, OR: [{ userId: actor.id || "__none__" }, { userId: null }] },
    });
    return { count };
  }

  async markRead(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const result = await this.prisma.notification.updateMany({
      where: { id, OR: [{ userId: actor.id || "__none__" }, { userId: null }] },
      data: { read: true },
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");

    await this.audit.record({
      action: "notification.read",
      entityType: "Notification",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { read: true },
    });

    return { id, read: true };
  }

  async markAllRead(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const result = await this.prisma.notification.updateMany({
      where: { OR: [{ userId: actor.id || "__none__" }, { userId: null }], read: false },
      data: { read: true },
    });

    if (result.count > 0) {
      await this.audit.record({
        action: "notification.read_all",
        entityType: "Notification",
        entityId: null,
        actorId: actor.id || null,
        departmentId: actor.departmentId,
        detail: { updated: result.count },
      });
    }

    return { updated: result.count };
  }

  async create(principal: Principal, dto: CreateNotificationDto) {
    const actor = await this.access.resolveActor(principal);
    if (dto.userId && !this.access.isGlobal(actor)) {
      const target = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { departmentId: true } });
      if (target && target.departmentId && target.departmentId !== actor.departmentId) {
        throw new NotFoundException("Notification target not found");
      }
    }

    const notification = await this.push({
      userId: dto.userId ?? null,
      title: dto.title,
      message: dto.message,
      level: dto.level,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    await this.audit.record({
      action: "notification.create",
      entityType: "Notification",
      entityId: notification.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { userId: dto.userId ?? null, title: dto.title, level: notification.level },
    });

    return notification;
  }
}
