import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AuditEvent, Prisma } from "@prisma/client";
import { advisoryLock } from "../../common/db/advisory-lock";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  departmentId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  result?: string;
  correlationId?: string | null;
  detail?: Prisma.InputJsonValue;
}

export type AuditBreakKind = "hash_mismatch" | "broken_link" | "missing_hash";

export interface AuditChainBreak {
  seq: number;
  id: string;
  ts: string;
  action: string;
  entityType: string;
  kind: AuditBreakKind;
  expected: string | null;
  found: string | null;
  known: boolean;
}

export interface AuditChainFork {
  prevHash: string;
  children: number;
  seqs: number[];
  known: boolean;
}

export interface AuditChainBaseline {
  seq: number;
  id: string;
  recordedAt: string;
  events: number;
  maxSeq: number | null;
  breakCount: number;
  forkCount: number;
}

export interface AuditChainReport {
  events: number;
  maxSeq: number | null;
  sequenceGaps: number;
  valid: boolean;
  breakCount: number;
  breaks: AuditChainBreak[];
  truncated: boolean;
  forkCount: number;
  forks: AuditChainFork[];
  genesisCount: number;
  firstBrokenSeq: number | null;
  verifiedAt: string;
  detailSignedEvents: number;
  detailSignedFromSeq: number | null;
  baseline: AuditChainBaseline | null;
  knownBreakCount: number;
  knownForkCount: number;
  newBreakCount: number;
  newForkCount: number;
  alarm: boolean;
}

/** The advisory lock key every writer must hold while it reads the chain head and appends to it. */
const CHAIN_LOCK = "edas.audit.chain";
const BREAK_REPORT_LIMIT = 50;
const CHAIN_BATCH_SIZE = 1000;

/** Version 1 covers the ledger columns; version 2 additionally covers the canonicalised `detail` JSON. */
const SIGNED_DETAIL_HASH_VERSION = 2;
const BASELINE_ACTION = "audit.chain_baseline";
const BASELINE_ENTITY_TYPE = "AuditChain";

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function chainPayload(event: {
  ts: Date;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  result?: string | null;
  detail?: unknown;
  hashVersion?: number | null;
}): string {
  const payload = {
    ts: event.ts.toISOString(),
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    actorId: event.actorId ?? null,
    result: event.result ?? "success",
  };
  if ((event.hashVersion ?? 1) < SIGNED_DETAIL_HASH_VERSION) return JSON.stringify(payload);
  return JSON.stringify({ ...payload, detail: canonicalJson(event.detail ?? null) });
}

function chainHash(prevHash: string | null, payload: string): string {
  return createHash("sha256")
    .update(`${prevHash ?? ""}|${payload}`)
    .digest("hex");
}

function breakFingerprint(seq: number, kind: AuditBreakKind, found: string | null, expected: string | null): string {
  return `${seq}|${kind}|${found ?? ""}|${expected ?? ""}`;
}

function forkFingerprint(prevHash: string, seqs: number[]): string {
  return `${prevHash}|${seqs.join(",")}`;
}

type ChainRow = {
  id: string;
  seq: bigint;
  ts: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  result: string;
  detail?: unknown;
  hashVersion?: number;
  prevHash: string | null;
  hash: string | null;
};

type ChainBreakEntry = Omit<AuditChainBreak, "known"> & { fingerprint: string };
type ChainForkEntry = Omit<AuditChainFork, "known"> & { fingerprint: string };

type BaselineRecord = {
  id: string;
  seq: number;
  recordedAt: string;
  events: number;
  maxSeq: number | null;
  breakCount: number;
  forkCount: number;
  breaks: string[];
  forks: string[];
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends to the hash chain. The advisory lock serialises the read-the-head/append step across concurrent
   * requests; passing `client` lets a caller commit the event inside its own business transaction.
   */
  async record(input: AuditInput, client?: Prisma.TransactionClient): Promise<AuditEvent> {
    const append = async (tx: Prisma.TransactionClient) => {
      await advisoryLock(tx, CHAIN_LOCK);
      const previous = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
      const prevHash = previous?.hash ?? null;
      const ts = new Date();
      const hash = chainHash(prevHash, chainPayload({ ...input, ts, hashVersion: SIGNED_DETAIL_HASH_VERSION }));

      return tx.auditEvent.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          actorId: input.actorId ?? null,
          actorName: input.actorName ?? null,
          departmentId: input.departmentId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          result: input.result ?? "success",
          correlationId: input.correlationId ?? null,
          detail: input.detail,
          hashVersion: SIGNED_DETAIL_HASH_VERSION,
          ts,
          prevHash,
          hash,
        },
      });
    };

    if (client) return append(client);
    return this.prisma.$transaction((tx) => append(tx));
  }

  async verifyChain(): Promise<AuditChainReport> {
    const analysis = await this.analyzeChain();
    const baseline = await this.readBaseline();
    const knownBreaks = new Set(baseline?.breaks ?? []);
    const knownForks = new Set(baseline?.forks ?? []);

    const knownBreakCount = analysis.breakEntries.filter((entry) => knownBreaks.has(entry.fingerprint)).length;
    const newBreakCount = analysis.breakCount - knownBreakCount;

    let knownForkCount = 0;
    let newForkCount = 0;
    for (const entry of analysis.forkEntries) {
      const extraChildren = entry.seqs.length - 1;
      if (knownForks.has(entry.fingerprint)) knownForkCount += extraChildren;
      else newForkCount += extraChildren;
    }

    return {
      events: analysis.events,
      maxSeq: analysis.maxSeq,
      sequenceGaps: analysis.sequenceGaps,
      valid: analysis.breakCount === 0 && analysis.forkEntries.length === 0,
      breakCount: analysis.breakCount,
      breaks: analysis.breakEntries.slice(0, BREAK_REPORT_LIMIT).map(({ fingerprint, ...breakRow }) => ({
        ...breakRow,
        known: knownBreaks.has(fingerprint),
      })),
      truncated: analysis.breakCount > BREAK_REPORT_LIMIT,
      forkCount: analysis.forkEntries.reduce((total, entry) => total + entry.seqs.length - 1, 0),
      forks: analysis.forkEntries.slice(0, BREAK_REPORT_LIMIT).map(({ fingerprint, ...fork }) => ({
        ...fork,
        known: knownForks.has(fingerprint),
      })),
      genesisCount: analysis.genesisCount,
      firstBrokenSeq: analysis.firstBrokenSeq,
      verifiedAt: new Date().toISOString(),
      detailSignedEvents: analysis.detailSignedEvents,
      detailSignedFromSeq: analysis.detailSignedFromSeq,
      baseline: baseline
        ? {
            seq: baseline.seq,
            id: baseline.id,
            recordedAt: baseline.recordedAt,
            events: baseline.events,
            maxSeq: baseline.maxSeq,
            breakCount: baseline.breakCount,
            forkCount: baseline.forkCount,
          }
        : null,
      knownBreakCount,
      knownForkCount,
      newBreakCount,
      newForkCount,
      alarm: newBreakCount > 0 || newForkCount > 0,
    };
  }

  /**
   * Freezes the damage the chain currently reports into a signed audit event, so any break that appears later is
   * new rather than another instance of the historical damage that predates the serialised appender.
   */
  async recordBaseline(actor: { id?: string | null; name?: string | null } = {}): Promise<AuditChainReport> {
    const analysis = await this.analyzeChain();

    await this.record({
      action: BASELINE_ACTION,
      entityType: BASELINE_ENTITY_TYPE,
      actorId: actor.id ?? null,
      actorName: actor.name ?? null,
      detail: {
        breaks: analysis.breakEntries.map((entry) => entry.fingerprint),
        forks: analysis.forkEntries.map((entry) => entry.fingerprint),
        events: analysis.events,
        maxSeq: analysis.maxSeq,
        sequenceGaps: analysis.sequenceGaps,
      },
    });

    return this.verifyChain();
  }

  private async *chainBatches(): AsyncGenerator<ChainRow[]> {
    let cursor: bigint | undefined;
    while (true) {
      const batch = await this.prisma.auditEvent.findMany({
        take: CHAIN_BATCH_SIZE,
        ...(cursor === undefined ? {} : { cursor: { seq: cursor }, skip: 1 }),
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          ts: true,
          action: true,
          entityType: true,
          entityId: true,
          actorId: true,
          result: true,
          detail: true,
          hashVersion: true,
          prevHash: true,
          hash: true,
        },
      });
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < CHAIN_BATCH_SIZE) return;
      cursor = batch[batch.length - 1].seq;
    }
  }

  /** Streams the ledger in `seq` order so verification memory stays bounded by one batch (plus the fork index). */
  private async analyzeChain() {
    const breakEntries: ChainBreakEntry[] = [];
    const childrenOf = new Map<string, number[]>();
    let genesisCount = 0;
    let firstBrokenSeq: number | null = null;
    let detailSignedEvents = 0;
    let detailSignedFromSeq: number | null = null;
    let events = 0;
    let maxSeq: number | null = null;
    let previousHash: string | null = null;
    let hasPrevious = false;

    for await (const batch of this.chainBatches()) {
      for (const row of batch) {
        const seq = Number(row.seq);
        if ((row.hashVersion ?? 1) >= SIGNED_DETAIL_HASH_VERSION) {
          detailSignedEvents += 1;
          if (detailSignedFromSeq === null) detailSignedFromSeq = seq;
        }
        if (row.prevHash === null) genesisCount += 1;
        else childrenOf.set(row.prevHash, [...(childrenOf.get(row.prevHash) ?? []), seq]);

        const expectedPrevHash = hasPrevious ? previousHash : null;
        const expectedHash = chainHash(row.prevHash, chainPayload(row));
        const kind: AuditBreakKind | null =
          row.hash === null
            ? "missing_hash"
            : row.hash !== expectedHash
              ? "hash_mismatch"
              : row.prevHash !== expectedPrevHash
                ? "broken_link"
                : null;

        if (kind) {
          if (firstBrokenSeq === null) firstBrokenSeq = seq;
          const expected = kind === "broken_link" ? expectedPrevHash : expectedHash;
          breakEntries.push({
            seq,
            id: row.id,
            ts: row.ts.toISOString(),
            action: row.action,
            entityType: row.entityType,
            kind,
            expected,
            found: row.hash,
            fingerprint: breakFingerprint(seq, kind, row.hash, expected),
          });
        }

        hasPrevious = true;
        previousHash = row.hash;
        events += 1;
        maxSeq = seq;
      }
    }

    const forkEntries: ChainForkEntry[] = [...childrenOf.entries()]
      .filter(([, seqs]) => seqs.length > 1)
      .map(([prevHash, seqs]) => ({ prevHash, children: seqs.length, seqs, fingerprint: forkFingerprint(prevHash, seqs) }))
      .sort((a, b) => b.children - a.children);

    return {
      events,
      maxSeq,
      sequenceGaps: maxSeq === null ? 0 : maxSeq - events,
      breakCount: breakEntries.length,
      breakEntries,
      forkEntries,
      genesisCount,
      firstBrokenSeq,
      detailSignedEvents,
      detailSignedFromSeq,
    };
  }

  private async readBaseline(): Promise<BaselineRecord | null> {
    const row = await this.prisma.auditEvent.findFirst({
      where: { action: BASELINE_ACTION, entityType: BASELINE_ENTITY_TYPE },
      orderBy: { seq: "desc" },
      select: { id: true, seq: true, ts: true, detail: true },
    });
    if (!row) return null;

    const detail = row.detail as { breaks?: unknown; forks?: unknown; events?: unknown; maxSeq?: unknown } | null;
    const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    const breaks = asStrings(detail?.breaks);
    const forks = asStrings(detail?.forks);

    return {
      id: row.id,
      seq: Number(row.seq),
      recordedAt: row.ts.toISOString(),
      events: typeof detail?.events === "number" ? detail.events : 0,
      maxSeq: typeof detail?.maxSeq === "number" ? detail.maxSeq : null,
      breakCount: breaks.length,
      forkCount: forks.reduce((total, fingerprint) => {
        const children = fingerprint.split("|")[1]?.split(",").filter(Boolean).length ?? 1;
        return total + Math.max(0, children - 1);
      }, 0),
      breaks,
      forks,
    };
  }
}
