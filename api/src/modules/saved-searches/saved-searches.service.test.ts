import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SavedSearchesService } from "./saved-searches.service";

const PRINCIPAL = { sub: "user-1" } as never;
const ACTOR = { id: "user-1", departmentId: "dept-fin" };

function buildService(actor: { id: string; departmentId: string | null } = ACTOR) {
  const rows = [
    { id: "saved-1", userId: "user-1", name: "عقود", query: { q: "عقد" }, createdAt: new Date("2026-10-01") },
    { id: "saved-2", userId: "user-2", name: "خاص بغيري", query: {}, createdAt: new Date("2026-10-02") },
  ];
  const prisma = {
    savedSearch: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => rows.filter((row) => row.userId === where.userId)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: { name: string } }) => ({
        id: "saved-new",
        userId: "user-1",
        name: data.name,
        query: {},
        createdAt: new Date(),
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name?: string } }) => ({
        ...rows.find((row) => row.id === where.id),
        ...data,
      })),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const access = { resolveActor: vi.fn().mockResolvedValue(actor) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { service: new SavedSearchesService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("SavedSearchesService", () => {
  it("lists only the caller's saved searches", async () => {
    const { service, prisma } = buildService();

    const result = await service.list(PRINCIPAL);

    expect(result.items.map((item) => item.id)).toEqual(["saved-1"]);
    expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });

  it("never matches another account when the actor is unprovisioned", async () => {
    const { service } = buildService({ id: "", departmentId: null });

    const result = await service.list(PRINCIPAL);

    expect(result.items).toEqual([]);
  });

  it("refuses to save a search for an unprovisioned actor", async () => {
    const { service, prisma } = buildService({ id: "", departmentId: null });

    await expect(service.create(PRINCIPAL, { name: "x", query: {} } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.savedSearch.create).not.toHaveBeenCalled();
  });

  it("creates a saved search and records it", async () => {
    const { service, prisma, audit } = buildService();

    const saved = await service.create(PRINCIPAL, { name: "فواتير", query: { q: "فاتورة" } } as never);

    expect(saved).toEqual(expect.objectContaining({ id: "saved-new", name: "فواتير" }));
    expect(prisma.savedSearch.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "فواتير", query: { q: "فاتورة" } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "saved-search.create", entityId: "saved-new", departmentId: "dept-fin" }),
    );
  });

  it("hides another account's saved search behind a 404", async () => {
    const { service, prisma } = buildService();

    await expect(service.update(PRINCIPAL, "saved-2", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedSearch.update).not.toHaveBeenCalled();
    await expect(service.remove(PRINCIPAL, "saved-404")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedSearch.delete).not.toHaveBeenCalled();
  });

  it("updates name and query for the owner", async () => {
    const { service, prisma, audit } = buildService();

    const updated = await service.update(PRINCIPAL, "saved-1", { name: "عقود 2026", query: { q: "2026" } } as never);

    expect(prisma.savedSearch.update).toHaveBeenCalledWith({
      where: { id: "saved-1" },
      data: { name: "عقود 2026", query: { q: "2026" } },
    });
    expect(updated.name).toBe("عقود 2026");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "saved-search.update", entityId: "saved-1" }));
  });

  it("deletes an owned saved search and audits it", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.remove(PRINCIPAL, "saved-1")).resolves.toEqual({ id: "saved-1", deleted: true });

    expect(prisma.savedSearch.delete).toHaveBeenCalledWith({ where: { id: "saved-1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "saved-search.delete", detail: { name: "عقود" } }));
  });

  it("leaves the audit actor empty for an account without an id", async () => {
    const { service, prisma, audit } = buildService({ id: "", departmentId: null });
    prisma.savedSearch.findUnique.mockResolvedValue({ id: "saved-1", userId: "", name: "عقود", query: {} } as never);

    await service.update(PRINCIPAL, "saved-1", { name: "عقود 2026" } as never);
    await service.remove(PRINCIPAL, "saved-1");

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "saved-search.update", actorId: null }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "saved-search.delete", actorId: null }));
  });
});
