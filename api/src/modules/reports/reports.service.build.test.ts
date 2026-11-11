import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { NotificationLevel, ReportCadence } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DownloadTicketService } from "../../common/download/download-ticket.service";
import type { DepartmentMatch } from "../../common/access/access.service";
import { ReportsService } from "./reports.service";

interface ReportTableFixture {
  title: string;
  columns: string[];
  rows: string[][];
}

const MANAGER = { id: "user-mgr", departmentId: "dept-finance", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

function ticketLedger() {
  const used = new Set<string>();
  return {
    create: vi.fn((args: { data: { nonce: string } }) => {
      if (used.has(args.data.nonce)) return Promise.reject({ code: "P2002" });
      used.add(args.data.nonce);
      return Promise.resolve(args.data);
    }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

function build(actor: { id: string; departmentId: string | null; role: string } = MANAGER) {
  const prisma = {
    reportSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "sch-1", ...args.data })),
      update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "sch-1", ...args.data })),
      delete: vi.fn().mockResolvedValue({ id: "sch-1" }),
    },
    reportRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    reportTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "rpt-2" }) },
    fileObject: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "file-9" }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    document: {
      count: vi.fn().mockResolvedValue(5),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    approvalInstance: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    retentionItem: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    legalHold: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    user: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    taskItem: { count: vi.fn().mockResolvedValue(0) },
    downloadTicketUse: ticketLedger(),
  };
  let currentRun: Record<string, unknown> = { id: "run-9", reportType: "rpt-2", format: "pdf", scheduleId: null };
  prisma.reportRun.create.mockImplementation((args: { data: Record<string, unknown> }) => {
    currentRun = { ...currentRun, ...args.data, id: "run-9" };
    return Promise.resolve(currentRun);
  });
  prisma.reportRun.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...currentRun, ...args.data }));
  const transactional = prisma as unknown as { $transaction: unknown };
  transactional.$transaction = vi.fn(async (work: unknown) =>
    typeof work === "function" ? (work as (client: typeof prisma) => Promise<unknown>)(prisma) : Promise.all(work as Promise<unknown>[]),
  );

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN" || actor.role === "AUDITOR"),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const storage = { bucketName: "edas", put: vi.fn().mockResolvedValue(undefined) };
  const notifications = { push: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    prisma as never,
    access as never,
    audit as never,
    storage as never,
    notifications as never,
    new DownloadTicketService({ get: () => undefined } as never, prisma as never),
  );

  return { service, prisma, access, audit, storage, notifications };
}

type BuildReport = (reportType: string, departmentId: DepartmentMatch) => Promise<ReportTableFixture>;

function builder(service: ReportsService): BuildReport {
  return (service as unknown as { buildReport: BuildReport }).buildReport.bind(service);
}

function ticketOf(url: string): string {
  return new URL(url, "http://localhost").searchParams.get("ticket") ?? "";
}

describe("ReportsService schedule writes", () => {
  it("stamps a department schedule with the requesting department, defaults and the next UTC slot", async () => {
    const { service, prisma, audit } = build(MANAGER);

    const created = await service.createSchedule(
      { sub: "user-mgr" } as never,
      {
        name: "تقرير مالي",
        reportType: "rpt-2",
        cadence: ReportCadence.DAILY,
        filters: { time: "08:00" },
      } as never,
    );

    const data = prisma.reportSchedule.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ name: "تقرير مالي", departmentId: "dept-finance", recipients: [], isActive: true });
    const nextRunAt = data.nextRunAt as Date;
    expect([nextRunAt.getUTCHours(), nextRunAt.getUTCMinutes(), nextRunAt.getUTCSeconds()]).toEqual([8, 0, 0]);
    expect(created).toMatchObject({ id: "sch-1" });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report.schedule.create", entityId: "sch-1", departmentId: "dept-finance" }),
    );
  });

  it("keeps an organisation-wide schedule unowned for a global actor and honours recipients and isActive", async () => {
    const { service, prisma } = build(ADMIN);

    await service.createSchedule(
      { sub: "user-admin" } as never,
      {
        name: "Org weekly",
        reportType: "rpt-3",
        cadence: ReportCadence.WEEKLY,
        recipients: ["ops@edas.local"],
        isActive: false,
        filters: { format: "csv" },
      } as never,
    );

    const data = prisma.reportSchedule.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ departmentId: null, recipients: ["ops@edas.local"], isActive: false });
    const nextRunAt = data.nextRunAt as Date;
    expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an unknown report type before creating the schedule", async () => {
    const { service, prisma } = build(ADMIN);
    prisma.reportTemplate.findUnique.mockResolvedValue(null);

    await expect(
      service.createSchedule(
        { sub: "user-admin" } as never,
        {
          name: "Ghost",
          reportType: "rpt-ghost",
          cadence: ReportCadence.DAILY,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reportSchedule.create).not.toHaveBeenCalled();
  });

  it("recomputes nextRunAt from the new cadence and the retained time filter", async () => {
    const { service, prisma, audit } = build(MANAGER);
    prisma.reportSchedule.findUnique.mockResolvedValue({
      id: "sch-1",
      name: "Finance",
      cadence: ReportCadence.DAILY,
      departmentId: "dept-finance",
      filters: { time: "09:00" },
    });

    await service.updateSchedule({ sub: "user-mgr" } as never, "sch-1", { cadence: ReportCadence.MONTHLY } as never);

    const data = prisma.reportSchedule.update.mock.calls[0][0].data as Record<string, unknown>;
    const nextRunAt = data.nextRunAt as Date;
    expect([nextRunAt.getUTCHours(), nextRunAt.getUTCMinutes()]).toEqual([9, 0]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "report.schedule.update", entityId: "sch-1" }));
  });

  it("leaves nextRunAt alone when neither cadence nor filters change and validates a new report type", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.reportSchedule.findUnique.mockResolvedValue({
      id: "sch-1",
      name: "Finance",
      cadence: ReportCadence.DAILY,
      departmentId: "dept-finance",
      filters: null,
    });

    await service.updateSchedule({ sub: "user-mgr" } as never, "sch-1", { name: "Renamed" } as never);

    expect((prisma.reportSchedule.update.mock.calls[0][0].data as Record<string, unknown>).nextRunAt).toBeUndefined();

    prisma.reportTemplate.findUnique.mockResolvedValue(null);
    await expect(
      service.updateSchedule({ sub: "user-mgr" } as never, "sch-1", { reportType: "rpt-ghost" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports a missing schedule on update and delete", async () => {
    const { service } = build(MANAGER);

    await expect(service.updateSchedule({ sub: "user-mgr" } as never, "sch-ghost", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteSchedule({ sub: "user-mgr" } as never, "sch-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ReportsService schedule runs", () => {
  function managedSchedule(overrides: Record<string, unknown> = {}) {
    return {
      id: "sch-1",
      name: "Finance monthly",
      reportType: "rpt-2",
      cadence: ReportCadence.MONTHLY,
      departmentId: "dept-finance",
      isActive: true,
      filters: { format: "CSV" },
      recipients: [],
      ...overrides,
    };
  }

  it("reports a missing or inactive schedule before enqueuing a run", async () => {
    const missing = build(MANAGER);
    await expect(missing.service.runSchedule({ sub: "user-mgr" } as never, "sch-ghost")).rejects.toBeInstanceOf(NotFoundException);

    const inactive = build(MANAGER);
    inactive.prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule({ isActive: false }));
    await expect(inactive.service.runSchedule({ sub: "user-mgr" } as never, "sch-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(inactive.prisma.reportRun.create).not.toHaveBeenCalled();
  });

  it("enqueues the run in the schedule format and lower-cased extension, then completes it", async () => {
    const { service, prisma, audit, storage } = build(MANAGER);
    prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule());

    const completed = await service.runSchedule({ sub: "user-mgr" } as never, "sch-1");

    expect(prisma.reportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduleId: "sch-1", format: "csv", departmentId: "dept-finance", requestedById: "user-mgr" }),
      }),
    );
    expect(prisma.reportSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sch-1" }, data: expect.objectContaining({ nextRunAt: expect.any(Date) }) }),
    );
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^reports\/\d{4}\/run-9-[a-z0-9]{8}\.csv$/),
      expect.any(String),
      "text/csv; charset=utf-8",
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.run.create",
        detail: expect.objectContaining({ trigger: "schedule", scopeDepartmentId: "dept-finance" }),
      }),
    );
    expect(completed).toMatchObject({ id: "run-9", status: "completed", fileId: "file-9" });
  });

  it("keeps an organisation-wide schedule unscoped when a global actor runs it", async () => {
    const { service, prisma } = build(ADMIN);
    prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule({ departmentId: null }));

    await service.runSchedule({ sub: "user-admin" } as never, "sch-1");

    expect(prisma.reportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) }),
    );
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ departmentId: expect.anything() }) }),
    );
  });

  it("refuses a manual run for an unknown schedule or one from another department", async () => {
    const missing = build(MANAGER);
    await expect(
      missing.service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", scheduleId: "sch-ghost" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    const foreign = build(MANAGER);
    foreign.prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule({ departmentId: "dept-legal" }));
    await expect(
      foreign.service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", scheduleId: "sch-1" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(foreign.prisma.reportRun.create).not.toHaveBeenCalled();
  });

  it("defaults a manual run to PDF and keeps the schedule department for a global actor", async () => {
    const { service, prisma, storage } = build(ADMIN);
    prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule({ departmentId: "dept-legal" }));

    await service.createRun({ sub: "user-admin" } as never, { reportType: "rpt-2", scheduleId: "sch-1" } as never);

    expect(prisma.reportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ format: "pdf", departmentId: "dept-legal" }) }),
    );
    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), expect.any(Buffer), "application/pdf");
    expect(prisma.fileObject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalName: expect.stringMatching(/^rpt-2-run-9\.pdf$/) }) }),
    );
  });

  it("writes SpreadsheetML for the Excel formats", async () => {
    const { service, prisma, storage } = build(MANAGER);

    await service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", format: "XLSX" } as never);

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/\.xls$/),
      expect.stringContaining("<Workbook"),
      "application/vnd.ms-excel",
    );
    expect(prisma.reportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }),
    );
  });

  it("marks the run failed and rethrows when the report cannot be built", async () => {
    const { service, prisma } = build(MANAGER);

    await expect(service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-7", format: "csv" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.reportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed", completedAt: expect.any(Date) }) }),
    );
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("marks the run failed without throwing when storage rejects", async () => {
    const { service, prisma, storage } = build(MANAGER);
    storage.put.mockRejectedValue(new Error("bucket unavailable"));

    const result = await service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", format: "csv" } as never);

    expect(result).toMatchObject({ id: "run-9", status: "failed" });
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("notifies the schedule recipients in the requested format and skips invalid addresses", async () => {
    const { service, prisma, notifications } = build(MANAGER);
    prisma.reportSchedule.findUnique.mockResolvedValue(
      managedSchedule({ recipients: ["sara@edas.local", "not-an-email", "khaled@edas.local"] }),
    );
    prisma.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);

    await service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", scheduleId: "sch-1", format: "csv" } as never);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { in: ["sara@edas.local", "khaled@edas.local"] } },
      select: { id: true },
    });
    expect(notifications.push).toHaveBeenCalledTimes(2);
    expect(notifications.push).toHaveBeenCalledWith({
      userId: "u-1",
      title: "تقرير مجدول جاهز",
      message: "Finance monthly — CSV",
      level: NotificationLevel.SUCCESS,
      entityType: "ReportRun",
      entityId: "run-9",
    });
  });

  it("skips notifications without a schedule, a stored schedule or a usable address", async () => {
    const noScheduleId = build(MANAGER);
    await noScheduleId.service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", format: "csv" } as never);
    expect(noScheduleId.prisma.reportSchedule.findUnique).not.toHaveBeenCalled();

    const deletedSchedule = build(MANAGER);
    deletedSchedule.prisma.reportSchedule.findUnique.mockResolvedValueOnce(managedSchedule()).mockResolvedValueOnce(null);
    await deletedSchedule.service.createRun(
      { sub: "user-mgr" } as never,
      { reportType: "rpt-2", scheduleId: "sch-gone", format: "csv" } as never,
    );
    expect(deletedSchedule.prisma.user.findMany).not.toHaveBeenCalled();

    const invalidEmails = build(MANAGER);
    invalidEmails.prisma.reportSchedule.findUnique.mockResolvedValue(managedSchedule({ recipients: ["nope"] }));
    await invalidEmails.service.createRun(
      { sub: "user-mgr" } as never,
      { reportType: "rpt-2", scheduleId: "sch-1", format: "csv" } as never,
    );
    expect(invalidEmails.prisma.user.findMany).not.toHaveBeenCalled();
    expect(invalidEmails.notifications.push).not.toHaveBeenCalled();
  });

  it("keeps sweeping due schedules when one report fails to render", async () => {
    const due = {
      id: "sch-1",
      reportType: "rpt-1",
      cadence: ReportCadence.DAILY,
      filters: null,
      departmentId: "dept-1",
      nextRunAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    const tx = {
      reportSchedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reportRun: { create: vi.fn().mockResolvedValue({ id: "run-1" }) },
    };
    const prisma = {
      reportSchedule: { findMany: vi.fn().mockResolvedValue([due]) },
      $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new ReportsService(
      prisma as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      new DownloadTicketService({ get: () => undefined } as never, { downloadTicketUse: ticketLedger() } as never),
    );
    (service as unknown as { executeRunFor: () => Promise<void> }).executeRunFor = vi.fn().mockRejectedValue(new Error("render failed"));

    await expect(service.runDueSchedules()).resolves.toBe(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ trigger: "scheduler", scopeDepartmentId: "dept-1" }) }),
    );
  });
});

describe("ReportsService ticket error paths", () => {
  it("still rejects an invalid ticket when the audit trail is down", async () => {
    const { service, audit } = build(MANAGER);
    audit.record.mockRejectedValue(new Error("audit unavailable"));

    await expect(service.openTicketDownload("run-9", "deadbeef")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("still enforces the scope when the denial cannot be audited", async () => {
    const { service, prisma, audit } = build(MANAGER);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });
    prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-1",
      storageKey: "reports/2026/run-9.csv",
      originalName: "rpt-2-run-9.csv",
      sizeBytes: 1024n,
    });
    const { url } = await service.downloadRun({ sub: "user-mgr" } as never, "run-9");
    audit.record.mockRejectedValue(new Error("audit unavailable"));
    prisma.reportRun.findUnique.mockResolvedValue({
      id: "run-9",
      departmentId: "dept-legal",
      requestedById: "user-other",
      fileId: "file-1",
    });

    await expect(service.openTicketDownload("run-9", ticketOf(url))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("serves the content even when the delivery audit fails", async () => {
    const { service, prisma, audit } = build(MANAGER);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });
    prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-1",
      storageKey: "reports/2026/run-9.csv",
      originalName: "rpt-2-run-9.csv",
      sizeBytes: 1024n,
    });
    const { url } = await service.downloadRun({ sub: "user-mgr" } as never, "run-9");
    audit.record.mockRejectedValue(new Error("audit unavailable"));

    await expect(service.openTicketDownload("run-9", ticketOf(url))).resolves.toEqual({
      key: "reports/2026/run-9.csv",
      contentType: "application/octet-stream",
      fileName: "rpt-2-run-9.csv",
      sizeBytes: 1024,
    });
  });
});

describe("ReportsService report tables", () => {
  it("builds the department volume table and ignores groups without a matching department", async () => {
    const { service, prisma } = build(ADMIN);
    prisma.department.findMany.mockResolvedValue([
      { id: "dept-1", code: "FIN", name: "المالية" },
      { id: "dept-2", code: "HR", name: "الموارد البشرية" },
    ]);
    prisma.document.groupBy.mockImplementation((args: { where: { status?: string } }) =>
      Promise.resolve(
        args.where.status
          ? [{ departmentId: "dept-1", _count: { _all: 4 } }]
          : [
              { departmentId: "dept-1", _count: { _all: 10 }, _sum: { sizeBytes: 2048n } },
              { departmentId: null, _count: { _all: 2 }, _sum: { sizeBytes: null } },
            ],
      ),
    );

    const table = await builder(service)("rpt-1", undefined);

    expect(table.columns).toEqual(["الإدارة", "الرمز", "الوثائق", "المؤرشفة", "الحجم"]);
    expect(table.rows).toEqual([
      ["المالية", "FIN", "10", "4", "2.0 KB"],
      ["الموارد البشرية", "HR", "0", "0", "0 B"],
    ]);
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("scopes the department volume queries to one department", async () => {
    const { service, prisma } = build(ADMIN);

    await builder(service)("rpt-1", "dept-1");

    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "dept-1" } }));
    expect(prisma.document.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ departmentId: "dept-1" }) }),
    );
  });

  it("buckets storage usage by month and sorts the months", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.document.findMany.mockResolvedValue([
      { createdAt: new Date("2026-06-15T08:00:00.000Z"), sizeBytes: 1024n },
      { createdAt: new Date("2026-05-02T08:00:00.000Z"), sizeBytes: 2048n },
      { createdAt: new Date("2026-06-20T08:00:00.000Z"), sizeBytes: 0n },
    ]);

    const table = await builder(service)("rpt-2", "dept-finance");

    expect(table.rows).toEqual([
      ["2026-05", "1", "2.0 KB", "2.0 KB"],
      ["2026-06", "2", "1.0 KB", "512 B"],
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ departmentId: "dept-finance" }) }),
    );
  });

  it("names audit actors and falls back for unknown or anonymous actors", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.auditEvent.groupBy.mockResolvedValue([
      { actorId: "u-1", _count: { _all: 5 }, _max: { ts: new Date("2026-11-01T08:30:00.000Z") } },
      { actorId: "u-ghost", _count: { _all: 2 }, _max: { ts: null } },
      { actorId: null, _count: { _all: 1 }, _max: { ts: null } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "u-1", name: "سارة" }]);

    const table = await builder(service)("rpt-3", undefined);

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["u-1", "u-ghost"] } }, select: { id: true, name: true } });
    expect(table.rows).toEqual([
      ["سارة", "5", "2026-11-01 08:30"],
      ["مستخدم غير معروف", "2", "—"],
      ["مستخدم غير معروف", "1", "—"],
    ]);
  });

  it("skips the user lookup when the audit trail has no actors", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.auditEvent.groupBy.mockResolvedValue([{ actorId: null, _count: { _all: 1 }, _max: { ts: null } }]);

    await builder(service)("rpt-3", undefined);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("reports approval turnaround in hours and marks a missing chain", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.approvalInstance.findMany.mockResolvedValue([
      {
        startedAt: new Date("2026-11-01T06:00:00.000Z"),
        completedAt: new Date("2026-11-01T08:30:00.000Z"),
        document: { docNo: "DOC-1", title: "عقد" },
        chain: { name: "سلسلة المالية" },
      },
      {
        startedAt: new Date("2026-11-02T06:00:00.000Z"),
        completedAt: new Date("2026-11-02T07:00:00.000Z"),
        document: { docNo: "DOC-2", title: "محضر" },
        chain: null,
      },
    ]);

    const table = await builder(service)("rpt-4", "dept-finance");

    expect(prisma.approvalInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ document: { departmentId: "dept-finance" } }) }),
    );
    expect(table.rows).toEqual([
      ["DOC-1", "عقد", "سلسلة المالية", "2026-11-01 06:00", "2026-11-01 08:30", "2.5"],
      ["DOC-2", "محضر", "—", "2026-11-02 06:00", "2026-11-02 07:00", "1.0"],
    ]);
  });

  it("lists retention due dates with the remaining days", async () => {
    const { service, prisma } = build(MANAGER);
    const dueAt = new Date(Date.now() + 10 * 86_400_000);
    prisma.retentionItem.findMany.mockResolvedValue([
      {
        dueAt,
        action: "DESTROY",
        status: "scheduled",
        document: { docNo: "DOC-3", title: "فاتورة" },
        policy: { name: "سياسة المالية" },
      },
    ]);

    const table = await builder(service)("rpt-5", "dept-finance");

    expect(table.rows).toEqual([["DOC-3", "فاتورة", "سياسة المالية", "DESTROY", dueAt.toISOString().slice(0, 10), "10", "scheduled"]]);
  });

  it("renders the audit compliance table with dashes for missing values", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        ts: new Date("2026-11-03T09:15:00.000Z"),
        actorName: null,
        action: "document.update",
        entityType: "Document",
        result: "success",
        correlationId: null,
      },
    ]);

    const table = await builder(service)("rpt-6", undefined);

    expect(table.rows).toEqual([["2026-11-03 09:15", "—", "document.update", "Document", "success", "—"]]);
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("lists legal holds with the released date and document count", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.legalHold.findMany.mockResolvedValue([
      {
        caseNo: "CASE-1",
        reason: "نزاع",
        status: "ACTIVE",
        placedAt: new Date("2026-10-01T00:00:00.000Z"),
        releasedAt: null,
        _count: { documents: 3 },
      },
      {
        caseNo: "CASE-2",
        reason: "تحقيق",
        status: "RELEASED",
        placedAt: new Date("2026-09-01T00:00:00.000Z"),
        releasedAt: new Date("2026-09-20T00:00:00.000Z"),
        _count: { documents: 1 },
      },
    ]);

    const table = await builder(service)("rpt-8", undefined);

    expect(table.rows).toEqual([
      ["CASE-1", "نزاع", "ACTIVE", "2026-10-01", "—", "3"],
      ["CASE-2", "تحقيق", "RELEASED", "2026-09-01", "2026-09-20", "1"],
    ]);
    expect(prisma.legalHold.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("refuses the browser-only trend report and any unknown id", async () => {
    const { service } = build(MANAGER);

    await expect(builder(service)("rpt-7", undefined)).rejects.toThrow(/cannot be generated on the server/);
    await expect(builder(service)("rpt-unknown", undefined)).rejects.toThrow(/Unknown report type/);
  });

  it("formats byte sizes across all four units", () => {
    const formatBytes = (build(MANAGER).service as unknown as { formatBytes: (value: bigint | number) => string }).formatBytes.bind(
      build(MANAGER).service,
    );

    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2n * 1024n * 1024n * 1024n)).toBe("2.00 GB");
  });

  it("starts a new PDF page when the rows overflow the first one", async () => {
    const { service } = build(MANAGER);
    const toPdf = (service as unknown as { toPdf: (table: ReportTableFixture) => Promise<Buffer> }).toPdf.bind(service);
    const rows = Array.from({ length: 60 }, (_, index) => [`صف ${index}`, "FIN", String(index)]);

    const pdf = await toPdf({ title: "تقرير طويل", columns: ["الاسم", "الرمز", "العدد"], rows });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Type /Page");
  });
});

describe("ReportsService summary aggregation", () => {
  it("maps the grouped status and classification counts plus the six-month trend", async () => {
    const { service, prisma } = build(MANAGER);
    prisma.document.groupBy.mockImplementation((args: { by: string[] }) =>
      Promise.resolve(
        args.by[0] === "status"
          ? [
              { status: "DRAFT", _count: { _all: 3 } },
              { status: "ARCHIVED", _count: { _all: 2 } },
            ]
          : [{ classification: "PUBLIC", _count: { _all: 4 } }],
      ),
    );

    const result = await service.summary({ sub: "user-mgr" } as never);

    expect(result.documents).toEqual({
      total: 5,
      byStatus: { DRAFT: 3, ARCHIVED: 2 },
      byClassification: { PUBLIC: 4 },
    });
    expect(result.trend).toHaveLength(6);
    expect(result.trend.map((point) => point.month)).toEqual([...result.trend.map((point) => point.month)].sort());
    expect(result.trend[0]).toEqual({ month: expect.stringMatching(/^\d{4}-\d{2}$/), uploaded: 5, archived: 5 });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { departmentId: "dept-finance" } });
  });

  it("counts every user for a global role", async () => {
    const { service, prisma } = build(ADMIN);

    await service.summary({ sub: "user-admin" } as never);

    expect(prisma.user.count).toHaveBeenCalledWith(undefined);
    expect(prisma.document.count).toHaveBeenCalledWith({ where: {} });
  });
});

describe("ReportsService cadence", () => {
  function nextRun(from: Date, cadence: ReportCadence, time?: string) {
    const service = build(MANAGER).service as unknown as {
      nextRun(from: Date, cadence: ReportCadence, time?: string): Date;
    };
    return service.nextRun(from, cadence, time);
  }

  it("advances weekly, monthly and quarterly cadences without a time filter", () => {
    expect(nextRun(new Date("2026-10-29T09:00:00.000Z"), ReportCadence.WEEKLY).toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(nextRun(new Date("2026-02-10T10:00:00.000Z"), ReportCadence.MONTHLY).toISOString()).toBe("2026-03-10T10:00:00.000Z");
    expect(nextRun(new Date("2026-02-10T10:00:00.000Z"), ReportCadence.QUARTERLY).toISOString()).toBe("2026-05-10T10:00:00.000Z");
  });

  it("rolls the weekly slot to the next week when the time already passed", () => {
    expect(nextRun(new Date("2026-10-29T09:00:00.000Z"), ReportCadence.WEEKLY, "08:00").toISOString()).toBe("2026-11-05T08:00:00.000Z");
  });
});
