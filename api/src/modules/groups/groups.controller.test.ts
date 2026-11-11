import { describe, expect, it, vi } from "vitest";
import { GroupsController } from "./groups.controller";
import type { GroupsService } from "./groups.service";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const groups = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "group-1" }),
    update: vi.fn().mockResolvedValue({ id: "group-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new GroupsController(groups as unknown as GroupsService), groups };
}

describe("GroupsController delegation", () => {
  it("serves the catalog without a principal", async () => {
    const { controller, groups } = build();

    await expect(controller.list()).resolves.toEqual([]);
    expect(groups.list).toHaveBeenCalledWith();
  });

  it("forwards creation with its body", async () => {
    const { controller, groups } = build();
    const dto = { name: "لجنة المراجعة", memberIds: ["user-2"] } as never;

    await controller.create(PRINCIPAL as never, dto);

    expect(groups.create).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("forwards the update body and the removal id", async () => {
    const { controller, groups } = build();
    const dto = { name: "لجنة المراجعة الداخلية" } as never;

    await controller.update(PRINCIPAL as never, "group-1", dto);
    await controller.remove(PRINCIPAL as never, "group-1");

    expect(groups.update).toHaveBeenCalledWith(PRINCIPAL, "group-1", dto);
    expect(groups.remove).toHaveBeenCalledWith(PRINCIPAL, "group-1");
  });
});
