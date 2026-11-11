import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { API_PREFIX } from "@edas/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../common/storage/storage.service";
import type { AuditInput, AuditService } from "../audit/audit.service";
import type { FilesService } from "../files/files.service";
import {
  ConversionFailedError,
  ConversionOutputMissingError,
  ConversionTimeoutError,
  ConverterUnavailableError,
} from "./preview-converter.service";
import type { PreviewConverterService } from "./preview-converter.service";
import { PreviewService } from "./preview.service";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };
const ACTOR = { id: "user-1", departmentId: "dept-1" };

const HEADS = {
  pdf: Buffer.from("%PDF-1.7\n"),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  text: Buffer.from("مرحبا بالعالم"),
  dxf: Buffer.from("0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n"),
  dwg: Buffer.concat([Buffer.from("AC1032"), Buffer.alloc(16)]),
  binary: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
  docx: (() => {
    const name = Buffer.from("[Content_Types].xml");
    const head = Buffer.alloc(30 + name.length);
    head.write("PK", 0, "latin1");
    head[2] = 3;
    head[3] = 4;
    head.writeUInt16LE(name.length, 26);
    name.copy(head, 30);
    return head;
  })(),
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORK_DIRS: string[] = [];

async function tmpWorkDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "edas-preview-test-"));
  WORK_DIRS.push(dir);
  return dir;
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    storageKey: "documents/2026/a.docx",
    originalName: "a.docx",
    mimeType: DOCX_MIME,
    sizeBytes: 1024n,
    checksumSha256: "ABC123",
    uploadedById: "user-1",
    ...overrides,
  };
}

function build(options: { values?: Record<string, string>; head?: Buffer; file?: Record<string, unknown> } = {}) {
  const values = options.values ?? {};
  const stored = file(options.file);
  const files = {
    readableFile: vi.fn().mockResolvedValue({ actor: ACTOR, file: stored, documents: [] }),
    canDownloadAny: vi.fn().mockResolvedValue(true),
    fileForJob: vi.fn().mockResolvedValue(stored),
  };
  const storage = {
    readHead: vi.fn().mockResolvedValue(options.head ?? HEADS.docx),
    head: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    listObjects: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    downloadToFile: vi.fn().mockResolvedValue(1024),
    presignExpiresSeconds: 900,
  };
  const converter = {
    capabilities: vi.fn().mockResolvedValue({ office: { available: true, version: "7.6" }, dwg: { available: false } }),
    officeAvailability: vi.fn().mockResolvedValue({ command: "/opt/soffice", version: "7.6" }),
    odaAvailability: vi.fn().mockResolvedValue({ command: "/opt/oda", version: null }),
    convertOfficeToPdf: vi.fn(),
    convertDwgToDxf: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const access = { resolveActor: vi.fn().mockResolvedValue(ACTOR) };
  const config = { get: (key: string, fallback?: string) => values[key] ?? fallback };
  const service = new PreviewService(
    files as unknown as FilesService,
    storage as unknown as StorageService,
    converter as unknown as PreviewConverterService,
    audit as unknown as AuditService,
    access as never,
    config as never,
  );
  return { service, files, storage, converter, audit, access, stored };
}

function producedPdf(bytes = "%PDF-1.7 produced") {
  return async (_source: string, workDir: string) => {
    const outputPath = join(workDir, "output.pdf");
    await writeFile(outputPath, Buffer.from(bytes));
    return { outputPath, elapsedMs: 7 };
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(WORK_DIRS.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("PreviewService limits", () => {
  it("reports the converter capabilities with the default limits", async () => {
    const { service } = build();

    await expect(service.capabilities()).resolves.toEqual({
      office: { available: true, version: "7.6" },
      dwg: { available: false },
      limits: { maxSourceBytes: 50 * 1024 * 1024, timeoutMs: 120_000, concurrency: 2 },
    });
  });

  it("honours configured limits and rejects unusable values", async () => {
    const configured = build({
      values: {
        PREVIEW_MAX_SOURCE_BYTES: "1024",
        PREVIEW_MAX_OUTPUT_BYTES: "2048",
        PREVIEW_TIMEOUT_MS: "5000",
        PREVIEW_CONCURRENCY: "3.9",
      },
    });
    await expect(configured.service.capabilities()).resolves.toMatchObject({
      limits: { maxSourceBytes: 1024, timeoutMs: 5000, concurrency: 3 },
    });

    const invalid = build({
      values: { PREVIEW_MAX_SOURCE_BYTES: "-1", PREVIEW_TIMEOUT_MS: "abc", PREVIEW_CONCURRENCY: "0" },
    });
    await expect(invalid.service.capabilities()).resolves.toMatchObject({
      limits: { maxSourceBytes: 50 * 1024 * 1024, timeoutMs: 120_000, concurrency: 2 },
    });
  });
});

describe("PreviewService ready previews", () => {
  it("returns inline previews for PDF, image, text and DXF originals", async () => {
    const pdf = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });
    await expect(pdf.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "pdf",
      status: "ready",
      source: "original",
      detectedType: "pdf",
      url: `${API_PREFIX}/preview/files/file-1/content?kind=original`,
      downloadable: true,
      retryable: false,
      reason: null,
      expiresInSeconds: 900,
    });

    const png = build({ head: HEADS.png, file: { originalName: "صورة.PNG", mimeType: "image/png" } });
    await expect(png.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "image",
      status: "ready",
      detectedType: "image",
    });

    const text = build({ head: HEADS.text, file: { originalName: "notes.txt", mimeType: "text/plain" } });
    await expect(text.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "text",
      detectedType: "text",
    });

    const dxf = build({ head: HEADS.dxf, file: { originalName: "plan.dxf", mimeType: "application/dxf" } });
    await expect(dxf.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "cad",
      detectedType: "dxf",
    });
  });

  it("marks the preview as not downloadable when the ACL denies export", async () => {
    const { service, files } = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });
    files.canDownloadAny.mockResolvedValue(false);

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "ready",
      downloadable: false,
    });
  });

  it("reports the refused reasons without converting", async () => {
    const tooLarge = build({ file: { sizeBytes: 60n * 1024n * 1024n } });
    await expect(tooLarge.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      reason: "too_large",
      retryable: false,
      url: null,
      message: null,
    });

    const unreadable = build();
    unreadable.storage.readHead.mockResolvedValue(null);
    await expect(unreadable.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      reason: "unreadable",
    });

    const mismatch = build({ head: HEADS.pdf, file: { originalName: "a.txt", mimeType: "text/plain" } });
    await expect(mismatch.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      reason: "type_mismatch",
      detectedType: "pdf",
    });

    const unsupported = build({ head: HEADS.binary, file: { originalName: "a.bin", mimeType: "application/octet-stream" } });
    await expect(unsupported.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      reason: "unsupported_type",
      detectedType: "unknown",
    });
  });

  it("refuses a script-bearing SVG renamed as a PNG instead of serving it inline", async () => {
    const svg = build({
      head: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      file: { originalName: "logo.png", mimeType: "image/png" },
    });

    await expect(svg.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      reason: "type_mismatch",
    });
    await expect(svg.service.resolveContent(PRINCIPAL as never, "file-1", "original")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("serves a cached office conversion without enqueuing a job", async () => {
    const { service, storage, converter } = build({ head: HEADS.docx });
    storage.head.mockResolvedValue({ sizeBytes: 2048 });

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "pdf",
      status: "ready",
      source: "office",
      url: `${API_PREFIX}/preview/files/file-1/content?kind=preview`,
    });
    expect(converter.convertOfficeToPdf).not.toHaveBeenCalled();
  });

  it("serves a cached DWG conversion without enqueuing a job", async () => {
    const { service, storage, converter } = build({
      head: HEADS.dwg,
      file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg" },
    });
    storage.head.mockResolvedValue({ sizeBytes: 4096 });

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "cad",
      status: "ready",
      source: "dwg",
      detectedType: "dwg",
    });
    expect(converter.convertDwgToDxf).not.toHaveBeenCalled();
  });

  it("reports a missing converter for office and DWG sources", async () => {
    const office = build({ head: HEADS.docx });
    office.converter.officeAvailability.mockResolvedValue({ command: null, version: null });
    await expect(office.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      source: "office",
      reason: "converter_unavailable",
    });

    const dwg = build({ head: HEADS.dwg, file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg" } });
    dwg.converter.odaAvailability.mockResolvedValue({ command: null, version: null });
    await expect(dwg.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "unavailable",
      source: "dwg",
      reason: "converter_unavailable",
    });
  });
});

describe("PreviewService conversions", () => {
  it("queues, runs and then serves an office conversion", async () => {
    const { service, storage, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockImplementation(producedPdf());

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "pdf",
      status: "converting",
      source: "office",
      message: expect.any(String),
      startedAt: expect.any(String),
    });

    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "preview.convert.done",
          result: "success",
          detail: expect.objectContaining({ source: "office", detectedType: "docx", elapsedMs: 7 }),
        }),
      ),
    );
    expect(converter.convertOfficeToPdf).toHaveBeenCalledWith(expect.stringContaining("source.docx"), expect.any(String), 120_000);
    expect(storage.downloadToFile).toHaveBeenCalledWith("documents/2026/a.docx", expect.stringContaining("source.docx"), 50 * 1024 * 1024);
    expect(storage.put).toHaveBeenCalledWith("previews/file-1/abc123.pdf", expect.any(Buffer), "application/pdf");

    storage.head.mockResolvedValue({ sizeBytes: 18 });
    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "pdf",
      status: "ready",
      source: "office",
    });
  });

  it("runs a DWG conversion and stores the DXF", async () => {
    const { service, storage, converter, audit } = build({
      head: HEADS.dwg,
      file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg" },
    });
    converter.convertDwgToDxf.mockImplementation(async (_source: string, workDir: string) => {
      const outputPath = join(workDir, "output.dxf");
      await writeFile(outputPath, Buffer.from("0\nSECTION\n"));
      return { outputPath, elapsedMs: 3 };
    });

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      kind: "cad",
      status: "converting",
      source: "dwg",
    });

    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", result: "success", detail: expect.objectContaining({ source: "dwg" }) }),
      ),
    );
    expect(storage.put).toHaveBeenCalledWith("previews/file-1/abc123.dxf", expect.any(Buffer), "application/dxf");
  });

  it("records a timed-out conversion, exposes the failure and re-queues on retry", async () => {
    const { service, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockRejectedValue(new ConversionTimeoutError(1500));

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "preview.convert.done",
          result: "failure",
          detail: expect.objectContaining({ reason: "conversion_timeout" }),
        }),
      ),
    );

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "failed",
      reason: "conversion_timeout",
      message: "The conversion exceeded the server time limit",
      retryable: true,
    });

    const runsBefore = converter.convertOfficeToPdf.mock.calls.length;
    await service.retry(PRINCIPAL as never, "file-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preview.retry", detail: { previousReason: "conversion_timeout" } }),
    );
    await vi.waitFor(() => expect(converter.convertOfficeToPdf.mock.calls.length).toBe(runsBefore + 1));
  });

  it("returns the running preview instead of re-queueing while a job is active", async () => {
    const { service, converter } = build({ head: HEADS.docx });
    const dir = await tmpWorkDir();
    const outputPath = join(dir, "output.pdf");
    await writeFile(outputPath, Buffer.from("%PDF-1.7"));
    let release: (value: { outputPath: string; elapsedMs: number }) => void = () => undefined;
    converter.convertOfficeToPdf.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const first = await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(1));
    const second = await service.getPreview(PRINCIPAL as never, "file-1");
    const retried = await service.retry(PRINCIPAL as never, "file-1");

    expect(first.status).toBe("converting");
    expect(second.status).toBe("converting");
    expect(retried.status).toBe("converting");
    expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(1);
    release({ outputPath, elapsedMs: 1 });
  });

  it("maps every failure reason", async () => {
    const cases: Array<{ error: Error; reason: string; message: string }> = [
      {
        error: new ConversionOutputMissingError(".pdf"),
        reason: "conversion_produced_no_output",
        message: "The converter produced no preview file",
      },
      { error: new ConversionFailedError("boom"), reason: "conversion_failed", message: "The file could not be converted for preview" },
      { error: new Error("The object exceeds the 50 byte limit"), reason: "too_large", message: "The file is too large to preview" },
    ];

    for (const { error, reason, message } of cases) {
      const { service, converter, audit } = build({ head: HEADS.docx });
      converter.convertOfficeToPdf.mockRejectedValue(error);

      await service.getPreview(PRINCIPAL as never, "file-1");
      await vi.waitFor(() =>
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({ action: "preview.convert.done", detail: expect.objectContaining({ reason }) }),
        ),
      );
      await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({ status: "failed", reason, message });
    }
  });

  it("fails a conversion that produced an empty or oversized file", async () => {
    const empty = build({ head: HEADS.docx });
    empty.converter.convertOfficeToPdf.mockImplementation(async (_source: string, workDir: string) => {
      const outputPath = join(workDir, "output.pdf");
      await writeFile(outputPath, Buffer.alloc(0));
      return { outputPath, elapsedMs: 1 };
    });
    await empty.service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(empty.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "preview.convert.done",
          detail: expect.objectContaining({ reason: "conversion_produced_no_output" }),
        }),
      ),
    );

    const oversized = build({ head: HEADS.docx, values: { PREVIEW_MAX_OUTPUT_BYTES: "5" } });
    oversized.converter.convertOfficeToPdf.mockImplementation(producedPdf("0123456789"));
    await oversized.service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(oversized.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", detail: expect.objectContaining({ reason: "too_large" }) }),
      ),
    );
    expect(oversized.storage.put).not.toHaveBeenCalled();
  });

  it("fails the job when the download is refused and removes the work directory", async () => {
    const { service, storage, audit } = build({ head: HEADS.docx });
    storage.downloadToFile.mockRejectedValue(new Error("The object exceeds the 50 byte preview limit"));

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", detail: expect.objectContaining({ reason: "too_large" }) }),
      ),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.start" }));
  });

  it("queues a second conversion until the single slot frees up", async () => {
    const { service, converter, storage, files } = build({ head: HEADS.docx, values: { PREVIEW_CONCURRENCY: "1" } });
    const second = file({ id: "file-2", checksumSha256: "def456", storageKey: "documents/2026/b.docx" });
    files.readableFile.mockImplementation(async (_principal, id) =>
      id === "file-2" ? { actor: ACTOR, file: second, documents: [] } : { actor: ACTOR, file: file(), documents: [] },
    );
    storage.downloadToFile.mockImplementation(async (_key: string, target: string) => {
      await writeFile(target, Buffer.from("%PDF-1.7"));
      return 1024;
    });

    const dir = await tmpWorkDir();
    const outputPath = join(dir, "first.pdf");
    await writeFile(outputPath, Buffer.from("%PDF-1.7"));
    let release: (value: { outputPath: string; elapsedMs: number }) => void = () => undefined;
    converter.convertOfficeToPdf.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    converter.convertOfficeToPdf.mockImplementation(producedPdf());

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(1));

    await expect(service.getPreview(PRINCIPAL as never, "file-2")).resolves.toMatchObject({
      status: "converting",
      message: "Waiting for an available conversion slot",
    });
    expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(1);

    release({ outputPath, elapsedMs: 1 });
    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(storage.put).toHaveBeenCalledWith("previews/file-2/def456.pdf", expect.any(Buffer), "application/pdf"));
  });

  it("replaces a finished job when its cached preview disappeared", async () => {
    const { service, storage, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockImplementation(producedPdf());

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done", result: "success" })),
    );

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({ status: "converting" });
    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(2));
    expect(storage.put).toHaveBeenCalledTimes(2);
  });

  it("logs a job that crashes before it can start converting", async () => {
    const { service, audit } = build({ head: HEADS.docx });
    audit.record.mockImplementation(async (input: AuditInput) => {
      if (input.action === "preview.convert.start") throw new Error("audit unavailable");
    });
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    await service.getPreview(PRINCIPAL as never, "file-1");

    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("audit unavailable")));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("preview conversion failed"));
  });

  it("never echoes raw converter output back to the caller", async () => {
    const { service, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockRejectedValue(new Error("soffice: /tmp/edas-preview-abc/source.docx crashed"));

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", detail: expect.objectContaining({ reason: "conversion_failed" }) }),
      ),
    );

    const failed = await service.getPreview(PRINCIPAL as never, "file-1");
    expect(failed).toMatchObject({ status: "failed", message: "The file could not be converted for preview" });
    expect(JSON.stringify(failed)).not.toContain("edas-preview-abc");
  });

  it("maps a converter that vanished mid-flight to converter_unavailable", async () => {
    const { service, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockRejectedValue(new ConverterUnavailableError("LibreOffice"));

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "preview.convert.done",
          detail: expect.objectContaining({ reason: "converter_unavailable" }),
        }),
      ),
    );
    await expect(service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({
      status: "failed",
      reason: "converter_unavailable",
      message: "The required converter is not installed on the server",
      retryable: true,
    });
  });
});

describe("PreviewService streaming content", () => {
  it("returns the original for inline types", async () => {
    const pdf = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100n } });
    await expect(pdf.service.resolveContent(PRINCIPAL as never, "file-1", "original")).resolves.toEqual({
      key: "documents/2026/a.docx",
      contentType: "application/pdf",
      fileName: "a.pdf",
      sizeBytes: 100,
    });
    expect(pdf.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preview.stream", detail: { kind: "original", contentType: "application/pdf", sizeBytes: 100 } }),
    );

    const text = build({ head: HEADS.text, file: { originalName: "notes.txt", mimeType: "text/plain" } });
    await expect(text.service.resolveContent(PRINCIPAL as never, "file-1", "original")).resolves.toMatchObject({
      contentType: "text/plain",
      fileName: "notes.txt",
    });
  });

  it("refuses oversized, unreadable, mismatched and non-inline originals", async () => {
    const oversized = build({ file: { sizeBytes: 60n * 1024n * 1024n } });
    await expect(oversized.service.resolveContent(PRINCIPAL as never, "file-1", "original")).rejects.toBeInstanceOf(ForbiddenException);

    const unreadable = build();
    unreadable.storage.readHead.mockResolvedValue(null);
    await expect(unreadable.service.resolveContent(PRINCIPAL as never, "file-1", "original")).rejects.toBeInstanceOf(NotFoundException);

    const mismatch = build({ head: HEADS.pdf, file: { originalName: "a.txt", mimeType: "text/plain" } });
    await expect(mismatch.service.resolveContent(PRINCIPAL as never, "file-1", "original")).rejects.toBeInstanceOf(ForbiddenException);

    const office = build({ head: HEADS.docx });
    await expect(office.service.resolveContent(PRINCIPAL as never, "file-1", "original")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("serves a converted office preview only when it is cached", async () => {
    const { service, storage } = build({ head: HEADS.docx });
    await expect(service.resolveContent(PRINCIPAL as never, "file-1", "preview")).rejects.toBeInstanceOf(NotFoundException);

    storage.head.mockResolvedValue({ sizeBytes: 2048 });
    await expect(service.resolveContent(PRINCIPAL as never, "file-1", "preview")).resolves.toEqual({
      key: "previews/file-1/abc123.pdf",
      contentType: "application/pdf",
      fileName: "a.pdf",
      sizeBytes: 2048,
    });
  });

  it("serves a cached DWG preview as DXF", async () => {
    const { service, storage } = build({ head: HEADS.dwg, file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg" } });
    storage.head.mockResolvedValue({ sizeBytes: 512 });

    await expect(service.resolveContent(PRINCIPAL as never, "file-1", "preview")).resolves.toMatchObject({
      key: "previews/file-1/abc123.dxf",
      contentType: "application/dxf",
      fileName: "plan.dxf",
      sizeBytes: 512,
    });
  });

  it("refuses a preview request for a type that is never converted", async () => {
    const { service } = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });

    await expect(service.resolveContent(PRINCIPAL as never, "file-1", "preview")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("PreviewService auditing", () => {
  it("audits a denied read once with the denial reason", async () => {
    const { service, files, audit, access } = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });
    files.readableFile.mockRejectedValue(new ForbiddenException("Missing permission: VIEW"));

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getPreview(PRINCIPAL as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "preview.open",
        result: "failure",
        actorId: "user-1",
        departmentId: "dept-1",
        detail: { reason: "missing_view_permission" },
      }),
    );
    expect(access.resolveActor).toHaveBeenCalled();
  });

  it("falls back to the token subject when the actor cannot be resolved", async () => {
    const { service, files, audit, access } = build();
    files.readableFile.mockRejectedValue(new NotFoundException("File not found"));
    access.resolveActor.mockRejectedValue(new Error("account is not provisioned"));

    await expect(service.getPreview(PRINCIPAL as never, "file-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preview.open", result: "failure", actorId: null, detail: { reason: "not_found" } }),
    );
  });

  it("deduplicates repeated reads and survives an audit outage", async () => {
    const { service, audit } = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });

    await service.getPreview(PRINCIPAL as never, "file-1");
    await service.getPreview(PRINCIPAL as never, "file-1");
    expect(audit.record).toHaveBeenCalledTimes(1);

    const failing = build({ head: HEADS.pdf, file: { originalName: "b.pdf", mimeType: "application/pdf" } });
    failing.audit.record.mockRejectedValue(new Error("audit chain locked"));
    await expect(failing.service.getPreview(PRINCIPAL as never, "file-1")).resolves.toMatchObject({ status: "ready" });
  });

  it("prunes the audit dedupe index once it grows past its bound", async () => {
    const { service, audit } = build();
    const internal = service as unknown as {
      auditSeen: Map<string, number>;
      auditOnce(key: string, input: AuditInput): Promise<void>;
    };
    const stale = Date.now() - 6 * 60 * 1000;
    for (let index = 0; index < 5000; index += 1) internal.auditSeen.set(`stale-${index}`, stale);

    await internal.auditOnce("fresh", { action: "preview.open", entityType: "File", entityId: "file-1" });

    expect(internal.auditSeen.has("stale-0")).toBe(false);
    expect(internal.auditSeen.has("stale-4999")).toBe(false);
    expect(internal.auditSeen.get("fresh")).toEqual(expect.any(Number));
    expect(audit.record).toHaveBeenCalledTimes(1);

    await internal.auditOnce("fresh", { action: "preview.open", entityType: "File", entityId: "file-1" });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PreviewService cache cleanup", () => {
  it("removes stale objects, counts failures and audits the sweep", async () => {
    const { service, storage, audit, access } = build();
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    storage.listObjects.mockResolvedValue({
      objects: [
        { key: "previews/a.pdf", sizeBytes: 10, lastModified: stale },
        { key: "previews/b.pdf", sizeBytes: 10, lastModified: stale },
        { key: "previews/c.pdf", sizeBytes: 10, lastModified: new Date() },
        { key: "previews/d.pdf", sizeBytes: 10 },
      ],
      truncated: true,
    });
    storage.remove.mockImplementation(async (key: string) => {
      if (key === "previews/b.pdf") throw new Error("Access Denied");
    });

    await expect(service.cleanupCache(PRINCIPAL as never, 30)).resolves.toEqual({
      olderThanDays: 30,
      removed: 1,
      failed: 1,
      truncated: true,
    });
    expect(storage.listObjects).toHaveBeenCalledWith("previews/", 5000);
    expect(access.resolveActor).toHaveBeenCalledWith(PRINCIPAL);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "preview.cache.cleanup",
        detail: { olderThanDays: 30, removed: 1, failed: 1, truncated: true },
      }),
    );
  });

  it("clamps the day window and honours the scan limit", async () => {
    const { service, storage } = build({ values: { PREVIEW_CACHE_SCAN_LIMIT: "7" } });

    await expect(service.cleanupCache(PRINCIPAL as never, 0)).resolves.toMatchObject({ olderThanDays: 1 });
    await expect(service.cleanupCache(PRINCIPAL as never, 100_000)).resolves.toMatchObject({ olderThanDays: 3650 });
    await expect(service.cleanupCache(PRINCIPAL as never, Number.NaN)).resolves.toMatchObject({ olderThanDays: 30 });
    expect(storage.listObjects).toHaveBeenCalledWith("previews/", 7);
  });
});

describe("PreviewService prewarming", () => {
  it("queues a conversion for a supported upload", async () => {
    const { service, files, storage, converter, audit } = build({ head: HEADS.docx });
    converter.convertOfficeToPdf.mockImplementation(producedPdf());

    await service.prewarm("file-1", { id: "user-1", departmentId: "dept-1" });

    expect(files.fileForJob).toHaveBeenCalledWith("file-1");
    expect(converter.officeAvailability).toHaveBeenCalled();
    expect(storage.head).toHaveBeenCalledWith("previews/file-1/abc123.pdf");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", result: "success", actorId: "user-1" }),
      ),
    );
    expect(converter.convertOfficeToPdf).toHaveBeenCalled();
  });

  it("skips prewarming when it is disabled or already queued", async () => {
    const disabled = build({ head: HEADS.docx, values: { PREVIEW_PREWARM: "off" } });
    await disabled.service.prewarm("file-1", { id: "user-1", departmentId: "dept-1" });
    expect(disabled.files.fileForJob).not.toHaveBeenCalled();

    const queued = build({ head: HEADS.docx });
    queued.converter.convertOfficeToPdf.mockImplementation(producedPdf());
    await queued.service.prewarm("file-1", { id: "user-1", departmentId: "dept-1" });
    await vi.waitFor(() =>
      expect(queued.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done", result: "success" })),
    );
    await queued.service.prewarm("file-1", { id: "user-1", departmentId: "dept-1" });
    expect(queued.converter.convertOfficeToPdf).toHaveBeenCalledTimes(1);
  });

  it("skips unsupported, oversized, mismatched, unreadable and already cached files", async () => {
    const missing = build();
    missing.files.fileForJob.mockResolvedValue(null);
    await missing.service.prewarm("file-1", { id: null, departmentId: null });
    expect(missing.storage.readHead).not.toHaveBeenCalled();

    const oversized = build({ file: { sizeBytes: 60n * 1024n * 1024n } });
    await oversized.service.prewarm("file-1", { id: null, departmentId: null });
    expect(oversized.storage.readHead).not.toHaveBeenCalled();

    const unreadable = build();
    unreadable.storage.readHead.mockResolvedValue(null);
    await unreadable.service.prewarm("file-1", { id: null, departmentId: null });
    expect(unreadable.converter.officeAvailability).not.toHaveBeenCalled();

    const mismatch = build({ head: HEADS.pdf, file: { originalName: "a.txt", mimeType: "text/plain" } });
    await mismatch.service.prewarm("file-1", { id: null, departmentId: null });
    expect(mismatch.converter.officeAvailability).not.toHaveBeenCalled();

    const inline = build({ head: HEADS.pdf, file: { originalName: "a.pdf", mimeType: "application/pdf" } });
    await inline.service.prewarm("file-1", { id: null, departmentId: null });
    expect(inline.converter.officeAvailability).not.toHaveBeenCalled();

    const cached = build({ head: HEADS.docx });
    cached.storage.head.mockResolvedValue({ sizeBytes: 100 });
    await cached.service.prewarm("file-1", { id: null, departmentId: null });
    expect(cached.converter.convertOfficeToPdf).not.toHaveBeenCalled();

    const noConverter = build({ head: HEADS.docx });
    noConverter.converter.officeAvailability.mockResolvedValue({ command: null, version: null });
    await noConverter.service.prewarm("file-1", { id: null, departmentId: null });
    expect(noConverter.converter.convertOfficeToPdf).not.toHaveBeenCalled();
  });

  it("prewarms DWG files through the ODA converter", async () => {
    const { service, converter, audit } = build({
      head: HEADS.dwg,
      file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg" },
    });
    converter.convertDwgToDxf.mockImplementation(async (_source: string, workDir: string) => {
      const outputPath = join(workDir, "output.dxf");
      await writeFile(outputPath, Buffer.from("0\nSECTION\n"));
      return { outputPath, elapsedMs: 1 };
    });

    await service.prewarm("file-1", { id: "user-1", departmentId: "dept-1" });

    expect(converter.odaAvailability).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "preview.convert.done", result: "success", detail: expect.objectContaining({ source: "dwg" }) }),
      ),
    );
    expect(converter.convertDwgToDxf).toHaveBeenCalled();
  });

  it("swallows storage failures during prewarming", async () => {
    const { service, storage } = build({ head: HEADS.docx });
    storage.readHead.mockRejectedValue(new Error("MinIO is down"));

    await expect(service.prewarm("file-1", { id: null, departmentId: null })).resolves.toBeUndefined();
  });
});

describe("PreviewService disk hygiene", () => {
  it("cleans the conversion work directory after a run", async () => {
    const { service, converter, audit } = build({ head: HEADS.docx });
    const dir = await tmpWorkDir();
    let workDir = "";
    converter.convertOfficeToPdf.mockImplementation(async (_source: string, internal: string) => {
      workDir = internal;
      const outputPath = join(internal, "output.pdf");
      await writeFile(outputPath, Buffer.from("%PDF-1.7"));
      return { outputPath, elapsedMs: 1 };
    });

    await service.getPreview(PRINCIPAL as never, "file-1");
    await vi.waitFor(() => expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done" })));

    expect(workDir).not.toBe("");
    expect(workDir).not.toBe(dir);
    await vi.waitFor(async () => {
      await expect(stat(workDir)).rejects.toThrow();
    });
  });
});
