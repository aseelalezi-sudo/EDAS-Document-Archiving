import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "./settings.service";

const PRINCIPAL = { sub: "user-admin" } as never;
const ADMIN = { id: "user-admin", departmentId: null };

function buildService() {
  const prisma = {
    setting: {
      findMany: vi.fn().mockResolvedValue([{ id: "s1", key: "retention.defaultYears", value: 5 }]),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        where.key === "missing" ? null : { id: "s1", key: where.key, value: 5 },
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: unknown; update: unknown }) => ({
        id: "s1",
        ...(create as object),
        ...(update as object),
        key: where.key,
      })),
    },
  };
  const access = { resolveActor: vi.fn().mockResolvedValue(ADMIN) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { service: new SettingsService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("SettingsService", () => {
  it("lists settings ordered by key with a total", async () => {
    const { service, prisma } = buildService();

    const result = await service.list();

    expect(result.meta).toEqual({ total: 1 });
    expect(prisma.setting.findMany).toHaveBeenCalledWith({ orderBy: { key: "asc" } });
  });

  it("reads one setting and reports a missing key", async () => {
    const { service } = buildService();

    await expect(service.get("retention.defaultYears")).resolves.toEqual(expect.objectContaining({ key: "retention.defaultYears" }));
    await expect(service.get("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("upserts the value and records who changed it", async () => {
    const { service, prisma, audit } = buildService();

    const setting = await service.put(PRINCIPAL, "retention.defaultYears", { value: 7 } as never);

    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: "retention.defaultYears" },
      update: { value: 7 },
      create: { key: "retention.defaultYears", value: 7 },
    });
    expect(setting.value).toBe(7);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "setting.update",
        entityType: "Setting",
        entityId: "s1",
        actorId: "user-admin",
        detail: { key: "retention.defaultYears", value: 7 },
      }),
    );
  });
});
