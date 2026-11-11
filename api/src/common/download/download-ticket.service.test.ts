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
