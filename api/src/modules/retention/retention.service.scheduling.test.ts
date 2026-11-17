import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RetentionService } from "./retention.service";

const PRINCIPAL = { sub: "user-mgr", name: "سارة المطيري" } as never;
const MANAGER = { id: "user-mgr", departmentId: "dept-fin", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    docNo: "DOC-2026-0001",
    title: "عقد توريد",
    status: "APPROVED",
    isRecord: false,
    departmentId: "dept-fin",
    retentionEnd: null,
    folderId: "fold-fin",
    ownerId: "user-owner",
    createdAt: new Date("2020-01-31T00:00:00.000Z"),
    ...overrides,
  };
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pol-1",
    name: "إتلاف بعد خمس سنوات",
    action: "DESTROY",
    retentionMonths: 60,
    legalBasis: "نظام الوثائق والسجلات",
    isActive: true,
    departmentId: null,
    _count: { items: 0 },
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    documentId: "doc-1",
    policyId: "pol-1",
    dueAt: new Date("2026-01-15T00:00:00.000Z"),
    status: "scheduled",
    action: "DESTROY",
    document: documentRow(),
    policy: policyRow(),
    ...overrides,
  };
}

function buildService(actor: { id: string; departmentId: string | null; role: string } = MANAGER) {
  const state = {
    document: documentRow(),
    policy: policyRow(),
    item: itemRow(),
    policies: [{ id: "pol-1", name: "إتلاف", departmentId: "dept-fin" }],
    items: [itemRow()],
    total: 1,
    holds: [] as { documentId: string }[],
    claimed: 1,
    versions: [] as unknown[],
  };

  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
    retentionPolicy: {
      findMany: vi.fn(async (_args: { where?: Record<string, unknown> } = {}) => state.policies),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === state.policy.id ? state.policy : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pol-new", ...data })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...state.policy,
        ...data,
        id: where.id,
      })),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    retentionItem: {
      findMany: vi.fn(async (_args: { where?: Record<string, unknown>; skip?: number; take?: number } = {}) => state.items),
      count: vi.fn(async () => state.total),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === state.item.id ? state.item : null)),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: "item-1", ...create })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...state.item, ...data })),
      updateMany: vi.fn(async () => ({ count: state.claimed })),
    },
    document: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === state.document.id ? state.document : null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        docNo: state.document.docNo,
        title: state.document.title,
        ...data,
      })),
    },
    documentVersion: {
      findMany: vi.fn(async () => state.versions),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    fileObject: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    legalHoldDocument: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn(async () => state.holds),
    },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };

  const transaction = prisma.$transaction as unknown as {
    mockImplementation: (work: (input: unknown) => unknown) => void;
  };
  transaction.mockImplementation(async (work) =>
    Array.isArray(work) ? Promise.all(work as Promise<unknown>[]) : (work as (tx: typeof prisma) => unknown)(prisma),
  );

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    assert: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
    documentVisibilityFilter: vi.fn().mockImplementation(async (candidate: { departmentId: string | null }) =>
      candidate.departmentId
        ? { OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null, departmentId: candidate.departmentId }] }
        : undefined,
    ),
  };
  const audit = {
    record: vi.fn(async (input: { detail: Record<string, unknown> }) => ({
      id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
      ts: new Date("2026-02-01T10:00:00.000Z"),
      hash: "hash-123",
      actorId: "user-mgr",
      actorName: "سارة المطيري",
      detail: input.detail,
    })),
  };
  const notifications = { push: vi.fn().mockResolvedValue(undefined) };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };

  return {
    service: new RetentionService(prisma as never, access as never, audit as never, notifications as never, storage as never),
    prisma,
    access,
    audit,
    notifications,
    storage,
    state,
  };
}

describe("RetentionService policy catalogue", () => {
  it("lists every policy for a global actor", async () => {
    const { service, prisma } = buildService(ADMIN);

    const result = await service.listPolicies(PRINCIPAL);

    expect(prisma.retentionPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, include: expect.objectContaining({ _count: { select: { items: true } } }) }),
    );
    expect(result.meta).toEqual({ total: 1 });
  });

  it("limits a manager to their department plus the shared policies", async () => {
    const { service, prisma } = buildService();

    await service.listPolicies(PRINCIPAL);

    const where = (prisma.retentionPolicy.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({ OR: [{ departmentId: "dept-fin" }, { departmentId: null }] });
  });

  it("refuses a manager without a department", async () => {
    const { service, prisma } = buildService({ id: "user-x", departmentId: null, role: "DEPT_MANAGER" });

    await expect(service.createPolicy(PRINCIPAL, { name: "سياسة" } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.retentionPolicy.create).not.toHaveBeenCalled();
  });

  it("creates a policy inside the manager's department and records it", async () => {
    const { service, prisma, audit } = buildService();

    const policy = await service.createPolicy(PRINCIPAL, { name: "سياسة", retentionMonths: 12, action: "ARCHIVE" } as never);

    expect(prisma.retentionPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "سياسة", departmentId: "dept-fin", isActive: true }),
    });
    expect(policy.id).toBe("pol-new");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "retention.policy.create", departmentId: "dept-fin" }));
  });

  it("lets an administrator create a shared policy", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.createPolicy(PRINCIPAL, { name: "مشتركة", retentionMonths: 6, action: "REVIEW" } as never);

    expect(prisma.retentionPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) }),
    );
  });

  it("reports a missing policy on delete", async () => {
    const { service } = buildService(ADMIN);

    await expect(service.deletePolicy(PRINCIPAL, "pol-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to delete a policy that still schedules documents", async () => {
    const { service, prisma } = buildService(ADMIN);
    prisma.retentionPolicy.findUnique.mockResolvedValue({ ...policyRow(), _count: { items: 2 } });

    await expect(service.deletePolicy(PRINCIPAL, "pol-1")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.retentionPolicy.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused policy and records its name", async () => {
    const { service, prisma, audit } = buildService(ADMIN);
    prisma.retentionPolicy.findUnique.mockResolvedValue({ ...policyRow(), _count: { items: 0 } });

    await expect(service.deletePolicy(PRINCIPAL, "pol-1")).resolves.toEqual({ id: "pol-1", deleted: true });

    expect(prisma.retentionPolicy.delete).toHaveBeenCalledWith({ where: { id: "pol-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "retention.policy.delete", detail: { name: "إتلاف بعد خمس سنوات" } }),
    );
  });
});

describe("RetentionService item listing", () => {
  it("pages the items, scopes them to the department and flags holds", async () => {
    const { service, prisma, state } = buildService();
    state.holds = [{ documentId: "doc-1" }];

    const result = await service.listItems(PRINCIPAL, {} as never);

    expect(prisma.retentionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        where: expect.objectContaining({
          document: {
            OR: [
              { folderId: { in: ["folder-visible"] } },
              { folderId: null, departmentId: "dept-fin" },
            ],
          },
        }),
      }),
    );
    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1 });
    expect(result.items[0].onHold).toBe(true);
  });

  it("applies the requested filters and the administrator's department override", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.listItems(PRINCIPAL, {
      status: "scheduled",
      policyId: "pol-1",
      dueOnly: true,
      departmentId: "dept-legal",
      page: 2,
      pageSize: 10,
    } as never);

    const args = prisma.retentionItem.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({
      status: "scheduled",
      policyId: "pol-1",
      document: { departmentId: "dept-legal" },
    });
    expect(args.where.dueAt).toBeInstanceOf(Object);
  });
});

describe("RetentionService scheduling", () => {
  it("reports a missing document", async () => {
    const { service } = buildService();

    await expect(service.schedule(PRINCIPAL, { documentId: "doc-404", policyId: "pol-1" } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses an inactive policy and one from another department", async () => {
    const { service, state, prisma } = buildService();

    state.policy = policyRow({ isActive: false });
    await expect(service.schedule(PRINCIPAL, { documentId: "doc-1", policyId: "pol-1" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    state.policy = policyRow({ departmentId: "dept-legal" });
    await expect(service.schedule(PRINCIPAL, { documentId: "doc-1", policyId: "pol-1" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.retentionItem.upsert).not.toHaveBeenCalled();
  });

  it("schedules against the document's own retention end and notifies the owner", async () => {
    const { service, prisma, audit, notifications, state } = buildService();
    state.document = documentRow({ retentionEnd: new Date("2027-03-01T00:00:00.000Z") });

    const item = await service.schedule(PRINCIPAL, { documentId: "doc-1", policyId: "pol-1" } as never);

    expect(prisma.retentionItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId_policyId: { documentId: "doc-1", policyId: "pol-1" } },
        update: expect.objectContaining({ dueAt: new Date("2027-03-01T00:00:00.000Z"), status: "scheduled", executedAt: null }),
      }),
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { retentionEnd: new Date("2027-03-01T00:00:00.000Z") },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.schedule",
        detail: expect.objectContaining({ policyId: "pol-1", dueAt: "2027-03-01T00:00:00.000Z" }),
      }),
    );
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-owner", title: "جدولة احتفاظ", level: "INFO" }),
    );
    expect(item).toEqual(expect.objectContaining({ id: "item-1", onHold: false }));
  });

  it("computes the due date from the creation date and stays silent without an owner", async () => {
    const { service, prisma, notifications, state } = buildService();
    state.document = documentRow({ ownerId: null });

    await service.schedule(PRINCIPAL, { documentId: "doc-1", policyId: "pol-1" } as never);

    const data = (prisma.retentionItem.upsert.mock.calls[0][0] as { create: { dueAt: Date } }).create;
    expect(data.dueAt).toEqual(new Date("2025-01-31T00:00:00.000Z"));
    expect(notifications.push).not.toHaveBeenCalled();
  });
});

describe("RetentionService item updates", () => {
  it("reports a missing item", async () => {
    const { service } = buildService();

    await expect(service.updateItem(PRINCIPAL, "item-404", { dueAt: "2027-01-01" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to extend an item that was already executed", async () => {
    const { service, prisma, state } = buildService();
    state.item = itemRow({ status: "executed" });

    await expect(service.updateItem(PRINCIPAL, "item-1", { dueAt: "2027-01-01" } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.retentionItem.update).not.toHaveBeenCalled();
  });

  it("rejects an unparsable due date", async () => {
    const { service } = buildService();

    await expect(service.updateItem(PRINCIPAL, "item-1", { dueAt: "not-a-date" } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("moves the due date on both the item and the document and records the extension", async () => {
    const { service, prisma, audit } = buildService();

    const updated = await service.updateItem(PRINCIPAL, "item-1", { dueAt: "2027-05-01" } as never);

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { retentionEnd: new Date("2027-05-01") },
    });
    expect(prisma.retentionItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1" }, data: { dueAt: new Date("2027-05-01") } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.extend",
        detail: expect.objectContaining({ retentionItemId: "item-1" }),
      }),
    );
    expect(updated.dueAt).toEqual(new Date("2027-05-01"));
  });
});

describe("RetentionService execution guards", () => {
  it("refuses an item that was already executed", async () => {
    const { service, prisma, state } = buildService();
    state.item = itemRow({ status: "executed" });

    await expect(service.execute(PRINCIPAL, "item-1", { action: "ARCHIVE" } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.retentionItem.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when another writer claimed the item first", async () => {
    const { service, state, prisma } = buildService();
    state.claimed = 0;

    await expect(service.execute(PRINCIPAL, "item-1", { action: "ARCHIVE" } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("records a storage sweep failure without failing the execution", async () => {
    const { service, prisma, audit, storage, state } = buildService();
    state.versions = [
      {
        version: 1,
        createdAt: new Date("2025-01-10T08:00:00.000Z"),
        createdBy: { name: "نورة" },
        file: {
          id: "file-own",
          storageKey: "documents/2025/own.pdf",
          originalName: "contract.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096n,
          checksumSha256: "aaa111",
        },
      },
    ];
    prisma.documentVersion.findMany.mockResolvedValueOnce(state.versions).mockResolvedValueOnce([]);
    storage.remove.mockRejectedValue(new Error("NoSuchKey"));

    const result = await service.execute(PRINCIPAL, "item-1", { action: "DESTROY" } as never);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "retention.destroy.storage",
        result: "failure",
        detail: expect.objectContaining({ storageErrors: 1 }),
      }),
    );
    expect(result.certificate?.storageErrors).toBe(1);
  });

  it("tells the owner about a non-destructive execution with the success level", async () => {
    const { service, notifications } = buildService();

    await service.execute(PRINCIPAL, "item-1", { action: "ARCHIVE" } as never);

    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-owner", title: "تنفيذ احتفاظ", level: "SUCCESS" }),
    );
  });

  it("folds the recorded storage errors into the certificate read-back", async () => {
    const { service, prisma } = buildService();
    prisma.auditEvent.findMany
      .mockResolvedValueOnce([
        {
          id: "evt-1",
          ts: new Date("2026-02-01T10:00:00.000Z"),
          hash: "h",
          actorId: "user-mgr",
          actorName: "سارة",
          detail: {
            retentionItemId: "item-1",
            note: null,
            destruction: {
              policyName: "إتلاف بعد خمس سنوات",
              retentionMonths: 60,
              legalBasis: null,
              dueAt: "2026-01-15T00:00:00.000Z",
              files: [],
              fileCount: 0,
              totalBytes: 0,
              storageErrors: 0,
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "evt-2",
          ts: new Date(),
          hash: "h2",
          actorId: null,
          actorName: null,
          detail: { retentionItemId: "item-1", storageErrors: 3 },
        },
      ]);

    const certificate = await service.certificate(PRINCIPAL, "item-1");

    expect(certificate.storageErrors).toBe(3);
    expect(prisma.auditEvent.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: "retention.destroy.storage" }) }),
    );
  });
});
