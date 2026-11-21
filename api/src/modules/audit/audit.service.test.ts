import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuditService, type AuditInput } from "./audit.service";

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashOf(prevHash: string | null, ts: Date, overrides: Partial<AuditInput> & { hashVersion?: number } = {}) {
  const payload = {
    ts: ts.toISOString(),
    action: overrides.action ?? "document.create",
    entityType: overrides.entityType ?? "Document",
    entityId: overrides.entityId ?? null,
    actorId: overrides.actorId ?? null,
    result: overrides.result ?? "success",
  };
  const body =
    (overrides.hashVersion ?? 1) >= 2
      ? JSON.stringify({ ...payload, detail: canonical(overrides.detail ?? null) })
      : JSON.stringify(payload);
  return createHash("sha256")
    .update(`${prevHash ?? ""}|${body}`)
    .digest("hex");
}

function event(
  seq: number,
  prevHash: string | null,
  overrides: Partial<AuditInput> & { hashVersion?: number } = {},
  hashOverride?: string,
) {
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, seq));
  return {
    id: `event-${seq}`,
    seq: BigInt(seq),
    ts,
    action: overrides.action ?? "document.create",
    entityType: overrides.entityType ?? "Document",
    entityId: overrides.entityId ?? null,
    actorId: overrides.actorId ?? null,
    result: overrides.result ?? "success",
    detail: overrides.detail ?? null,
    hashVersion: overrides.hashVersion ?? 1,
    prevHash,
    hash: hashOverride ?? hashOf(prevHash, ts, overrides),
  };
}

function buildService(rows: Array<Record<string, unknown>> = []) {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditEvent: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "event-new", ...data })),
    },
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => Promise<unknown>) => void };
  transaction.mockImplementation(async (work) => (work as (tx: typeof prisma) => unknown)(prisma));

  return { service: new AuditService(prisma as never), prisma };
}

describe("AuditService chain append", () => {
  it("takes the chain lock before reading the head and links the new event to it", async () => {
    const head = { hash: "head-hash" };
    const { service, prisma } = buildService();
    prisma.auditEvent.findFirst.mockResolvedValue(head);

    await service.record({ action: "document.update", entityType: "Document", entityId: "doc-1" });

    expect(prisma.auditEvent.findFirst).toHaveBeenCalledWith({ orderBy: { seq: "desc" }, select: { hash: true } });
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.auditEvent.findFirst.mock.invocationCallOrder[0]);
    expect(prisma.auditEvent.findFirst.mock.invocationCallOrder[0]).toBeLessThan(prisma.auditEvent.create.mock.invocationCallOrder[0]);

    const { data } = prisma.auditEvent.create.mock.calls[0][0];
    expect(data.prevHash).toBe("head-hash");
    expect(data.hashVersion).toBe(2);
    expect(data.hash).toBe(
      hashOf("head-hash", data.ts as Date, { action: "document.update", entityType: "Document", entityId: "doc-1", hashVersion: 2 }),
    );
  });

  it("signs the event detail so a rewritten detail breaks the chain", async () => {
    const { service, prisma } = buildService();
    prisma.auditEvent.findFirst.mockResolvedValue({ hash: "head-hash" });

    await service.record({
      action: "document.dispose",
      entityType: "Document",
      entityId: "doc-1",
      detail: { certificate: { destroyedAt: "2026-11-05T00:00:00.000Z", key: "documents/a.pdf" } },
    });

    const { data } = prisma.auditEvent.create.mock.calls[0][0];
    const signed = data.hash as string;
    const withSameDetailInAnotherOrder = hashOf("head-hash", data.ts as Date, {
      action: "document.dispose",
      entityType: "Document",
      entityId: "doc-1",
      hashVersion: 2,
      detail: { certificate: { key: "documents/a.pdf", destroyedAt: "2026-11-05T00:00:00.000Z" } },
    });
    expect(signed).toBe(withSameDetailInAnotherOrder);

    const tamperedDetail = hashOf("head-hash", data.ts as Date, {
      action: "document.dispose",
      entityType: "Document",
      entityId: "doc-1",
      hashVersion: 2,
      detail: { certificate: { destroyedAt: "2026-11-05T00:00:00.000Z", key: null } },
    });
    expect(signed).not.toBe(tamperedDetail);
  });

  it("starts the chain from a null predecessor", async () => {
    const { service, prisma } = buildService();

    await service.record({ action: "auth.login", entityType: "Session" });

    const { data } = prisma.auditEvent.create.mock.calls[0][0];
    expect(data.prevHash).toBeNull();
    expect(data.hash).toBe(hashOf(null, data.ts as Date, { action: "auth.login", entityType: "Session", hashVersion: 2 }));
  });

  it("appends inside the caller transaction instead of opening its own", async () => {
    const { service, prisma } = buildService();
    const client = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      auditEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: { data: unknown }) => data) },
    };

    await service.record({ action: "document.purge", entityType: "Document", entityId: "doc-1" }, client as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.$executeRaw).toHaveBeenCalled();
    expect(client.auditEvent.create).toHaveBeenCalled();
  });

  it("keeps a date inside the detail verifiable after the database round-trip", async () => {
    const { service, prisma } = buildService();

    await service.record({
      action: "retention.extend",
      entityType: "Document",
      entityId: "doc-1",
      detail: {
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        previousDueAt: new Date("2029-11-05T10:18:08.384Z"),
        retentionItemId: "item-1",
      },
    });

    const { data } = prisma.auditEvent.create.mock.calls[0][0];
    const storedDetail = JSON.parse(JSON.stringify({ detail: data.detail })).detail as Record<string, string>;
    const row = {
      id: "event-1",
      seq: BigInt(1),
      ts: data.ts as Date,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      actorId: data.actorId,
      result: data.result,
      detail: storedDetail,
      hashVersion: data.hashVersion,
      prevHash: data.prevHash,
      hash: data.hash,
    };

    expect(storedDetail.dueAt).toBe("2020-01-01T00:00:00.000Z");
    const { service: verifier } = buildService([row]);
    const report = await verifier.verifyChain();

    expect(report).toMatchObject({ valid: true, breakCount: 0, detailSignedEvents: 1 });
  });
});

describe("AuditService.verifyChain", () => {
  it("accepts a chain in which every event links to its predecessor", async () => {
    const first = event(1, null);
    const second = event(2, first.hash);
    const third = event(3, second.hash);
    const { service } = buildService([first, second, third]);

    const report = await service.verifyChain();

    expect(report).toMatchObject({ events: 3, maxSeq: 3, sequenceGaps: 0, valid: true, breakCount: 0, forkCount: 0, genesisCount: 1 });
    expect(report.breaks).toEqual([]);
  });

  it("reports an empty ledger as a clean chain", async () => {
    const { service } = buildService([]);

    const report = await service.verifyChain();

    expect(report).toMatchObject({ events: 0, maxSeq: null, sequenceGaps: 0, valid: true, breakCount: 0, baseline: null, alarm: false });
  });

  it("compares a row against a predecessor whose hash was blanked out", async () => {
    const first = event(1, null);
    const second = { ...event(2, first.hash), hash: null };
    const { service } = buildService([first, second, event(3, null)]);

    const report = await service.verifyChain();

    expect(report.breaks).toEqual([expect.objectContaining({ seq: 2, kind: "missing_hash" })]);
    expect(report.sequenceGaps).toBe(0);
  });

  it("reads the chain in sequence order, not by the application clock", async () => {
    const { service, prisma } = buildService([event(1, null)]);

    await service.verifyChain();

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { seq: "asc" } }));
  });

  it("flags a rewritten action as a hash mismatch", async () => {
    const first = event(1, null);
    const second = event(2, first.hash);
    const third = { ...event(3, second.hash), action: "document.purge" };
    const { service } = buildService([first, second, third]);

    const report = await service.verifyChain();

    expect(report.valid).toBe(false);
    expect(report.breakCount).toBe(1);
    expect(report.firstBrokenSeq).toBe(3);
    expect(report.breaks[0]).toMatchObject({ seq: 3, kind: "hash_mismatch" });
  });

  it("flags an event that points at the wrong predecessor", async () => {
    const first = event(1, null);
    const orphan = event(2, "some-other-chain-head");
    const { service } = buildService([first, orphan]);

    const report = await service.verifyChain();

    expect(report.breaks).toEqual([expect.objectContaining({ seq: 2, kind: "broken_link", expected: first.hash })]);
  });

  it("flags a first row that claims a predecessor it cannot have", async () => {
    const { service } = buildService([event(1, "ghost-head")]);

    const report = await service.verifyChain();

    expect(report.breaks).toEqual([expect.objectContaining({ seq: 1, kind: "broken_link", expected: null })]);
    expect(report.genesisCount).toBe(0);
  });

  it("orders several forked parents by the number of children", async () => {
    const first = event(1, null);
    const shared = event(2, first.hash);
    const rows = [first, shared, event(3, first.hash), event(5, shared.hash), event(6, shared.hash), event(7, shared.hash)];
    const { service } = buildService(rows);

    const report = await service.verifyChain();

    expect(report.forks.map((fork) => fork.children)).toEqual([3, 2]);
    expect(report.forkCount).toBe(3);
  });

  it("flags a rewritten hash", async () => {
    const first = event(1, null);
    const { service } = buildService([first, event(2, first.hash, {}, "tampered")]);

    const report = await service.verifyChain();

    expect(report.breaks[0]).toMatchObject({ seq: 2, kind: "hash_mismatch", found: "tampered" });
  });

  it("reports a forked parent as an integrity break", async () => {
    const first = event(1, null);
    const sharedParent = first.hash;
    const { service } = buildService([first, event(2, sharedParent), event(3, sharedParent)]);

    const report = await service.verifyChain();

    expect(report.valid).toBe(false);
    expect(report.forkCount).toBe(1);
    expect(report.forks[0]).toMatchObject({ prevHash: sharedParent, children: 2, seqs: [2, 3] });
  });

  it("counts gaps left by removed rows", async () => {
    const first = event(1, null);
    const second = event(2, first.hash);
    const fourth = event(4, second.hash);
    const { service } = buildService([first, second, fourth]);

    const report = await service.verifyChain();

    expect(report.sequenceGaps).toBe(1);
    expect(report.maxSeq).toBe(4);
  });

  it("truncates the break list instead of returning the whole ledger", async () => {
    const rows: ReturnType<typeof event>[] = [];
    let prev: string | null = null;
    for (let seq = 1; seq <= 60; seq += 1) {
      const row = event(seq, prev, {}, seq === 1 ? undefined : "tampered");
      rows.push(row);
      prev = row.hash;
    }
    const { service } = buildService(rows);

    const report = await service.verifyChain();

    expect(report.breakCount).toBe(59);
    expect(report.breaks).toHaveLength(50);
    expect(report.truncated).toBe(true);
  });

  it("flags an event whose hash was blanked out", async () => {
    const first = event(1, null);
    const { service } = buildService([first, { ...event(2, first.hash), hash: null }]);

    const report = await service.verifyChain();

    expect(report.breaks[0]).toMatchObject({ seq: 2, kind: "missing_hash", found: null });
    expect(report).toMatchObject({ baseline: null, knownBreakCount: 0, newBreakCount: 1, alarm: true });
  });

  it("flags a rewritten detail on a signed event and counts the coverage", async () => {
    const first = event(1, null, { hashVersion: 2, detail: { note: "الأصل" } });
    const second = event(2, first.hash, { hashVersion: 2, detail: { note: "الأصل" } });
    const { service } = buildService([first, { ...second, detail: { note: "محذوف" } }]);

    const report = await service.verifyChain();

    expect(report.detailSignedEvents).toBe(2);
    expect(report.detailSignedFromSeq).toBe(1);
    expect(report.breaks[0]).toMatchObject({ seq: 2, kind: "hash_mismatch", known: false });
  });

  it("still verifies legacy events whose detail was never hashed", async () => {
    const legacy = event(1, null, { detail: { note: "الأصل" } });
    const signed = event(2, legacy.hash, { hashVersion: 2, detail: { note: "الأصل" } });
    const { service } = buildService([legacy, signed]);

    const report = await service.verifyChain();

    expect(report).toMatchObject({ valid: true, detailSignedEvents: 1, detailSignedFromSeq: 2 });
  });

  it("acknowledges recorded damage as a baseline and alarms only on new breaks", async () => {
    const first = event(1, null);
    const damaged = event(2, first.hash, {}, "tampered");
    const third = event(3, damaged.hash);
    const { service, prisma } = buildService([first, damaged, third]);

    await service.recordBaseline({ id: "user-1", name: "مدير النظام" });

    const created = prisma.auditEvent.create.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(created.data.action).toBe("audit.chain_baseline");
    prisma.auditEvent.findFirst.mockResolvedValue({ id: "baseline-1", seq: BigInt(4), ts: new Date(), detail: created.data.detail });

    const report = await service.verifyChain();
    expect(report).toMatchObject({
      valid: false,
      breakCount: 1,
      knownBreakCount: 1,
      newBreakCount: 0,
      alarm: false,
    });
    expect(report.baseline).toMatchObject({ seq: 4, id: "baseline-1", events: 3, maxSeq: 3, breakCount: 1, forkCount: 0 });
    expect(report.breaks[0].known).toBe(true);

    const after = buildService([first, damaged, { ...third, action: "document.purge" }]);
    after.prisma.auditEvent.findFirst.mockResolvedValue({ id: "baseline-1", seq: BigInt(4), ts: new Date(), detail: created.data.detail });

    const second = await after.service.verifyChain();
    expect(second).toMatchObject({ knownBreakCount: 1, newBreakCount: 1, alarm: true });
    expect(second.breaks.map((breakRow) => breakRow.known)).toEqual([true, false]);
  });

  it("acknowledges a forked parent in the baseline instead of reporting it as new", async () => {
    const first = event(1, null);
    const { service, prisma } = buildService([first, event(2, first.hash), event(3, first.hash)]);

    await service.recordBaseline();
    const created = prisma.auditEvent.create.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    prisma.auditEvent.findFirst.mockResolvedValue({ id: "baseline-1", seq: BigInt(4), ts: new Date(), detail: created.data.detail });

    const report = await service.verifyChain();

    expect(report).toMatchObject({ forkCount: 1, knownForkCount: 1, newForkCount: 0, alarm: false });
    expect(report.baseline?.forkCount).toBe(report.forkCount);
    expect(report.forks[0]).toMatchObject({ children: 2, seqs: [2, 3], known: true });
  });

  it("reads a baseline whose detail never recorded the figures", async () => {
    const { service, prisma } = buildService([event(1, null)]);
    prisma.auditEvent.findFirst.mockResolvedValue({
      id: "baseline-1",
      seq: BigInt(9),
      ts: new Date("2026-11-01T00:00:00.000Z"),
      detail: null,
    });

    const report = await service.verifyChain();

    expect(report.baseline).toEqual({
      seq: 9,
      id: "baseline-1",
      recordedAt: "2026-11-01T00:00:00.000Z",
      events: 0,
      maxSeq: null,
      breakCount: 0,
      forkCount: 0,
    });
  });

  it("counts a fork fingerprint it cannot parse as a single child", async () => {
    const { service, prisma } = buildService([event(1, null)]);
    prisma.auditEvent.findFirst.mockResolvedValue({
      id: "baseline-1",
      seq: BigInt(9),
      ts: new Date("2026-11-01T00:00:00.000Z"),
      detail: { forks: ["unparseable", "parent|"] },
    });

    const report = await service.verifyChain();

    expect(report.baseline?.forkCount).toBe(0);
  });

  it("treats a row without a stored hash version as a legacy event", async () => {
    const legacy = { ...event(1, null), hashVersion: undefined };
    const { service } = buildService([legacy]);

    const report = await service.verifyChain();

    expect(report).toMatchObject({ valid: true, detailSignedEvents: 0, detailSignedFromSeq: null });
  });

  it("verifies a signed event whose detail keys arrived out of order", async () => {
    const signed = event(1, null, { hashVersion: 2, detail: { alpha: 1, zeta: 3, middle: 2 } });
    const { service } = buildService([signed]);

    const report = await service.verifyChain();

    expect(report).toMatchObject({ valid: true, detailSignedEvents: 1 });
  });

  it("streams a long chain in batches and keeps the report identical", async () => {
    const rows: Array<Record<string, unknown>> = [];
    let previousHash: string | null = null;
    for (let seq = 1; seq <= 1001; seq += 1) {
      const row = event(seq, previousHash);
      rows.push(row);
      previousHash = row.hash as string;
    }
    const { service, prisma } = buildService(rows);
    prisma.auditEvent.findMany.mockImplementation(async ({ take, cursor }: { take: number; cursor?: { seq: bigint } }) => {
      const start = cursor ? rows.findIndex((row) => row.seq === cursor.seq) + 1 : 0;
      return rows.slice(start, start + take);
    });

    const report = await service.verifyChain();

    expect(prisma.auditEvent.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.auditEvent.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 1000 }));
    expect(prisma.auditEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 1000, cursor: { seq: BigInt(1000) }, skip: 1 }),
    );
    expect(report).toMatchObject({ valid: true, events: 1001, maxSeq: 1001, sequenceGaps: 0, breakCount: 0 });
  });

  it("detects a tampered event that falls in the second batch", async () => {
    const rows: Array<Record<string, unknown>> = [];
    let previousHash: string | null = null;
    for (let seq = 1; seq <= 1001; seq += 1) {
      const row = event(seq, previousHash);
      rows.push(row);
      previousHash = row.hash as string;
    }
    rows[1000] = { ...rows[1000], hash: "tampered-in-batch-2" };
    const { service, prisma } = buildService(rows);
    prisma.auditEvent.findMany.mockImplementation(async ({ take, cursor }: { take: number; cursor?: { seq: bigint } }) => {
      const start = cursor ? rows.findIndex((row) => row.seq === cursor.seq) + 1 : 0;
      return rows.slice(start, start + take);
    });

    const report = await service.verifyChain();

    expect(report.valid).toBe(false);
    expect(report.breaks[0]).toMatchObject({ seq: 1001, kind: "hash_mismatch", found: "tampered-in-batch-2" });
  });
});
