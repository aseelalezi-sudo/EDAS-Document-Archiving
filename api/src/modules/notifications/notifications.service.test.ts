import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";

const ACTOR = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" };

function buildService(actor = ACTOR) {
  const prisma = {
    notification: {
      create: vi.fn().mockResolvedValue({ id: "note-1", level: "INFO" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ departmentId: "dept-1" }) },
  };
  const access = { resolveActor: vi.fn().mockResolvedValue(actor), isGlobal: vi.fn().mockReturnValue(false) };
  const audit = { record: vi.fn().mockResolvedValue({ id: "audit-1" }) };
  return { service: new NotificationsService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("NotificationsService.markRead", () => {
  it("marks the notification read and records an audit event", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.markRead({ sub: "sub-1" } as never, "note-1")).resolves.toEqual({ id: "note-1", read: true });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "note-1", OR: [{ userId: "user-1" }, { userId: null }] },
      data: { read: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notification.read",
        entityType: "Notification",
        entityId: "note-1",
        actorId: "user-1",
        departmentId: "dept-1",
      }),
    );
  });

  it("rejects a notification outside the caller's scope without auditing", async () => {
    const { service, prisma, audit } = buildService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markRead({ sub: "sub-1" } as never, "note-9")).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("NotificationsService.markAllRead", () => {
  it("records one aggregate audit event for the batch", async () => {
    const { service, prisma, audit } = buildService();
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.markAllRead({ sub: "sub-1" } as never)).resolves.toEqual({ updated: 4 });

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notification.read_all",
        entityType: "Notification",
        entityId: null,
        actorId: "user-1",
        detail: { updated: 4 },
      }),
    );
  });

  it("skips the audit event when nothing was unread", async () => {
    const { service, prisma, audit } = buildService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markAllRead({ sub: "sub-1" } as never)).resolves.toEqual({ updated: 0 });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
