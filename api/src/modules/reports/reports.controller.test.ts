import { Readable, Writable } from "node:stream";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../common/storage/storage.service";
import type { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";

const PRINCIPAL = { sub: "user-1", role: "DEPT_MANAGER" };

function fakeResponse() {
  const chunks: Buffer[] = [];
  const response = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  const status = vi.fn();
  const setHeader = vi.fn();
  const target = Object.assign(response, { status, setHeader, headersSent: false, chunks });
  status.mockReturnValue(target);
  return target;
}

function fakeRequest(host = "api.example", headers: Record<string, string> = {}): Request {
  return { headers, protocol: "http", get: (name: string) => (name === "host" ? host : undefined) } as unknown as Request;
}

function build(options: { publicUrl?: string } = {}) {
  const reports = {
    summary: vi.fn().mockResolvedValue({ documents: { total: 1 } }),
    listSchedules: vi.fn().mockResolvedValue([]),
    createSchedule: vi.fn().mockResolvedValue({ id: "sch-1" }),
    updateSchedule: vi.fn().mockResolvedValue({ id: "sch-1" }),
    deleteSchedule: vi.fn().mockResolvedValue(undefined),
    runSchedule: vi.fn().mockResolvedValue({ id: "run-1" }),
    listRuns: vi.fn().mockResolvedValue({ items: [] }),
    createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
    downloadRun: vi.fn().mockResolvedValue({ url: "https://edas.example/api/v1/reports/runs/run-1/content?ticket=t" }),
    openTicketDownload: vi.fn().mockResolvedValue({
      key: "reports/2026/run-1.pdf",
      contentType: "application/pdf",
      fileName: "rpt-2-run-1.pdf",
      sizeBytes: 10,
    }),
  };
  const storage = { getObjectStream: vi.fn() };
  const config = { get: (key: string) => (key === "API_PUBLIC_URL" ? options.publicUrl : undefined) };
  return {
    controller: new ReportsController(reports as unknown as ReportsService, storage as unknown as StorageService, config as never),
    reports,
    storage,
  };
}

describe("ReportsController delegation", () => {
  it("forwards the summary and every schedule action", async () => {
    const { controller, reports } = build();
    const dto = { name: "تقرير", reportType: "rpt-2", cadence: "DAILY" } as never;

    await controller.summary(PRINCIPAL as never);
    await controller.listSchedules(PRINCIPAL as never);
    await controller.createSchedule(PRINCIPAL as never, dto);
    await controller.updateSchedule(PRINCIPAL as never, "sch-1", dto);
    await controller.deleteSchedule(PRINCIPAL as never, "sch-1");
    await controller.runSchedule(PRINCIPAL as never, "sch-1");

    expect(reports.summary).toHaveBeenCalledWith(PRINCIPAL);
    expect(reports.listSchedules).toHaveBeenCalledWith(PRINCIPAL);
    expect(reports.createSchedule).toHaveBeenCalledWith(PRINCIPAL, dto);
    expect(reports.updateSchedule).toHaveBeenCalledWith(PRINCIPAL, "sch-1", dto);
    expect(reports.deleteSchedule).toHaveBeenCalledWith(PRINCIPAL, "sch-1");
    expect(reports.runSchedule).toHaveBeenCalledWith(PRINCIPAL, "sch-1");
  });

  it("forwards the run list and creation", async () => {
    const { controller, reports } = build();
    const query = { page: 2 } as never;
    const dto = { reportType: "rpt-2", format: "csv" } as never;

    await controller.listRuns(PRINCIPAL as never, query);
    await controller.createRun(PRINCIPAL as never, dto);

    expect(reports.listRuns).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(reports.createRun).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("builds the download base URL from the configured origin", async () => {
    const configured = build({ publicUrl: "https://edas.example/" });
    await configured.controller.downloadRun(PRINCIPAL as never, "run-1", fakeRequest());
    expect(configured.reports.downloadRun).toHaveBeenCalledWith(PRINCIPAL, "run-1", { baseUrl: "https://edas.example" });

    const derived = build();
    await derived.controller.downloadRun(PRINCIPAL as never, "run-1", fakeRequest("api.internal:4000"));
    expect(derived.reports.downloadRun).toHaveBeenCalledWith(PRINCIPAL, "run-1", { baseUrl: "http://api.internal:4000" });

    const forwarded = build();
    await forwarded.controller.downloadRun(
      PRINCIPAL as never,
      "run-1",
      fakeRequest("api.internal:4000", { "x-forwarded-proto": "https, http" }),
    );
    expect(forwarded.reports.downloadRun).toHaveBeenCalledWith(PRINCIPAL, "run-1", { baseUrl: "https://api.internal:4000" });
  });
});

describe("ReportsController content streaming", () => {
  it("streams the report as an attachment with the range headers", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("abc")]),
      contentLength: 3,
      contentRange: "bytes 2-4/10",
      contentType: "application/pdf",
    });
    const response = fakeResponse();

    await controller.content("run-1", "ticket-1", "bytes=2-4", response as unknown as Response);

    expect(storage.getObjectStream).toHaveBeenCalledWith("reports/2026/run-1.pdf", "bytes=2-4");
    expect(response.status).toHaveBeenCalledWith(206);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", "attachment; filename*=UTF-8''rpt-2-run-1.pdf");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes 2-4/10");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Length", "3");
    expect(response.setHeader).toHaveBeenCalledWith("Accept-Ranges", "bytes");
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("answers 200 without a range and keeps the body flowing", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("abcd")]),
      contentLength: 4,
      contentRange: null,
      contentType: "application/pdf",
    });
    const response = fakeResponse();
    const finished = new Promise<void>((resolve) => response.on("finish", () => resolve()));

    await controller.content("run-1", "ticket-1", undefined, response as unknown as Response);
    await finished;

    expect(storage.getObjectStream).toHaveBeenCalledWith("reports/2026/run-1.pdf", undefined);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.chunks.join("")).toBe("abcd");
    expect(response.setHeader).not.toHaveBeenCalledWith("Content-Range", expect.anything());
  });

  it("rejects an unsatisfiable range without touching storage", async () => {
    const { controller, storage } = build();
    const response = fakeResponse();

    await controller.content("run-1", "ticket-1", "bytes=50-60", response as unknown as Response);

    expect(storage.getObjectStream).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(416);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */10");
  });

  it("maps a storage range refusal to 416", async () => {
    const { controller, storage } = build();
    storage.getObjectStream.mockRejectedValue({ $metadata: { httpStatusCode: 416 } });
    const response = fakeResponse();

    await controller.content("run-1", "ticket-1", "bytes=0-1", response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(416);
  });

  it("aborts the response when the stream errors and tears the body down on close", async () => {
    const { controller, storage } = build();
    const body = new Readable({ read() {} });
    storage.getObjectStream.mockResolvedValue({ body, contentLength: 3, contentRange: null, contentType: "text/csv" });
    const response = fakeResponse();

    await controller.content("run-1", "ticket-1", undefined, response as unknown as Response);
    body.emit("error", new Error("socket hang up"));

    expect(response.status).toHaveBeenCalledWith(502);
    body.destroy();

    const second = build();
    const secondBody = Readable.from([Buffer.from("abc")]);
    second.storage.getObjectStream.mockResolvedValue({
      body: secondBody,
      contentLength: 3,
      contentRange: null,
      contentType: "text/csv",
    });
    const secondResponse = fakeResponse();
    await second.controller.content("run-1", "ticket-1", undefined, secondResponse as unknown as Response);
    secondResponse.emit("close");

    expect(secondBody.destroyed).toBe(true);
  });
});
