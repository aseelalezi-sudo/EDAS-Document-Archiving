import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

export const DOWNLOAD_TICKET_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;
const PRUNE_INTERVAL_MS = 5 * 60_000;

export interface DownloadTicketGrant {
  kind: "file" | "report";
  id: string;
  sub: string;
  inline: boolean;
  nonce: string;
  expiresAt: Date;
}

interface TicketPayload {
  kind: "file" | "report";
  id: string;
  sub: string;
  inline: boolean;
  exp: number;
  n: string;
}

/**
 * Stateless download capability: the ticket carries an AES-256-GCM sealed payload and an expiry, so any API replica
 * holding the same DOWNLOAD_TICKET_SECRET can validate it without shared state. Single-delivery bookkeeping is stored
 * in PostgreSQL so the guarantee holds across replicas instead of inside one process.
 */
@Injectable()
export class DownloadTicketService {
  private static warned = false;
  private readonly logger = new Logger(DownloadTicketService.name);
  private readonly key: Buffer;
  private lastPruneAt = 0;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = String(config.get<string>("DOWNLOAD_TICKET_SECRET") ?? "").trim();
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`DOWNLOAD_TICKET_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    if (secret) {
      this.key = createHash("sha256").update(secret).digest();
      return;
    }
    this.key = randomBytes(32);
    if (!DownloadTicketService.warned) {
      DownloadTicketService.warned = true;
      this.logger.warn(
        "DOWNLOAD_TICKET_SECRET is not set; download links are ephemeral and other API instances cannot validate them",
      );
    }
  }

  issue(kind: "file" | "report", id: string, sub: string, options: { inline?: boolean } = {}): string {
    const payload: TicketPayload = {
      kind,
      id,
      sub,
      inline: options.inline === true,
      exp: Date.now() + DOWNLOAD_TICKET_TTL_SECONDS * 1000,
      n: randomBytes(9).toString("base64url"),
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  verify(kind: "file" | "report", id: string, ticket: string | undefined): DownloadTicketGrant | null {
    if (!ticket) return null;
    const payload = this.decrypt(ticket);
    if (!payload) return null;
    if (payload.kind !== kind || payload.id !== id || payload.exp <= Date.now()) return null;
    return {
      kind: payload.kind,
      id: payload.id,
      sub: payload.sub,
      inline: payload.inline,
      nonce: payload.n,
      expiresAt: new Date(payload.exp),
    };
  }

  /**
   * Reserves the ticket's nonce cluster-wide; only the first caller gets `true`. Range requests reuse the same ticket,
   * so later chunks skip the delivery audit without failing. If the ledger is unreachable the download still goes
   * through (returns `true`) because losing a bookkeeping row must not break a legitimate download.
   */
  async firstDelivery(grant: DownloadTicketGrant): Promise<boolean> {
    try {
      await this.prisma.downloadTicketUse.create({
        data: {
          nonce: grant.nonce,
          kind: grant.kind,
          entityId: grant.id,
          sub: grant.sub,
          expiresAt: grant.expiresAt,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return false;
      this.logger.warn(`download ticket dedupe unavailable: ${(error as Error).message}`);
      return true;
    }
    await this.pruneExpired();
    return true;
  }

  private async pruneExpired(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    await this.prisma.downloadTicketUse.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);
  }

  private decrypt(ticket: string): TicketPayload | null {
    try {
      const raw = Buffer.from(ticket, "base64url");
      if (raw.length <= 28) return null;
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
      const payload = JSON.parse(json) as Partial<TicketPayload>;
      if (typeof payload.id !== "string" || typeof payload.sub !== "string") return null;
      if (typeof payload.exp !== "number" || typeof payload.n !== "string") return null;
      if (payload.kind !== "file" && payload.kind !== "report") return null;
      return {
        kind: payload.kind,
        id: payload.id,
        sub: payload.sub,
        inline: payload.inline === true,
        exp: payload.exp,
        n: payload.n,
      };
    } catch {
      return null;
    }
  }
}
