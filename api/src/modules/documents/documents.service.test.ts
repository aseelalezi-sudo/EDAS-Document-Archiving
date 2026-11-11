import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DocumentsService } from "./documents.service";
import { AccessService } from "../../common/access/access.service";
import type { Actor } from "../../common/access/access.service";

const document = {
  id: "doc-1",
  docNo: "DOC-2026-0001",
  departmentId: null,
  folderId: "folder-1",
  deletedAt: new Date("2026-03-02T08:00:00.000Z"),
  isRecord: false,
};

function buildService() {
  const prisma = {
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    documentVersion: {
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    fileObject: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    retentionItem: { deleteMany: vi.fn() },
    legalHoldDocument: { deleteMany: vi.fn(), count: vi.fn() },
    approvalInstance: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    approvalDecision: { deleteMany: vi.fn() },
    folder: { findUnique: vi.fn().mockResolvedValue({ departmentId: "dept-folder" }) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as { mockImplementation: (work: (input: unknown) => Promise<unknown>) => void };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );
  const access = {
    resolveActor: vi.fn(),
    assert: vi.fn(),
    isGlobal: vi.fn(),
    assertDepartmentScope: vi.fn().mockResolvedValue(undefined),
    permissionsFor: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const preview = { prewarm: vi.fn().mockResolvedValue(undefined) };
  const service = new DocumentsService(prisma as never, access as never, audit as never, storage as never, preview as never);
  return { service, prisma, access, audit, storage, preview };
}

function allowAdmin({ prisma, access }: ReturnType<typeof buildService>) {
  prisma.document.findUnique.mockResolvedValue(document);
  access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: null, role: "SYSTEM_ADMIN" });
  access.isGlobal.mockReturnValue(true);
  access.permissionsFor.mockResolvedValue(new Set(["DELETE"]));
  prisma.legalHoldDocument.count.mockResolvedValue(0);
}

describe("DocumentsService update", () => {
  it("records the change reason in the audit trail without persisting it as a document field", async () => {
    const context = buildService();
    const { service, prisma, audit } = context;
    allowAdmin(context);
    context.access.permissionsFor.mockResolvedValue(new Set(["EDIT"]));
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    const detailSpy = vi
      .spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail")
      .mockResolvedValue({ id: "doc-1" });

    await service.update({ sub: "user-1" } as never, "doc-1", { title: "Updated title", reason: "Wrong date on the cover page" });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "doc-1" }, data: expect.not.objectContaining({ reason: expect.anything() }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.update",
        detail: expect.objectContaining({ title: "Updated title", reason: "Wrong date on the cover page" }),
      }),
      expect.anything(),
    );
    expect(detailSpy).toHaveBeenCalledWith("doc-1");
  });
});

describe("DocumentsService folder moves", () => {
  function moving(departmentId: string | null, folderDepartmentId: string | null, actor: Record<string, unknown> = {}) {
    const context = buildService();
    const { service, prisma, access } = context;
    allowAdmin(context);
    access.permissionsFor.mockResolvedValue(new Set(["EDIT", "CREATE"]));
    access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: "dept-a", role: "DEPT_MANAGER", ...actor });
    access.isGlobal.mockImplementation((candidate: Actor) => candidate.role === "SYSTEM_ADMIN");
    prisma.document.findUnique.mockResolvedValue({ ...document, departmentId, deletedAt: null, status: "DRAFT" });
    prisma.folder.findUnique.mockResolvedValue({ departmentId: folderDepartmentId });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-1" });
    return context;
  }

  it("re-derives the department from the destination folder when an administrator moves a document", async () => {
    const { service, prisma, audit } = moving("dept-a", "dept-b", { role: "SYSTEM_ADMIN" });

    await service.update({ sub: "user-1" } as never, "doc-1", { folderId: "folder-2" });

    expect(prisma.folder.findUnique).toHaveBeenCalledWith({ where: { id: "folder-2" }, select: { departmentId: true } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ folderId: "folder-2", departmentId: "dept-b" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.update", departmentId: "dept-b" }),
      expect.anything(),
    );
  });

  it("keeps the current department when the destination folder has none", async () => {
    const { service, prisma } = moving("dept-a", null);

    await service.update({ sub: "user-1" } as never, "doc-1", { folderId: "folder-2" });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-a" }) }),
    );
  });

  it("refuses to move a document into another department's folder", async () => {
    const { service, prisma } = moving("dept-a", "dept-b");

    await expect(service.update({ sub: "user-1" } as never, "doc-1", { folderId: "folder-2" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("leaves the department untouched when the folder does not change", async () => {
    const { service, prisma } = moving("dept-a", "dept-a");

    await service.update({ sub: "user-1" } as never, "doc-1", { folderId: "folder-1" });

    expect(prisma.folder.findUnique).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: undefined }) }),
    );
  });

  it("reports an unknown destination folder as not found", async () => {
    const { service, prisma } = moving("dept-a", null);
    (prisma.folder.findUnique as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue(null);

    await expect(service.update({ sub: "user-1" } as never, "doc-1", { folderId: "folder-2" })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
});

describe("DocumentsService status transitions", () => {
  function ready(status: string, overrides: Record<string, unknown> = {}) {
    const context = buildService();
    allowAdmin(context);
    context.access.permissionsFor.mockResolvedValue(new Set(["EDIT"]));
    const live = { ...document, deletedAt: null, status, ...overrides };
    context.prisma.document.findUnique.mockResolvedValue(live);
    context.prisma.document.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(context.service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-1" });
    return context;
  }

  it("moves a live document to ARCHIVED through the archive transition", async () => {
    const { service, prisma, audit } = ready("APPROVED");

    await service.update({ sub: "user-1" } as never, "doc-1", { transition: "ARCHIVE" });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ARCHIVED" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.update", detail: { transition: "ARCHIVE" } }),
      expect.anything(),
    );
  });

  it("reopens a document back to DRAFT", async () => {
    const { service, prisma } = ready("ARCHIVED");

    await service.update({ sub: "user-1" } as never, "doc-1", { transition: "REOPEN" });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT" }) }),
    );
  });

  it("never touches the status when no transition is sent", async () => {
    const { service, prisma } = ready("IN_REVIEW");

    await service.update({ sub: "user-1" } as never, "doc-1", { title: "Retitled" });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: undefined }) }),
    );
  });

  it("refuses to transition a disposed document", async () => {
    const { service, prisma } = ready("DISPOSED");

    await expect(service.update({ sub: "user-1" } as never, "doc-1", { transition: "REOPEN" })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to transition a document that is in the trash", async () => {
    const { service, prisma } = ready("DRAFT", { deletedAt: new Date("2026-04-01T00:00:00.000Z") });

    await expect(service.update({ sub: "user-1" } as never, "doc-1", { transition: "ARCHIVE" })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to reopen a declared record but still allows archiving it", async () => {
    const { service, prisma } = ready("ARCHIVED", { isRecord: true });

    await expect(service.update({ sub: "user-1" } as never, "doc-1", { transition: "REOPEN" })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();

    await service.update({ sub: "user-1" } as never, "doc-1", { transition: "ARCHIVE" });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ARCHIVED" }) }),
    );
  });
});

describe("DocumentsService department scope", () => {
  function scoped(doc: Record<string, unknown>, actor: Record<string, unknown>) {
    const context = buildService();
    allowAdmin(context);
    const folderLookup = vi.fn().mockResolvedValue({ departmentId: "dept-folder" });
    const access = new AccessService({ folder: { findUnique: folderLookup } } as never);
    context.prisma.document.findUnique.mockResolvedValue({ ...document, ...doc, deletedAt: null });
    context.access.resolveActor.mockResolvedValue(actor);
    context.access.isGlobal.mockImplementation((candidate: Actor) => access.isGlobal(candidate));
    context.access.assertDepartmentScope.mockImplementation(
      (candidate: Actor, target: Parameters<AccessService["assertDepartmentScope"]>[1]) => access.assertDepartmentScope(candidate, target),
    );
    context.access.permissionsFor.mockResolvedValue(new Set(["VIEW", "EDIT"]));
    vi.spyOn(context.service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-1" });
    return { ...context, folderLookup };
  }

  it("resolves the department from the folder when the document has none", async () => {
    const manager = { id: "user-9", departmentId: "dept-folder", role: "DEPT_MANAGER" };
    const allowed = scoped({ departmentId: null, ownerId: "user-1" }, manager);
    await expect(allowed.service.get({ sub: "user-9" } as never, "doc-1")).resolves.toBeDefined();

    const outsider = scoped({ departmentId: null, ownerId: "user-1" }, { id: "user-8", departmentId: "dept-other", role: "DEPT_MANAGER" });
    await expect(outsider.service.get({ sub: "user-8" } as never, "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(outsider.folderLookup).toHaveBeenCalledWith({ where: { id: "folder-1" }, select: { departmentId: true } });
  });

  it("denies an actor without a department when the document has no department anchor", async () => {
    const { service, folderLookup } = scoped(
      { departmentId: null, folderId: null, ownerId: "user-1" },
      { id: "user-9", departmentId: null, role: "ARCHIVIST" },
    );

    await expect(service.get({ sub: "user-9" } as never, "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(folderLookup).not.toHaveBeenCalled();
  });

  it("lets the owner reach an anchor-less document", async () => {
    const { service } = scoped(
      { departmentId: null, folderId: null, ownerId: "user-9" },
      { id: "user-9", departmentId: null, role: "EMPLOYEE" },
    );

    await expect(service.get({ sub: "user-9" } as never, "doc-1")).resolves.toBeDefined();
  });

  it("refuses to disclose the permission set of a document outside the department", async () => {
    const outsider = scoped(
      { departmentId: "dept-folder", ownerId: "user-1" },
      { id: "user-8", departmentId: "dept-other", role: "DEPT_MANAGER" },
    );

    await expect(outsider.service.permissions({ sub: "user-8" } as never, "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("DocumentsService purge", () => {
  it("removes legal hold links and approval decisions before deleting the document", async () => {
    const context = buildService();
    const { service, prisma, audit } = context;
    allowAdmin(context);
    prisma.approvalInstance.findMany.mockResolvedValue([{ id: "approval-1" }, { id: "approval-2" }]);

    const result = await service.purge({ sub: "user-1" } as never, "doc-1");

    expect(prisma.approvalDecision.deleteMany).toHaveBeenCalledWith({
      where: { instanceId: { in: ["approval-1", "approval-2"] } },
    });
    expect(prisma.approvalInstance.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(prisma.legalHoldDocument.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(prisma.retentionItem.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: "doc-1", deletedAt: { not: null } } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.purge", entityId: "doc-1" }), expect.anything());
    expect(result).toEqual({ id: "doc-1", deleted: true, purged: true });
  });

  it("removes the stored object only when no other document version still uses it", async () => {
    const context = buildService();
    const { service, prisma, storage } = context;
    allowAdmin(context);
    prisma.documentVersion.findMany
      .mockResolvedValueOnce([{ fileId: "file-own" }, { fileId: "file-shared" }])
      .mockResolvedValueOnce([{ fileId: "file-shared" }]);
    prisma.fileObject.findMany.mockResolvedValue([{ id: "file-own", storageKey: "documents/2026/own.pdf" }]);

    await service.purge({ sub: "user-1" } as never, "doc-1");

    expect(prisma.fileObject.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["file-own"] } } });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith("documents/2026/own.pdf");
  });

  it("refuses to purge a document that is still under an active legal hold", async () => {
    const context = buildService();
    const { service, prisma } = context;
    allowAdmin(context);
    prisma.legalHoldDocument.count.mockResolvedValue(1);

    await expect(service.purge({ sub: "user-1" } as never, "doc-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    expect(prisma.documentVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to purge when the actor is not a system administrator", async () => {
    const context = buildService();
    const { service, access, prisma } = context;
    allowAdmin(context);
    access.resolveActor.mockResolvedValue({ id: "user-2", departmentId: null, role: "ARCHIVIST" });

    await expect(service.purge({ sub: "user-2" } as never, "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("DocumentsService file attachment", () => {
  const employee = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" };

  function uploadContext(uploadedBy: string | null) {
    const context = buildService();
    context.access.resolveActor.mockResolvedValue(employee);
    context.access.assert.mockResolvedValue(employee);
    context.access.isGlobal.mockReturnValue(false);
    context.access.permissionsFor.mockResolvedValue(new Set(["CREATE", "VIEW", "EDIT"]));
    context.prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    context.prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-9",
      storageKey: "documents/2026/8a7c.pdf",
      uploadedById: uploadedBy,
      mimeType: "application/pdf",
      sizeBytes: 4096n,
    });
    return context;
  }

  it("refuses to create a document over a file uploaded by another account", async () => {
    const { service, prisma } = uploadContext("user-2");

    await expect(
      service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-1", fileId: "file-9" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("refuses to add a version that points at another account's upload", async () => {
    const { service, prisma } = uploadContext("user-2");
    prisma.document.findUnique.mockResolvedValue({ ...document, deletedAt: null });

    await expect(service.addVersion({ sub: "user-1" } as never, "doc-1", { fileId: "file-9" } as never)).rejects.toThrow(
      /Only the account that uploaded a file/,
    );
    expect(prisma.documentVersion.create).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown file id as a validation error rather than a missing document", async () => {
    const { service, prisma } = uploadContext("user-1");
    prisma.fileObject.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-1", fileId: "does-not-exist" } as never),
    ).rejects.toThrow(/File not found/);
  });

  it("lets the uploader attach their own file", async () => {
    const context = uploadContext("user-1");
    const { service, prisma } = context;
    prisma.document.create.mockResolvedValue({ id: "doc-2", docNo: "DOC-2026-ABCD1234", title: "Contract" });
    vi.spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-2" });

    await service.create(
      { sub: "user-1" } as never,
      { title: "Contract", folderId: "folder-1", fileId: "file-9", comment: "first issue" } as never,
    );

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileType: "application/pdf",
          sizeBytes: 4096n,
          ownerId: "user-1",
          versions: { create: expect.objectContaining({ fileId: "file-9", version: 1, isCurrent: true }) },
        }),
      }),
    );
  });

  it("lets a global administrator attach a file uploaded by anyone", async () => {
    const context = uploadContext("user-2");
    context.access.isGlobal.mockReturnValue(true);
    const { service, prisma } = context;
    prisma.document.create.mockResolvedValue({ id: "doc-3", docNo: "DOC-2026-EF567890", title: "Contract" });
    vi.spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-3" });

    await service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-1", fileId: "file-9" } as never);

    expect(prisma.document.create).toHaveBeenCalled();
  });

  it("prewarms the preview of a newly attached file without blocking the response", async () => {
    const context = uploadContext("user-1");
    const { service, prisma, preview } = context;
    prisma.document.create.mockResolvedValue({ id: "doc-4", docNo: "DOC-2026-GH123456", title: "Contract" });
    vi.spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-4" });

    await service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-1", fileId: "file-9" } as never);

    expect(preview.prewarm).toHaveBeenCalledWith("file-9", employee);
  });

  it("refuses to file a document into a folder that belongs to another department", async () => {
    const context = uploadContext("user-1");
    context.access.isGlobal.mockReturnValue(true);
    context.prisma.folder.findUnique.mockResolvedValue({ departmentId: "dept-2" });

    await expect(
      context.service.create(
        { sub: "user-1" } as never,
        { title: "Contract", folderId: "folder-1", departmentId: "dept-1", fileId: "file-9" } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(context.prisma.document.create).not.toHaveBeenCalled();
  });

  it("derives the department from the folder when an administrator omits it", async () => {
    const context = uploadContext("user-1");
    context.access.isGlobal.mockReturnValue(true);
    context.prisma.document.create.mockResolvedValue({ id: "doc-5", docNo: "DOC-2026-IJ123456", title: "Contract" });
    vi.spyOn(context.service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-5" });

    await context.service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-1", fileId: "file-9" } as never);

    expect(context.prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-1" }) }),
    );
  });

  it("rejects an unknown folder as not found instead of relying on the foreign key", async () => {
    const context = uploadContext("user-1");
    context.prisma.folder.findUnique.mockResolvedValue(null);

    await expect(
      context.service.create({ sub: "user-1" } as never, { title: "Contract", folderId: "folder-x", fileId: "file-9" } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(context.prisma.document.create).not.toHaveBeenCalled();
  });
});

describe("DocumentsService concurrent writes", () => {
  function lifecycle(overrides: Record<string, unknown> = {}) {
    const context = buildService();
    allowAdmin(context);
    const live = { ...document, ...overrides, deletedAt: null, status: "APPROVED" };
    context.access.permissionsFor.mockResolvedValue(new Set(["EDIT", "APPROVE", "DELETE"]));
    context.prisma.document.findUnique.mockResolvedValue(live);
    return { ...context, live };
  }

  it("refuses a checkout that lost the race for the lock", async () => {
    const { service, prisma, audit } = lifecycle({ checkedOutById: "user-2" });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.checkout({ sub: "user-1" } as never, "doc-1")).rejects.toThrow(/checked out by another user/);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("keeps a legal hold from being bypassed by a concurrent trash request", async () => {
    const { service, prisma, audit } = lifecycle({ deletedAt: null });
    prisma.legalHoldDocument.count.mockResolvedValue(1);

    await expect(service.remove({ sub: "user-1" } as never, "doc-1")).rejects.toThrow(/under legal hold/);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("treats a signature that landed first as the state it wanted to reach", async () => {
    const { service, prisma, audit } = lifecycle({ signatureStatus: "PENDING" });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    prisma.document.findUnique.mockImplementation(async (args: { select?: { signatureStatus?: boolean } }) =>
      args.select?.signatureStatus ? { signatureStatus: "SIGNED" } : { ...document, deletedAt: null, status: "APPROVED" },
    );
    vi.spyOn(service as unknown as { detail: (id: string) => Promise<unknown> }, "detail").mockResolvedValue({ id: "doc-1" });

    await expect(service.sign({ sub: "user-1" } as never, "doc-1")).resolves.toBeDefined();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("reports a version clash as a conflict instead of a server error", async () => {
    const { service, prisma } = lifecycle();
    prisma.fileObject.findUnique.mockResolvedValue({
      id: "file-9",
      storageKey: "documents/2026/8a7c.pdf",
      uploadedById: "user-1",
      mimeType: "application/pdf",
      sizeBytes: 4096n,
    });
    prisma.documentVersion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`documentId`,`version`)", {
        code: "P2002",
        clientVersion: "6.1.0",
      }),
    );

    await expect(service.addVersion({ sub: "user-1" } as never, "doc-1", { fileId: "file-9" } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
