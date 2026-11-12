import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ReportTemplatesService } from "./report-templates.service";

const ACTOR = { id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" };

function buildService(actor = ACTOR) {
  const prisma = {
    reportTemplate: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "rpt-1" }),
      update: vi.fn().mockResolvedValue({ id: "rpt-1", favorite: true }),
    },
  };
  const access = { resolveActor: vi.fn().mockResolvedValue(actor) };
  const audit = { record: vi.fn().mockResolvedValue({ id: "audit-1" }) };
  return { service: new ReportTemplatesService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("ReportTemplatesService catalog", () => {
  it("seeds the default templates once when the catalog is empty", async () => {
    const { service, prisma } = buildService();

    await service.onModuleInit();

    expect(prisma.reportTemplate.count).toHaveBeenCalledOnce();
    expect(prisma.reportTemplate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
    });
  });

  it("leaves an already seeded catalog untouched", async () => {
    const { service, prisma } = buildService();
    prisma.reportTemplate.count.mockResolvedValue(12);

    await service.onModuleInit();

    expect(prisma.reportTemplate.createMany).not.toHaveBeenCalled();
  });

  it("lists the templates in id order with their total", async () => {
    const { service, prisma } = buildService();
    prisma.reportTemplate.findMany.mockResolvedValue([{ id: "rpt-1" }, { id: "rpt-2" }]);

    await expect(service.list()).resolves.toEqual({ items: [{ id: "rpt-1" }, { id: "rpt-2" }], meta: { total: 2 } });
    expect(prisma.reportTemplate.findMany).toHaveBeenCalledWith({ orderBy: { id: "asc" } });
  });
});

describe("ReportTemplatesService.setFavorite", () => {
  it("updates the favorite flag and records the actor in the audit trail", async () => {
    const { service, prisma, audit } = buildService();
    await expect(service.setFavorite({ sub: "sub-1" } as never, "rpt-1", true)).resolves.toMatchObject({
      id: "rpt-1",
      favorite: true,
    });

    expect(prisma.reportTemplate.update).toHaveBeenCalledWith({ where: { id: "rpt-1" }, data: { favorite: true } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report_template.favorite",
        entityType: "ReportTemplate",
        entityId: "rpt-1",
        actorId: "user-1",
        departmentId: "dept-1",
        detail: { favorite: true },
      }),
    );
  });

  it("rejects an unknown template without auditing", async () => {
    const { service, prisma, audit } = buildService();
    prisma.reportTemplate.findUnique.mockResolvedValue(null);

    await expect(service.setFavorite({ sub: "sub-1" } as never, "missing", true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.reportTemplate.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("records no actor for a service account without an id", async () => {
    const { service, audit } = buildService({ id: "", departmentId: "dept-1", role: "EMPLOYEE" } as never);

    await service.setFavorite({ sub: "sub-1" } as never, "rpt-1", true);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "report_template.favorite", actorId: null }));
  });
});
