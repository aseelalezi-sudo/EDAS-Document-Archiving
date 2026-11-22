import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "./documents.service";

const PRINCIPAL = { sub: "user-1" } as never;

function entity(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    docNo: "DOC-2026-0001",
    departmentId: "dept-1",
    folderId: "folder-1",
    deletedAt: null as Date | null,
    isRecord: false,
    status: "DRAFT",
    checkedOutById: null as string | null,
    ownerId: "user-1",
    ...overrides,
  };
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    docNo: "DOC-2026-0001",
    title: "عقد توريد",
    titleEn: "Supply contract",
    description: "وصف",
    category: "contract",
    classification: "INTERNAL",
    status: "DRAFT",
    isRecord: false,
    currentVersion: 1,
    fileType: "application/pdf",
    sizeBytes: 4096n,
    tags: ["عقود"],
    retentionEnd: null,
    folderId: "folder-1",
    departmentId: "dept-1",
    sectionId: null,
    projectId: null,
    ownerId: "user-1",
    checkedOutById: null,
    checkedOutAt: null,
    signatureStatus: "NONE",
    signedById: null,
    signedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: new Date("2026-01-01T08:00:00.000Z"),
    updatedAt: new Date("2026-01-02T08:00:00.000Z"),
    owner: { name: "سارة", nameEn: "Sara" },
    department: { name: "المالية", nameEn: "Finance" },
    folder: { name: "العقود" },
    checkedOutBy: null,
    signedBy: null,
    deletedBy: null,
    ...overrides,
  };
}

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ver-1",
    version: 1,
    comment: "الإصدار الأول",
    isCurrent: true,
    createdById: "user-1",
    createdAt: new Date("2026-01-01T08:00:00.000Z"),
    createdBy: { name: "سارة" },
    file: {
      id: "file-1",
      originalName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096n,
      checksumSha256: "abc123",
      createdAt: new Date("2026-01-01T08:00:00.000Z"),
    },
    ...overrides,
  };
}

function buildService() {
  const state = {
    doc: entity(),
    signatureStatus: "NONE",
    isRecord: false,
  };

  const prisma = {
    document: {
      findMany: vi.fn().mockResolvedValue([listRow()]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        if (!where?.id) return null;
        if (!select) return where.id === "doc-1" ? state.doc : null;
        if (select.docNo) return listRow({ id: where.id });
        if (select.deletedAt) return { deletedAt: state.doc.deletedAt, status: state.doc.status, isRecord: state.doc.isRecord };
        if (select.signatureStatus) return { signatureStatus: state.signatureStatus };
        if (select.isRecord) return { isRecord: state.isRecord };
        return listRow({ id: where.id });
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => listRow({ id: "doc-new", ...data })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        listRow({ id: where.id, ...data }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    documentVersion: {
      findMany: vi.fn(async (args: { include?: unknown; select?: Record<string, unknown> } = {}) => {
        if (args.include) return [versionRow()];
        if (args.select?.fileId) return [{ fileId: "file-1" }];
        return [];
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "ver-2", version: 2, fileId: "file-2", isCurrent: true }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    fileObject: {
      findUnique: vi.fn().mockResolvedValue({
        id: "file-1",
        storageKey: "documents/2026/contract.pdf",
        uploadedById: "user-1",
        mimeType: "application/pdf",
        sizeBytes: 4096n,
      }),
      findMany: vi.fn().mockResolvedValue([{ id: "file-1", storageKey: "documents/2026/contract.pdf" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    folder: { findUnique: vi.fn().mockResolvedValue({ departmentId: "dept-1" }) },
    retentionItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    legalHoldDocument: { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    approvalInstance: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    approvalDecision: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  };

  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );

  const actor = { id: "user-1", departmentId: "dept-1", role: "DEPT_MANAGER" };
  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    listScope: vi.fn().mockResolvedValue({ actor, departmentId: "dept-1" }),
    assert: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(false),
    assertDepartmentScope: vi.fn().mockResolvedValue(undefined),
    permissionsFor: vi.fn().mockResolvedValue(new Set(["VIEW", "EDIT", "DELETE", "APPROVE", "CREATE"])),
    documentVisibilityFilter: vi.fn().mockResolvedValue({ OR: [{ folderId: { in: ["folder-1"] } }, { folderId: null, departmentId: "dept-1" }] }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const preview = { prewarm: vi.fn().mockResolvedValue(undefined) };

  return {
    service: new DocumentsService(prisma as never, access as never, audit as never, storage as never, preview as never),
    prisma,
    access,
    audit,
    storage,
    preview,
    state,
  };
}

describe("DocumentsService listing", () => {
  it("defaults to page one and twenty-five rows over the live documents", async () => {
    const { service, prisma, access } = buildService();
    const manager = { id: "user-1", departmentId: "dept-1", role: "DEPT_MANAGER" };
    access.listScope.mockResolvedValue({ actor: manager, departmentId: "dept-1" });

    const result = await service.list(PRINCIPAL, {} as never);

    const args = prisma.document.findMany.mock.calls[0][0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(25);
    expect(args.where).toMatchObject({
      deletedAt: null,
      AND: [{ OR: [{ folderId: { in: ["folder-1"] } }, { folderId: null, departmentId: "dept-1" }] }],
    });
    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, departmentId: "dept-1" });
    expect(result.items[0]).toMatchObject({
      id: "doc-1",
      sizeBytes: 4096,
      ownerName: "سارة",
      departmentName: "المالية",
      folderName: "العقود",
    });
  });

  it("applies every filter, the free-text OR block and the administrator's department override", async () => {
    const { service, prisma, access } = buildService();
    const admin = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };
    access.listScope.mockResolvedValue({ actor: admin, departmentId: undefined });

    const result = await service.list(PRINCIPAL, {
      page: 3,
      pageSize: 10,
      departmentId: "dept-2",
      folderId: "folder-2",
      status: "ARCHIVED",
      classification: "PUBLIC",
      projectId: "proj-1",
      category: "contract",
      tag: "مالية",
      q: "  عقد  ",
    } as never);

    const args = prisma.document.findMany.mock.calls[0][0] as { where: Record<string, unknown>; skip: number; take: number };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({
      deletedAt: null,
      departmentId: "dept-2",
      folderId: "folder-2",
      status: "ARCHIVED",
      classification: "PUBLIC",
      projectId: "proj-1",
      category: "contract",
      tags: { has: "مالية" },
    });
    expect(args.where.AND).toEqual([await access.documentVisibilityFilter()]);
    expect(args.where.OR).toHaveLength(7);
    expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 1, departmentId: null });
  });

  it("ignores a blank free-text term", async () => {
    const { service, prisma } = buildService();

    await service.list(PRINCIPAL, { q: "   " } as never);

    const args = prisma.document.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.OR).toBeUndefined();
  });

  it("lists only trashed documents in the trash", async () => {
    const { service, prisma } = buildService();

    await service.trash(PRINCIPAL, {} as never);

    const args = prisma.document.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.deletedAt).toEqual({ not: null });
  });

  it("falls back to the actor's department when the scope hands back none", async () => {
    const { service, access } = buildService();
    access.listScope.mockResolvedValue({ actor: { id: "user-1", departmentId: "dept-1", role: "DEPT_MANAGER" }, departmentId: null });

    const result = await service.trash(PRINCIPAL, {} as never);

    expect(result.meta.departmentId).toBe("dept-1");
  });

  it("leaves the department filter open for an unscoped administrator without a query", async () => {
    const { service, prisma, access } = buildService();
    access.listScope.mockResolvedValue({ actor: { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" }, departmentId: undefined });

    await service.list(PRINCIPAL, {} as never);

    const args = prisma.document.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.departmentId).toBeUndefined();
    expect(args.where.AND).toEqual([await access.documentVisibilityFilter()]);
  });
});

describe("DocumentsService detail and permissions", () => {
  it("returns the document with its versions and file metadata", async () => {
    const { service } = buildService();

    const detail = await service.get(PRINCIPAL, "doc-1");

    expect(detail).toMatchObject({ id: "doc-1", title: "عقد توريد", sizeBytes: 4096 });
    expect(detail.versions).toEqual([
      expect.objectContaining({
        id: "ver-1",
        version: 1,
        createdByName: "سارة",
        file: expect.objectContaining({ id: "file-1", sizeBytes: 4096, checksumSha256: "abc123" }),
      }),
    ]);
  });

  it("reports a missing document", async () => {
    const { service } = buildService();

    await expect(service.get(PRINCIPAL, "doc-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the permission set for a scoped document", async () => {
    const { service, access } = buildService();
    access.permissionsFor.mockResolvedValue(new Set(["VIEW", "DOWNLOAD"]));

    await expect(service.permissions(PRINCIPAL, "doc-1")).resolves.toEqual({
      documentId: "doc-1",
      actions: ["VIEW", "DOWNLOAD"],
    });
  });

  it("refuses to read a document the actor has no view grant on", async () => {
    const { service, access } = buildService();
    access.permissionsFor.mockResolvedValue(new Set(["DOWNLOAD"]));

    await expect(service.get(PRINCIPAL, "doc-1")).rejects.toThrow(/Missing permission: VIEW/);
  });

  it("returns empty labels when the document has no owner, department or folder left", async () => {
    const { service, prisma } = buildService();
    prisma.document.findUnique
      .mockResolvedValueOnce(entity())
      .mockResolvedValueOnce(listRow({ owner: null, department: null, folder: null }));
    prisma.documentVersion.findMany.mockResolvedValue([versionRow({ createdBy: null })]);

    const detail = await service.get(PRINCIPAL, "doc-1");

    expect(detail).toMatchObject({
      ownerName: null,
      ownerNameEn: null,
      departmentName: null,
      departmentNameEn: null,
      folderName: null,
    });
    expect(detail.versions[0].createdByName).toBeNull();
  });

  it("reports a detail row that disappeared between the lookup and the projection", async () => {
    const { service, prisma } = buildService();
    prisma.document.findUnique.mockResolvedValueOnce(entity()).mockResolvedValueOnce(null);

    await expect(service.get(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("DocumentsService creation", () => {
  function uploader(global: boolean) {
    const context = buildService();
    context.access.isGlobal.mockReturnValue(global);
    context.access.assert.mockResolvedValue({ id: "user-1", departmentId: "dept-1", role: global ? "SYSTEM_ADMIN" : "EMPLOYEE" });
    context.access.resolveActor.mockResolvedValue({
      id: "user-1",
      departmentId: global ? null : "dept-1",
      role: global ? "SYSTEM_ADMIN" : "EMPLOYEE",
    });
    return context;
  }

  it("creates the document, its first version and the audit event", async () => {
    const { service, prisma, audit, preview } = uploader(false);

    const created = await service.create(PRINCIPAL, {
      title: "عقد جديد",
      folderId: "folder-1",
      fileId: "file-1",
      comment: "أول إصدار",
    } as never);

    expect(prisma.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "عقد جديد",
        departmentId: "dept-1",
        ownerId: "user-1",
        fileType: "application/pdf",
        sizeBytes: 4096n,
        versions: { create: expect.objectContaining({ version: 1, fileId: "file-1", isCurrent: true, comment: "أول إصدار" }) },
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.create", entityId: "doc-new" }),
      expect.anything(),
    );
    expect(preview.prewarm).toHaveBeenCalledWith("file-1", expect.objectContaining({ id: "user-1" }));
    expect(created).toMatchObject({ id: "doc-new" });
  });

  it("keeps the actor's department when no folder is supplied", async () => {
    const { service, prisma } = uploader(false);

    await service.create(PRINCIPAL, { title: "بدون مجلد", fileId: "file-1" } as never);

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-1", folderId: undefined }) }),
    );
  });

  it("falls back to the requested department when the folder has none", async () => {
    const { service, prisma } = uploader(true);
    prisma.folder.findUnique.mockResolvedValue({ departmentId: null });

    await service.create(PRINCIPAL, { title: "مشترك", folderId: "folder-1", departmentId: "dept-9", fileId: "file-1" } as never);

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-9" }) }),
    );
  });

  it("refuses a folder that belongs to another department", async () => {
    const { service, prisma } = uploader(true);
    prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-other" });

    await expect(
      service.create(PRINCIPAL, { title: "خارج النطاق", folderId: "folder-1", departmentId: "dept-9", fileId: "file-1" } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown folder as not found", async () => {
    const { service, prisma } = uploader(false);
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(service.create(PRINCIPAL, { title: "مفقود", folderId: "folder-ghost", fileId: "file-1" } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("leaves the department empty when an unscoped administrator files without one", async () => {
    const { service, prisma } = uploader(true);

    await service.create(PRINCIPAL, { title: "بلا إدارة", fileId: "file-1" } as never);

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: null, folderId: undefined }) }),
    );
  });

  it("keeps the owner and version author empty for a service account without an id", async () => {
    const context = uploader(false);
    context.access.assert.mockResolvedValue({ id: "", departmentId: "dept-1", role: "EMPLOYEE" });
    context.prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-1",
      storageKey: "documents/2026/contract.pdf",
      uploadedById: "",
      mimeType: "application/pdf",
      sizeBytes: 4096n,
    });

    await context.service.create(PRINCIPAL, { title: "آلي", folderId: "folder-1", fileId: "file-1" } as never);

    const args = context.prisma.document.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.ownerId).toBeNull();
    expect((args.data.versions as { create: { createdById: string | null } }).create.createdById).toBeNull();
  });
});

describe("DocumentsService trash and restore", () => {
  it("returns the existing deletion when the document is already in the trash", async () => {
    const { service, prisma, audit, state } = buildService();
    state.doc = entity({ deletedAt: new Date("2026-02-01T00:00:00.000Z") });

    const result = await service.remove(PRINCIPAL, "doc-1");

    expect(result).toEqual({ id: "doc-1", deleted: true, deletedAt: new Date("2026-02-01T00:00:00.000Z") });
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("refuses to trash a declared record", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ isRecord: true });

    await expect(service.remove(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to trash a document under an active legal hold", async () => {
    const { service, prisma } = buildService();
    prisma.legalHoldDocument.count.mockResolvedValue(1);

    await expect(service.remove(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("trashes the document and records who deleted it", async () => {
    const { service, prisma, audit } = buildService();

    const result = await service.remove(PRINCIPAL, "doc-1");

    expect(result).toMatchObject({ id: "doc-1", deleted: true });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: null, isRecord: false },
      data: { deletedAt: expect.any(Date), deletedById: "user-1" },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.trash", entityId: "doc-1" }), expect.anything());
  });

  it("reports a concurrent trash as a conflict", async () => {
    const { service, prisma } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.remove(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("records no deleter for a service account without an id", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: "ARCHIVIST" });

    await service.remove(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedById: null }) }),
    );
  });

  it("refuses to restore a document that is not in the trash", async () => {
    const { service, prisma } = buildService();

    await expect(service.restore(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("restores a trashed document and records it", async () => {
    const { service, prisma, audit, state } = buildService();
    state.doc = entity({ deletedAt: new Date("2026-02-01T00:00:00.000Z") });

    const detail = await service.restore(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.restore" }), expect.anything());
    expect(detail).toMatchObject({ id: "doc-1" });
  });

  it("reports a lost restore race instead of pretending success", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ deletedAt: new Date("2026-02-01T00:00:00.000Z") });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.restore(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("DocumentsService versions", () => {
  it.each(["add", "restore"])("rejects a version %s if disposal finished while waiting for the document lock", async (operation) => {
    const { service, prisma, state, audit } = buildService();
    prisma.$executeRaw.mockImplementationOnce(async () => {
      state.doc = entity({ status: "DISPOSED" });
      return 1;
    });
    const write = operation === "add"
      ? service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" })
      : service.restoreVersion(PRINCIPAL, "doc-1", "ver-1");
    await expect(write).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.documentVersion.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("refuses a new version on a disposed document", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ status: "DISPOSED" });

    await expect(service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.documentVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a new version on a trashed document", async () => {
    const { service, state } = buildService();
    state.doc = entity({ deletedAt: new Date() });

    await expect(service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("numbers the first version as one and prewarms its preview", async () => {
    const { service, prisma, preview } = buildService();
    prisma.documentVersion.create.mockResolvedValue({ id: "ver-1", version: 1, fileId: "file-1", isCurrent: true });

    const result = await service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1", comment: "أول" } as never);

    expect(prisma.documentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ documentId: "doc-1", fileId: "file-1", version: 1, isCurrent: true, comment: "أول" }),
    });
    expect(prisma.documentVersion.updateMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" }, data: { isCurrent: false } });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({ currentVersion: 1, signatureStatus: "NONE", signedById: null, signedAt: null }),
    });
    expect(preview.prewarm).toHaveBeenCalledWith("file-1", expect.anything());
    expect(result).toMatchObject({ documentId: "doc-1", version: 1, isCurrent: true });
  });

  it("increments the latest version", async () => {
    const { service, prisma } = buildService();
    prisma.documentVersion.findFirst.mockResolvedValue({ version: 3 });
    prisma.documentVersion.create.mockResolvedValue({ id: "ver-4", version: 4, fileId: "file-2", isCurrent: true });

    const result = await service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never);

    expect(prisma.documentVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 4 }) }));
    expect(result.version).toBe(4);
  });

  it("maps a concurrent version insert to a conflict", async () => {
    const { service, prisma } = buildService();
    prisma.documentVersion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.1.0" }),
    );

    await expect(service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets any other version failure through untouched", async () => {
    const { service, prisma } = buildService();
    prisma.documentVersion.create.mockRejectedValue(new Error("connection reset"));

    await expect(service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never)).rejects.toThrow(/connection reset/);
  });

  it("records no author for a service account without an id", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: "ARCHIVIST" });
    prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-1",
      storageKey: "documents/2026/contract.pdf",
      uploadedById: "",
      mimeType: "application/pdf",
      sizeBytes: 4096n,
    });

    await service.addVersion(PRINCIPAL, "doc-1", { fileId: "file-1" } as never);

    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: null }) }),
    );
  });

  it("refuses to restore a version on a disposed or trashed document", async () => {
    const disposed = buildService();
    disposed.state.doc = entity({ status: "DISPOSED" });
    await expect(disposed.service.restoreVersion(PRINCIPAL, "doc-1", "ver-1")).rejects.toBeInstanceOf(ConflictException);

    const trashed = buildService();
    trashed.state.doc = entity({ deletedAt: new Date() });
    await expect(trashed.service.restoreVersion(PRINCIPAL, "doc-1", "ver-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports an unknown version", async () => {
    const { service } = buildService();

    await expect(service.restoreVersion(PRINCIPAL, "doc-1", "ver-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to reopen a declared record through its first version", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ isRecord: true });
    prisma.documentVersion.findFirst.mockResolvedValue(versionRow({ version: 1 }));

    await expect(service.restoreVersion(PRINCIPAL, "doc-1", "ver-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.documentVersion.updateMany).not.toHaveBeenCalled();
  });

  it("restores a later version without changing the status", async () => {
    const { service, prisma } = buildService();
    prisma.documentVersion.findFirst.mockResolvedValue(versionRow({ version: 3 }));

    await service.restoreVersion(PRINCIPAL, "doc-1", "ver-3");

    expect(prisma.documentVersion.update).toHaveBeenCalledWith({ where: { id: "ver-1" }, data: { isCurrent: true } });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({ currentVersion: 3, status: undefined, signatureStatus: "NONE" }),
    });
  });

  it("returns a first-version restore to draft", async () => {
    const { service, prisma } = buildService();
    prisma.documentVersion.findFirst.mockResolvedValue(versionRow({ version: 1 }));

    await service.restoreVersion(PRINCIPAL, "doc-1", "ver-1");

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentVersion: 1, status: "DRAFT" }) }),
    );
  });
});

describe("DocumentsService checkout locks", () => {
  it("checks the document out to the actor", async () => {
    const { service, prisma, audit } = buildService();

    const detail = await service.checkout(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: "doc-1",
        deletedAt: null,
        status: { not: "DISPOSED" },
        OR: [{ checkedOutById: null }, { checkedOutById: "user-1" }],
      },
      data: { checkedOutById: "user-1", checkedOutAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.checkout" }), expect.anything());
    expect(detail).toMatchObject({ id: "doc-1" });
  });

  it("refuses a checkout held by another user", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ checkedOutById: "user-2" });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.checkout(PRINCIPAL, "doc-1")).rejects.toThrow(/another user/);
  });

  it("holds a service account checkout without an id", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: "ARCHIVIST" });

    await service.checkout(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ checkedOutById: null }) }),
    );
  });

  it("reports an unavailable checkout without a holder", async () => {
    const { service, prisma } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.checkout(PRINCIPAL, "doc-1")).rejects.toThrow(/not available for checkout/);
  });

  it("checks the document back in for its holder", async () => {
    const { service, prisma, audit, state } = buildService();
    state.doc = entity({ checkedOutById: "user-1" });

    const detail = await service.checkin(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", OR: [{ checkedOutById: "user-1" }, { checkedOutById: null }] },
      data: { checkedOutById: null, checkedOutAt: null },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.checkin" }), expect.anything());
    expect(detail).toMatchObject({ id: "doc-1" });
  });

  it("refuses a check-in by anyone but the holder", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ checkedOutById: "user-2" });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.checkin(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an administrator release any checkout", async () => {
    const { service, prisma, access } = buildService();
    access.isGlobal.mockReturnValue(true);
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.checkin(PRINCIPAL, "doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: "doc-1" }, data: { checkedOutById: null, checkedOutAt: null } });
  });
});

describe("DocumentsService signatures and records", () => {
  it("requests a signature and records it", async () => {
    const { service, prisma, audit } = buildService();

    await service.requestSignature(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: null, status: { not: "DISPOSED" }, signatureStatus: { not: "SIGNED" } },
      data: { signatureStatus: "PENDING" },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.signature.request" }), expect.anything());
  });

  it("refuses a signature request on an already signed document", async () => {
    const { service, prisma } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.requestSignature(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("signs the document and records the signer", async () => {
    const { service, prisma, audit } = buildService();

    await service.sign(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: null, status: { not: "DISPOSED" }, signatureStatus: { not: "SIGNED" } },
      data: { signatureStatus: "SIGNED", signedById: "user-1", signedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.signature.sign" }), expect.anything());
  });

  it("treats a concurrent signature as the desired state", async () => {
    const { service, prisma, audit, state } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    state.signatureStatus = "SIGNED";

    await expect(service.sign(PRINCIPAL, "doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("signs without a signer id for a service account", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "", departmentId: "dept-1", role: "ARCHIVIST" });

    await service.sign(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signedById: null }) }),
    );
  });

  it("refuses a signature that cannot be applied", async () => {
    const { service, prisma, state } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    state.signatureStatus = "PENDING";

    await expect(service.sign(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns the document without writing when it is already a record", async () => {
    const { service, prisma, state } = buildService();
    state.doc = entity({ isRecord: true });

    await expect(service.declareRecord(PRINCIPAL, "doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("declares the record and records it", async () => {
    const { service, prisma, audit } = buildService();

    await service.declareRecord(PRINCIPAL, "doc-1");

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", isRecord: false, deletedAt: null, status: { not: "DISPOSED" } },
      data: { isRecord: true, status: "ARCHIVED" },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.declare-record" }), expect.anything());
  });

  it("accepts a concurrent declaration as the desired state", async () => {
    const { service, prisma, audit, state } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    state.isRecord = true;

    await expect(service.declareRecord(PRINCIPAL, "doc-1")).resolves.toMatchObject({ id: "doc-1" });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("refuses a declaration that cannot be applied", async () => {
    const { service, prisma } = buildService();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.declareRecord(PRINCIPAL, "doc-1")).rejects.toBeInstanceOf(ConflictException);
  });
});
