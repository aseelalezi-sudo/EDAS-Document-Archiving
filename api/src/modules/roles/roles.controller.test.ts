import { describe, expect, it, vi } from "vitest";
import { RolesController } from "./roles.controller";
import type { RolesService } from "./roles.service";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const roles = {
    list: vi.fn().mockResolvedValue([{ role: "EMPLOYEE", actions: ["VIEW"] }]),
    update: vi.fn().mockResolvedValue({ role: "EMPLOYEE", actions: ["VIEW"] }),
    reset: vi.fn().mockResolvedValue({ role: "EMPLOYEE" }),
  };
  return { controller: new RolesController(roles as unknown as RolesService), roles };
}

describe("RolesController delegation", () => {
  it("serves the permission matrix without a principal", async () => {
    const { controller, roles } = build();

    await expect(controller.list()).resolves.toEqual([{ role: "EMPLOYEE", actions: ["VIEW"] }]);
    expect(roles.list).toHaveBeenCalledWith();
  });

  it("unwraps the actions of the patch body", async () => {
    const { controller, roles } = build();
    const dto = { actions: ["VIEW", "DOWNLOAD"] } as never;

    await controller.update(PRINCIPAL as never, "EMPLOYEE", dto);

    expect(roles.update).toHaveBeenCalledWith(PRINCIPAL, "EMPLOYEE", ["VIEW", "DOWNLOAD"]);
    expect(roles.update).not.toHaveBeenCalledWith(PRINCIPAL, "EMPLOYEE", dto);
  });

  it("forwards the reset of one role", async () => {
    const { controller, roles } = build();

    await controller.reset(PRINCIPAL as never, "EMPLOYEE");

    expect(roles.reset).toHaveBeenCalledWith(PRINCIPAL, "EMPLOYEE");
  });
});
