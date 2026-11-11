import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const DEFAULT_TEMPLATES: Prisma.ReportTemplateCreateManyInput[] = [
  {
    id: "rpt-1",
    name: "حجم الوثائق حسب الإدارة",
    nameEn: "Documents by Department",
    category: "الوثائق",
    categoryEn: "Documents",
    desc: "توزيع عدد وأحجام الوثائق عبر الإدارات",
    descEn: "Distribution of documents across departments",
    favorite: true,
    lastRun: "2026-01-26",
    schedule: "أسبوعي",
    icon: "bar",
  },
  {
    id: "rpt-2",
    name: "استخدام التخزين",
    nameEn: "Storage Usage",
    category: "النظام",
    categoryEn: "System",
    desc: "استهلاك سعة التخزين واتجاهات النمو",
    descEn: "Storage capacity and growth trends",
    favorite: true,
    lastRun: "2026-01-27",
    schedule: "يومي",
    icon: "gauge",
  },
  {
    id: "rpt-3",
    name: "نشاط المستخدمين",
    nameEn: "User Activity",
    category: "النشاط",
    categoryEn: "Activity",
    desc: "مستوى نشاط المستخدمين والإدارات",
    descEn: "User and department activity levels",
    favorite: false,
    lastRun: "2026-01-24",
    schedule: "—",
    icon: "line",
  },
  {
    id: "rpt-4",
    name: "زمن إنجاز الموافقات",
    nameEn: "Approval Turnaround",
    category: "سير العمل",
    categoryEn: "Workflow",
    desc: "متوسط زمن إنجاز طلبات الموافقة",
    descEn: "Average approval turnaround time",
    favorite: true,
    lastRun: "2026-01-25",
    schedule: "أسبوعي",
    icon: "clock",
  },
  {
    id: "rpt-5",
    name: "توقعات الاحتفاظ والإتلاف",
    nameEn: "Retention Forecast",
    category: "الحوكمة",
    categoryEn: "Governance",
    desc: "تنبؤ بالوثائق المستحقة للمراجعة والإتلاف",
    descEn: "Forecast of documents due for review/disposal",
    favorite: false,
    lastRun: "2026-01-20",
    schedule: "شهري",
    icon: "calendar",
  },
  {
    id: "rpt-6",
    name: "الامتثال وسجل التدقيق",
    nameEn: "Compliance & Audit",
    category: "الامتثال",
    categoryEn: "Compliance",
    desc: "ملخص أحداث التدقيق ومؤشرات الامتثال",
    descEn: "Audit events and compliance indicators",
    favorite: false,
    lastRun: "2026-01-22",
    schedule: "شهري",
    icon: "shield",
  },
  {
    id: "rpt-7",
    name: "اتجاهات الأخطاء",
    nameEn: "Error Trends",
    category: "النظام",
    categoryEn: "System",
    desc: "اتجاهات الأخطاء التقنية وصحة النظام",
    descEn: "Technical error trends and system health",
    favorite: false,
    lastRun: "2026-01-27",
    schedule: "يومي",
    icon: "alert",
  },
  {
    id: "rpt-8",
    name: "سجل الحجوزات القانونية",
    nameEn: "Legal Holds Log",
    category: "الحوكمة",
    categoryEn: "Governance",
    desc: "سجل بجميع الحجوزات القانونية",
    descEn: "Log of all legal holds",
    favorite: false,
    lastRun: "2026-01-18",
    schedule: "—",
    icon: "gavel",
  },
];

@Injectable()
export class ReportTemplatesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.reportTemplate.count();
    if (count === 0) await this.prisma.reportTemplate.createMany({ data: DEFAULT_TEMPLATES });
  }

  async list() {
    const items = await this.prisma.reportTemplate.findMany({ orderBy: { id: "asc" } });
    return { items, meta: { total: items.length } };
  }

  async setFavorite(principal: Principal, id: string, favorite: boolean) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.reportTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Report template not found");
    const updated = await this.prisma.reportTemplate.update({ where: { id }, data: { favorite } });

    await this.audit.record({
      action: "report_template.favorite",
      entityType: "ReportTemplate",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { favorite },
    });

    return updated;
  }
}
