import { describe, expect, it, vi } from "vitest";
import type { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const users = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findOne: vi.fn().mockResolvedValue({ id: "user-2" }),
    updateSelf: vi.fn().mockResolvedValue({ id: "user-1" }),
    preferences: vi.fn().mockResolvedValue({}),
    putPreference: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: "user-2" }),
    update: vi.fn().mockResolvedValue({ id: "user-2" }),
    remove: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    revokeSessions: vi.fn().mockResolvedValue({ revoked: 2 }),
    sessions: vi.fn().mockResolvedValue([]),
  };
  return { controller: new UsersController(users as unknown as UsersService), users };
}

describe("UsersController delegation", () => {
  it("forwards listing and lookup", async () => {
    const { controller, users } = build();
    const query = { page: 2, search: "سارة" } as never;

    await controller.list(PRINCIPAL as never, query);
    await controller.findOne(PRINCIPAL as never, "user-2");

    expect(users.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(users.findOne).toHaveBeenCalledWith(PRINCIPAL, "user-2");
  });

  it("forwards self updates and preferences", async () => {
    const { controller, users } = build();
    const dto = { name: "سارة" } as never;
    const preference = { value: { theme: "dark" } } as never;

    await controller.updateSelf(PRINCIPAL as never, dto);
    await controller.preferences(PRINCIPAL as never);
    await controller.putPreference(PRINCIPAL as never, "ui.theme", preference);

    expect(users.updateSelf).toHaveBeenCalledWith(PRINCIPAL, dto);
    expect(users.preferences).toHaveBeenCalledWith(PRINCIPAL);
    expect(users.putPreference).toHaveBeenCalledWith(PRINCIPAL, "ui.theme", preference);
  });

  it("forwards the administrative writes", async () => {
    const { controller, users } = build();
    const create = { username: "ahmad", role: "EMPLOYEE" } as never;
    const update = { name: "أحمد" } as never;
    const reset = { password: "NewPass123" } as never;

    await controller.create(PRINCIPAL as never, create);
    await controller.update(PRINCIPAL as never, "user-2", update);
    await controller.remove(PRINCIPAL as never, "user-2");
    await controller.resetPassword(PRINCIPAL as never, "user-2", reset);
    await controller.revokeSessions(PRINCIPAL as never, "user-2");
    await controller.sessions(PRINCIPAL as never, "user-2");

    expect(users.create).toHaveBeenCalledWith(PRINCIPAL, create);
    expect(users.update).toHaveBeenCalledWith(PRINCIPAL, "user-2", update);
    expect(users.remove).toHaveBeenCalledWith(PRINCIPAL, "user-2");
    expect(users.resetPassword).toHaveBeenCalledWith(PRINCIPAL, "user-2", reset);
    expect(users.revokeSessions).toHaveBeenCalledWith(PRINCIPAL, "user-2");
    expect(users.sessions).toHaveBeenCalledWith(PRINCIPAL, "user-2");
  });
});
