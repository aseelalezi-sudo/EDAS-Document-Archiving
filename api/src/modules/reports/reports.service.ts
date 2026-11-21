import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import PDFDocument from "pdfkit";
import { textBidi, type PdfKitDocLike } from "bidi-shaper/pdfkit";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentStatus, NotificationLevel, Prisma, ReportCadence, UserRole } from "@prisma/client";
import { API_PREFIX } from "@edas/shared";
import { AccessService, departmentMatch, type Actor, type DepartmentMatch } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { denialReason } from "../../common/access/denial-reason";
import { DOWNLOAD_TICKET_TTL_SECONDS, DownloadTicketService } from "../../common/download/download-ticket.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateReportScheduleDto } from "./dto/create-report-schedule.dto";
import { ListReportRunsQuery } from "./dto/list-report-runs.query";
import { RunReportDto } from "./dto/run-report.dto";
import { UpdateReportScheduleDto } from "./dto/update-report-schedule.dto";

interface ReportTable {
  title: string;
  columns: string[];
  rows: string[][];
}

const SYSTEM_ACTOR: Actor = { id: "", departmentId: null, role: UserRole.SYSTEM_ADMIN };
export interface ReportDownloadContent {
  key: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly tickets: DownloadTicketService,
  ) {}

  async listSchedules(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const items = await this.prisma.reportSchedule.findMany({
      where: this.access.isGlobal(actor) ? {} : { OR: [{ departmentId: actor.departmentId }, { departmentId: null }] },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { runs: true } } },
    });
    return { items, meta: { total: items.length } };
  }

  async createSchedule(principal: Principal, dto: CreateReportScheduleDto) {
    const actor = await this.access.resolveActor(principal);
    await this.assertReportType(dto.reportType);
    const filters = dto.filters as { time?: string; format?: string } | undefined;
    const schedule = await this.prisma.reportSchedule.create({
      data: {
        name: dto.name,
        reportType: dto.reportType,
        cadence: dto.cadence,
        recipients: dto.recipients ?? [],
        filters: dto.filters as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive ?? true,
        departmentId: this.access.isGlobal(actor) ? null : actor.departmentId,
        nextRunAt: this.nextRun(new Date(), dto.cadence, filters?.time),
      },
    });

    await this.audit.record({
      action: "report.schedule.create",
      entityType: "ReportSchedule",
      entityId: schedule.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: schedule.name, cadence: schedule.cadence, reportType: schedule.reportType },
    });

    return schedule;
  }

  async updateSchedule(principal: Principal, id: string, dto: UpdateReportScheduleDto) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.reportSchedule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Report schedule not found");
    this.assertScheduleWritable(actor, existing);
    if (dto.reportType) await this.assertReportType(dto.reportType);
    const filters = (dto.filters ?? existing.filters) as { time?: string; format?: string } | null;

    const updated = await this.prisma.reportSchedule.update({
      where: { id },
      data: {
        name: dto.name,
        reportType: dto.reportType,
        cadence: dto.cadence,
        recipients: dto.recipients,
        filters: dto.filters as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
        nextRunAt: dto.cadence || dto.filters ? this.nextRun(new Date(), dto.cadence ?? existing.cadence, filters?.time) : undefined,
      },
    });

    await this.audit.record({
      action: "report.schedule.update",
      entityType: "ReportSchedule",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: dto.name, reportType: dto.reportType, cadence: dto.cadence, isActive: dto.isActive },
    });

    return updated;
  }

  async deleteSchedule(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const existing = await this.prisma.reportSchedule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Report schedule not found");
    this.assertScheduleWritable(actor, existing);

    const discardedRuns = await this.prisma.$transaction(async (tx) => {
      const queued = await tx.reportRun.deleteMany({ where: { scheduleId: id, status: "queued" } });
      await tx.reportSchedule.delete({ where: { id } });
      return queued.count;
    });

    await this.audit.record({
      action: "report.schedule.delete",
      entityType: "ReportSchedule",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: existing.name, discardedRuns },
    });

    return { id, deleted: true, discardedRuns };
  }

  async runSchedule(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const schedule = await this.prisma.reportSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException("Report schedule not found");
    this.assertScheduleRunnable(actor, schedule);
    if (!schedule.isActive) throw new BadRequestException("Report schedule is inactive");
    const filters = schedule.filters as { time?: string; format?: string } | null;
    const contentDepartmentId = this.runDepartmentId(actor, schedule.departmentId);

    const [run] = await this.prisma.$transaction([
      this.prisma.reportRun.create({
        data: {
          scheduleId: id,
          reportType: schedule.reportType,
          format: filters?.format?.toLowerCase() ?? "pdf",
          status: "queued",
          requestedById: actor.id || null,
          departmentId: contentDepartmentId,
        },
      }),
      this.prisma.reportSchedule.update({
        where: { id },
        data: { nextRunAt: this.nextRun(new Date(), schedule.cadence, filters?.time) },
      }),
    ]);

    await this.audit.record({
      action: "report.run.create",
      entityType: "ReportRun",
      entityId: run.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { scheduleId: id, reportType: schedule.reportType, trigger: "schedule", scopeDepartmentId: contentDepartmentId },
    });

    return this.executeRun(principal, run, contentDepartmentId);
  }

  async runDueSchedules(): Promise<number> {
    const due = await this.prisma.reportSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: new Date() } },
      orderBy: { nextRunAt: "asc" },
      take: 20,
    });

    let claimed = 0;
    for (const schedule of due) {
      const filters = schedule.filters as { time?: string; format?: string } | null;
      const contentDepartmentId = schedule.departmentId ?? null;
      const nextRunAt = this.nextRun(new Date(), schedule.cadence, filters?.time);
      // Compare-and-swap on nextRunAt: only the replica that moves the schedule forward owns this run,
      // so horizontal replicas sweeping the same due row never enqueue duplicate reports.
      const run = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.reportSchedule.updateMany({
          where: { id: schedule.id, isActive: true, nextRunAt: schedule.nextRunAt },
          data: { nextRunAt },
        });
        if (claim.count === 0) return null;
        return tx.reportRun.create({
          data: {
            scheduleId: schedule.id,
            reportType: schedule.reportType,
            format: filters?.format?.toLowerCase() ?? "pdf",
            status: "queued",
            departmentId: contentDepartmentId,
          },
        });
      });
      if (!run) continue;
      claimed += 1;
      await this.audit.record({
        action: "report.run.create",
        entityType: "ReportRun",
        entityId: run.id,
        actorId: null,
        departmentId: contentDepartmentId,
        detail: { scheduleId: schedule.id, reportType: schedule.reportType, trigger: "scheduler", scopeDepartmentId: contentDepartmentId },
      });
      await this.executeRunFor(SYSTEM_ACTOR, run, contentDepartmentId).catch(() => undefined);
    }

    return claimed;
  }

  async createRun(principal: Principal, dto: RunReportDto) {
    const actor = await this.access.resolveActor(principal);
    await this.assertReportType(dto.reportType);
    let scheduleDepartmentId: string | null = null;
    if (dto.scheduleId) {
      const schedule = await this.prisma.reportSchedule.findUnique({ where: { id: dto.scheduleId } });
      if (!schedule) throw new BadRequestException("Report schedule not found");
      this.assertScheduleRunnable(actor, schedule);
      scheduleDepartmentId = schedule.departmentId;
    }
    const contentDepartmentId = this.runDepartmentId(actor, scheduleDepartmentId);

    const run = await this.prisma.reportRun.create({
      data: {
        scheduleId: dto.scheduleId,
        reportType: dto.reportType,
        format: dto.format ?? "pdf",
        status: "queued",
        requestedById: actor.id || null,
        departmentId: contentDepartmentId,
      },
    });

    await this.audit.record({
      action: "report.run.create",
      entityType: "ReportRun",
      entityId: run.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { reportType: run.reportType, format: run.format, trigger: "manual", scopeDepartmentId: contentDepartmentId },
    });

    return this.executeRun(principal, run, contentDepartmentId);
  }

  async listRuns(principal: Principal, query: ListReportRunsQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ReportRunWhereInput = {};
    if (query.reportType) where.reportType = query.reportType;
    if (query.status) where.status = query.status;
    if (!this.access.isGlobal(actor)) {
      where.OR = [{ departmentId: actor.departmentId }, { requestedById: actor.id }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reportRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { schedule: { select: { id: true, name: true } } },
      }),
      this.prisma.reportRun.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async summary(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const global = this.access.isGlobal(actor);
    const departmentId = global ? undefined : departmentMatch(actor.departmentId);
    const documentWhere = await this.access.documentVisibilityFilter(actor);
    const documentScope = { document: documentWhere };

    const [documents, byStatus, byClassification, pendingApprovals, overdueRetention, activeHolds, users, openTasks] = await Promise.all([
      this.prisma.document.count({ where: documentWhere }),
      this.prisma.document.groupBy({ by: ["status"], where: documentWhere, _count: { _all: true } }),
      this.prisma.document.groupBy({ by: ["classification"], where: documentWhere, _count: { _all: true } }),
      this.prisma.approvalInstance.count({
        where: {
          status: "PENDING",
          ...documentScope,
        },
      }),
      this.prisma.retentionItem.count({
        where: {
          status: "scheduled",
          dueAt: { lte: new Date() },
          ...documentScope,
        },
      }),
      this.prisma.legalHold.count({
        where: {
          status: "ACTIVE",
          documents: { some: documentScope },
        },
      }),
      this.prisma.user.count(departmentId ? { where: { departmentId } } : undefined),
      this.prisma.taskItem.count({
        where: {
          status: { not: "completed" },
          ...(global ? {} : { OR: [{ assigneeId: actor.id }, { createdById: actor.id }] }),
        },
      }),
    ]);

    const toRecord = (groups: { status?: DocumentStatus; classification?: string; _count: { _all: number } }[]) =>
      groups.reduce<Record<string, number>>((acc, group) => {
        const key = (group.status ?? group.classification ?? "UNKNOWN") as string;
        acc[key] = group._count._all;
        return acc;
      }, {});

    const now = new Date();
    const monthStart = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const months = Array.from({ length: 6 }, (_, index) => ({ start: monthStart(index - 5), end: monthStart(index - 4) }));
    const [trendUploaded, trendArchived] = await Promise.all([
      Promise.all(
        months.map((month) => this.prisma.document.count({ where: { ...documentWhere, createdAt: { gte: month.start, lt: month.end } } })),
      ),
      Promise.all(
        months.map((month) =>
          this.prisma.document.count({
            where: { ...documentWhere, status: DocumentStatus.ARCHIVED, updatedAt: { gte: month.start, lt: month.end } },
          }),
        ),
      ),
    ]);
    const trend = months.map((month, index) => ({
      month: month.start.toISOString().slice(0, 7),
      uploaded: trendUploaded[index],
      archived: trendArchived[index],
    }));

    return {
      documents: { total: documents, byStatus: toRecord(byStatus), byClassification: toRecord(byClassification) },
      approvals: { pending: pendingApprovals },
      retention: { overdue: overdueRetention },
      legalHolds: { active: activeHolds },
      users: { total: users },
      tasks: { open: openTasks },
      trend,
    };
  }

  async downloadRun(principal: Principal, id: string, options: { baseUrl?: string } = {}) {
    const actor = await this.access.resolveActor(principal);
    const { file } = await this.authorizedRun(actor, id);

    const ticket = this.tickets.issue("report", id, principal.sub);
    const path = `${API_PREFIX}/reports/runs/${encodeURIComponent(id)}/content?ticket=${ticket}`;
    const base = (options.baseUrl ?? "").replace(/\/+$/, "");
    await this.audit.record({
      action: "report.run.download",
      entityType: "ReportRun",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { fileName: file.originalName, mode: "proxy" },
    });
    return { url: `${base}${path}`, fileName: file.originalName, expiresInSeconds: DOWNLOAD_TICKET_TTL_SECONDS };
  }

  /** Re-checks the report scope when the link is opened, so a ticket cannot outlive the requester's access. */
  async openTicketDownload(id: string, ticket: string | undefined): Promise<ReportDownloadContent> {
    const grant = this.tickets.verify("report", id, ticket);
    if (!grant) {
      await this.audit
        .record({
          action: "report.run.download",
          entityType: "ReportRun",
          entityId: id,
          actorId: null,
          result: "failure",
          detail: { reason: "invalid_ticket" },
        })
        .catch(() => undefined);
      throw new ForbiddenException("This download link is invalid or has expired");
    }

    try {
      const actor = await this.access.resolveActor({ sub: grant.sub } as Principal);
      const { file } = await this.authorizedRun(actor, id);
      const content: ReportDownloadContent = {
        key: file.storageKey,
        contentType: "application/octet-stream",
        fileName: basename(file.originalName),
        sizeBytes: Number(file.sizeBytes),
      };

      if (await this.tickets.firstDelivery(grant)) {
        await this.audit
          .record({
            action: "report.run.download",
            entityType: "ReportRun",
            entityId: id,
            actorId: actor.id || null,
            departmentId: actor.departmentId,
            detail: { delivered: true, fileName: content.fileName },
          })
          .catch(() => undefined);
      }
      return content;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.audit
          .record({
            action: "report.run.download",
            entityType: "ReportRun",
            entityId: id,
            actorId: grant.sub,
            result: "failure",
            detail: { reason: denialReason(error) },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async authorizedRun(actor: Actor, id: string) {
    const run = await this.prisma.reportRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Report run not found");
    if (!this.access.isGlobal(actor) && run.departmentId !== actor.departmentId && run.requestedById !== actor.id) {
      throw new ForbiddenException("This report was generated for another department");
    }
    if (!run.fileId) throw new NotFoundException("Report file is not ready");
    const file = await this.prisma.fileObject.findUnique({ where: { id: run.fileId } });
    if (!file) throw new NotFoundException("Report file is not ready");
    return { run, file };
  }

  private async assertReportType(reportType: string) {
    const template = await this.prisma.reportTemplate.findUnique({ where: { id: reportType }, select: { id: true } });
    if (!template) throw new BadRequestException("Unknown report type");
  }

  private runDepartmentId(actor: Actor, scheduleDepartmentId?: string | null): string | null {
    return this.access.isGlobal(actor) ? (scheduleDepartmentId ?? null) : actor.departmentId;
  }

  private assertScheduleWritable(actor: Actor, schedule: { departmentId: string | null }) {
    if (this.access.isGlobal(actor)) return;
    if (schedule.departmentId === actor.departmentId) return;
    throw new ForbiddenException(
      schedule.departmentId
        ? "This report schedule belongs to another department"
        : "Only a system administrator can change organisation-wide report schedules",
    );
  }

  private assertScheduleRunnable(actor: Actor, schedule: { departmentId: string | null }) {
    if (this.access.isGlobal(actor)) return;
    if (!schedule.departmentId || schedule.departmentId === actor.departmentId) return;
    throw new ForbiddenException("This report schedule belongs to another department");
  }

  private async executeRun(
    principal: Principal,
    run: { id: string; reportType: string; format: string; scheduleId?: string | null },
    contentDepartmentId: string | null,
  ) {
    const actor = await this.access.resolveActor(principal);
    return this.executeRunFor(actor, run, contentDepartmentId);
  }

  private async executeRunFor(
    actor: Actor,
    run: { id: string; reportType: string; format: string; scheduleId?: string | null },
    contentDepartmentId: string | null,
  ) {
    const departmentId: DepartmentMatch =
      contentDepartmentId ?? (this.access.isGlobal(actor) ? undefined : departmentMatch(actor.departmentId));
    let table: ReportTable;
    try {
      const visibility = await this.access.documentVisibilityFilter(actor);
      table = await this.buildReport(run.reportType, departmentId, visibility);
    } catch (error) {
      await this.prisma.reportRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date() } });
      throw error;
    }

    const format = run.format.toLowerCase();
    const pdf = format === "pdf";
    const excel = ["excel", "xlsx", "xls"].includes(format);
    const extension = pdf ? "pdf" : excel ? "xls" : "csv";
    const mimeType = pdf ? "application/pdf" : excel ? "application/vnd.ms-excel" : "text/csv; charset=utf-8";
    const storageKey = `reports/${new Date().getUTCFullYear()}/${run.id}-${randomUUID().slice(0, 8)}.${extension}`;
    const fileName = `${run.reportType}-${run.id.slice(0, 8)}.${extension}`;
    const body = pdf ? await this.toPdf(table) : excel ? this.toExcelXml(table) : `\uFEFF${this.toCsv(table)}`;

    try {
      await this.storage.put(storageKey, body, mimeType);
      const file = await this.prisma.fileObject.create({
        data: {
          bucket: this.storage.bucketName,
          storageKey,
          originalName: fileName,
          mimeType,
          sizeBytes: BigInt(Buffer.byteLength(body)),
          checksumSha256: createHash("sha256").update(body).digest("hex"),
          uploadedById: actor.id || null,
        },
      });
      const completed = await this.prisma.reportRun.update({
        where: { id: run.id },
        data: { status: "completed", fileId: file.id, completedAt: new Date() },
      });
      await this.audit.record({
        action: "report.run.complete",
        entityType: "ReportRun",
        entityId: run.id,
        actorId: actor.id || null,
        departmentId: actor.departmentId,
        detail: { fileName, rows: table.rows.length },
      });
      await this.notifyRecipients(run.scheduleId, completed).catch(() => undefined);
      return completed;
    } catch {
      return this.prisma.reportRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date() } });
    }
  }

  private async notifyRecipients(
    scheduleId: string | null | undefined,
    run: { id: string; reportType: string; format: string },
  ): Promise<void> {
    if (!scheduleId) return;
    const schedule = await this.prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
      select: { name: true, recipients: true },
    });
    if (!schedule) return;
    const emails = schedule.recipients.filter((email) => email.includes("@"));
    if (emails.length === 0) return;
    const users = await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    await Promise.all(
      users.map((user) =>
        this.notifications.push({
          userId: user.id,
          title: "تقرير مجدول جاهز",
          message: `${schedule.name} — ${run.format.toUpperCase()}`,
          level: NotificationLevel.SUCCESS,
          entityType: "ReportRun",
          entityId: run.id,
        }),
      ),
    );
  }

  private async buildReport(
    reportType: string,
    departmentId: DepartmentMatch,
    visibility?: Prisma.DocumentWhereInput,
  ): Promise<ReportTable> {
    const documentWhere: Prisma.DocumentWhereInput = {
      ...(departmentId ? { departmentId } : {}),
      ...(visibility ? { AND: [visibility] } : {}),
    };
    const auditWhere: Prisma.AuditEventWhereInput = departmentId ? { departmentId } : {};
    const hasDocumentScope = Object.keys(documentWhere).length > 0;

    switch (reportType) {
      case "rpt-1": {
        const [departments, totals, archived] = await Promise.all([
          this.prisma.department.findMany({
            where: departmentId ? { id: departmentId } : {},
            orderBy: { name: "asc" },
            select: { id: true, code: true, name: true },
          }),
          this.prisma.document.groupBy({
            by: ["departmentId"],
            where: documentWhere,
            _count: { _all: true },
            _sum: { sizeBytes: true },
          }),
          this.prisma.document.groupBy({
            by: ["departmentId"],
            where: { ...documentWhere, status: DocumentStatus.ARCHIVED },
            _count: { _all: true },
          }),
        ]);
        const totalByDept = new Map(totals.map((row) => [row.departmentId ?? "", row]));
        const archivedByDept = new Map(archived.map((row) => [row.departmentId ?? "", row._count._all]));
        const rows = departments.map((department) => {
          const total = totalByDept.get(department.id);
          return [
            department.name,
            department.code,
            String(total?._count._all ?? 0),
            String(archivedByDept.get(department.id) ?? 0),
            this.formatBytes(total?._sum.sizeBytes ?? BigInt(0)),
          ];
        });
        return { title: `حجم الوثائق حسب الإدارة — ${this.today()}`, columns: ["الإدارة", "الرمز", "الوثائق", "المؤرشفة", "الحجم"], rows };
      }
      case "rpt-2": {
        const now = new Date();
        const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
        const documents = await this.prisma.document.findMany({
          where: { ...documentWhere, createdAt: { gte: from } },
          select: { createdAt: true, sizeBytes: true },
        });
        const buckets = new Map<string, { count: number; bytes: number }>();
        for (const document of documents) {
          const key = document.createdAt.toISOString().slice(0, 7);
          const bucket = buckets.get(key) ?? { count: 0, bytes: 0 };
          bucket.count += 1;
          bucket.bytes += Number(document.sizeBytes);
          buckets.set(key, bucket);
        }
        const rows = [...buckets.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, bucket]) => [
            month,
            String(bucket.count),
            this.formatBytes(bucket.bytes),
            this.formatBytes(bucket.count ? Math.round(bucket.bytes / bucket.count) : 0),
          ]);
        return { title: `استخدام التخزين — ${this.today()}`, columns: ["الشهر", "الوثائق", "الحجم", "متوسط الوثيقة"], rows };
      }
      case "rpt-3": {
        const grouped = await this.prisma.auditEvent.groupBy({
          by: ["actorId"],
          where: auditWhere,
          _count: { _all: true },
          _max: { ts: true },
          orderBy: { _count: { actorId: "desc" } },
          take: 200,
        });
        const actorIds = grouped.map((row) => row.actorId).filter((id): id is string => Boolean(id));
        const users = actorIds.length
          ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
          : [];
        const names = new Map(users.map((user) => [user.id, user.name]));
        const rows = grouped.map((row) => [
          (row.actorId && names.get(row.actorId)) || "مستخدم غير معروف",
          String(row._count._all),
          row._max.ts ? row._max.ts.toISOString().slice(0, 16).replace("T", " ") : "—",
        ]);
        return { title: `نشاط المستخدمين — ${this.today()}`, columns: ["المستخدم", "الأحداث", "آخر نشاط"], rows };
      }
      case "rpt-4": {
        const instances = await this.prisma.approvalInstance.findMany({
          where: { completedAt: { not: null }, ...(hasDocumentScope ? { document: documentWhere } : {}) },
          orderBy: { completedAt: "desc" },
          take: 2000,
          select: {
            startedAt: true,
            completedAt: true,
            document: { select: { docNo: true, title: true } },
            chain: { select: { name: true } },
          },
        });
        const hours = (start: Date, end: Date) => ((end.getTime() - start.getTime()) / 3600000).toFixed(1);
        const rows = instances
          .filter((instance): instance is typeof instance & { completedAt: Date } => Boolean(instance.completedAt))
          .map((instance) => [
            instance.document.docNo,
            instance.document.title,
            instance.chain?.name ?? "—",
            instance.startedAt.toISOString().slice(0, 16).replace("T", " "),
            instance.completedAt.toISOString().slice(0, 16).replace("T", " "),
            hours(instance.startedAt, instance.completedAt),
          ]);
        return {
          title: `زمن إنجاز الموافقات — ${this.today()}`,
          columns: ["رقم الوثيقة", "العنوان", "سلسلة الموافقة", "البدء", "الإنجاز", "الساعات"],
          rows,
        };
      }
      case "rpt-5": {
        const items = await this.prisma.retentionItem.findMany({
          where: hasDocumentScope ? { document: documentWhere } : {},
          orderBy: { dueAt: "asc" },
          take: 2000,
          select: {
            dueAt: true,
            action: true,
            status: true,
            document: { select: { docNo: true, title: true } },
            policy: { select: { name: true } },
          },
        });
        const now = Date.now();
        const rows = items.map((item) => [
          item.document.docNo,
          item.document.title,
          item.policy.name,
          item.action,
          item.dueAt.toISOString().slice(0, 10),
          String(Math.ceil((item.dueAt.getTime() - now) / 86400000)),
          item.status,
        ]);
        return {
          title: `توقعات الاحتفاظ والإتلاف — ${this.today()}`,
          columns: ["رقم الوثيقة", "العنوان", "السياسة", "الإجراء", "الاستحقاق", "الأيام المتبقية", "الحالة"],
          rows,
        };
      }
      case "rpt-6": {
        const events = await this.prisma.auditEvent.findMany({
          where: auditWhere,
          orderBy: { ts: "desc" },
          take: 2000,
          select: { ts: true, actorName: true, action: true, entityType: true, result: true, correlationId: true },
        });
        const rows = events.map((event) => [
          event.ts.toISOString().slice(0, 16).replace("T", " "),
          event.actorName ?? "—",
          event.action,
          event.entityType,
          event.result,
          event.correlationId ?? "—",
        ]);
        return {
          title: `الامتثال وسجل التدقيق — ${this.today()}`,
          columns: ["الوقت", "المستخدم", "العملية", "الكيان", "النتيجة", "الترابط"],
          rows,
        };
      }
      case "rpt-7":
        throw new BadRequestException("Error trends are recorded in the browser and cannot be generated on the server");
      case "rpt-8": {
        const holds = await this.prisma.legalHold.findMany({
          where: hasDocumentScope ? { documents: { some: { document: documentWhere } } } : {},
          orderBy: { placedAt: "desc" },
          take: 2000,
          select: {
            caseNo: true,
            reason: true,
            status: true,
            placedAt: true,
            releasedAt: true,
            _count: { select: { documents: { where: { document: documentWhere } } } },
          },
        });
        const rows = holds.map((hold) => [
          hold.caseNo,
          hold.reason,
          hold.status,
          hold.placedAt.toISOString().slice(0, 10),
          hold.releasedAt ? hold.releasedAt.toISOString().slice(0, 10) : "—",
          String(hold._count.documents),
        ]);
        return {
          title: `سجل الحجوزات القانونية — ${this.today()}`,
          columns: ["رقم القضية", "السبب", "الحالة", "تاريخ الحجز", "تاريخ الإفراج", "الوثائق"],
          rows,
        };
      }
      default:
        throw new BadRequestException("Unknown report type");
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private formatBytes(value: bigint | number): string {
    const bytes = Number(value);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private toCsv(table: ReportTable) {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    return [table.columns, ...table.rows].map((row) => row.map(escape).join(",")).join("\r\n");
  }

  private async toPdf(table: ReportTable): Promise<Buffer> {
    const fontPath = [
      join(__dirname, "..", "..", "..", "assets", "Amiri-Regular.ttf"),
      join(process.cwd(), "assets", "Amiri-Regular.ttf"),
    ].find((candidate) => existsSync(candidate));
    if (!fontPath) throw new Error("PDF font asset is missing");

    const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    doc.registerFont("arabic", fontPath);
    doc.font("arabic");
    const bidiDoc = doc as unknown as PdfKitDocLike;

    const left = 40;
    const right = 555;
    const cellHeight = 18;
    const columnWidth = Math.floor((right - left) / Math.max(1, table.columns.length));

    const writeRow = (values: string[], y: number, header = false) => {
      if (header) {
        doc.rect(left, y - 3, right - left, cellHeight).fill("#1e293b");
        doc.fillColor("#ffffff").fontSize(8);
      } else {
        doc.fillColor("#111827").fontSize(7.5);
      }
      let x = right;
      table.columns.forEach((_, index) => {
        x -= columnWidth;
        textBidi(bidiDoc, values[index] ?? "", x + 2, y, {
          width: columnWidth - 4,
          align: "right",
          lineBreak: false,
          ellipsis: true,
        });
      });
      if (!header) doc.rect(left, y + cellHeight - 5, right - left, 0.4).fill("#e5e7eb");
    };

    doc.fillColor("#111827").fontSize(15);
    textBidi(bidiDoc, table.title, { align: "right" });
    doc.moveDown(0.4);
    doc.fillColor("#6b7280").fontSize(9);
    textBidi(bidiDoc, `تاريخ الإنشاء: ${this.today()} · الصفوف: ${table.rows.length}`, { align: "right" });
    doc.moveDown(0.6);
    let y = doc.y + 6;
    writeRow(table.columns, y, true);
    y += cellHeight + 4;
    for (const row of table.rows.slice(0, 2000)) {
      if (y > 780) {
        doc.addPage();
        y = 50;
        writeRow(table.columns, y, true);
        y += cellHeight + 4;
      }
      writeRow(row, y);
      y += cellHeight;
    }
    doc.fillColor("#6b7280").fontSize(8);
    textBidi(bidiDoc, `إجمالي الصفوف: ${table.rows.length}`, left, 800, { width: right - left, align: "left" });
    doc.end();
    return finished;
  }

  private toExcelXml(table: ReportTable) {
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const cell = (value: string, style = "") =>
      `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="String">${escape(value)}</Data></Cell>`;
    const row = (values: string[], style = "") => `<Row>${values.map((value) => cell(value, style)).join("")}</Row>`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?mso-application progid="Excel.Sheet"?>',
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
      '<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>',
      '<Worksheet ss:Name="Report"><Table>',
      row(table.columns, "header"),
      ...table.rows.map((values) => row(values)),
      "</Table></Worksheet></Workbook>",
    ].join("");
  }

  private nextRun(from: Date, cadence: ReportCadence, time?: string): Date {
    const next = new Date(from);
    const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
    if (match) next.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);

    const advance = () => {
      switch (cadence) {
        case ReportCadence.DAILY:
          next.setUTCDate(next.getUTCDate() + 1);
          break;
        case ReportCadence.WEEKLY:
          next.setUTCDate(next.getUTCDate() + 7);
          break;
        case ReportCadence.MONTHLY:
          next.setUTCMonth(next.getUTCMonth() + 1);
          break;
        case ReportCadence.QUARTERLY:
          next.setUTCMonth(next.getUTCMonth() + 3);
          break;
      }
    };

    if (match && next <= from) advance();
    else if (!match) advance();
    return next;
  }
}
