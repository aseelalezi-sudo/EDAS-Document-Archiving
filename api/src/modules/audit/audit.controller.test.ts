import { describe, expect, it, vi } from "vitest";
import { AuditController } from "./audit.controller";

const PRINCIPAL = { sub: "keycloak-1", username: "amal", role: "AUDITOR" };

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    seq: 7n,
    ts: new Date("2026-03-04T05:06:07.000Z"),
    action: "document.read",
    entityType: "Document",
    entityId: "doc-1",
    actorId: "user-1",
    actorName: "أمل",
    departmentId: "dept-1",
    result: "success",
    ip: "10.0.0.1",
    userAgent: "vitest",
    correlationId: "corr-1",
    detail: { inline: true },
    prevHash: "a".repeat(64),
    hash: "b".repeat(64),
    hashVersion: 1,
    ...overrides,
  };
}

function build(rows: Array<Record<string, unknown>> = [event()]) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", name: "أمل" }) },
    auditEvent: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      groupBy: vi.fn(async ({ by }: { by: string[]; where?: Record<string, unknown> }) =>
        by[0] === "result"
          ? [
              { result: "success", _count: { _all: 5 } },
              { result: "failure", _count: { _all: 2 } },
            ]
          : [{ entityType: "Document" }, { entityType: "Folder" }],
      ),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  const audit = {
    verifyChain: vi.fn().mockResolvedValue({ ok: true, checked: 3 }),
    recordBaseline: vi.fn().mockResolvedValue({ ok: true, checked: 4 }),
  };
  return { controller: new AuditController(prisma as never, audit as never), prisma, audit };
}

describe("AuditController delegation", () => {
  it("forwards the chain verification", async () => {
    const { controller, audit } = build();

    await expect(controller.verify()).resolves.toEqual({ ok: true, checked: 3 });
    expect(audit.verifyChain).toHaveBeenCalledWith();
  });

  it("anchors the baseline to the resolved account", async () => {
    const { controller, prisma, audit } = build();

    await controller.recordBaseline(PRINCIPAL as never);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { keycloakSub: "keycloak-1" },
      select: { id: true, name: true },
    });
    expect(audit.recordBaseline).toHaveBeenCalledWith({ id: "user-1", name: "أمل" });
  });

  it("falls back to the token subject when the account row is missing", async () => {
    const { controller, prisma, audit } = build();
    prisma.user.findUnique.mockResolvedValue(null);

    await controller.recordBaseline(PRINCIPAL as never);

    expect(audit.recordBaseline).toHaveBeenCalledWith({ id: null, name: "amal" });
  });
});

describe("AuditController.list defaults", () => {
  it("reads the first page with no filters", async () => {
    const { controller, prisma } = build();

    const result = await controller.list({} as never);

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType: undefined,
          entityId: undefined,
          action: undefined,
          actorId: undefined,
          result: undefined,
          ts: undefined,
        },
        orderBy: { seq: "desc" },
        skip: 0,
        take: 50,
      }),
    );
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 50,
      total: 1,
      success: 5,
      failure: 2,
      entityTypes: ["Document", "Folder"],
    });
  });

  it("forwards every explicit filter and the page offset", async () => {
    const { controller, prisma } = build();

    await controller.list({
      entityType: "Document",
      entityId: "doc-1",
      action: "document.read",
      actorId: "user-1",
      result: "failure",
      page: 3,
      pageSize: 20,
    } as never);

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType: "Document",
          entityId: "doc-1",
          action: "document.read",
          actorId: "user-1",
          result: "failure",
          ts: undefined,
        },
        skip: 40,
        take: 20,
      }),
    );
  });

  it("turns the date window into an inclusive timestamp range", async () => {
    const { controller, prisma } = build();

    await controller.list({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T00:00:00.000Z" } as never);
    await controller.list({ from: "2026-01-01T00:00:00.000Z" } as never);
    await controller.list({ to: "2026-01-31T00:00:00.000Z" } as never);

    const [both, fromOnly, toOnly] = prisma.auditEvent.findMany.mock.calls.map(([args]) => args.where.ts);

    expect(both).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-01-31T00:00:00.000Z") });
    expect(fromOnly).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z"), lte: undefined });
    expect(toOnly).toEqual({ gte: undefined, lte: new Date("2026-01-31T00:00:00.000Z") });
  });

  it("searches six columns case-insensitively for a free-text query", async () => {
    const { controller, prisma } = build();

    await controller.list({ q: "عقد" } as never);

    const where = prisma.auditEvent.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { action: { contains: "عقد", mode: "insensitive" } },
      { entityType: { contains: "عقد", mode: "insensitive" } },
      { entityId: { contains: "عقد", mode: "insensitive" } },
      { actorName: { contains: "عقد", mode: "insensitive" } },
      { ip: { contains: "عقد", mode: "insensitive" } },
      { correlationId: { contains: "عقد", mode: "insensitive" } },
    ]);
  });
});

describe("AuditController.list shaping", () => {
  it("serialises the timestamp and the bigint sequence", async () => {
    const { controller } = build();

    const result = await controller.list({} as never);

    expect(result.items[0]).toMatchObject({
      id: "event-1",
      seq: 7,
      ts: "2026-03-04T05:06:07.000Z",
      action: "document.read",
      detail: { inline: true },
      hash: "b".repeat(64),
      hashVersion: 1,
    });
    expect(typeof result.items[0].seq).toBe("number");
    expect(typeof result.items[0].ts).toBe("string");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("counts failures apart and lumps every other result with successes", async () => {
    const { controller, prisma } = build();
    prisma.auditEvent.groupBy.mockImplementation(async ({ by }: { by: string[] }) =>
      by[0] === "result"
        ? [
            { result: "success", _count: { _all: 4 } },
            { result: "failure", _count: { _all: 3 } },
            { result: "partial", _count: { _all: 1 } },
          ]
        : [{ entityType: "Document" }],
    );

    const result = await controller.list({} as never);

    expect(result.meta).toMatchObject({ success: 5, failure: 3 });
  });

  it("counts the whole filtered set rather than the page", async () => {
    const { controller, prisma } = build();
    prisma.auditEvent.count.mockResolvedValue(1234);

    const result = await controller.list({ page: 2, pageSize: 10 } as never);

    expect(result.items).toHaveLength(1);
    expect(result.meta).toMatchObject({ page: 2, pageSize: 10, total: 1234 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("drops the entity-type filter when listing the available types", async () => {
    const { controller, prisma } = build();

    await controller.list({ entityType: "Document", result: "success" } as never);

    const entityTypeCall = prisma.auditEvent.groupBy.mock.calls.find(([args]) => args.by[0] === "entityType");
    expect(entityTypeCall?.[0].where).toEqual({ entityType: undefined, result: "success" });
  });
});
