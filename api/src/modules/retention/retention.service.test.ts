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
    auditEvent: { findFirst: vi.fn() },
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
    documentVisibilityFilter: vi.fn().mockImplementation(async (candidate: { departmentId: string | null }) =>
      candidate.departmentId
        ? { OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null, departmentId: candidate.departmentId }] }
        : undefined,
    ),
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
    prisma.auditEvent.findFirst.mockResolvedValueOnce(auditEvent).mockResolvedValueOnce(null);

    const certificate = await service.certificate({ sub: "user-1", username: "sara", roles: [] } as never, "item-1");

    expect(prisma.auditEvent.findFirst).toHaveBeenCalledWith({
      where: { entityType: "Document", entityId: "doc-1", action: "retention.destroy", detail: { path: ["retentionItemId"], equals: "item-1" } },
      orderBy: { seq: "desc" },
    });
    expect(certificate.retentionItemId).toBe("item-1");
    expect(certificate.certificateRef).toBe("DES-0F1E2D3C-2026");
    expect(certificate.files).toHaveLength(1);
    expect(certificate.note).toBe("انتهت المدة");
  });

  it("reports a missing certificate when the document was never destroyed", async () => {
    const { service, prisma } = buildService();
    prisma.auditEvent.findFirst.mockResolvedValue(null);

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

    await expect(service.updatePolicy({ sub: "u-1" } as never, "pol-1", { departmentId: "dept-b" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

function edgeService(options: { actor?: Record<string, unknown>; itemRow?: Record<string, unknown> | null } = {}) {
  const actor = options.actor ?? { id: "user-1", departmentId: null, role: "ARCHIVIST" };
  const prisma = {
    retentionItem: {
      findUnique: vi.fn().mockResolvedValue(options.itemRow === undefined ? item : options.itemRow),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue(item),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue(item),
    },
    retentionPolicy: {
      findUnique: vi.fn().mockResolvedValue({
        id: "pol-1",
        departmentId: null,
        isActive: true,
        name: "سياسة",
        action: "ARCHIVE",
        retentionMonths: 12,
      }),
      create: vi.fn().mockResolvedValue({ id: "pol-1", name: "سياسة", retentionMonths: 12, action: "ARCHIVE", departmentId: null }),
      update: vi.fn().mockResolvedValue({ id: "pol-1", departmentId: null }),
      delete: vi.fn().mockResolvedValue({}),
    },
    document: {
      findUnique: vi.fn().mockResolvedValue({
        id: "doc-1",
        docNo: "DOC-1",
        departmentId: null,
        folderId: "folder-1",
        ownerId: null,
        retentionEnd: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
      update: vi.fn().mockResolvedValue({ id: "doc-1", docNo: "DOC-1", title: "عقد", status: "DISPOSED", retentionEnd: null }),
    },
    documentVersion: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    fileObject: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    legalHoldDocument: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { findFirst: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    assert: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
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
  return { service, prisma, access, audit, notifications, storage, actor };
}

describe("RetentionService policy administration", () => {
  it("records a policy created by an actor with no identifier", async () => {
    const { service, prisma, audit } = edgeService({
      actor: { id: "", departmentId: "dept-a", role: "DEPT_MANAGER" },
    });

    await service.createPolicy({ sub: "u-1" } as never, { name: "سياسة", retentionMonths: 12, action: "ARCHIVE" } as never);

    expect(prisma.retentionPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "سياسة", departmentId: "dept-a", isActive: true }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.policy.create", actorId: null }));
  });

  it("reports a missing policy on update", async () => {
    const { service, prisma } = edgeService();
    prisma.retentionPolicy.findUnique.mockResolvedValue(null);

    await expect(service.updatePolicy({ sub: "u-1" } as never, "pol-404", { name: "x" } as never)).rejects.toThrow(
      "Retention policy not found",
    );
  });

  it("updates a policy without moving its department", async () => {
    const { service, prisma, audit } = edgeService({ actor: { id: "", departmentId: "dept-a", role: "SYSTEM_ADMIN" } });

    await service.updatePolicy({ sub: "u-1" } as never, "pol-1", { name: "أحدث" } as never);

    const { data } = prisma.retentionPolicy.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.departmentId).toBeUndefined();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.policy.update", actorId: null }));
  });

  it("deletes a policy and records the removal", async () => {
    const { service, prisma, audit } = edgeService({ actor: { id: "", departmentId: null, role: "SYSTEM_ADMIN" } });
    prisma.retentionPolicy.findUnique.mockResolvedValue({ id: "pol-1", name: "سياسة", departmentId: null, _count: { items: 0 } });

    await expect(service.deletePolicy({ sub: "u-1" } as never, "pol-1")).resolves.toEqual({ id: "pol-1", deleted: true });

    expect(prisma.retentionPolicy.delete).toHaveBeenCalledWith({ where: { id: "pol-1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.policy.delete", actorId: null }));
  });

  it("lists items for a global actor without a department filter", async () => {
    const { service, prisma } = edgeService({ actor: { id: "admin", departmentId: null, role: "SYSTEM_ADMIN" } });
    prisma.retentionItem.findMany = vi.fn().mockResolvedValue([]);
    prisma.retentionItem.count = vi.fn().mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (work) => Promise.all(work as Promise<unknown>[]));

    const result = await service.listItems({ sub: "admin" } as never, { page: 1, pageSize: 5 } as never);

    const where = (prisma.retentionItem.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.document).toBeUndefined();
    expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 5, total: 0 } });
    expect(prisma.legalHoldDocument.findMany).not.toHaveBeenCalled();
  });
});

describe("RetentionService scheduling and item updates", () => {
  it("reports a missing policy when scheduling", async () => {
    const { service, prisma } = edgeService();
    prisma.retentionPolicy.findUnique.mockResolvedValue(null);

    await expect(service.schedule({ sub: "u-1" } as never, { documentId: "doc-1", policyId: "pol-404" } as never)).rejects.toThrow(
      "Retention policy not found",
    );
  });

  it("schedules a document for an actor with no identifier", async () => {
    const { service, prisma, audit, notifications } = edgeService({ actor: { id: "", departmentId: null, role: "ARCHIVIST" } });

    const scheduled = await service.schedule({ sub: "u-1" } as never, { documentId: "doc-1", policyId: "pol-1" } as never);

    expect(prisma.retentionItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentId_policyId: { documentId: "doc-1", policyId: "pol-1" } } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.schedule", actorId: null }));
    expect(notifications.push).not.toHaveBeenCalled();
    expect(scheduled).toMatchObject({ id: "item-1", onHold: false });
  });

  it("extends an item and audits an anonymous actor", async () => {
    const { service, prisma, audit } = edgeService({ actor: { id: "", departmentId: null, role: "ARCHIVIST" } });

    const extended = await service.updateItem({ sub: "u-1" } as never, "item-1", { dueAt: "2026-05-01T00:00:00.000Z" } as never);

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { retentionEnd: new Date("2026-05-01T00:00:00.000Z") },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.extend", actorId: null }));
    expect(extended).toMatchObject({ id: "item-1", onHold: false });
  });
});

describe("RetentionService execution edges", () => {
  it("reports a missing item on execute", async () => {
    const { service } = edgeService({ itemRow: null });

    await expect(service.execute({ sub: "u-1" } as never, "item-404", { action: "DESTROY" })).rejects.toThrow("Retention item not found");
  });

  it("falls back to the item action and an anonymous principal", async () => {
    const { service, prisma, audit } = edgeService({
      actor: { id: "", departmentId: null, role: "ARCHIVIST" },
      itemRow: { ...item, action: "ARCHIVE" },
    });

    const result = await service.execute({ sub: "u-1" } as never, "item-1", {} as never);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.execute",
        actorId: null,
        actorName: null,
        detail: expect.objectContaining({ action: "ARCHIVE" }),
      }),
      expect.anything(),
    );
    expect(result.certificate).toBeNull();
    expect(prisma.documentVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("reports the stored objects it could not remove", async () => {
    const { service, prisma, audit, storage } = edgeService({ actor: { id: "", departmentId: null, role: "ARCHIVIST" } });
    prisma.documentVersion.findMany.mockResolvedValueOnce([ownVersion]).mockResolvedValueOnce([]);
    storage.remove.mockRejectedValue(new Error("minio unavailable"));

    const result = await service.execute({ sub: "u-1" } as never, "item-1", { action: "DESTROY" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.destroy.storage",
        result: "failure",
        actorId: null,
        actorName: null,
        detail: expect.objectContaining({ storageErrors: 1, storageKeys: ["documents/2025/own.pdf"] }),
      }),
    );
    expect(result.certificate).toMatchObject({ storageErrors: 1, fileCount: 1 });
  });

  it("destroys a document that never stored a version", async () => {
    const { service, prisma, storage } = edgeService();

    const result = await service.execute({ sub: "u-1" } as never, "item-1", { action: "DESTROY" });

    expect(prisma.documentVersion.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(prisma.fileObject.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [] } } });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(result.certificate).toMatchObject({ fileCount: 0, totalBytes: 0, files: [] });
  });

  it("certifies from the original row when the item vanished after the decision", async () => {
    const { service, prisma } = edgeService();
    prisma.retentionItem.findUnique.mockResolvedValueOnce(item).mockResolvedValueOnce(null);
    prisma.documentVersion.findMany.mockResolvedValueOnce([{ ...ownVersion, createdBy: null }]).mockResolvedValueOnce([]);

    const result = await service.execute({ sub: "u-1" } as never, "item-1", { action: "DESTROY", note: "إتلاف" });

    expect(result.certificate).toMatchObject({ fileCount: 1, note: "إتلاف", files: [expect.objectContaining({ uploadedBy: null })] });
    expect(result.item).toMatchObject({ id: "item-1" });
  });

  it("refuses to execute an item of another department", async () => {
    const { service, prisma } = edgeService({
      actor: { id: "u-1", departmentId: "dept-a", role: "ARCHIVIST" },
      itemRow: { ...item, document: { ...item.document, departmentId: "dept-b" } },
    });

    await expect(service.execute({ sub: "u-1" } as never, "item-1", { action: "ARCHIVE" })).rejects.toThrow("Out of department scope");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("RetentionService certificate edges", () => {
  it("reports a missing item", async () => {
    const { service } = edgeService({ itemRow: null });

    await expect(service.certificate({ sub: "u-1" } as never, "item-404")).rejects.toThrow("Retention item not found");
  });

  it("reports an event that carries no destruction record", async () => {
    const { service, prisma } = edgeService();
    prisma.auditEvent.findFirst.mockResolvedValue({ ...auditEvent, detail: { retentionItemId: "item-1" } });

    await expect(service.certificate({ sub: "u-1" } as never, "item-1")).rejects.toThrow(
      "No destruction certificate for this retention item",
    );
  });

  it("requires VIEW on the document before reading certificate evidence", async () => {
    const { service, access, prisma } = edgeService();
    access.assert.mockRejectedValue(new ForbiddenException());
    await expect(service.certificate({ sub: "u-1" } as never, "item-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.assert).toHaveBeenCalledWith({ sub: "u-1" }, "VIEW", item.document.folderId);
    expect(prisma.auditEvent.findFirst).not.toHaveBeenCalled();
  });

  it("rebuilds a certificate from a partial destruction record", async () => {
    const { service, prisma } = edgeService();
    prisma.auditEvent.findFirst.mockResolvedValue({ ...auditEvent, detail: { retentionItemId: "item-1", destruction: {} } });

    const certificate = await service.certificate({ sub: "u-1" } as never, "item-1");

    expect(certificate).toMatchObject({
      policy: { name: "إتلاف بعد خمس سنوات", retentionMonths: 60, legalBasis: "نظام الوثائق والسجلات" },
      dueAt: "2026-01-15T00:00:00.000Z",
      files: [],
      fileCount: 0,
      totalBytes: 0,
      storageErrors: 0,
    });
  });
});
