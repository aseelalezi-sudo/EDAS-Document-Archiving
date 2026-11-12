import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AclAction } from "@prisma/client";
import { DownloadTicketService } from "../../common/download/download-ticket.service";
import { FilesService, MIME_EXTENSIONS } from "./files.service";

const CHECKSUM = "a".repeat(64);

function buildService(actor: Record<string, unknown> = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" }) {
  const usedTickets = new Set<string>();
  const prisma = {
    uploadIntent: {
      create: vi.fn().mockResolvedValue({ id: "intent-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    fileObject: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    reportRun: { findMany: vi.fn().mockResolvedValue([]) },
    downloadTicketUse: {
      create: vi.fn((args: { data: { nonce: string } }) => {
        if (usedTickets.has(args.data.nonce)) return Promise.reject({ code: "P2002" });
        usedTickets.add(args.data.nonce);
        return Promise.resolve(args.data);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as {
    mockImplementation: (impl: (work: (tx: unknown) => Promise<unknown>) => unknown) => void;
  };
  transaction.mockImplementation((work: (tx: unknown) => Promise<unknown>) => work(prisma));
  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    assertDepartmentScope: vi.fn().mockResolvedValue(undefined),
    permissionsFor: vi.fn().mockResolvedValue(new Set([AclAction.VIEW, AclAction.EXPORT])),
  };
  const storage = {
    bucketName: "edas-documents",
    presignExpiresSeconds: 900,
    presignUpload: vi.fn().mockResolvedValue("https://minio/put?X-Signature=abc"),
    presignDownload: vi.fn().mockResolvedValue("https://minio/get?X-Signature=abc"),
    head: vi.fn().mockResolvedValue({ sizeBytes: 2048, mimeType: "application/pdf" }),
    sha256: vi.fn().mockResolvedValue({ checksum: CHECKSUM, sizeBytes: 2048 }),
    readHead: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n")),
    get: vi.fn().mockResolvedValue(null),
    listKeys: vi.fn().mockResolvedValue({ keys: [], truncated: false }),
    remove: vi.fn().mockResolvedValue(undefined),
    removePrefix: vi.fn().mockResolvedValue({ removed: 0, failed: 0, truncated: false }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const config = { get: vi.fn().mockReturnValue(undefined) };
  const service = new FilesService(
    prisma as never,
    access as never,
    storage as never,
    audit as never,
    config as never,
    new DownloadTicketService(config as never, prisma as never),
  );
  return { service, prisma, access, storage, audit, config, actor };
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1",
    storageKey: "documents/2026/8a7c.pdf",
    actorId: "user-1",
    mimeType: "application/pdf",
    maxBytes: 50 * 1024 * 1024,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    ...overrides,
  };
}

function fileObject(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    bucket: "edas-documents",
    storageKey: "documents/2026/8a7c.pdf",
    originalName: "contract.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048n,
    checksumSha256: CHECKSUM,
    uploadedById: "user-1",
    createdAt: new Date("2026-11-05T08:00:00.000Z"),
    ...overrides,
  };
}

describe("FilesService presignUpload", () => {
  it("rejects a content type outside the allowed list", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.presignUpload(
        { sub: "user-1" } as never,
        { fileName: "payload.exe", mimeType: "application/x-msdownload", sizeBytes: 1024 } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it("refuses executable and markup-by-proxy types even when the extension looks safe", async () => {
    const { service } = buildService();

    for (const mimeType of ["application/x-msdownload", "text/html", "image/svg+xml", "application/x-sh"]) {
      await expect(
        service.presignUpload(
          { sub: "user-1" } as never,
          { fileName: `note.${mimeType === "text/html" ? "html" : "pdf"}`, mimeType } as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it("rejects an extension that contradicts the declared content type", async () => {
    const { service, storage } = buildService();

    await expect(
      service.presignUpload({ sub: "user-1" } as never, { fileName: "invoice.docx", mimeType: "application/pdf", sizeBytes: 512 } as never),
    ).rejects.toThrow(/does not match/);
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("rejects a size above the configured upload limit", async () => {
    const context = buildService();
    context.config.get.mockImplementation((key: string) => (key === "MAX_UPLOAD_BYTES" ? "1048576" : undefined));

    await expect(
      context.service.presignUpload(
        { sub: "user-1" } as never,
        { fileName: "scan.pdf", mimeType: "application/pdf", sizeBytes: 2_000_000 } as never,
      ),
    ).rejects.toThrow(/upload limit of 1048576 bytes/);
    expect(context.prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it("records an intent bound to the account, type and limit before handing out the URL", async () => {
    const { service, prisma, storage } = buildService();

    const result = await service.presignUpload(
      { sub: "user-1" } as never,
      {
        fileName: "C:\\Users\\x\\تصريح العمل.pdf",
        mimeType: "application/pdf; charset=binary",
        sizeBytes: 4096,
      } as never,
    );

    expect(result).toMatchObject({ bucket: "edas-documents", method: "PUT", maxBytes: 50 * 1024 * 1024 });
    expect(result.storageKey).toMatch(/^documents\/\d{4}\/[0-9a-f-]{36}\.pdf$/);
    expect(prisma.uploadIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: result.storageKey,
        actorId: "user-1",
        mimeType: "application/pdf",
        maxBytes: 50 * 1024 * 1024,
        expiresAt: expect.any(Date),
      }),
    });
    expect(storage.presignUpload).toHaveBeenCalledWith(result.storageKey, "application/pdf");
    expect(prisma.uploadIntent.create.mock.invocationCallOrder[0]).toBeLessThan(storage.presignUpload.mock.invocationCallOrder[0]);
    expect(result.storageKey).not.toContain("تصريح");
  });

  it("writes the department of the actor on the presign audit event", async () => {
    const { service, audit } = buildService();

    await service.presignUpload({ sub: "user-1" } as never, { fileName: "scan.pdf", mimeType: "application/pdf" } as never);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "file.presign", actorId: "user-1", departmentId: "dept-1" }),
    );
  });

  it("honours an explicit ALLOWED_UPLOAD_MIME list", async () => {
    const context = buildService();
    context.config.get.mockImplementation((key: string) => (key === "ALLOWED_UPLOAD_MIME" ? "application/pdf,image/png" : undefined));

    await expect(
      context.service.presignUpload({ sub: "user-1" } as never, { fileName: "sheet.xlsx", mimeType: "application/vnd.ms-excel" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      context.service.presignUpload({ sub: "user-1" } as never, { fileName: "scan.pdf", mimeType: "application/pdf" } as never),
    ).resolves.toMatchObject({
      storageKey: expect.stringContaining(".pdf"),
    });
  });

  it("accepts the office and CAD types the product advertises and still refuses unknown binaries", async () => {
    const { service } = buildService();

    await expect(
      service.presignUpload(
        { sub: "user-1" } as never,
        {
          fileName: "عرض.pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        } as never,
      ),
    ).resolves.toMatchObject({ storageKey: expect.stringContaining(".pptx") });

    await expect(
      service.presignUpload({ sub: "user-1" } as never, { fileName: "drawing.dwg", mimeType: "image/vnd.dwg" } as never),
    ).resolves.toMatchObject({ storageKey: expect.stringContaining(".dwg") });

    await expect(
      service.presignUpload({ sub: "user-1" } as never, { fileName: "drawing.dxf", mimeType: "application/dxf" } as never),
    ).resolves.toMatchObject({ storageKey: expect.stringContaining(".dxf") });

    await expect(
      service.presignUpload({ sub: "user-1" } as never, { fileName: "payload.bin", mimeType: "application/octet-stream" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps the built-in type catalogue free of markup and script types", () => {
    expect(Object.keys(MIME_EXTENSIONS)).not.toContain("text/html");
    expect(Object.keys(MIME_EXTENSIONS)).not.toContain("image/svg+xml");
  });

  it("falls back to the built-in catalogue when the configured list holds no usable entry", async () => {
    const context = buildService();
    context.config.get.mockImplementation((key: string) => (key === "ALLOWED_UPLOAD_MIME" ? " , ," : undefined));

    await expect(
      context.service.presignUpload({ sub: "user-1" } as never, { fileName: "scan.pdf", mimeType: "application/pdf" } as never),
    ).resolves.toMatchObject({ storageKey: expect.stringContaining(".pdf") });
  });

  it("refuses a name that carries nothing but control characters", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.presignUpload({ sub: "user-1" } as never, { fileName: "\u0001\u0007", mimeType: "application/pdf" } as never),
    ).rejects.toThrow(/File name must not be empty/);
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it("refuses an allowed type it cannot map to an extension", async () => {
    const context = buildService();
    context.config.get.mockImplementation((key: string) => (key === "ALLOWED_UPLOAD_MIME" ? "application/x-custom" : undefined));

    await expect(
      context.service.presignUpload({ sub: "user-1" } as never, { fileName: "scan.pdf", mimeType: "application/x-custom" } as never),
    ).rejects.toThrow(/does not match the declared type/);
  });

  it("refuses a request that declares no content type at all", async () => {
    const { service, prisma } = buildService();

    await expect(service.presignUpload({ sub: "user-1" } as never, { fileName: "scan.pdf", mimeType: undefined } as never)).rejects.toThrow(
      /Unsupported content type/,
    );
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });
});

describe("FilesService register", () => {
  it("refuses a storage key that was never presigned", async () => {
    const { service, prisma, storage } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(null);

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/guest.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.head).not.toHaveBeenCalled();
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("refuses a key presigned by another account", async () => {
    const { service, prisma } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent({ actorId: "user-2" }));

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/not presigned by the current account/);
  });

  it("rejects a traversal-shaped storage key", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "../edas-documents/documents/2026/x.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.uploadIntent.findUnique).not.toHaveBeenCalled();
  });

  it("refuses to register the same intent twice", async () => {
    const { service, prisma } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent({ consumedAt: new Date("2026-11-05T09:00:00.000Z") }));

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses an expired intent", async () => {
    const { service, prisma } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/expired/);
  });

  it("loses the race against a concurrent registration", async () => {
    const { service, prisma } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    prisma.uploadIntent.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("refuses an object that is missing, empty, or bigger than the presigned limit", async () => {
    const missing = buildService();
    missing.prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    missing.storage.head.mockResolvedValue(null);
    await expect(
      missing.service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const empty = buildService();
    empty.prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    empty.storage.head.mockResolvedValue({ sizeBytes: 0, mimeType: "application/pdf" });
    await expect(
      empty.service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/empty/);

    const oversize = buildService();
    oversize.prisma.uploadIntent.findUnique.mockResolvedValue(intent({ maxBytes: 1024 }));
    oversize.storage.head.mockResolvedValue({ sizeBytes: 4096, mimeType: "application/pdf" });
    await expect(
      oversize.service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/larger than the presigned limit of 1024 bytes/);
    expect(oversize.prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("refuses a size or content-type that contradicts what storage reports", async () => {
    const sizeMismatch = buildService();
    sizeMismatch.prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    sizeMismatch.storage.head.mockResolvedValue({ sizeBytes: 9999, mimeType: "application/pdf" });
    await expect(
      sizeMismatch.service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/does not match the stored size/);

    const typeMismatch = buildService();
    typeMismatch.prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    typeMismatch.storage.head.mockResolvedValue({ sizeBytes: 2048, mimeType: "application/x-msdownload" });
    await expect(
      typeMismatch.service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/Stored content type application\/x-msdownload/);
    expect(typeMismatch.prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("stores the presigned type and the real object size instead of the client declaration", async () => {
    const { service, prisma, storage } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent({ mimeType: "application/pdf" }));
    storage.head.mockResolvedValue({ sizeBytes: 77777, mimeType: "application/pdf" });
    storage.sha256.mockResolvedValue({ checksum: CHECKSUM, sizeBytes: 77777 });
    prisma.fileObject.create.mockResolvedValue(fileObject({ sizeBytes: 77777n }));

    const result = await service.register(
      { sub: "user-1" } as never,
      {
        storageKey: "documents/2026/8a7c.pdf",
        originalName: "../../evil/../عقد العمل.pdf",
        mimeType: "application/octet-stream",
        sizeBytes: 77777,
        checksumSha256: CHECKSUM.toUpperCase(),
      } as never,
    );

    expect(prisma.fileObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mimeType: "application/pdf",
        sizeBytes: 77777n,
        checksumSha256: CHECKSUM,
        originalName: "عقد العمل.pdf",
      }),
    });
    expect(result).toMatchObject({ mimeType: "application/pdf", sizeBytes: 77777, checksumSha256: CHECKSUM });
    expect(prisma.uploadIntent.updateMany).toHaveBeenCalledWith({
      where: { id: "intent-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("refuses an upload whose stored bytes contradict the declared checksum", async () => {
    const { service, prisma, storage } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    storage.sha256.mockResolvedValue({ checksum: "b".repeat(64), sizeBytes: 2048 });

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/does not match the declared checksum/);
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
    expect(prisma.uploadIntent.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an upload it cannot stream back for verification", async () => {
    const { service, prisma, storage } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    storage.sha256.mockResolvedValue(null);

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/could not be read for verification/);
    expect(prisma.fileObject.create).not.toHaveBeenCalled();
  });

  it("refuses a registration whose name carries nothing printable", async () => {
    const { service, prisma } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent());

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "\u0001\u0007",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/File name must not be empty/);
    expect(prisma.uploadIntent.findUnique).not.toHaveBeenCalled();
  });

  it("accepts an object whose storage layer reports no content type", async () => {
    const { service, prisma, storage } = buildService();
    prisma.uploadIntent.findUnique.mockResolvedValue(intent());
    storage.head.mockResolvedValue({ sizeBytes: 2048, mimeType: null });
    prisma.fileObject.create.mockResolvedValue(fileObject());

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).resolves.toMatchObject({ mimeType: "application/pdf" });
  });

  it("refuses a registration without a name", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.register(
        { sub: "user-1" } as never,
        {
          storageKey: "documents/2026/8a7c.pdf",
          originalName: undefined,
          mimeType: "application/pdf",
          sizeBytes: 2048,
          checksumSha256: CHECKSUM,
        } as never,
      ),
    ).rejects.toThrow(/File name must not be empty/);
    expect(prisma.uploadIntent.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an empty storage key and one over the length limit", async () => {
    const { service, prisma } = buildService();

    for (const storageKey of ["", `documents/2026/${"a".repeat(512)}.pdf`]) {
      await expect(
        service.register(
          { sub: "user-1" } as never,
          {
            storageKey,
            originalName: "x.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            checksumSha256: CHECKSUM,
          } as never,
        ),
      ).rejects.toThrow(/Invalid storage key/);
    }
    expect(prisma.uploadIntent.findUnique).not.toHaveBeenCalled();
  });
});

describe("FilesService downloadUrl", () => {
  function withFile(context: ReturnType<typeof buildService>, file: Record<string, unknown>) {
    context.prisma.fileObject.findUnique.mockResolvedValue(file);
    return context;
  }

  it("refuses a file attached to a document outside the account scope", async () => {
    const context = buildService();
    context.access.assertDepartmentScope.mockRejectedValue(new ForbiddenException("Out of department scope"));
    withFile(context, {
      ...fileObject(),
      versions: [{ document: { id: "doc-9", departmentId: "dept-9", folderId: "folder-9", ownerId: "user-9", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.storage.presignDownload).not.toHaveBeenCalled();
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "file.download", result: "failure", detail: { reason: "not_allowed" } }),
    );
  });

  it("refuses a file whose only linked document denies VIEW even when the department matches", async () => {
    const context = buildService();
    context.access.permissionsFor.mockResolvedValue(new Set<AclAction>());
    withFile(context, {
      ...fileObject(),
      versions: [{ document: { id: "doc-1", departmentId: "dept-1", folderId: "folder-1", ownerId: "user-2", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("grants a global role and audits the actor, department and number of linked documents", async () => {
    const context = buildService({ id: "user-3", departmentId: null, role: "AUDITOR" });
    context.access.assertDepartmentScope.mockResolvedValue(undefined);
    withFile(context, {
      ...fileObject({ uploadedById: "user-9" }),
      versions: [{ document: { id: "doc-1", departmentId: "dept-9", folderId: "folder-1", ownerId: "user-9", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-3" } as never, "file-1")).resolves.toMatchObject({ fileName: "contract.pdf" });
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.download",
        entityId: "file-1",
        actorId: "user-3",
        departmentId: null,
        detail: expect.objectContaining({ linkedDocuments: 1 }),
      }),
    );
  });

  it("issues a short-lived API link for in-browser previews instead of a storage URL", async () => {
    const context = buildService();
    withFile(context, { ...fileObject(), versions: [] });

    const result = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1", {
      inline: true,
      baseUrl: "https://edas.example",
    });

    expect(result).toMatchObject({ fileName: "contract.pdf", expiresInSeconds: 120 });
    expect(result.url).toMatch(/^https:\/\/edas\.example\/api\/v1\/files\/file-1\/content\?ticket=[A-Za-z0-9_-]{40,}$/);
    const ticket = result.url.match(/ticket=([A-Za-z0-9_-]+)/)?.[1];
    expect(ticket).toBeDefined();
    const verified = context.service.verifyDownloadTicket(ticket!, "file-1");
    expect(verified).toMatchObject({ sub: "user-1", inline: true });
    expect(result.url).not.toContain("minio");
    expect(context.storage.presignDownload).not.toHaveBeenCalled();
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ mode: "proxy", inline: true, requestedInline: true }) }),
    );
  });

  it("lets an owner read a trashed document version", async () => {
    const context = buildService();
    withFile(context, {
      ...fileObject({ uploadedById: "user-9" }),
      versions: [
        {
          document: {
            id: "doc-1",
            departmentId: "dept-2",
            folderId: "folder-1",
            ownerId: "user-1",
            deletedAt: new Date("2026-11-01T00:00:00.000Z"),
          },
        },
      ],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).resolves.toMatchObject({
      url: expect.stringMatching(/^\/api\/v1\/files\/file-1\/content\?ticket=[A-Za-z0-9_-]{40,}$/),
    });
  });

  it("restricts an unattached upload to the account that uploaded it", async () => {
    const stranger = buildService();
    withFile(stranger, fileObject({ uploadedById: "user-2", versions: [] }));
    await expect(stranger.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);

    const uploader = buildService();
    withFile(uploader, fileObject({ uploadedById: "user-1", versions: [] }));
    await expect(uploader.service.downloadUrl({ sub: "user-1" } as never, "file-1")).resolves.toMatchObject({ fileName: "contract.pdf" });
  });

  it("still requires a provisioned account before touching storage", async () => {
    const context = buildService();
    context.access.resolveActor.mockRejectedValue(new ForbiddenException("Account is not provisioned in EDAS"));

    await expect(context.service.downloadUrl({ sub: "ghost" } as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.prisma.fileObject.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown file id", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(null);

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses the original when the account only has view permission on the document", async () => {
    const context = buildService();
    context.access.permissionsFor.mockResolvedValue(new Set([AclAction.VIEW]));
    withFile(context, {
      ...fileObject(),
      versions: [{ document: { id: "doc-1", departmentId: "dept-1", folderId: "folder-1", ownerId: "user-2", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toThrow(/Missing permission: EXPORT/);
    expect(context.storage.presignDownload).not.toHaveBeenCalled();
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "file.download", result: "failure", detail: { reason: "missing_download_permission" } }),
    );
  });

  it("forces an attachment when inline is requested for content that is not safe to render", async () => {
    const context = buildService();
    withFile(context, { ...fileObject(), versions: [] });
    context.storage.readHead.mockResolvedValue(Buffer.from([0x00, 0x01, 0x02, 0x03]));

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1", { inline: true })).resolves.toMatchObject({
      fileName: "contract.pdf",
    });
    expect(context.storage.presignDownload).not.toHaveBeenCalled();
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ inline: false, requestedInline: true }) }),
    );
  });

  it("treats an unreadable header as unsafe and keeps the download an attachment", async () => {
    const context = buildService();
    withFile(context, { ...fileObject(), versions: [] });
    context.storage.readHead.mockResolvedValue(null);

    await context.service.downloadUrl({ sub: "user-1" } as never, "file-1", { inline: true });

    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ inline: false, requestedInline: true }) }),
    );
  });

  it("keeps the denial when the failure audit is down before the ACL check", async () => {
    const context = buildService();
    context.access.assertDepartmentScope.mockRejectedValue(new ForbiddenException("Out of department scope"));
    context.audit.record.mockRejectedValue(new Error("audit chain locked"));
    withFile(context, {
      ...fileObject(),
      versions: [{ document: { id: "doc-9", departmentId: "dept-9", folderId: "folder-9", ownerId: "user-9", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps the denial when the download audit is down after the file check", async () => {
    const context = buildService();
    context.access.permissionsFor.mockResolvedValue(new Set<AclAction>([AclAction.VIEW]));
    context.audit.record.mockRejectedValue(new Error("audit chain locked"));
    withFile(context, {
      ...fileObject(),
      versions: [{ document: { id: "doc-1", departmentId: "dept-1", folderId: "folder-1", ownerId: "user-2", deletedAt: null } }],
    });

    await expect(context.service.downloadUrl({ sub: "user-1" } as never, "file-1")).rejects.toThrow(/Missing permission: EXPORT/);
  });
});

describe("FilesService openTicketDownload", () => {
  function linkedFile(overrides: Record<string, unknown> = {}) {
    return {
      ...fileObject(overrides),
      versions: [{ document: { id: "doc-1", departmentId: "dept-1", folderId: "folder-1", ownerId: "user-2", deletedAt: null } }],
    };
  }

  function ticketOf(url: string): string {
    return new URL(url, "http://localhost").searchParams.get("ticket") ?? "";
  }

  it("streams the original as an attachment for a valid ticket", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());

    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1");
    const content = await context.service.openTicketDownload("file-1", ticketOf(url));

    expect(content).toEqual({
      key: "documents/2026/8a7c.pdf",
      contentType: "application/octet-stream",
      fileName: "contract.pdf",
      sizeBytes: 2048,
      inline: false,
    });
  });

  it("keeps inline rendering for a safe PDF ticket and audits delivery once", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());

    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1", { inline: true });
    const ticket = ticketOf(url);

    await expect(context.service.openTicketDownload("file-1", ticket)).resolves.toMatchObject({
      contentType: "application/pdf",
      inline: true,
    });
    await context.service.openTicketDownload("file-1", ticket);

    const delivered = context.audit.record.mock.calls.filter(
      ([event]) => (event as { detail?: { delivered?: boolean } }).detail?.delivered === true,
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0][0]).toMatchObject({ action: "file.download", entityId: "file-1", actorId: "user-1" });
  });

  it("rejects a missing, unknown or foreign ticket", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());

    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1");
    const ticket = ticketOf(url);

    await expect(context.service.openTicketDownload("file-1", undefined)).rejects.toThrow(/invalid or has expired/);
    await expect(context.service.openTicketDownload("file-1", "deadbeef")).rejects.toThrow(/invalid or has expired/);
    const tampered = `${ticket.slice(0, -2)}${ticket.endsWith("AA") ? "BB" : "AA"}`;
    await expect(context.service.openTicketDownload("file-1", tampered)).rejects.toThrow(/invalid or has expired/);
    await expect(context.service.openTicketDownload("file-9", ticket)).rejects.toThrow(/invalid or has expired/);
    expect(context.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "file.download", result: "failure", detail: { reason: "invalid_ticket" } }),
    );
    await expect(context.service.openTicketDownload("file-1", ticket)).resolves.toMatchObject({
      key: "documents/2026/8a7c.pdf",
    });
  });

  it("re-checks the download permission when the ticket is used", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());

    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1");
    context.access.permissionsFor.mockResolvedValue(new Set<AclAction>([AclAction.VIEW]));

    await expect(context.service.openTicketDownload("file-1", ticketOf(url))).rejects.toThrow(/Missing permission: EXPORT/);
  });

  it("still refuses a bad ticket when the audit chain itself is down", async () => {
    const context = buildService();
    context.audit.record.mockRejectedValue(new Error("audit chain locked"));

    await expect(context.service.openTicketDownload("file-1", undefined)).rejects.toThrow(/invalid or has expired/);
    await expect(context.service.openTicketDownload("file-1", "deadbeef")).rejects.toThrow(/invalid or has expired/);
  });

  it("serves the file even when the delivery audit cannot be written", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());
    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1");
    context.audit.record.mockRejectedValue(new Error("audit chain locked"));

    await expect(context.service.openTicketDownload("file-1", ticketOf(url))).resolves.toMatchObject({
      key: "documents/2026/8a7c.pdf",
    });
  });

  it("keeps the denial when the failure audit cannot be written", async () => {
    const context = buildService();
    context.prisma.fileObject.findUnique.mockResolvedValue(linkedFile());
    const { url } = await context.service.downloadUrl({ sub: "user-1" } as never, "file-1");
    context.access.permissionsFor.mockResolvedValue(new Set<AclAction>([AclAction.VIEW]));
    context.audit.record.mockRejectedValue(new Error("audit chain locked"));

    await expect(context.service.openTicketDownload("file-1", ticketOf(url))).rejects.toThrow(/Missing permission: EXPORT/);
  });
});

describe("FilesService internal lookups", () => {
  it("resolves the actor and the linked documents for a readable file", async () => {
    const { service, prisma, access } = buildService();
    const stored = {
      ...fileObject(),
      versions: [{ document: { id: "doc-1", departmentId: "dept-1", folderId: "folder-1", ownerId: "user-2", deletedAt: null } }],
    };
    prisma.fileObject.findUnique.mockResolvedValue(stored);

    const readable = await service.readableFile({ sub: "user-1" } as never, "file-1");

    expect(access.resolveActor).toHaveBeenCalledWith({ sub: "user-1" });
    expect(readable.actor).toMatchObject({ id: "user-1", departmentId: "dept-1" });
    expect(readable.file.id).toBe("file-1");
    expect(readable.documents.map((document) => document.id)).toEqual(["doc-1"]);
  });

  it("hands a background job the stored row without an ACL check", async () => {
    const { service, prisma, access } = buildService();
    prisma.fileObject.findUnique.mockResolvedValue(fileObject());

    await expect(service.fileForJob("file-1")).resolves.toMatchObject({ id: "file-1", storageKey: "documents/2026/8a7c.pdf" });
    expect(access.resolveActor).not.toHaveBeenCalled();
    expect(prisma.fileObject.findUnique).toHaveBeenCalledWith({ where: { id: "file-1" } });
  });

  it("returns null for a job that asks for a file that is gone", async () => {
    const { service, prisma } = buildService();
    prisma.fileObject.findUnique.mockResolvedValue(null);

    await expect(service.fileForJob("file-missing")).resolves.toBeNull();
  });
});

describe("FilesService checksum verification", () => {
  const AUDITOR = { id: "user-9", departmentId: null, role: "AUDITOR" };

  it("re-hashes the stored object and reports the match", async () => {
    const { service, prisma, storage, audit } = buildService(AUDITOR);
    const body = Buffer.from("contract bytes");
    const checksum = createHash("sha256").update(body).digest("hex");
    prisma.fileObject.findUnique.mockResolvedValue(fileObject({ checksumSha256: checksum, sizeBytes: BigInt(body.length) }));
    storage.head.mockResolvedValue({ sizeBytes: body.length, mimeType: "application/pdf" });
    storage.get.mockResolvedValue(body);

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: true, reason: null, actualChecksum: checksum, declaredSizeBytes: body.length });
    expect(storage.get).toHaveBeenCalledWith("documents/2026/8a7c.pdf", expect.any(Number));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "file.verify", result: "success" }));
  });

  it("reports a replaced object as a checksum mismatch and audits the failure", async () => {
    const { service, prisma, storage, audit } = buildService(AUDITOR);
    const body = Buffer.from("edited after archiving");
    prisma.fileObject.findUnique.mockResolvedValue(fileObject({ checksumSha256: CHECKSUM, sizeBytes: BigInt(body.length) }));
    storage.head.mockResolvedValue({ sizeBytes: body.length, mimeType: "application/pdf" });
    storage.get.mockResolvedValue(body);

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: false, reason: "checksum_mismatch" });
    expect(result.actualChecksum).toBe(createHash("sha256").update(body).digest("hex"));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "file.verify", result: "failure" }));
  });

  it("does not download an object that the bucket no longer holds", async () => {
    const { service, prisma, storage } = buildService(AUDITOR);
    prisma.fileObject.findUnique.mockResolvedValue(fileObject());
    storage.head.mockResolvedValue(null);

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: false, reason: "missing_object", storedSizeBytes: null });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("stops at a size change before spending time on the hash", async () => {
    const { service, prisma, storage } = buildService(AUDITOR);
    prisma.fileObject.findUnique.mockResolvedValue(fileObject());
    storage.head.mockResolvedValue({ sizeBytes: 999, mimeType: "application/pdf" });

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: false, reason: "size_mismatch", storedSizeBytes: 999 });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown file id", async () => {
    const { service, prisma } = buildService(AUDITOR);
    prisma.fileObject.findUnique.mockResolvedValue(null);

    await expect(service.verify({ sub: "user-9" } as never, "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reports an object it can see but cannot read", async () => {
    const { service, prisma, storage } = buildService(AUDITOR);
    prisma.fileObject.findUnique.mockResolvedValue(fileObject());
    storage.get.mockResolvedValue(null);

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: false, reason: "unreadable_object", actualChecksum: null });
  });

  it("compares against an empty fingerprint when the row never stored one", async () => {
    const { service, prisma, storage } = buildService(AUDITOR);
    prisma.fileObject.findUnique.mockResolvedValue(fileObject({ checksumSha256: null }));
    storage.get.mockResolvedValue(Buffer.from("%PDF-1.7\n"));

    const result = await service.verify({ sub: "user-9" } as never, "file-1");

    expect(result).toMatchObject({ ok: false, reason: "checksum_mismatch", expectedChecksum: "" });
    expect(result.actualChecksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("FilesService integrity inventory", () => {
  it("separates rows without objects, objects without rows and files nothing points at", async () => {
    const attached = fileObject({ id: "file-attached", storageKey: "documents/2026/attached.pdf", versions: [{ documentId: "doc-1" }] });
    const lostObject = fileObject({ id: "file-lost", storageKey: "documents/2026/lost.pdf", versions: [{ documentId: "doc-2" }] });
    const unattached = fileObject({ id: "file-loose", storageKey: "documents/2026/loose.pdf", versions: [] });
    const reportFile = fileObject({ id: "file-report", storageKey: "reports/2026/run-1.csv", versions: [] });

    const { service, prisma, storage, audit } = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.fileObject.findMany.mockResolvedValue([attached, lostObject, unattached, reportFile]);
    prisma.reportRun.findMany.mockResolvedValue([{ fileId: "file-report" }]);
    storage.listKeys.mockResolvedValue({
      keys: [attached.storageKey, unattached.storageKey, reportFile.storageKey, "documents/2026/ghost.pdf"],
      truncated: false,
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id: "doc-3",
        docNo: "DOC-3",
        currentVersion: 2,
        status: "APPROVED",
        versionCount: 3,
        currentFlags: 0,
        flaggedVersion: null,
      },
    ]);

    const report = await service.integrity({ sub: "user-9" } as never);

    expect(report.files).toMatchObject({ total: 4, attachedToDocuments: 2, attachedToReportRuns: 1, unreferencedCount: 1 });
    expect(report.files.unreferenced.map((row: { id: string }) => row.id)).toEqual(["file-loose"]);
    expect(report.storage.missingObjects.map((row: { id: string }) => row.id)).toEqual(["file-lost"]);
    expect(report.storage.orphanObjects).toEqual(["documents/2026/ghost.pdf"]);
    expect(report.versions).toMatchObject({ mismatchCount: 1 });
    expect(report.versions.mismatches[0]).toMatchObject({ docNo: "DOC-3", currentFlags: 0 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "file.integrity" }));
  });

  it("lists the whole bucket once instead of probing every row", async () => {
    const { service, storage } = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });

    await service.integrity({ sub: "user-9" } as never);

    expect(storage.listKeys).toHaveBeenCalledWith("", expect.any(Number));
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("counts every finding but caps each displayed list at 50 and says so", async () => {
    const missingRows = Array.from({ length: 60 }, (_, index) =>
      fileObject({
        id: `file-missing-${index}`,
        storageKey: `documents/2026/missing-${index}.pdf`,
        versions: [{ documentId: `doc-missing-${index}` }],
      }),
    );
    const looseRows = Array.from({ length: 55 }, (_, index) =>
      fileObject({
        id: `file-loose-${index}`,
        storageKey: `documents/2026/loose-${index}.pdf`,
        versions: [],
      }),
    );
    const orphanKeys = Array.from({ length: 70 }, (_, index) => `documents/2026/orphan-${index}.pdf`);
    const pointerRows = Array.from({ length: 50 }, (_, index) => ({
      id: `doc-${index}`,
      docNo: `DOC-${index}`,
      currentVersion: 1,
      status: "APPROVED",
      versionCount: 1,
      currentFlags: 0,
      flaggedVersion: null,
      totalCount: 137,
    }));

    const { service, prisma, storage, audit } = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.fileObject.findMany.mockResolvedValue([...missingRows, ...looseRows]);
    prisma.reportRun.findMany.mockResolvedValue([]);
    storage.listKeys.mockResolvedValue({ keys: [...looseRows.map((row) => row.storageKey), ...orphanKeys], truncated: false });
    prisma.$queryRaw.mockResolvedValue(pointerRows);

    const report = await service.integrity({ sub: "user-9" } as never);

    expect(report.files.unreferencedCount).toBe(55);
    expect(report.files.unreferenced).toHaveLength(50);
    expect(report.files.unreferencedTruncated).toBe(true);
    expect(report.storage.missingObjectsCount).toBe(60);
    expect(report.storage.missingObjects).toHaveLength(50);
    expect(report.storage.missingObjectsTruncated).toBe(true);
    expect(report.storage.orphanObjectsCount).toBe(70);
    expect(report.storage.orphanObjects).toHaveLength(50);
    expect(report.storage.orphanObjectsTruncated).toBe(true);
    expect(report.versions.mismatchCount).toBe(137);
    expect(report.versions.mismatches).toHaveLength(50);
    expect(report.versions.mismatchesTruncated).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.integrity",
        detail: expect.objectContaining({
          missingObjects: 60,
          orphanObjects: 70,
          unreferencedFiles: 55,
          pointerIssues: 137,
          truncated: { unreferenced: true, missingObjects: true, orphanObjects: true, mismatches: true },
        }),
      }),
    );
  });

  it("does not blame the storage when its listing failed", async () => {
    const attached = fileObject({ id: "file-1", storageKey: "documents/2026/attached.pdf", versions: [{ documentId: "doc-1" }] });
    const { service, prisma, storage, audit } = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.fileObject.findMany.mockResolvedValue([attached]);
    prisma.reportRun.findMany.mockResolvedValue([]);
    storage.listKeys.mockResolvedValue({ keys: [], truncated: false, error: "Access Denied" });
    prisma.$queryRaw.mockResolvedValue([]);

    const report = await service.integrity({ sub: "user-9" } as never);

    expect(report.storage).toMatchObject({
      listedObjects: 0,
      listingFailed: true,
      listingError: "Access Denied",
      missingObjectsCount: 0,
      missingObjects: [],
      orphanObjectsCount: 0,
      orphanObjects: [],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.integrity",
        detail: expect.objectContaining({ listingFailed: true, listingError: "Access Denied", missingObjects: 0, orphanObjects: 0 }),
      }),
    );
  });
});

describe("FilesService purgeUnreferenced", () => {
  const loose = fileObject({ id: "file-loose", storageKey: "documents/2026/loose.pdf", versions: [] });
  const attached = fileObject({ id: "file-attached", storageKey: "documents/2026/keep.pdf", versions: [{ documentId: "doc-1" }] });

  function debris() {
    const found = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });
    found.prisma.fileObject.findMany.mockResolvedValue([attached, loose]);
    found.storage.listKeys.mockResolvedValue({
      keys: [attached.storageKey, loose.storageKey, "documents/2026/ghost.pdf"],
      truncated: false,
    });
    return found;
  }

  it("previews the plan without deleting a single row or object", async () => {
    const { service, prisma, storage, audit } = debris();

    const plan = await service.purgeUnreferenced({ sub: "user-9" } as never, {});

    expect(plan.dryRun).toBe(true);
    expect(plan.files.map((row: { id: string }) => row.id)).toEqual(["file-loose"]);
    expect(plan.storageKeys).toEqual(["documents/2026/ghost.pdf"]);
    expect(prisma.fileObject.deleteMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: "file.purge_unreferenced" }));
  });

  it("deletes only after confirmation and records what it removed", async () => {
    const { service, prisma, storage, audit } = debris();

    const result = await service.purgeUnreferenced({ sub: "user-9" } as never, { confirm: true });

    expect(result.dryRun).toBe(false);
    expect(result.deleted).toMatchObject({ files: 1, objects: 2, failures: [] });
    expect(prisma.fileObject.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["file-loose"] } } });
    expect(storage.remove.mock.calls.map(([key]) => key)).toEqual(["documents/2026/loose.pdf", "documents/2026/ghost.pdf"]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "file.purge_unreferenced" }));
  });

  it("re-reads the references inside the transaction and spares a file claimed meanwhile", async () => {
    const { service, prisma, storage } = debris();
    prisma.fileObject.findMany
      .mockResolvedValueOnce([attached, loose])
      .mockResolvedValueOnce([attached, { ...loose, versions: [{ documentId: "doc-9" }] }]);

    const result = await service.purgeUnreferenced({ sub: "user-9" } as never, { confirm: true });

    expect(prisma.fileObject.deleteMany).not.toHaveBeenCalled();
    expect(result.deleted).toMatchObject({ files: 0, objects: 1 });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith("documents/2026/ghost.pdf");
  });

  it("refuses to delete a file the inventory does not list as unreferenced", async () => {
    const { service, prisma, storage } = debris();

    await expect(service.purgeUnreferenced({ sub: "user-9" } as never, { fileIds: ["file-attached"], confirm: true })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("refuses an object key the inventory does not list as orphaned", async () => {
    const { service, prisma, storage } = debris();

    await expect(
      service.purgeUnreferenced({ sub: "user-9" } as never, { storageKeys: ["documents/2026/keep.pdf"], confirm: true }),
    ).rejects.toThrow(/storage keys the inventory lists as orphaned/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("reports the objects it could not reach instead of pretending they are gone", async () => {
    const { service, storage } = debris();
    storage.remove.mockRejectedValueOnce(new Error("minio unavailable"));

    const result = await service.purgeUnreferenced({ sub: "user-9" } as never, {
      storageKeys: ["documents/2026/ghost.pdf"],
      confirm: true,
    });

    expect(result.deleted).toMatchObject({ files: 1, objects: 1, failures: ["documents/2026/loose.pdf"] });
  });

  it("confirms an empty purge without touching storage", async () => {
    const { service, prisma, storage, audit } = buildService({ id: "user-9", departmentId: null, role: "SYSTEM_ADMIN" });
    prisma.fileObject.findMany.mockResolvedValue([]);
    storage.listKeys.mockResolvedValue({ keys: [], truncated: false });

    const result = await service.purgeUnreferenced({ sub: "user-9" } as never, { confirm: true });

    expect(result.deleted).toEqual({ files: 0, objects: 0, failures: [] });
    expect(prisma.fileObject.deleteMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.purge_unreferenced",
        result: "success",
        detail: expect.objectContaining({ files: 0, objects: 0 }),
      }),
    );
  });
});
