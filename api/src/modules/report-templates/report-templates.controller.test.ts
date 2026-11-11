import { describe, expect, it, vi } from "vitest";
import { ReportTemplatesController } from "./report-templates.controller";
import type { ReportTemplatesService } from "./report-templates.service";

const PRINCIPAL = { sub: "user-1", role: "ARCHIVIST" };

function build() {
  const templates = {
    list: vi.fn().mockResolvedValue([{ id: "tpl-1", name: "تقرير الوثائق" }]),
    setFavorite: vi.fn().mockResolvedValue({ id: "tpl-1", favorite: true }),
  };
  return { controller: new ReportTemplatesController(templates as unknown as ReportTemplatesService), templates };
}

describe("ReportTemplatesController delegation", () => {
  it("serves the catalog without a principal", async () => {
    const { controller, templates } = build();

    await expect(controller.list()).resolves.toEqual([{ id: "tpl-1", name: "تقرير الوثائق" }]);
    expect(templates.list).toHaveBeenCalledWith();
  });

  it("unwraps the favorite flag of the patch body", async () => {
    const { controller, templates } = build();
    const dto = { favorite: true } as never;

    await controller.setFavorite(PRINCIPAL as never, "tpl-1", dto);

    expect(templates.setFavorite).toHaveBeenCalledWith(PRINCIPAL, "tpl-1", true);
    expect(templates.setFavorite).not.toHaveBeenCalledWith(PRINCIPAL, "tpl-1", dto);
  });
});
