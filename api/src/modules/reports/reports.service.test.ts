import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ReportCadence } from "@prisma/client";
import { DownloadTicketService } from "../../common/download/download-ticket.service";
import { ReportsService } from "./reports.service";

interface ReportTableFixture {
  title: string;
  columns: string[];
  rows: string[][];
}

const table: ReportTableFixture = {
  title: "حجم الوثائق حسب الإدارة — 2026-10-29",
  columns: ["الإدارة", "الرمز", "الوثائق"],
  rows: [
    ["عقد & <صيانة>", "FIN", "12"],
    ["الموارد البشرية", "HR", "7"],
  ],
};

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

function buildService() {  return new ReportsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new DownloadTicketService({ get: () => undefined } as never, { downloadTicketUse: ticketLedger() } as never),
  );
}

describe("ReportsService exports", () => {
  it("emits a SpreadsheetML workbook with escaped values", () => {
    const xml = (buildService() as unknown as { toExcelXml(table: ReportTableFixture): string }).toExcelXml(table);

    expect(xml).toContain('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');
    expect(xml).toContain("FIN");
    expect(xml).toContain("&amp; &lt;");
    expect(xml).not.toContain("<صيانة>");
  });

  it("emits CSV with the report columns and quoted fields", () => {
    const csv = (buildService() as unknown as { toCsv(table: ReportTableFixture): string }).toCsv(table);

    expect(csv.startsWith('"الإدارة","الرمز","الوثائق"')).toBe(true);
    expect(csv).toContain('"HR"');
    expect(csv).toContain('"7"');
  });

  it("renders an RTL PDF with an embedded Arabic-capable font", async () => {
    const pdf = await (buildService() as unknown as { toPdf(table: ReportTableFixture): Promise<Buffer> }).toPdf(table);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("schedules the next run at the configured UTC time", () => {
    const service = buildService() as unknown as {
      nextRun(from: Date, cadence: ReportCadence, time?: string): Date;
    };

    expect(service.nextRun(new Date("2026-10-29T06:00:00.000Z"), ReportCadence.DAILY, "08:00").toISOString()).toBe(
      "2026-10-29T08:00:00.000Z",
    );
    expect(service.nextRun(new Date("2026-10-29T09:00:00.000Z"), ReportCadence.DAILY, "08:00").toISOString()).toBe(
      "2026-10-30T08:00:00.000Z",
    );
    expect(service.nextRun(new Date("2026-10-29T06:00:00.000Z"), ReportCadence.WEEKLY, "07:30").toISOString()).toBe(
      "2026-10-29T07:30:00.000Z",
    );
  });
});

const FINANCE = { id: "user-mgr", departmentId: "dept-finance", role: "DEPT_MANAGER" };
const AUDIT_ROLE = { id: "user-aud", departmentId: null, role: "AUDITOR" };

function scopedService(actor: { id: string; departmentId: string | null; role: string }) {
  const prisma = {
    reportSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "sch-1" }),
      delete: vi.fn().mockResolvedValue({ id: "sch-1" }),
    },
    reportRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn().mockImplementation((_data: unknown) => Promise.resolve({ id: "run-1" })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    reportTemplate: { findUnique: vi.fn().mockResolvedValue({ id: "rpt-2" }) },
    fileObject: {
      findUnique: vi.fn().mockResolvedValue({ id: "file-1", storageKey: "reports/2026/run-1.csv", originalName: "rpt-2-run-1.csv", sizeBytes: 2048n }),
      create: vi.fn().mockResolvedValue({ id: "file-9" }),
    },
    document: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    approvalInstance: { count: vi.fn().mockResolvedValue(0) },
    retentionItem: { count: vi.fn().mockResolvedValue(0) },
    legalHold: { count: vi.fn().mockResolvedValue(0) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    user: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    taskItem: { count: vi.fn().mockResolvedValue(0) },
    auditEvent: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    downloadTicketUse: ticketLedger(),
    $transaction: vi.fn().mockResolvedValue([[], 0]),
  };
  prisma.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (client: typeof prisma) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "AUDITOR" || actor.role === "SYSTEM_ADMIN"),
    documentVisibilityFilter: vi.fn().mockImplementation(async (candidate: { departmentId: string | null }) =>
      candidate.departmentId
        ? { OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null, departmentId: candidate.departmentId }] }
        : { OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null }] },
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const storage = {
    bucketName: "edas",
    presignExpiresSeconds: 900,
    presignDownload: vi.fn().mockResolvedValue("https://minio/report.csv"),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = { push: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    prisma as never,
    access as never,
    audit as never,
    storage as never,
    notifications as never,
    new DownloadTicketService({ get: () => undefined } as never, prisma as never),
  );
  return { service, prisma, audit, storage };
}

describe("ReportsService department scope", () => {
  it("hides schedules owned by another department but keeps organisation-wide ones", async () => {
    const { service, prisma } = scopedService(FINANCE);

    await service.listSchedules({ sub: "user-mgr" } as never);

    expect(prisma.reportSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ departmentId: "dept-finance" }, { departmentId: null }] } }),
    );
  });

  it("lets a global role list every schedule", async () => {
    const { service, prisma } = scopedService(AUDIT_ROLE);

    await service.listSchedules({ sub: "user-aud" } as never);

    expect(prisma.reportSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("restricts run lists to the requester's department or their own runs", async () => {
    const { service, prisma } = scopedService(FINANCE);

    await service.listRuns({ sub: "user-mgr" } as never, { page: 1, pageSize: 25 });

    expect(prisma.reportRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ departmentId: "dept-finance" }, { requestedById: "user-mgr" }] } }),
    );
    expect(prisma.reportRun.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ departmentId: "dept-finance" }, { requestedById: "user-mgr" }] } }),
    );
  });

  it("refuses to open a download URL for another department's report", async () => {
    const { service, prisma, storage, audit } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValue({
      id: "run-9",
      departmentId: "dept-legal",
      requestedById: "user-other",
      fileId: "file-1",
    });

    await expect(service.downloadRun({ sub: "user-mgr" } as never, "run-9")).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.presignDownload).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("serves a report whose content was built for the requester's department", async () => {
    const { service, prisma, storage, audit } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });

    await expect(service.downloadRun({ sub: "user-mgr" } as never, "run-9", { baseUrl: "https://edas.example" })).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringMatching(/^https:\/\/edas\.example\/api\/v1\/reports\/runs\/run-9\/content\?ticket=[A-Za-z0-9_-]{40,}$/),
        expiresInSeconds: 120,
      }),
    );
    expect(storage.presignDownload).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report.run.download", departmentId: "dept-finance", detail: expect.objectContaining({ mode: "proxy" }) }),
    );
  });

  it("still lets a manager download the legacy runs they requested themselves", async () => {
    const { service, prisma } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: null, requestedById: "user-mgr", fileId: "file-1" });

    await expect(service.downloadRun({ sub: "user-mgr" } as never, "run-9")).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringMatching(/^\/api\/v1\/reports\/runs\/run-9\/content\?ticket=[A-Za-z0-9_-]{40,}$/),
      }),
    );
  });

  it("rejects an unknown run before touching storage", async () => {
    const { service, storage } = scopedService(FINANCE);

    await expect(service.downloadRun({ sub: "user-mgr" } as never, "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });

  function ticketOf(url: string): string {
    return new URL(url, "http://localhost").searchParams.get("ticket") ?? "";
  }

  it("streams a report through a ticket and audits delivery once", async () => {
    const { service, prisma, audit } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });

    const { url } = await service.downloadRun({ sub: "user-mgr" } as never, "run-9");
    const ticket = ticketOf(url);

    await expect(service.openTicketDownload("run-9", ticket)).resolves.toEqual({
      key: "reports/2026/run-1.csv",
      contentType: "application/octet-stream",
      fileName: "rpt-2-run-1.csv",
      sizeBytes: 2048,
    });
    await service.openTicketDownload("run-9", ticket);

    const delivered = audit.record.mock.calls.filter(
      ([event]) => (event as { detail?: { delivered?: boolean } }).detail?.delivered === true,
    );
    expect(delivered).toHaveLength(1);
  });

  it("rejects an unknown or foreign report ticket without destroying a valid one", async () => {
    const { service, prisma } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });

    const { url } = await service.downloadRun({ sub: "user-mgr" } as never, "run-9");
    const ticket = ticketOf(url);

    await expect(service.openTicketDownload("run-9", undefined)).rejects.toThrow(/invalid or has expired/);
    await expect(service.openTicketDownload("run-9", "deadbeef")).rejects.toThrow(/invalid or has expired/);
    await expect(service.openTicketDownload("run-8", ticket)).rejects.toThrow(/invalid or has expired/);
    await expect(service.openTicketDownload("run-9", ticket)).resolves.toMatchObject({ key: "reports/2026/run-1.csv" });
  });

  it("re-checks the report scope when the ticket is used", async () => {
    const { service, prisma } = scopedService(FINANCE);
    prisma.reportRun.findUnique.mockResolvedValueOnce({ id: "run-9", departmentId: "dept-finance", requestedById: null, fileId: "file-1" });

    const { url } = await service.downloadRun({ sub: "user-mgr" } as never, "run-9");
    prisma.reportRun.findUnique.mockResolvedValue({ id: "run-9", departmentId: "dept-legal", requestedById: "user-other", fileId: "file-1" });

    await expect(service.openTicketDownload("run-9", ticketOf(url))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps organisation-wide schedules read-only for a department manager", async () => {
    const { service, prisma } = scopedService(FINANCE);
    prisma.reportSchedule.findUnique.mockResolvedValue({
      id: "sch-1",
      name: "Weekly",
      cadence: "WEEKLY",
      departmentId: null,
      filters: null,
    });

    await expect(service.updateSchedule({ sub: "user-mgr" } as never, "sch-1", { name: "Hijacked" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.reportSchedule.update).not.toHaveBeenCalled();
  });

  it("blocks editing a schedule that belongs to another department", async () => {
    const { service, prisma } = scopedService(FINANCE);
    prisma.reportSchedule.findUnique.mockResolvedValue({
      id: "sch-1",
      name: "Legal",
      cadence: "MONTHLY",
      departmentId: "dept-legal",
      filters: null,
    });

    await expect(service.deleteSchedule({ sub: "user-mgr" } as never, "sch-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reportSchedule.delete).not.toHaveBeenCalled();
  });

  it("drops only queued runs when a schedule is deleted and keeps the finished history", async () => {
    const { service, prisma, audit } = scopedService(FINANCE);
    prisma.reportSchedule.findUnique.mockResolvedValue({
      id: "sch-1",
      name: "Finance monthly",
      cadence: "MONTHLY",
      departmentId: FINANCE.departmentId,
      filters: null,
    });
    prisma.reportRun.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.deleteSchedule({ sub: "user-mgr" } as never, "sch-1");

    expect(prisma.reportRun.deleteMany).toHaveBeenCalledWith({ where: { scheduleId: "sch-1", status: "queued" } });
    expect(prisma.reportSchedule.delete).toHaveBeenCalledWith({ where: { id: "sch-1" } });
    expect(result).toEqual({ id: "sch-1", deleted: true, discardedRuns: 2 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ detail: { name: "Finance monthly", discardedRuns: 2 } }));
  });

  it("blocks running a schedule owned by another department", async () => {    const { service, prisma } = scopedService(FINANCE);
    prisma.reportSchedule.findUnique.mockResolvedValue({ id: "sch-1", reportType: "rpt-2", departmentId: "dept-legal", isActive: true });

    await expect(service.runSchedule({ sub: "user-mgr" } as never, "sch-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reportRun.create).not.toHaveBeenCalled();
  });

  it("stamps a manual run with the requesting department and builds it from that scope", async () => {
    const { service, prisma, storage } = scopedService(FINANCE);
    prisma.reportRun.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-7", ...args.data, scheduleId: null }),
    );

    const result = await service.createRun({ sub: "user-mgr" } as never, { reportType: "rpt-2", format: "csv" } as never);

    expect(prisma.reportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-finance" }) }),
    );
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ departmentId: "dept-finance" }) }),
    );
    expect(storage.put).toHaveBeenCalled();
    expect(prisma.reportRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fileId: "file-9" }) }));
    expect(result).toEqual(expect.objectContaining({ id: "run-1" }));
  });

  it("intersects the schedule department with the auditor's visible folders in an export", async () => {
    const { service, prisma } = scopedService(AUDIT_ROLE);
    prisma.reportSchedule.findUnique.mockResolvedValue({ id: "sch-1", departmentId: "dept-finance", recipients: [] });
    prisma.reportRun.create.mockResolvedValue({ id: "run-8", reportType: "rpt-2", format: "csv", scheduleId: "sch-1" });
    await service.createRun({ sub: "user-aud" } as never, { scheduleId: "sch-1", reportType: "rpt-2", format: "csv" });
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        departmentId: "dept-finance",
        AND: [{ OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null }] }],
      }),
    }));
  });

  it("scopes the open task counter to the requester like the task list does", async () => {
    const { service, prisma } = scopedService(FINANCE);

    await service.summary({ sub: "user-mgr" } as never);

    expect(prisma.taskItem.count).toHaveBeenCalledWith({
      where: { status: { not: "completed" }, OR: [{ assigneeId: "user-mgr" }, { createdById: "user-mgr" }] },
    });
  });

  it("counts every open task for a global role", async () => {
    const { service, prisma } = scopedService(AUDIT_ROLE);

    await service.summary({ sub: "user-aud" } as never);

    expect(prisma.taskItem.count).toHaveBeenCalledWith({ where: { status: { not: "completed" } } });
  });
});

describe("ReportsService scheduler claim", () => {
  function schedulerService(claimCount: number) {
    const due = {
      id: "sch-1",
      reportType: "rpt-1",
      cadence: ReportCadence.DAILY,
      filters: null,
      departmentId: "dept-1",
      nextRunAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    const tx = {
      reportSchedule: { updateMany: vi.fn().mockResolvedValue({ count: claimCount }) },
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
    const internals = service as unknown as { executeRunFor: () => Promise<void> };
    internals.executeRunFor = vi.fn().mockResolvedValue(undefined);
    return { service, tx, audit };
  }

  it("claims a due schedule exactly once with a compare-and-swap on nextRunAt", async () => {
    const { service, tx, audit } = schedulerService(1);

    await expect(service.runDueSchedules()).resolves.toBe(1);

    expect(tx.reportSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: "sch-1", isActive: true, nextRunAt: new Date("2026-11-01T00:00:00.000Z") },
      data: { nextRunAt: expect.any(Date) },
    });
    expect(tx.reportRun.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "report.run.create", entityId: "run-1" }));
  });

  it("skips a schedule another replica already claimed", async () => {
    const { service, tx, audit } = schedulerService(0);

    await expect(service.runDueSchedules()).resolves.toBe(0);

    expect(tx.reportSchedule.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.reportRun.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
