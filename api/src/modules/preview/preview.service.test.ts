import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import type { StorageService } from "../../common/storage/storage.service";
import type { AuditService } from "../audit/audit.service";
import type { FilesService } from "../files/files.service";
import { ConversionTimeoutError, type PreviewConverterService } from "./preview-converter.service";
import { PreviewService } from "./preview.service";

const principal: Principal = {
  sub: "keycloak-1",
  username: "amal",
  roles: [UserRole.EMPLOYEE],
  identityRoles: [UserRole.EMPLOYEE],
};
const actor = { id: "user-1", departmentId: null, role: UserRole.EMPLOYEE };
const checksum = "a".repeat(64);

function fileRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    bucket: "edas-documents",
    storageKey: "documents/2026/source.pdf",
    originalName: "source.pdf",
    mimeType: "application/pdf",
    sizeBytes: BigInt(2048),
    checksumSha256: checksum,
    uploadedById: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function pdfBytes() {
  return Buffer.from("%PDF-1.7\n1 0 obj\n");
}

function docxBytes() {
  const name = Buffer.from("[Content_Types].xml");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name]);
}

function dwgBytes() {
  return Buffer.concat([Buffer.from("AC1032", "latin1"), Buffer.alloc(64, 0)]);
}

function setup(overrides: {
  file?: Record<string, unknown>;
  head?: Buffer | null;
  cached?: { sizeBytes: number } | null;
  office?: { command: string | null; version: string | null };
  oda?: { command: string | null; version: string | null };
  env?: Record<string, string>;
} = {}) {
  const file = fileRecord(overrides.file);
  const files = {
    readableFile: vi.fn().mockResolvedValue({ actor, file, documents: [] }),
    canDownloadAny: vi.fn().mockResolvedValue(true),
    fileForJob: vi.fn().mockResolvedValue(file),
  } as unknown as FilesService;
  const storage = {
    presignExpiresSeconds: 900,
    readHead: vi.fn().mockResolvedValue(overrides.head ?? pdfBytes()),
    head: vi.fn().mockResolvedValue(overrides.cached ?? null),
    downloadToFile: vi.fn().mockResolvedValue(1),
    put: vi.fn().mockResolvedValue(undefined),
    listObjects: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const converter = {
    officeAvailability: vi.fn().mockResolvedValue(overrides.office ?? { command: null, version: null }),
    odaAvailability: vi.fn().mockResolvedValue(overrides.oda ?? { command: null, version: null }),
    convertOfficeToPdf: vi.fn(),
    convertDwgToDxf: vi.fn(),
    capabilities: vi.fn().mockResolvedValue({ office: { available: false, version: null }, dwg: { available: false } }),
  } as unknown as PreviewConverterService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const access = { resolveActor: vi.fn().mockResolvedValue(actor) } as unknown as AccessService;
  const config = { get: (key: string) => overrides.env?.[key] } as unknown as ConfigService;
  const service = new PreviewService(files, storage, converter, audit, access, config);
  return { service, files, storage, converter, audit, access, file };
}

describe("PreviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a streamed URL for a real PDF", async () => {
    const { service } = setup();
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "ready", kind: "pdf", source: "original", detectedType: "pdf" });
    expect(result.url).toBe("/api/v1/preview/files/file-1/content?kind=original");
  });

  it("blocks a preview when the content does not match the declared type", async () => {
    const { service } = setup({
      file: { originalName: "invoice.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      head: pdfBytes(),
    });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "unavailable", reason: "type_mismatch" });
  });

  it("reports converter_unavailable for Office files when LibreOffice is missing", async () => {
    const { service } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
    });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "unavailable", reason: "converter_unavailable", source: "office", detectedType: "docx" });
  });

  it("reuses a cached Office preview keyed by file id and checksum", async () => {
    const { service, storage, converter } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
      cached: { sizeBytes: 4096 },
      office: { command: "/usr/bin/soffice", version: "7.6" },
    });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "ready", kind: "pdf", source: "office" });
    expect(result.url).toBe("/api/v1/preview/files/file-1/content?kind=preview");
    expect(storage.head).toHaveBeenCalledWith(`previews/file-1/${checksum}.pdf`);
    expect(converter.convertOfficeToPdf).not.toHaveBeenCalled();
  });

  it("converts an Office file in the background and then serves the cached PDF", async () => {
    const { service, storage, converter, audit } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
      office: { command: "/usr/bin/soffice", version: "7.6" },
    });
    (converter.convertOfficeToPdf as ReturnType<typeof vi.fn>).mockImplementation(async (_source: string, workDir: string) => {
      const outputPath = join(workDir, "source.pdf");
      await writeFile(outputPath, Buffer.from("%PDF-1.4\npreview\n"));
      return { outputPath, elapsedMs: 12 };
    });

    const first = await service.getPreview(principal, "file-1");
    expect(first).toMatchObject({ status: "converting", source: "office", kind: "pdf" });

    await vi.waitFor(() => expect(storage.put).toHaveBeenCalledWith(`previews/file-1/${checksum}.pdf`, expect.any(Buffer), "application/pdf"));
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done", result: "success" })),
    );

    (storage.head as ReturnType<typeof vi.fn>).mockResolvedValue({ sizeBytes: 20 });
    const second = await service.getPreview(principal, "file-1");
    expect(second).toMatchObject({ status: "ready", kind: "pdf", source: "office" });
  });

  it("reports a timeout and allows a retry", async () => {
    const { service, converter, audit } = setup({
      file: {
        originalName: "report.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storageKey: "documents/2026/report.xlsx",
      },
      head: docxBytes(),
      office: { command: "/usr/bin/soffice", version: "7.6" },
    });
    (converter.convertOfficeToPdf as ReturnType<typeof vi.fn>).mockRejectedValue(new ConversionTimeoutError(1000));

    await service.getPreview(principal, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done", result: "failure" })),
    );

    const failed = await service.getPreview(principal, "file-1");
    expect(failed).toMatchObject({ status: "failed", reason: "conversion_timeout", retryable: true });

    (converter.convertOfficeToPdf as ReturnType<typeof vi.fn>).mockResolvedValue({ outputPath: "/nonexistent/x.pdf", elapsedMs: 1 });
    await service.retry(principal, "file-1");
    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(2));
  });

  it("prewarms an Office upload in the background when the converter is installed", async () => {
    const { service, converter, storage } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
      office: { command: "/usr/bin/soffice", version: "7.6" },
    });
    (converter.convertOfficeToPdf as ReturnType<typeof vi.fn>).mockRejectedValue(new ConversionTimeoutError(1000));

    await service.prewarm("file-1", { id: "user-1", departmentId: null });

    await vi.waitFor(() => expect(converter.convertOfficeToPdf).toHaveBeenCalledTimes(1));
    expect(storage.head).toHaveBeenCalledWith(`previews/file-1/${checksum}.pdf`);
  });

  it("skips background prewarming when PREVIEW_PREWARM is off", async () => {
    const { service, converter, files } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
      office: { command: "/usr/bin/soffice", version: "7.6" },
      env: { PREVIEW_PREWARM: "off" },
    });

    await service.prewarm("file-1", { id: "user-1", departmentId: null });
    expect(files.fileForJob).not.toHaveBeenCalled();
    expect(converter.convertOfficeToPdf).not.toHaveBeenCalled();
  });

  it("skips prewarming when no converter is installed", async () => {
    const { service, converter } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
    });

    await service.prewarm("file-1", { id: "user-1", departmentId: null });
    expect(converter.convertOfficeToPdf).not.toHaveBeenCalled();
  });

  it("skips prewarming for files that already preview natively", async () => {
    const { service, storage } = setup({ head: pdfBytes() });
    await service.prewarm("file-1", { id: "user-1", departmentId: null });
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("never throws when prewarming hits a storage or lookup error", async () => {
    const { service, files } = setup();
    (files.fileForJob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("database offline"));
    await expect(service.prewarm("file-1", { id: "user-1", departmentId: null })).resolves.toBeUndefined();
  });

  it("keeps DWG unavailable until the ODA converter exists", async () => {
    const { service } = setup({
      file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg", storageKey: "documents/2026/plan.dwg" },
      head: dwgBytes(),
    });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "unavailable", kind: "cad", source: "dwg", reason: "converter_unavailable" });
  });

  it("serves a cached DXF preview for DWG when the converter is present", async () => {
    const { service, storage } = setup({
      file: { originalName: "plan.dwg", mimeType: "image/vnd.dwg", storageKey: "documents/2026/plan.dwg" },
      head: dwgBytes(),
      cached: { sizeBytes: 512 },
      oda: { command: "/usr/bin/ODAFileConverter", version: null },
    });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "ready", kind: "cad", source: "dwg" });
    expect(storage.head).toHaveBeenCalledWith(`previews/file-1/${checksum}.dxf`);
  });

  it("rejects previews larger than the configured limit", async () => {
    const { service } = setup({ file: { sizeBytes: BigInt(60 * 1024 * 1024) } });
    const result = await service.getPreview(principal, "file-1");
    expect(result).toMatchObject({ status: "unavailable", reason: "too_large" });
  });

  it("streams originals only for safe inline types", async () => {
    const { service } = setup();
    await expect(service.resolveContent(principal, "file-1", "original")).resolves.toMatchObject({
      key: "documents/2026/source.pdf",
      contentType: "application/pdf",
    });

    const office = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
    });
    await expect(office.service.resolveContent(principal, "file-1", "original")).rejects.toMatchObject({ status: 400 });
    await expect(office.service.resolveContent(principal, "file-1", "preview")).rejects.toMatchObject({ status: 404 });
  });

  it("removes stale cached previews and reports the result", async () => {
    const { service, storage, audit } = setup();
    (storage.listObjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      objects: [
        { key: "previews/file-1/old.pdf", sizeBytes: 10, lastModified: new Date("2020-01-01T00:00:00Z") },
        { key: "previews/file-2/new.pdf", sizeBytes: 10, lastModified: new Date() },
      ],
      truncated: false,
    });

    const result = await service.cleanupCache(principal, 30);
    expect(result).toEqual({ olderThanDays: 30, removed: 1, failed: 0, truncated: false });
    expect(storage.remove).toHaveBeenCalledWith("previews/file-1/old.pdf");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.cache.cleanup" }));
  });

  it("reports whether the caller may also download the file", async () => {
    const { service, files } = setup();
    (files.canDownloadAny as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect((await service.getPreview(principal, "file-1")).downloadable).toBe(false);

    (files.canDownloadAny as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    expect((await service.getPreview(principal, "file-1")).downloadable).toBe(true);
  });

  it("audits an open and a stream once per actor and file even when the viewer polls", async () => {
    const { service, audit } = setup();

    await service.getPreview(principal, "file-1");
    await service.getPreview(principal, "file-1");
    await service.resolveContent(principal, "file-1", "original");

    const actions = (audit.record as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => input.action as string);
    expect(actions.filter((action) => action === "preview.open")).toHaveLength(1);
    expect(actions.filter((action) => action === "preview.stream")).toHaveLength(1);
  });

  it("records a refused preview with a safe reason and no document contents", async () => {
    const { service, files, audit } = setup();
    (files.readableFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new ForbiddenException("Out of department scope"));

    await expect(service.getPreview(principal, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preview.open", result: "failure", detail: { reason: "out_of_scope" } }),
    );
  });

  it("blocks an SVG renamed as an image instead of streaming it inline", async () => {
    const { service } = setup({
      file: { originalName: "logo.png", mimeType: "image/png" },
      head: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });

    await expect(service.getPreview(principal, "file-1")).resolves.toMatchObject({ status: "unavailable", reason: "type_mismatch" });
  });

  it("does not expose raw converter output in the preview response", async () => {
    const { service, converter, audit } = setup({
      file: {
        originalName: "report.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageKey: "documents/2026/report.docx",
      },
      head: docxBytes(),
      office: { command: "/usr/bin/soffice", version: "7.6" },
    });
    (converter.convertOfficeToPdf as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("soffice: /tmp/edas-preview-abc/source.docx crashed"),
    );

    await service.getPreview(principal, "file-1");
    await vi.waitFor(() =>
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "preview.convert.done", result: "failure" })),
    );

    const failed = await service.getPreview(principal, "file-1");
    expect(failed.status).toBe("failed");
    expect(failed.message).not.toContain("/tmp");
    expect(failed.message).not.toContain("soffice");
  });
});
