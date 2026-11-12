import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DownloadTicketService } from "./download-ticket.service";

function ledger() {
  const used = new Set<string>();
  return {
    create: vi.fn((args: { data: { nonce: string; expiresAt: Date } }) => {
      if (used.has(args.data.nonce)) return Promise.reject(Object.assign(new Error("unique"), { code: "P2002" }));
      used.add(args.data.nonce);
      return Promise.resolve(args.data);
    }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

function buildService(prisma = { downloadTicketUse: ledger() }) {
  return { service: new DownloadTicketService({ get: () => undefined } as never, prisma as never), prisma };
}

describe("DownloadTicketService", () => {
  const SECRET = "unit-test-download-secret-0123456789";

  function seal(payload: unknown, secret = SECRET): string {
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  function withSecret(secret: string) {
    return new DownloadTicketService({ get: () => secret } as never, { downloadTicketUse: ledger() } as never);
  }

  it("rejects a configured secret that is too short", () => {
    expect(() => withSecret("short")).toThrow("DOWNLOAD_TICKET_SECRET must be at least 32 characters");
  });

  it("seals with the configured secret so another replica can verify it", () => {
    const first = withSecret(SECRET);
    const second = withSecret(SECRET);

    const ticket = first.issue("file", "file-1", "user-1");

    expect(second.verify("file", "file-1", ticket)).toMatchObject({ kind: "file", id: "file-1", sub: "user-1" });
  });

  it("rejects a well-formed ticket that omits an identity, an expiry or a known kind", () => {
    const service = withSecret(SECRET);
    const exp = Date.now() + 60_000;

    expect(service.verify("file", "file-1", seal({ kind: "file", sub: "user-1", exp, n: "nonce" }))).toBeNull();
    expect(service.verify("file", "file-1", seal({ kind: "file", id: "file-1", sub: "user-1", exp: "later", n: "nonce" }))).toBeNull();
    expect(service.verify("file", "file-1", seal({ kind: "bundle", id: "file-1", sub: "user-1", exp, n: "nonce" }))).toBeNull();
  });

  it("rejects a ticket whose authentication tag was corrupted", () => {
    const service = withSecret(SECRET);
    const forged = Buffer.concat([randomBytes(12), randomBytes(16), randomBytes(20)]).toString("base64url");

    expect(service.verify("file", "file-1", forged)).toBeNull();
  });

  it("issues a sealed ticket that verifies with a nonce and expiry", () => {
    const { service } = buildService();

    const ticket = service.issue("file", "file-1", "user-1", { inline: true });
    const grant = service.verify("file", "file-1", ticket);

    expect(grant).toMatchObject({ kind: "file", id: "file-1", sub: "user-1", inline: true });
    expect(grant?.nonce).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(grant?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a ticket bound to another entity or kind", () => {
    const { service } = buildService();
    const ticket = service.issue("file", "file-1", "user-1");

    expect(service.verify("file", "file-2", ticket)).toBeNull();
    expect(service.verify("report", "file-1", ticket)).toBeNull();
    expect(service.verify("file", "file-1", "deadbeef")).toBeNull();
  });

  it("reserves the nonce cluster-wide so only the first delivery audits", async () => {
    const { service, prisma } = buildService();
    const grant = service.verify("file", "file-1", service.issue("file", "file-1", "user-1"));
    if (!grant) throw new Error("expected a grant");

    await expect(service.firstDelivery(grant)).resolves.toBe(true);
    await expect(service.firstDelivery(grant)).resolves.toBe(false);

    expect(prisma.downloadTicketUse.create).toHaveBeenCalledTimes(2);
    expect(prisma.downloadTicketUse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nonce: grant.nonce, kind: "file", entityId: "file-1", sub: "user-1" }),
    });
  });

  it("still delivers when the ledger is unavailable", async () => {
    const prisma = {
      downloadTicketUse: {
        create: vi.fn().mockRejectedValue(new Error("connection refused")),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { service } = buildService(prisma);
    const grant = service.verify("file", "file-1", service.issue("file", "file-1", "user-1"));
    if (!grant) throw new Error("expected a grant");

    await expect(service.firstDelivery(grant)).resolves.toBe(true);
  });

  it("prunes expired reservations at most once per interval", async () => {
    const { service, prisma } = buildService();
    const grant = service.verify("file", "file-1", service.issue("file", "file-1", "user-1"));
    if (!grant) throw new Error("expected a grant");

    await service.firstDelivery(grant);
    await service.firstDelivery({ ...grant, nonce: "second-nonce" });

    expect(prisma.downloadTicketUse.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.downloadTicketUse.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
