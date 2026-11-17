import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ApprovalsService } from "./approvals.service";

const PRINCIPAL = { sub: "user-sup" } as never;
const SUPERVISOR = { id: "user-sup", departmentId: "dept-fin", role: "SUPERVISOR" };
const MANAGER = { id: "user-mgr", departmentId: "dept-fin", role: "DEPT_MANAGER" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

const CHAIN = {
  id: "chain-1",
  name: "اعتماد مزدوج",
  description: null,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  steps: [
    { id: "step-1", chainId: "chain-1", order: 1, role: "SUPERVISOR", name: "مراجعة" },
    { id: "step-2", chainId: "chain-1", order: 2, role: "DEPT_MANAGER", name: "اعتماد" },
  ],
};

const DOCUMENT = {
  id: "doc-1",
  docNo: "DOC-1",
  title: "عقد",
  departmentId: "dept-fin",
  folderId: "fold-fin",
  ownerId: "user-sup",
  status: "DRAFT",
  isRecord: false,
};

function decision(stepOrder: number, value = "APPROVED") {
  return {
    id: `decision-${stepOrder}`,
    instanceId: "ap-1",
    stepOrder,
    decision: value,
    comment: null,
    decidedById: "user-sup",
    decidedAt: new Date("2026-11-01T00:00:00.000Z"),
  };
}

function instance(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    documentId: "doc-1",
    chainId: "chain-1",
    status: "PENDING",
    startedById: "user-sup",
    startedAt: new Date("2026-11-01T00:00:00.000Z"),
    completedAt: null,
    chain: CHAIN,
    decisions: [] as ReturnType<typeof decision>[],
    document: DOCUMENT,
    ...overrides,
  };
}

type Actor = { id: string; departmentId: string | null; role: string };

function buildService(actor: Actor = SUPERVISOR) {
  const state = {
    chain: CHAIN as typeof CHAIN | null,
    instance: instance() as ReturnType<typeof instance> | null,
    decisionRows: [] as ReturnType<typeof decision>[],
    pendingInstances: 0,
    pendingForChain: 0,
    instances: [] as ReturnType<typeof instance>[],
    claimed: 1,
    decisionError: null as unknown,
  };

  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
    approvalChain: {
      findMany: vi.fn(async () => [CHAIN]),
      create: vi.fn(async ({ data }: { data: { steps: { create: { order: number; role: string }[] } } }) => ({
        ...CHAIN,
        id: "chain-new",
        name: "جديدة",
        steps: data.steps.create.map((step, index) => ({ id: `s${index}`, chainId: "chain-new", ...step })),
      })),
      findUnique: vi.fn(async () => state.chain),
      findFirst: vi.fn(async () => state.chain),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...CHAIN, ...data })),
    },
    approvalStep: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    approvalInstance: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ("chainId" in where) return state.pendingForChain;
        return state.pendingInstances;
      }),
      findUnique: vi.fn(async () => state.instance),
      findMany: vi.fn(async () => state.instances),
      create: vi.fn(async () => instance()),
      updateMany: vi.fn(async ({ data }: { data: { status: string } }) => {
        if (state.claimed === 0) return { count: 0 };
        if (state.instance) state.instance = { ...state.instance, status: data.status as never, decisions: state.decisionRows };
        return { count: state.claimed };
      }),
    },
    approvalDecision: {
      create: vi.fn(async ({ data }: { data: { stepOrder: number; decision: string } }) => {
        if (state.decisionError) throw state.decisionError;
        state.decisionRows.push(decision(data.stepOrder, data.decision));
        return decision(data.stepOrder, data.decision);
      }),
    },
    document: {
      findUnique: vi.fn(async () => DOCUMENT),
      update: vi.fn().mockResolvedValue(DOCUMENT),
    },
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
    assertDepartmentScope: vi.fn().mockResolvedValue(undefined),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
    documentVisibilityFilter: vi.fn().mockImplementation(async (candidate: { departmentId: string | null }) =>
      candidate.departmentId
        ? { OR: [{ folderId: { in: ["folder-visible"] } }, { folderId: null, departmentId: candidate.departmentId }] }
        : undefined,
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const notifications = { pushToRole: vi.fn().mockResolvedValue(undefined), push: vi.fn().mockResolvedValue(undefined) };

  const service = new ApprovalsService(prisma as never, access as never, audit as never, notifications as never);
  return { service, prisma, access, audit, notifications, state };
}

describe("ApprovalsService chains", () => {
  it("lists chains with their steps and instance counts", async () => {
    const { service, prisma } = buildService();

    const result = await service.listChains();

    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1 });
    expect(prisma.approvalChain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ _count: { select: { instances: true } } }) }),
    );
  });

  it("derives step order from the array and records the chain", async () => {
    const { service, prisma, audit } = buildService();

    await service.createChain(PRINCIPAL, { name: "جديدة", steps: [{ role: "SUPERVISOR" }, { role: "DEPT_MANAGER", order: 5 }] } as never);

    expect(prisma.approvalChain.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          steps: {
            create: [
              { order: 1, role: "SUPERVISOR", name: undefined },
              { order: 5, role: "DEPT_MANAGER", name: undefined },
            ],
          },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.chain.create", departmentId: "dept-fin" }));
  });

  it("refuses duplicate step orders before writing", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.createChain(PRINCIPAL, {
        name: "x",
        steps: [
          { role: "SUPERVISOR", order: 2 },
          { role: "AUDITOR", order: 2 },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.approvalChain.create).not.toHaveBeenCalled();
  });

  it("reports a missing chain on update", async () => {
    const { service, state } = buildService();
    state.chain = null;

    await expect(service.updateChain(PRINCIPAL, "chain-404", {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to rewrite the steps of a chain with pending instances", async () => {
    const { service, prisma, state } = buildService();
    state.pendingForChain = 1;

    await expect(service.updateChain(PRINCIPAL, "chain-1", { steps: [{ role: "SUPERVISOR" }] } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.approvalStep.deleteMany).not.toHaveBeenCalled();
    expect(prisma.approvalStep.createMany).not.toHaveBeenCalled();
  });

  it("replaces the steps and audits the new order", async () => {
    const { service, prisma, audit } = buildService();

    await service.updateChain(PRINCIPAL, "chain-1", {
      name: "معاد تسميتها",
      isActive: false,
      steps: [{ role: "AUDITOR" }],
    } as never);

    expect(prisma.approvalStep.deleteMany).toHaveBeenCalledWith({ where: { chainId: "chain-1" } });
    expect(prisma.approvalStep.createMany).toHaveBeenCalledWith({
      data: [{ chainId: "chain-1", order: 1, role: "AUDITOR", name: undefined }],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approval.chain.update", detail: expect.objectContaining({ name: "معاد تسميتها" }) }),
    );
  });

  it("renames a chain without touching its steps", async () => {
    const { service, prisma } = buildService();

    await service.updateChain(PRINCIPAL, "chain-1", { name: "اسم جديد" } as never);

    expect(prisma.approvalStep.deleteMany).not.toHaveBeenCalled();
    expect(prisma.approvalStep.createMany).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("refuses duplicate step orders when rewriting a chain", async () => {
    const { service, prisma } = buildService();

    await expect(
      service.updateChain(PRINCIPAL, "chain-1", {
        steps: [
          { role: "SUPERVISOR", order: 3 },
          { role: "AUDITOR", order: 3 },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("audits chain changes made by an actor without an identifier", async () => {
    const { service, audit } = buildService({ id: "", departmentId: "dept-fin", role: "DEPT_MANAGER" });

    await service.createChain(PRINCIPAL, { name: "جديدة", steps: [{ role: "SUPERVISOR" }] } as never);
    await service.updateChain(PRINCIPAL, "chain-1", { name: "أحدث" } as never);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.chain.create", actorId: null }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.chain.update", actorId: null }));
  });
});

describe("ApprovalsService queries", () => {
  it("maps an instance to its current step and decision trail", async () => {
    const { service, access } = buildService();

    const view = await service.get(PRINCIPAL, "ap-1");

    expect(access.assertDepartmentScope).toHaveBeenCalledWith(SUPERVISOR, DOCUMENT);
    expect(view).toEqual(
      expect.objectContaining({
        id: "ap-1",
        chainName: "اعتماد مزدوج",
        currentStep: { order: 1, role: "SUPERVISOR" },
      }),
    );
  });

  it("reports a missing approval", async () => {
    const { service, state } = buildService();
    state.instance = null;

    await expect(service.get(PRINCIPAL, "ap-404")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes a department list to the actor's tree with paging", async () => {
    const { service, prisma } = buildService();

    const result = await service.list(PRINCIPAL, { page: 2, pageSize: 10 } as never);

    expect(prisma.approvalInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
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
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 0 });
  });

  it("does not filter a system administrator's list", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.list(PRINCIPAL, {} as never);

    const where = (prisma.approvalInstance.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.document).toBeUndefined();
    expect(where.status).toBeUndefined();
  });

  it("keeps only the steps the requester may decide", async () => {
    const { service, state } = buildService(MANAGER);
    state.instances = [
      instance({ id: "ap-1" }),
      instance({ id: "ap-2", decisions: [decision(1)], chain: CHAIN }),
      instance({ id: "ap-3", decisions: [decision(1), decision(2)], chain: CHAIN }),
    ];

    const result = await service.pending(PRINCIPAL);

    expect(result.items.map((item) => item.id)).toEqual(["ap-2"]);
    expect(result.meta).toEqual({ total: 1 });
  });

  it("lets a system administrator see every pending step", async () => {
    const { service, state } = buildService(ADMIN);
    state.instances = [instance({ id: "ap-1" }), instance({ id: "ap-2", decisions: [decision(1)] })];

    const result = await service.pending(PRINCIPAL);

    expect(result.items.map((item) => item.id)).toEqual(["ap-1", "ap-2"]);
  });

  it("passes the status and document filters into the list query", async () => {
    const { service, prisma } = buildService();

    await service.list(PRINCIPAL, { status: "PENDING", documentId: "doc-1" } as never);

    const where = (prisma.approvalInstance.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ status: "PENDING", documentId: "doc-1" });
  });

  it("keeps reading an instance whose chain was removed", async () => {
    const { service, state } = buildService();
    state.instance = instance({ chain: null, chainId: null });

    const view = await service.get(PRINCIPAL, "ap-1");

    expect(view).toMatchObject({ chainName: null, steps: [], currentStep: null });
  });
});

describe("ApprovalsService submit", () => {
  it("reports a missing document", async () => {
    const { service, prisma } = buildService();
    prisma.document.findUnique.mockResolvedValue(null as never);

    await expect(service.submit(PRINCIPAL, { documentId: "doc-404" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to send a declared record for approval", async () => {
    const { service, prisma } = buildService();
    prisma.document.findUnique.mockResolvedValue({ ...DOCUMENT, isRecord: true });

    await expect(service.submit(PRINCIPAL, { documentId: "doc-1" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires an active chain", async () => {
    const { service, state } = buildService();
    state.chain = null;

    await expect(service.submit(PRINCIPAL, { documentId: "doc-1" } as never)).rejects.toThrow(/No active approval chain/);
  });

  it("refuses an inactive chain", async () => {
    const { service, state } = buildService();
    state.chain = { ...CHAIN, isActive: false };

    await expect(service.submit(PRINCIPAL, { documentId: "doc-1" } as never)).rejects.toThrow(/inactive/);
  });

  it("refuses a chain without steps", async () => {
    const { service, state } = buildService();
    state.chain = { ...CHAIN, steps: [] };

    await expect(service.submit(PRINCIPAL, { documentId: "doc-1" } as never)).rejects.toThrow(/no steps/);
  });

  it("refuses a document that is already pending approval", async () => {
    const { service, state, prisma } = buildService();
    state.pendingInstances = 1;

    await expect(service.submit(PRINCIPAL, { documentId: "doc-1" } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.approvalInstance.create).not.toHaveBeenCalled();
  });

  it("creates the instance, moves the document to review and notifies the first role", async () => {
    const { service, prisma, audit, notifications } = buildService();

    const view = await service.submit(PRINCIPAL, { documentId: "doc-1", comment: "للاطلاع" } as never);

    expect(prisma.approvalInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { documentId: "doc-1", chainId: "chain-1", startedById: "user-sup" } }),
    );
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: "doc-1" }, data: { status: "IN_REVIEW" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approval.submit", entityId: "doc-1", detail: expect.objectContaining({ comment: "للاطلاع" }) }),
      expect.anything(),
    );
    expect(notifications.pushToRole).toHaveBeenCalledWith("SUPERVISOR", expect.objectContaining({ entityId: "doc-1" }));
    expect(view).toEqual(expect.objectContaining({ id: "ap-1", currentStep: { order: 1, role: "SUPERVISOR" } }));
  });

  it("submits against an explicitly chosen chain", async () => {
    const { service, prisma } = buildService();

    await service.submit(PRINCIPAL, { documentId: "doc-1", chainId: "chain-1" } as never);

    expect(prisma.approvalChain.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chain-1" }, include: expect.anything() }),
    );
    expect(prisma.approvalChain.findFirst).not.toHaveBeenCalled();
  });

  it("starts the approval without a requester identifier", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: "dept-fin", role: "SUPERVISOR" });

    await service.submit(PRINCIPAL, { documentId: "doc-1" } as never);

    expect(prisma.approvalInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ startedById: null }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.submit", actorId: null }), expect.anything());
  });
});

describe("ApprovalsService decide", () => {
  it("reports a missing approval", async () => {
    const { service, state } = buildService();
    state.instance = null;

    await expect(service.decide(PRINCIPAL, "ap-404", { decision: "APPROVED" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an instance that is no longer pending", async () => {
    const { service, state } = buildService();
    state.instance = instance({ status: "APPROVED" });

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow(/already APPROVED/);
  });

  it("refuses an instance whose chain lost its steps", async () => {
    const { service, state } = buildService();
    state.instance = instance({ chain: { ...CHAIN, steps: [] } });

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow(/no steps/);
  });

  it("refuses a decision from the wrong role", async () => {
    const { service, prisma } = buildService({ ...SUPERVISOR, role: "AUDITOR" });

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approvalDecision.create).not.toHaveBeenCalled();
  });

  it("reports a step that a concurrent decision already claimed", async () => {
    const { service, state } = buildService();
    state.decisionError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.1.0",
    });

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to decide when another writer moved the instance first", async () => {
    const { service, state } = buildService();
    state.claimed = 0;

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow(/no longer pending/);
  });

  it("keeps the instance pending and notifies the next role after an intermediate approval", async () => {
    const { service, prisma, notifications } = buildService();

    const view = await service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED", comment: "سليم" } as never);

    expect(prisma.approvalDecision.create).toHaveBeenCalledWith({
      data: { instanceId: "ap-1", stepOrder: 1, decision: "APPROVED", comment: "سليم", decidedById: "user-sup" },
    });
    expect(prisma.document.update).toHaveBeenLastCalledWith({ where: { id: "doc-1" }, data: { status: "IN_REVIEW" } });
    expect(notifications.pushToRole).toHaveBeenCalledWith("DEPT_MANAGER", expect.objectContaining({ entityId: "doc-1" }));
    expect(notifications.push).not.toHaveBeenCalled();
    expect(view.status).toBe("PENDING");
  });

  it("completes the approval on the last step and tells the requester", async () => {
    const { service, prisma, notifications, state } = buildService(MANAGER);
    state.instance = instance({ decisions: [decision(1)] });
    state.decisionRows = [decision(1)];

    const view = await service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never);

    expect(prisma.document.update).toHaveBeenLastCalledWith({ where: { id: "doc-1" }, data: { status: "APPROVED" } });
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-sup", title: "تم اعتماد الوثيقة", level: "SUCCESS" }),
    );
    expect(view.status).toBe("APPROVED");
  });

  it("returns the document to draft and tells the requester on rejection", async () => {
    const { service, prisma, notifications } = buildService();

    const view = await service.decide(PRINCIPAL, "ap-1", { decision: "REJECTED", comment: "ناقص" } as never);

    expect(prisma.document.update).toHaveBeenLastCalledWith({ where: { id: "doc-1" }, data: { status: "DRAFT" } });
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-sup", title: "تم رفض الوثيقة", level: "ERROR" }),
    );
    expect(view.status).toBe("REJECTED");
  });

  it("decides an instance that no longer records its chain id", async () => {
    const { service, state } = buildService();
    state.instance = instance({ chainId: null });

    const view = await service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never);

    expect(view.status).toBe("PENDING");
  });

  it("reports an approval that disappeared while the decision was being written", async () => {
    const { service, prisma } = buildService();
    prisma.approvalInstance.findUnique.mockResolvedValueOnce(instance() as never).mockResolvedValueOnce(null as never);

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an instance that lost its chain entirely", async () => {
    const { service, state } = buildService();
    state.instance = instance({ chain: null });

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow(/no steps/);
  });

  it("refuses an instance whose steps are all decided", async () => {
    const { service, state } = buildService();
    state.instance = instance({ decisions: [decision(1), decision(2)] });
    state.decisionRows = [decision(1), decision(2)];

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow(/no pending step/);
  });

  it("rethrows a decision failure that is not a duplicate step", async () => {
    const { service, state } = buildService();
    state.decisionError = new Error("database went away");

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toThrow("database went away");
  });

  it("reports an approval that vanished before it could be returned", async () => {
    const { service, prisma } = buildService();
    prisma.approvalInstance.findUnique
      .mockResolvedValueOnce(instance() as never)
      .mockResolvedValueOnce(instance() as never)
      .mockResolvedValueOnce(null as never);

    await expect(service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("completes an approval that nobody claimed without notifying anyone", async () => {
    const { service, notifications, state } = buildService(MANAGER);
    state.instance = instance({ decisions: [decision(1)], startedById: null });
    state.decisionRows = [decision(1)];

    const view = await service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never);

    expect(view.status).toBe("APPROVED");
    expect(notifications.push).not.toHaveBeenCalled();
    expect(notifications.pushToRole).not.toHaveBeenCalled();
  });

  it("records a decision made by an actor without an identifier", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: "dept-fin", role: "SUPERVISOR" });

    await service.decide(PRINCIPAL, "ap-1", { decision: "APPROVED" } as never);

    expect(prisma.approvalDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ decidedById: null }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.decide", actorId: null }), expect.anything());
  });
});
