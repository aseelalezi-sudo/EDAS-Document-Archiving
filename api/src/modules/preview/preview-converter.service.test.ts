import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import {
  ConverterUnavailableError,
  PreviewConverterService,
  odaArgs,
  officeArgs,
} from "./preview-converter.service";

const config = { get: () => undefined } as unknown as ConfigService;

describe("preview converter", () => {
  it("builds LibreOffice arguments without shell interpolation", () => {
    const args = officeArgs("/tmp/work/source.docx", "/tmp/work/out", "/tmp/work/profile");
    expect(args).toContain("--headless");
    expect(args).toContain("--convert-to");
    expect(args).toContain("pdf");
    expect(args).toContain("--outdir");
    expect(args).toContain("/tmp/work/out");
    expect(args[args.length - 1]).toBe("/tmp/work/source.docx");
    expect(args.join(" ")).toContain("UserInstallation=file://");
    expect(args.join(" ")).toContain("profile");
  });

  it("builds ODA arguments for a folder based DWG to DXF conversion", () => {
    const args = odaArgs("/tmp/work", "/tmp/work/dwg-output");
    expect(args).toEqual(["/tmp/work", "/tmp/work/dwg-output", "ACAD2018", "DXF", "0", "1", "*.dwg"]);
  });

  it("refuses to convert when LibreOffice is not installed", async () => {
    const service = new PreviewConverterService(config);
    vi.spyOn(service, "officeAvailability").mockResolvedValue({ command: null, version: null });
    await expect(service.convertOfficeToPdf("/tmp/source.docx", "/tmp/work", 1000)).rejects.toBeInstanceOf(ConverterUnavailableError);
  });

  it("refuses to convert DWG when the ODA converter is not installed", async () => {
    const service = new PreviewConverterService(config);
    vi.spyOn(service, "odaAvailability").mockResolvedValue({ command: null, version: null });
    await expect(service.convertDwgToDxf("/tmp/source.dwg", "/tmp/work", 1000)).rejects.toBeInstanceOf(ConverterUnavailableError);
  });
});
