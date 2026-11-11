import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { NotificationTemplateDto } from "@edas/shared";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateNotificationTemplateDto, UpdateNotificationTemplateDto } from "./dto/notification-template.dto";

const DEFAULT_TEMPLATES: Prisma.NotificationTemplateCreateManyInput[] = [
  {
    id: "nt-1",
    name: "طلب موافقة",
    nameEn: "Approval request",
    channel: "IN_APP",
    subject: "لديك طلب موافقة جديد",
    subjectEn: "You have a new approval request",
    body: "الوثيقة {DOC_TITLE} بانتظار اعتمادك. الموعد النهائي: {DUE_DATE}.",
    bodyEn: "Document {DOC_TITLE} awaits your approval. Due: {DUE_DATE}.",
  },
  {
    id: "nt-2",
    name: "اعتماد",
    nameEn: "Approved",
    channel: "IN_APP",
    subject: "تم اعتماد الوثيقة {DOC_NO}",
    subjectEn: "Document {DOC_NO} was approved",
    body: "تم اعتماد الوثيقة {DOC_TITLE} من قبل {USER_NAME}.",
    bodyEn: "Document {DOC_TITLE} was approved by {USER_NAME}.",
  },
  {
    id: "nt-3",
    name: "رفض",
    nameEn: "Rejected",
    channel: "IN_APP",
    subject: "تم رفض الوثيقة {DOC_NO}",
    subjectEn: "Document {DOC_NO} was rejected",
    body: "رفض {USER_NAME} الوثيقة {DOC_TITLE}. يرجى مراجعة الملاحظات.",
    bodyEn: "{USER_NAME} rejected document {DOC_TITLE}. Please review the comments.",
  },
  {
    id: "nt-4",
    name: "تنبيه احتفاظ",
    nameEn: "Retention warning",
    channel: "IN_APP",
    subject: "اقترب موعد مراجعة الوثيقة {DOC_NO}",
    subjectEn: "Retention review due for {DOC_NO}",
    body: "ستحين مراجعة الاحتفاظ للوثيقة {DOC_TITLE} في {DUE_DATE}.",
    bodyEn: "The retention review for {DOC_TITLE} is due on {DUE_DATE}.",
  },
  {
    id: "nt-5",
    name: "إعادة تعيين كلمة المرور",
    nameEn: "Password reset",
    channel: "EMAIL",
    subject: "إعادة تعيين كلمة المرور",
    subjectEn: "Reset your password",
    body: "مرحباً {USER_NAME}، استخدم الرابط المرسل لإعادة تعيين كلمة المرور.",
    bodyEn: "Hello {USER_NAME}, use the link in this message to reset your password.",
  },
  {
    id: "nt-6",
    name: "خطأ حرج",
    nameEn: "Critical error",
    channel: "EMAIL",
    subject: "خطأ حرج في النظام",
    subjectEn: "Critical system error",
    body: "حدث خطأ حرج في {DEPARTMENT}. يرجى المراجعة.",
    bodyEn: "A critical error occurred in {DEPARTMENT}. Please investigate.",
  },
];

type TemplateRow = {
  id: string;
  name: string;
  nameEn: string;
  channel: string;
  subject: string;
  subjectEn: string;
  body: string;
  bodyEn: string;
  updatedAt: Date;
};

function toDto(row: TemplateRow): NotificationTemplateDto {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.nameEn,
    channel: row.channel === "EMAIL" ? "EMAIL" : "IN_APP",
    subject: row.subject,
    subjectEn: row.subjectEn,
    body: row.body,
    bodyEn: row.bodyEn,
    isDefault: DEFAULT_TEMPLATES.some((template) => template.id === row.id),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class NotificationTemplatesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.notificationTemplate.count();
    if (count === 0) await this.prisma.notificationTemplate.createMany({ data: DEFAULT_TEMPLATES });
  }

  async list() {
    const items = await this.prisma.notificationTemplate.findMany({ orderBy: { id: "asc" } });
    return { items: items.map(toDto), meta: { total: items.length } };
  }

  async create(principal: Principal, dto: CreateNotificationTemplateDto) {
    const actor = await this.access.resolveActor(principal);
    const row = await this.prisma.notificationTemplate.create({
      data: { ...dto, id: `nt-${randomUUID().slice(0, 8)}`, channel: dto.channel ?? "IN_APP" },
    });
    await this.audit.record({
      action: "notification-template.create",
      entityType: "NotificationTemplate",
      entityId: row.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { nameEn: row.nameEn },
    });
    return toDto(row);
  }

  async update(principal: Principal, id: string, dto: UpdateNotificationTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Notification template not found");
    const actor = await this.access.resolveActor(principal);
    const row = await this.prisma.notificationTemplate.update({ where: { id }, data: dto });
    await this.audit.record({
      action: "notification-template.update",
      entityType: "NotificationTemplate",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { fields: Object.keys(dto) },
    });
    return toDto(row);
  }

  async remove(principal: Principal, id: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Notification template not found");
    const actor = await this.access.resolveActor(principal);
    await this.prisma.notificationTemplate.delete({ where: { id } });
    await this.audit.record({
      action: "notification-template.delete",
      entityType: "NotificationTemplate",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
    });
    return { id, deleted: true };
  }

  async reset(principal: Principal, id: string) {
    const seed = DEFAULT_TEMPLATES.find((template) => template.id === id);
    if (!seed) throw new NotFoundException("Notification template not found");
    const actor = await this.access.resolveActor(principal);
    const row = await this.prisma.notificationTemplate.upsert({
      where: { id },
      create: seed,
      update: {
        name: seed.name,
        nameEn: seed.nameEn,
        channel: seed.channel,
        subject: seed.subject,
        subjectEn: seed.subjectEn,
        body: seed.body,
        bodyEn: seed.bodyEn,
      },
    });
    await this.audit.record({
      action: "notification-template.reset",
      entityType: "NotificationTemplate",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
    });
    return toDto(row);
  }
}
