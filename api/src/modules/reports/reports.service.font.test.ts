import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: () => false };
});

import { DownloadTicketService } from "../../common/download/download-ticket.service";
import { ReportsService } from "./reports.service";

describe("ReportsService PDF assets", () => {
  it("reports a missing Arabic font asset", async () => {
    const service = new ReportsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new DownloadTicketService(
        { get: () => undefined } as never,
        { downloadTicketUse: { create: vi.fn(), deleteMany: vi.fn() } } as never,
      ),
    );
    const toPdf = (
      service as unknown as { toPdf: (table: { title: string; columns: string[]; rows: string[][] }) => Promise<Buffer> }
    ).toPdf.bind(service);

    await expect(toPdf({ title: "تقرير", columns: ["الاسم"], rows: [] })).rejects.toThrow("PDF font asset is missing");
  });
});
