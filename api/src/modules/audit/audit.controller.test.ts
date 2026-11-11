import { describe, expect, it, vi } from "vitest";
import { AuditController } from "./audit.controller";

function buildController(liveRow: Record<string, unknown>) {
  const prisma = {
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([liveRow]),
      count: vi.fn().mockResolvedValue(1),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockResolvedValue([[liveRow], 1]),
  };
  const audit = { verifyChain: vi.fn(), recordBaseline: vi.fn() };
  return { controller: new AuditController(prisma as never, audit as never), prisma };
}

function liveEvent(seq: bigint) {
  return {
    id: "event-1",
    seq,
    ts: new Date("2026-11-05T08:00:00.000Z"),
    action: "document.create",
    entityType: "Document",
    entityId: "doc-1",
    actorId: "user-1",
    actorName: "مدير النظام",
    departmentId: null,
    result: "success",
    ip: null,
    userAgent: null,
    correlationId: null,
    detail: { docNo: "DOC-1" },
    prevHash: "prev",
    hash: "head",
    hashVersion: 2,
  };
}

describe("AuditController.list", () => {
  it("answers the same query the ledger stores, in sequence order", async () => {
    const { controller, prisma } = buildController(liveEvent(BigInt(705)));

    const response = await controller.list({ page: 2, pageSize: 20 } as never);

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, orderBy: { seq: "desc" } }));
    expect(response.items).toHaveLength(1);
    expect(response.meta).toMatchObject({ page: 2, pageSize: 20, total: 1 });
  });

  it("sends the sequence as a plain number so the response survives JSON serialisation", async () => {
    const { controller } = buildController(liveEvent(BigInt(705)));

    const response = await controller.list({} as never);

    expect(response.items[0].seq).toBe(705);
    expect(() => JSON.stringify(response)).not.toThrow();
    expect(response.items[0].ts).toBe("2026-11-05T08:00:00.000Z");
  });

  it("keeps the signed detail visible to the reader", async () => {
    const { controller } = buildController(liveEvent(BigInt(705)));

    const response = await controller.list({} as never);

    expect(response.items[0].detail).toEqual({ docNo: "DOC-1" });
    expect(response.items[0].hash).toBe("head");
  });
});
