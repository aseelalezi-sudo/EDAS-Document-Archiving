import { describe, expect, it, vi } from "vitest";
import type { NotificationTemplatesService } from "./notification-templates.service";
import { NotificationTemplatesController } from "./notification-templates.controller";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const templates = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "tpl-1" }),
    update: vi.fn().mockResolvedValue({ id: "tpl-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue({ id: "tpl-1" }),
  };
  return { controller: new NotificationTemplatesController(templates as unknown as NotificationTemplatesService), templates };
}

describe("NotificationTemplatesController delegation", () => {
  it("serves the catalog without a principal", async () => {
    const { controller, templates } = build();

    await expect(controller.list()).resolves.toEqual([]);
    expect(templates.list).toHaveBeenCalledWith();
  });

  it("forwards creation and the update body", async () => {
    const { controller, templates } = build();
    const create = { key: "document.approved", subjectAr: "اعتماد", bodyAr: "تم الاعتماد" } as never;
    const update = { subjectAr: "اعتماد وثيقة" } as never;

    await controller.create(PRINCIPAL as never, create);
    await controller.update(PRINCIPAL as never, "tpl-1", update);

    expect(templates.create).toHaveBeenCalledWith(PRINCIPAL, create);
    expect(templates.update).toHaveBeenCalledWith(PRINCIPAL, "tpl-1", update);
  });

  it("forwards removal and the catalog reset", async () => {
    const { controller, templates } = build();

    await controller.remove(PRINCIPAL as never, "tpl-1");
    await controller.reset(PRINCIPAL as never, "tpl-1");

    expect(templates.remove).toHaveBeenCalledWith(PRINCIPAL, "tpl-1");
    expect(templates.reset).toHaveBeenCalledWith(PRINCIPAL, "tpl-1");
  });
});
