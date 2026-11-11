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
});
