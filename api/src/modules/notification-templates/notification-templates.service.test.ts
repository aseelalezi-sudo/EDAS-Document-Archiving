import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { NotificationTemplatesService } from "./notification-templates.service";

function buildService() {
  const prisma = {
    notificationTemplate: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  };
  const access = { resolveActor: vi.fn().mockResolvedValue({ id: "actor-1", departmentId: null, role: "SYSTEM_ADMIN" }) };
  const audit = { record: vi.fn() };
  const service = new NotificationTemplatesService(prisma as never, access as never, audit as never);
  return { service, prisma, audit };
}

const row = {
  id: "nt-1",
  name: "طلب موافقة",
  nameEn: "Approval request",
  channel: "IN_APP",
  subject: "موضوع",
  subjectEn: "Subject",
  body: "نص",
  bodyEn: "Body",
  updatedAt: new Date("2026-10-22T10:00:00.000Z"),
};

describe("NotificationTemplatesService", () => {
  it("seeds the default catalog once", async () => {
    const { service, prisma } = buildService();
    prisma.notificationTemplate.count.mockResolvedValue(0);
    prisma.notificationTemplate.createMany.mockResolvedValue({ count: 6 });

    await service.onModuleInit();

    expect(prisma.notificationTemplate.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
    const seeded = prisma.notificationTemplate.createMany.mock.calls[0][0].data as unknown[];
    expect(seeded).toHaveLength(6);
  });

  it("lists templates with ISO timestamps", async () => {
    const { service, prisma } = buildService();
    prisma.notificationTemplate.findMany.mockResolvedValue([row]);

    const result = await service.list();

    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ id: "nt-1", updatedAt: "2026-10-22T10:00:00.000Z" }));
  });

  it("audits create, update, delete and reset", async () => {
    const { service, prisma, audit } = buildService();
    prisma.notificationTemplate.create.mockResolvedValue({ ...row, id: "nt-custom" });
    prisma.notificationTemplate.findUnique.mockResolvedValue({ id: "nt-1" });
    prisma.notificationTemplate.update.mockResolvedValue(row);
    prisma.notificationTemplate.delete.mockResolvedValue(row);
    prisma.notificationTemplate.upsert.mockResolvedValue(row);

    await service.create({ sub: "actor-1" } as never, {
      name: "طلب",
      nameEn: "Request",
      subject: "موضوع",
      subjectEn: "Subject",
      body: "نص",
      bodyEn: "Body",
    });
    await service.update({ sub: "actor-1" } as never, "nt-1", { name: "محدث" });
    await service.remove({ sub: "actor-1" } as never, "nt-1");
    await service.reset({ sub: "actor-1" } as never, "nt-1");

    const actions = audit.record.mock.calls.map((call) => (call[0] as { action: string }).action);
    expect(actions).toEqual([
      "notification-template.create",
      "notification-template.update",
      "notification-template.delete",
      "notification-template.reset",
    ]);
  });

  it("rejects unknown seeds and missing templates", async () => {
    const { service, prisma } = buildService();
    prisma.notificationTemplate.findUnique.mockResolvedValue(null);

    await expect(service.reset({ sub: "actor-1" } as never, "missing")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update({ sub: "actor-1" } as never, "missing", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });
});
