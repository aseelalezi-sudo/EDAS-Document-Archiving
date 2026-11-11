import { describe, expect, it, vi } from "vitest";
import { SettingsController } from "./settings.controller";
import type { SettingsService } from "./settings.service";

const PRINCIPAL = { sub: "user-1", role: "SYSTEM_ADMIN" };

function build() {
  const settings = {
    list: vi.fn().mockResolvedValue([{ key: "retention.default", value: "7" }]),
    get: vi.fn().mockResolvedValue({ key: "retention.default", value: "7" }),
    put: vi.fn().mockResolvedValue({ key: "retention.default", value: "30" }),
  };
  return { controller: new SettingsController(settings as unknown as SettingsService), settings };
}

describe("SettingsController delegation", () => {
  it("serves the catalog and one key", async () => {
    const { controller, settings } = build();

    await expect(controller.list()).resolves.toEqual([{ key: "retention.default", value: "7" }]);
    await controller.get("retention.default");

    expect(settings.list).toHaveBeenCalledWith();
    expect(settings.get).toHaveBeenCalledWith("retention.default");
  });

  it("forwards the write with the principal, key and body", async () => {
    const { controller, settings } = build();
    const dto = { value: "30" } as never;

    await controller.put(PRINCIPAL as never, "retention.default", dto);

    expect(settings.put).toHaveBeenCalledWith(PRINCIPAL, "retention.default", dto);
  });
});
