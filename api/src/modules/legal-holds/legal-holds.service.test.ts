import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LegalHoldsService } from "./legal-holds.service";

const FINANCE = { id: "user-mgr", departmentId: "dept-finance", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

const folderDepartments: Record<string, string> = { "fold-fin": "dept-finance", "fold-legal": "dept-legal" };

function holdFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "hold-1",
    caseNo: "CASE-1",
    reason: "تحقيق",
    status: "ACTIVE",
    placedById: "user-mgr",
    placedBy: { id: "user-mgr", name: "Manager" },
    placedAt: new Date("2026-11-01T00:00:00.000Z"),
    releasedById: null,
    releasedBy: null,
    releasedAt: null,
    documents: [
      { addedAt: new Date(), document: { id: "doc-1", docNo: "DOC-1", title: "عقد", status: "ACTIVE", departmentId: "dept-finance" } },
    ],
    ...overrides,
  };
}

function buildService(actor: { id: string; departmentId: string | null; role: string }, scopedDocuments = 1, outsideDocuments = 0) {
  const isGlobal = actor.role === "SYSTEM_ADMIN" || actor.role === "AUDITOR";
  let released = false;
  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(isGlobal),
    assertDepartmentScope: vi.fn(
      async (_actor: unknown, document: { departmentId: string | null; folderId?: string | null; ownerId?: string | null }) => {
        if (isGlobal) return;
        if (document.ownerId && document.ownerId === actor.id) return;
        const anchor = document.departmentId ?? (document.folderId ? (folderDepartments[document.folderId] ?? null) : null);
        if (anchor !== actor.departmentId) throw new ForbiddenException("Out of department scope");
      },
    ),
  };
  const prisma = {
    $transaction: vi.fn().mockResolvedValue([[], 0]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    legalHold: {
      findUnique: vi.fn(async () => (released ? holdFixture({ status: "RELEASED", releasedAt: new Date() }) : holdFixture())),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async () => holdFixture()),
      update: vi.fn().mockImplementation(async () => holdFixture({ status: "RELEASED", releasedAt: new Date() })),
      updateMany: vi.fn(async () => {
        released = true;
        return { count: 1 };
      }),
    },
    legalHoldDocument: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ document: { id: "doc-1", departmentId: "dept-finance", folderId: "fold-fin", ownerId: null } }),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([{ id: "doc-1", departmentId: "dept-finance", folderId: "fold-fin", ownerId: null }]),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (where.NOT ? outsideDocuments : scopedDocuments)),
    },
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => Promise<unknown>) => void };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new LegalHoldsService(prisma as never, access as never, audit as never);
  return { service, prisma, access, audit };
}

describe("LegalHoldsService department scope", () => {
  it("lists holds that touch the requester's department through the folder anchor", async () => {
    const { service, prisma } = buildService(FINANCE);

    await service.list({ sub: "user-mgr" } as never, {} as never);

    expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documents: {
            some: {
              document: { OR: [{ departmentId: "dept-finance" }, { departmentId: null, folder: { departmentId: "dept-finance" } }] },
            },
          },
        },
      }),
    );
  });

  it("sees a hold whose only link is a folder-anchored document", async () => {
    const { service, prisma } = buildService(FINANCE, 1);
    prisma.legalHold.findUnique.mockResolvedValue(
      holdFixture({
        documents: [
          { addedAt: new Date(), document: { id: "doc-9", docNo: "DOC-9", title: "محضر", status: "ACTIVE", departmentId: null } },
        ],
      }),
    );

    await expect(service.get({ sub: "user-mgr" } as never, "hold-1")).resolves.toEqual(expect.objectContaining({ id: "hold-1" }));
  });

  it("refuses a hold that does not touch the requester's department", async () => {
    const { service } = buildService(FINANCE, 0);

    await expect(service.get({ sub: "user-mgr" } as never, "hold-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks releasing a hold that also covers another department's documents", async () => {
    const { service, prisma } = buildService(FINANCE, 1, 2);

    await expect(service.release({ sub: "user-mgr" } as never, "hold-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.legalHold.updateMany).not.toHaveBeenCalled();
    expect(prisma.document.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ NOT: expect.anything() }) }),
    );
  });

  it("lets a department manager release a hold that stays inside their department", async () => {
    const { service, prisma, audit } = buildService(FINANCE, 1, 0);

    await expect(service.release({ sub: "user-mgr" } as never, "hold-1")).resolves.toEqual(expect.objectContaining({ status: "RELEASED" }));
    expect(prisma.legalHold.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal-hold.release", departmentId: "dept-finance" }),
      expect.anything(),
    );
  });

  it("lets a system administrator release a cross-department hold", async () => {
    const { service, prisma } = buildService(ADMIN, 1, 3);

    await expect(service.release({ sub: "user-admin" } as never, "hold-1")).resolves.toEqual(
      expect.objectContaining({ status: "RELEASED" }),
    );
    expect(prisma.document.count).not.toHaveBeenCalled();
  });

  it("refuses to lift a hold from a document that belongs to another department", async () => {
    const { service, prisma, access } = buildService(FINANCE);
    prisma.legalHoldDocument.findUnique.mockResolvedValue({
      document: { id: "doc-77", departmentId: "dept-legal", folderId: "fold-legal", ownerId: null },
    });

    await expect(service.removeDocument({ sub: "user-mgr" } as never, "hold-1", "doc-77")).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.assertDepartmentScope).toHaveBeenCalledWith(FINANCE, {
      id: "doc-77",
      departmentId: "dept-legal",
      folderId: "fold-legal",
      ownerId: null,
    });
    expect(prisma.legalHoldDocument.deleteMany).not.toHaveBeenCalled();
  });

  it("checks the document itself, not any visible document of the hold", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHoldDocument.findUnique.mockResolvedValue({
      document: { id: "doc-5", departmentId: null, folderId: "fold-legal", ownerId: null },
    });

    await expect(service.removeDocument({ sub: "user-mgr" } as never, "hold-1", "doc-5")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.legalHoldDocument.deleteMany).not.toHaveBeenCalled();
  });

  it("removes a link that is inside the requester's department", async () => {
    const { service, prisma } = buildService(FINANCE);

    await service.removeDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1");

    expect(prisma.legalHoldDocument.deleteMany).toHaveBeenCalledWith({ where: { holdId: "hold-1", documentId: "doc-1" } });
  });

  it("reports a missing link instead of deleting silently", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHoldDocument.findUnique.mockResolvedValue(null);

    await expect(service.removeDocument({ sub: "user-mgr" } as never, "hold-1", "doc-404")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.legalHoldDocument.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a hold over a document the requester cannot see", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.document.findMany.mockResolvedValue([{ id: "doc-2", departmentId: null, folderId: "fold-legal", ownerId: null }]);

    await expect(
      service.create({ sub: "user-mgr" } as never, { caseNo: "CASE-2", reason: "r", documentIds: ["doc-2"] } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.legalHold.findUnique).not.toHaveBeenCalled();
  });

  it("refuses to extend another department's hold case", async () => {
    const { service, prisma } = buildService(FINANCE, 0);
    prisma.legalHold.findUnique.mockResolvedValue(holdFixture({ status: "ACTIVE" }));

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.legalHoldDocument.create).not.toHaveBeenCalled();
  });

  it("refuses to add documents to a released hold", async () => {
    const { service, prisma } = buildService(FINANCE, 1, 0);
    prisma.legalHold.findUnique.mockResolvedValue(holdFixture({ status: "RELEASED" }));

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.legalHoldDocument.create).not.toHaveBeenCalled();
  });

  it("refuses to release an already released hold", async () => {
    const { service, prisma } = buildService(FINANCE, 1, 0);
    prisma.legalHold.findUnique.mockResolvedValue(holdFixture({ status: "RELEASED" }));

    await expect(service.release({ sub: "user-mgr" } as never, "hold-1")).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("LegalHoldsService writes", () => {
  const DOCUMENT_SELECT = { id: true, departmentId: true, folderId: true, ownerId: true };

  it("places a hold inside one transaction with the lock, the link rows and an audit event", async () => {
    const { service, prisma, audit } = buildService(FINANCE);

    const dto = await service.create(
      { sub: "user-mgr" } as never,
      { caseNo: "CASE-1", reason: "تحقيق", documentIds: ["doc-1", "doc-1"] } as never,
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { id: { in: ["doc-1"] } }, select: DOCUMENT_SELECT });
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.document.count).toHaveBeenCalledWith({ where: { id: { in: ["doc-1"] } } });
    expect(prisma.legalHold.create).toHaveBeenCalledWith({
      data: {
        caseNo: "CASE-1",
        reason: "تحقيق",
        placedById: "user-mgr",
        documents: { create: [{ documentId: "doc-1" }] },
      },
      include: expect.anything(),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "legal-hold.create",
        entityType: "LegalHold",
        entityId: "hold-1",
        actorId: "user-mgr",
        departmentId: "dept-finance",
        detail: { caseNo: "CASE-1", documentIds: ["doc-1"] },
      }),
      expect.anything(),
    );
    expect(dto).toMatchObject({
      id: "hold-1",
      placedByName: "Manager",
      releasedByName: null,
      documents: [{ id: "doc-1", docNo: "DOC-1", addedAt: expect.any(Date) }],
    });
  });

  it("accepts a case with no documents attached yet", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.document.count.mockResolvedValue(0);

    await service.create({ sub: "user-mgr" } as never, { caseNo: "CASE-3", reason: "r" } as never);

    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.legalHold.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documents: { create: [] } }) }),
    );
  });

  it("refuses the case when a document disappeared before the write landed", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.document.count.mockResolvedValue(0);

    await expect(
      service.create({ sub: "user-mgr" } as never, { caseNo: "CASE-4", reason: "r", documentIds: ["doc-1"] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.legalHold.create).not.toHaveBeenCalled();
  });

  it("records a hold whose creator has no account id", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: "dept-finance", role: "EMPLOYEE" });

    await service.create({ sub: "ghost" } as never, { caseNo: "CASE-5", reason: "r", documentIds: ["doc-1"] } as never);

    expect(prisma.legalHold.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ placedById: null }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }), expect.anything());
  });

  it("adds a document once and audits the addition", async () => {
    const { service, prisma, audit } = buildService(FINANCE);
    prisma.legalHoldDocument.findUnique.mockResolvedValue(null);

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).resolves.toMatchObject({ id: "hold-1" });

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.legalHoldDocument.create).toHaveBeenCalledWith({ data: { holdId: "hold-1", documentId: "doc-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "legal-hold.add-document",
        entityId: "hold-1",
        actorId: "user-mgr",
        detail: { caseNo: "CASE-1", documentId: "doc-1" },
      }),
      expect.anything(),
    );
  });

  it("returns the hold unchanged when the document is already attached", async () => {
    const { service, prisma, audit } = buildService(FINANCE);
    prisma.legalHoldDocument.findUnique.mockResolvedValue({ holdId: "hold-1", documentId: "doc-1" });

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).resolves.toMatchObject({ id: "hold-1" });
    expect(prisma.legalHoldDocument.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("reports a hold that disappears between the read and the lock", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHold.findUnique.mockResolvedValueOnce(holdFixture()).mockResolvedValueOnce(null as never);

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an addition to a hold released while waiting for the lock", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHold.findUnique.mockResolvedValueOnce(holdFixture()).mockResolvedValueOnce({ status: "RELEASED" } as never);

    await expect(service.addDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.legalHoldDocument.create).not.toHaveBeenCalled();
  });

  it("reports a link that another request removed first", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHoldDocument.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeDocument({ sub: "user-mgr" } as never, "hold-1", "doc-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("loses the release race without writing an audit event", async () => {
    const { service, prisma, audit } = buildService(FINANCE);
    prisma.legalHold.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.release({ sub: "user-mgr" } as never, "hold-1")).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: "legal-hold.release" }), expect.anything());
  });

  it("reports a hold deleted while it was being released", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHold.findUnique.mockResolvedValueOnce(holdFixture()).mockResolvedValueOnce(null as never);

    await expect(service.release({ sub: "user-mgr" } as never, "hold-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("LegalHoldsService listing and reads", () => {
  it("reports a missing hold instead of an empty body", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHold.findUnique.mockResolvedValue(null as never);

    await expect(service.get({ sub: "user-mgr" } as never, "hold-404")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("pages a department list and maps a released hold", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.$transaction.mockResolvedValueOnce([
      [
        holdFixture({
          status: "RELEASED",
          releasedById: "user-admin",
          releasedBy: { id: "user-admin", name: "Admin" },
          releasedAt: new Date("2026-11-02T00:00:00.000Z"),
          documents: [],
        }),
      ],
      9,
    ]);

    const result = await service.list({ sub: "user-mgr" } as never, { page: 3, pageSize: 10 } as never);

    expect(prisma.legalHold.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    expect(result.items[0]).toMatchObject({
      status: "RELEASED",
      releasedByName: "Admin",
      releasedAt: new Date("2026-11-02T00:00:00.000Z"),
      documents: [],
    });
    expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 9 });
  });

  it("lists every hold for a global reader with the status filter applied", async () => {
    const { service, prisma } = buildService(ADMIN);
    prisma.$transaction.mockResolvedValueOnce([[holdFixture()], 1]);

    const result = await service.list({ sub: "user-admin" } as never, { status: "ACTIVE" } as never);

    expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" }, skip: 0, take: 25, orderBy: { placedAt: "desc" } }),
    );
    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1 });
  });

  it("maps a hold without a placer", async () => {
    const { service, prisma } = buildService(ADMIN);
    prisma.$transaction.mockResolvedValueOnce([[holdFixture({ placedById: null, placedBy: null })], 1]);

    const result = await service.list({ sub: "user-admin" } as never, {} as never);

    expect(result.items[0]).toMatchObject({ placedById: null, placedByName: null });
  });
});

describe("LegalHoldsService document checks and audit identity", () => {
  it("refuses a case that names a document the requester cannot resolve", async () => {
    const { service, prisma } = buildService(FINANCE);

    await expect(
      service.create({ sub: "user-mgr" } as never, { caseNo: "CASE-6", reason: "r", documentIds: ["doc-1", "doc-2"] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.legalHold.create).not.toHaveBeenCalled();
  });

  it("skips the department loop for a global actor", async () => {
    const { service, access, prisma } = buildService(ADMIN);

    await service.create({ sub: "user-admin" } as never, { caseNo: "CASE-7", reason: "r", documentIds: ["doc-1"] } as never);

    expect(access.assertDepartmentScope).not.toHaveBeenCalled();
    expect(prisma.legalHold.create).toHaveBeenCalled();
  });

  it("reports a hold that vanished before a removal", async () => {
    const { service, prisma } = buildService(FINANCE);
    prisma.legalHold.findUnique.mockResolvedValue(null as never);

    await expect(service.removeDocument({ sub: "user-mgr" } as never, "hold-404", "doc-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.legalHoldDocument.deleteMany).not.toHaveBeenCalled();
  });

  it("audits an addition made by an actor without an account id", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: "dept-finance", role: "EMPLOYEE" });
    prisma.legalHoldDocument.findUnique.mockResolvedValue(null);

    await service.addDocument({ sub: "ghost" } as never, "hold-1", "doc-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal-hold.add-document", actorId: null }),
      expect.anything(),
    );
  });

  it("audits a removal made by an actor without an account id", async () => {
    const { service, audit } = buildService({ id: "", departmentId: "dept-finance", role: "EMPLOYEE" });

    await service.removeDocument({ sub: "ghost" } as never, "hold-1", "doc-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal-hold.remove-document", actorId: null }),
      expect.anything(),
    );
  });

  it("releases a hold without recording a releasing user for an actor without an account id", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: "dept-finance", role: "EMPLOYEE" });

    await service.release({ sub: "ghost" } as never, "hold-1");

    expect(prisma.legalHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ releasedById: null }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "legal-hold.release", actorId: null }), expect.anything());
  });
});
