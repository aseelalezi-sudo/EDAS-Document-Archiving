import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { RetentionService } from "./retention.service";

const item = {
  id: "item-1",
  documentId: "doc-1",
  policyId: "pol-1",
  dueAt: new Date("2026-01-15T00:00:00.000Z"),
  status: "scheduled",
  action: "DESTROY",
  document: {
    id: "doc-1",
    docNo: "DOC-2026-0001",
    title: "اتفاقية تقديم خدمات",
    status: "APPROVED",
    isRecord: true,
    departmentId: null,
    retentionEnd: null,
    folderId: "folder-1",
    ownerId: null,
    owner: null,
  },
  policy: { id: "pol-1", name: "إتلاف بعد خمس سنوات", action: "DESTROY", retentionMonths: 60, legalBasis: "نظام الوثائق والسجلات" },
};

const ownVersion = {
  version: 1,
  createdAt: new Date("2025-01-10T08:00:00.000Z"),
  createdBy: { name: "نورة العتيبي" },
  file: {
    id: "file-own",
    storageKey: "documents/2025/own.pdf",
    originalName: "contract.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096n,
    checksumSha256: "aaa111",
  },
};

const sharedVersion = {
  version: 2,
  createdAt: new Date("2025-06-01T08:00:00.000Z"),
  createdBy: { name: "خالد الدوسري" },
  file: {
    id: "file-shared",
    storageKey: "documents/2025/shared.pdf",
    originalName: "contract-v2.pdf",
    mimeType: "application/pdf",
    sizeBytes: 8192n,
    checksumSha256: "bbb222",
  },
};

const auditEvent = {
  id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
  ts: new Date("2026-02-01T10:00:00.000Z"),
  hash: "hash-123",
  actorId: "user-1",
  actorName: "سارة المطيري",
  detail: {
    retentionItemId: "item-1",
    note: "انتهت المدة",
    destruction: {
      policyName: "إتلاف بعد خمس سنوات",
      retentionMonths: 60,
      legalBasis: "نظام الوثائق والسجلات",
      dueAt: "2026-01-15T00:00:00.000Z",
      files: [
        {
          version: 1,
          originalName: "contract.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
          checksumSha256: "aaa111",
          uploadedBy: "نورة العتيبي",
          uploadedAt: "2025-01-10T08:00:00.000Z",
        },
      ],
      fileCount: 1,
      totalBytes: 4096,
      storageErrors: 0,
    },
  },
};

function buildService() {
  const prisma = {
    retentionItem: { findUnique: vi.fn().mockResolvedValue(item), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    document: {
      update: vi.fn().mockResolvedValue({ id: "doc-1", docNo: item.document.docNo, title: item.document.title, status: "DISPOSED" }),
    },
    documentVersion: { findMany: vi.fn(), deleteMany: vi.fn() },
    fileObject: { deleteMany: vi.fn() },
    legalHoldDocument: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { findMany: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn().mockResolvedValue([{ id: "item-1" }, { id: "doc-1", status: "DISPOSED" }]),
  };
  const transaction = prisma.$transaction as unknown as {
    mockImplementation: (work: (input: unknown) => Promise<unknown>) => void;
  };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );
  const access = {
    assert: vi.fn().mockResolvedValue({ id: "user-1", departmentId: null, role: "ARCHIVIST" }),
    resolveActor: vi.fn().mockResolvedValue({ id: "user-1", departmentId: null, role: "ARCHIVIST" }),
    isGlobal: vi.fn().mockReturnValue(true),
  };
  const audit = {
    record: vi.fn(async (input: { actorId: string | null; actorName: string | null; detail: unknown }) => ({
      id: auditEvent.id,
      ts: auditEvent.ts,
      hash: auditEvent.hash,
      actorId: input.actorId,
      actorName: input.actorName,
      detail: input.detail,
    })),
  };
  const notifications = { push: vi.fn() };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const service = new RetentionService(prisma as never, access as never, audit as never, notifications as never, storage as never);
  return { service, prisma, access, audit, storage };
}

describe("RetentionService disposal", () => {
  it("destroys stored content and returns a certificate when the action is DESTROY", async () => {
    const { service, prisma, audit, storage } = buildService();
    prisma.documentVersion.findMany.mockResolvedValueOnce([ownVersion, sharedVersion]).mockResolvedValueOnce([{ fileId: "file-shared" }]);

    const result = await service.execute({ sub: "user-1", username: "sara", name: "سارة المطيري", roles: [] } as never, "item-1", {
      action: "DESTROY",
      note: "انتهت المدة",
    });

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { status: "DISPOSED", sizeBytes: 0n },
      select: expect.anything(),
    });
    expect(prisma.documentVersion.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(prisma.fileObject.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["file-own"] } } });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith("documents/2025/own.pdf");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.destroy",
        entityId: "doc-1",
        actorName: "سارة المطيري",
        detail: expect.objectContaining({
          retentionItemId: "item-1",
          destruction: expect.objectContaining({ fileCount: 2, totalBytes: 12288, storageErrors: 0 }),
        }),
      }),
      expect.anything(),
    );

    expect(result.certificate).toMatchObject({
      certificateRef: "DES-0F1E2D3C-2026",
      auditEventId: auditEvent.id,
      auditHash: "hash-123",
      performedBy: "سارة المطيري",
      fileCount: 2,
      totalBytes: 12288,
      policy: { name: "إتلاف بعد خمس سنوات", legalBasis: "نظام الوثائق والسجلات" },
    });
    expect(result.certificate?.files.map((file) => file.checksumSha256)).toEqual(["aaa111", "bbb222"]);
  });

  it("refuses to destroy a document that is under an active legal hold", async () => {
    const { service, prisma } = buildService();
    prisma.legalHoldDocument.count.mockResolvedValue(1);

    await expect(
      service.execute({ sub: "user-1", username: "sara", roles: [] } as never, "item-1", { action: "DESTROY" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.retentionItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.documentVersion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("leaves content untouched for non-destructive actions", async () => {
    const { service, prisma, audit, storage } = buildService();

    const result = await service.execute({ sub: "user-1", username: "sara", roles: [] } as never, "item-1", { action: "ARCHIVE" });

    expect(prisma.documentVersion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fileObject.deleteMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(result.certificate).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.execute" }), expect.anything());
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { status: "ARCHIVED" },
      select: expect.anything(),
    });
  });

  it("reads the certificate back from the immutable audit event", async () => {
    const { service, prisma } = buildService();
    prisma.auditEvent.findMany.mockResolvedValue([
      { ...auditEvent, detail: { ...auditEvent.detail, retentionItemId: "item-other" } },
      auditEvent,
    ]);

    const certificate = await service.certificate({ sub: "user-1", username: "sara", roles: [] } as never, "item-1");

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
      where: { entityType: "Document", entityId: "doc-1", action: "retention.destroy" },
      orderBy: { ts: "desc" },
      take: 20,
    });
    expect(certificate.retentionItemId).toBe("item-1");
    expect(certificate.certificateRef).toBe("DES-0F1E2D3C-2026");
    expect(certificate.files).toHaveLength(1);
    expect(certificate.note).toBe("انتهت المدة");
  });

  it("reports a missing certificate when the document was never destroyed", async () => {
    const { service, prisma } = buildService();
    prisma.auditEvent.findMany.mockResolvedValue([]);

    await expect(service.certificate({ sub: "user-1", username: "sara", roles: [] } as never, "item-1")).rejects.toThrow(
      "No destruction certificate for this retention item",
    );
  });
});

describe("RetentionService policy scope", () => {
  function policyService(actor: { id: string; departmentId: string | null; role: string }, policyDepartmentId: string | null) {
    const prisma = {
      retentionPolicy: {
        findUnique: vi.fn().mockResolvedValue({ id: "pol-1", departmentId: policyDepartmentId }),
        update: vi.fn().mockResolvedValue({ id: "pol-1", departmentId: "dept-b" }),
      },
    };
    const access = {
      resolveActor: vi.fn().mockResolvedValue(actor),
      isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new RetentionService(
      prisma as never,
      access as never,
      audit as never,
      { push: vi.fn() } as never,
      { remove: vi.fn() } as never,
    );
    return { service, prisma };
  }

  it("refuses to move a policy into another department", async () => {
    const { service, prisma } = policyService({ id: "u-1", departmentId: "dept-a", role: "DEPT_MANAGER" }, "dept-a");

    await expect(
      service.updatePolicy({ sub: "u-1" } as never, "pol-1", { departmentId: "dept-b" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.retentionPolicy.update).not.toHaveBeenCalled();
  });

  it("lets a global actor move a policy between departments", async () => {
    const { service, prisma } = policyService({ id: "u-1", departmentId: null, role: "SYSTEM_ADMIN" }, "dept-a");

    await service.updatePolicy({ sub: "u-1" } as never, "pol-1", { departmentId: "dept-b" } as never);

    expect(prisma.retentionPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pol-1" }, data: expect.objectContaining({ departmentId: "dept-b" }) }),
    );
  });
});
