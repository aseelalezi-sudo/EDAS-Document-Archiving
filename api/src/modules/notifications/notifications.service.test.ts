import { NotFoundException } from "@nestjs/common";
import { NotificationLevel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";

const PRINCIPAL = { sub: "user-1" } as never;
const EMPLOYEE = { id: "user-1", departmentId: "dept-fin", role: "EMPLOYEE" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

function buildService(actor: typeof EMPLOYEE | typeof ADMIN = EMPLOYEE) {
  const prisma = {
    $transaction: vi.fn(),
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "note-new", ...data })),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      findMany: vi.fn().mockResolvedValue([{ id: "note-1", title: "اعتماد" }]),
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: "user-2" }, { id: "user-3" }]),
      findUnique: vi.fn().mockResolvedValue({ departmentId: "dept-fin" }),
    },
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) => Promise.all(work as Promise<unknown>[]));

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { service: new NotificationsService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("NotificationsService push", () => {
  it("defaults to a broadcast info notification", async () => {
    const { service, prisma } = buildService();

    const note = await service.push({ title: "تحديث", message: "نص" });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: null, title: "تحديث", message: "نص", level: NotificationLevel.INFO, entityType: null, entityId: null },
    });
    expect(note.id).toBe("note-new");
  });

  it("fans out to every active holder of the role", async () => {
    const { service, prisma } = buildService();

    await expect(service.pushToRole("SUPERVISOR", { title: "اعتماد", message: "بانتظارك" })).resolves.toBe(2);

    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { role: "SUPERVISOR", status: "ACTIVE" }, select: { id: true } });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "user-2", title: "اعتماد", message: "بانتظارك", level: NotificationLevel.INFO, entityType: null, entityId: null },
        { userId: "user-3", title: "اعتماد", message: "بانتظارك", level: NotificationLevel.INFO, entityType: null, entityId: null },
      ],
    });
  });

  it("broadcasts once when the role has no active user", async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.pushToRole("ARCHIVIST", { title: "تنبيه", message: "نص" })).resolves.toBe(0);

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: null }) }));
  });
});

describe("NotificationsService reads", () => {
  it("scopes the list to the actor plus broadcasts and counts unread", async () => {
    const { service, prisma } = buildService();

    const result = await service.list(PRINCIPAL, { page: 2, pageSize: 10 } as never);

    const where = (prisma.notification.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toEqual([{ userId: "user-1" }, { userId: null }]);
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 2, unread: 2 });
  });

  it("adds the unread filter when requested", async () => {
    const { service, prisma } = buildService();

    await service.list(PRINCIPAL, { unreadOnly: true } as never);

    const where = (prisma.notification.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where;
    expect(where.AND).toEqual([{ OR: [{ userId: "user-1" }, { userId: null }] }, { read: false }]);
  });

  it("counts unread rows for the actor", async () => {
    const { service } = buildService();

    await expect(service.unreadCount(PRINCIPAL)).resolves.toEqual({ count: 2 });
  });

  it("marks one notification read and records it", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.markRead(PRINCIPAL, "note-1")).resolves.toEqual({ id: "note-1", read: true });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "note-1", OR: [{ userId: "user-1" }, { userId: null }] },
      data: { read: true },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "notification.read", entityId: "note-1" }));
  });

  it("reports a notification that is not the actor's", async () => {
    const { service, prisma, audit } = buildService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markRead(PRINCIPAL, "note-9")).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("records mark-all only when rows changed", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.markAllRead(PRINCIPAL)).resolves.toEqual({ updated: 1 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notification.read_all", entityId: null, detail: { updated: 1 } }),
    );

    audit.record.mockClear();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markAllRead(PRINCIPAL)).resolves.toEqual({ updated: 0 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("scopes every read to broadcasts when the actor has no identifier", async () => {
    const { service, prisma, audit } = buildService({ ...EMPLOYEE, id: "" });

    await service.list(PRINCIPAL, { unreadOnly: true } as never);
    const where = (prisma.notification.findMany.mock.calls[0][0] as { where: { AND: { OR: unknown[] }[] } }).where;
    expect(where.AND[0].OR).toEqual([{ userId: "__none__" }, { userId: null }]);

    await service.unreadCount(PRINCIPAL);
    expect(prisma.notification.count).toHaveBeenLastCalledWith({
      where: { read: false, OR: [{ userId: "__none__" }, { userId: null }] },
    });

    await service.markRead(PRINCIPAL, "note-1");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "note-1", OR: [{ userId: "__none__" }, { userId: null }] },
      data: { read: true },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "notification.read", actorId: null }));

    await service.markAllRead(PRINCIPAL);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "notification.read_all", actorId: null }));
  });
});

describe("NotificationsService create", () => {
  it("hides a target from another department behind a 404", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ departmentId: "dept-legal" });

    await expect(service.create(PRINCIPAL, { title: "x", message: "y", userId: "user-9" } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("creates and audits a notification for a scoped target", async () => {
    const { service, prisma, audit } = buildService();

    const note = await service.create(PRINCIPAL, {
      title: "تذكير",
      message: "نص",
      userId: "user-2",
      level: NotificationLevel.WARNING,
    } as never);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        title: "تذكير",
        message: "نص",
        level: NotificationLevel.WARNING,
        entityType: null,
        entityId: null,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notification.create", detail: expect.objectContaining({ userId: "user-2" }) }),
    );
    expect(note.id).toBe("note-new");
  });

  it("lets a system administrator target any department without a lookup", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.create(PRINCIPAL, { title: "x", message: "y", userId: "user-9" } as never);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it("broadcasts and audits a notification created by an actor without an identifier", async () => {
    const { service, prisma, audit } = buildService({ ...EMPLOYEE, id: "" });

    await service.create(PRINCIPAL, { title: "تعميم", message: "نص" } as never);

    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: null }) });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notification.create", actorId: null, detail: expect.objectContaining({ userId: null }) }),
    );
  });
});
