import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
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
