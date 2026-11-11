import { describe, expect, it, vi } from "vitest";
import { NotificationsController } from "./notifications.controller";
import type { NotificationsService } from "./notifications.service";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };

function build() {
  const notifications = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    unreadCount: vi.fn().mockResolvedValue({ count: 3 }),
    markAllRead: vi.fn().mockResolvedValue({ updated: 3 }),
    markRead: vi.fn().mockResolvedValue({ id: "note-1" }),
    create: vi.fn().mockResolvedValue({ id: "note-1" }),
  };
  return { controller: new NotificationsController(notifications as unknown as NotificationsService), notifications };
}

describe("NotificationsController delegation", () => {
  it("forwards the list query and the unread count", async () => {
    const { controller, notifications } = build();
    const query = { unreadOnly: true, page: 2 } as never;

    await controller.list(PRINCIPAL as never, query);
    await controller.unreadCount(PRINCIPAL as never);

    expect(notifications.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(notifications.unreadCount).toHaveBeenCalledWith(PRINCIPAL);
  });

  it("forwards read-all and the single read", async () => {
    const { controller, notifications } = build();

    await controller.markAllRead(PRINCIPAL as never);
    await controller.markRead(PRINCIPAL as never, "note-1");

    expect(notifications.markAllRead).toHaveBeenCalledWith(PRINCIPAL);
    expect(notifications.markRead).toHaveBeenCalledWith(PRINCIPAL, "note-1");
  });

  it("forwards creation with its body", async () => {
    const { controller, notifications } = build();
    const dto = { userId: "user-2", title: "اعتماد", body: "تم اعتماد الوثيقة" } as never;

    await controller.create(PRINCIPAL as never, dto);

    expect(notifications.create).toHaveBeenCalledWith(PRINCIPAL, dto);
  });
});
