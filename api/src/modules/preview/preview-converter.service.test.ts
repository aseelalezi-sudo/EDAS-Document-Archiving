import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversionFailedError,
  ConversionOutputMissingError,
  ConversionTimeoutError,
  ConverterUnavailableError,
  officeArgs,
  odaArgs,
  PreviewConverterService,
} from "./preview-converter.service";

const { existing, spawnMock, readdirSyncMock } = vi.hoisted(() => ({
  existing: new Set<string>(),
  spawnMock: vi.fn(),
  readdirSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: (path: string) => existing.has(path),
  readdirSync: readdirSyncMock,
}));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const WORK_DIRS: string[] = [];

async function workDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "edas-converter-"));
  WORK_DIRS.push(dir);
  return dir;
}

class FakeChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

interface Plan {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  error?: string;
  onSpawn?: (args: string[]) => void;
  silent?: boolean;
  version?: Plan;
}

function spawnPlan(plan: Plan) {
  spawnMock.mockImplementation((command: string, args: string[]) => {
    const child = new FakeChild();
    const effective = args.includes("--version") ? (plan.version ?? { stdout: "LibreOffice 7.6.4.2" }) : plan;
    if (effective.silent) return child;
    setImmediate(() => {
      effective.onSpawn?.(args);
      if (effective.stdout) child.stdout.emit("data", Buffer.from(effective.stdout));
      if (effective.stderr) child.stderr.emit("data", Buffer.from(effective.stderr));
      if (effective.error) child.emit("error", new Error(effective.error));
      else child.emit("close", effective.code === undefined ? 0 : effective.code);
    });
    return child;
  });
}

function config(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as never;
}

function service(values: Record<string, string> = {}) {
  return new PreviewConverterService(config(values));
}

afterEach(async () => {
  spawnMock.mockReset();
  readdirSyncMock.mockReset();
  existing.clear();
  vi.useRealTimers();
  await Promise.all(WORK_DIRS.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function withPlatform(platform: NodeJS.Platform, run: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    await run();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

describe("converter argument builders", () => {
  it("builds the headless LibreOffice invocation with a private profile and outdir", () => {
    const profileDir = join(tmpdir(), "edas-profile");
    const args = officeArgs("/work/report.docx", "/work/office-output", profileDir);

    expect(args).toContain("--headless");
    expect(args).toContain("--nofirststartwizard");
    expect(args).toContain("--convert-to");
    expect(args[args.indexOf("--convert-to") + 1]).toBe("pdf");
    expect(args[args.indexOf("--outdir") + 1]).toBe("/work/office-output");
    expect(args).toContain("/work/report.docx");
    expect(args).toContain(`-env:UserInstallation=${pathToFileURL(profileDir).href}`);
  });

  it("builds the ODA invocation for the ACAD2018 DXF target", () => {
    expect(odaArgs("/work/in", "/work/out")).toEqual(["/work/in", "/work/out", "ACAD2018", "DXF", "0", "1", "*.dwg"]);
  });

  it("names the error classes with their parameters", () => {
    expect(new ConverterUnavailableError("LibreOffice").message).toBe("LibreOffice is not installed or not configured");
    expect(new ConversionTimeoutError(1500).message).toBe("Conversion exceeded the 1500 ms limit");
    expect(new ConversionFailedError("boom").message).toBe("boom");
    expect(new ConversionOutputMissingError(".pdf").message).toBe("Converter finished without producing a .pdf file");
  });
});

describe("PreviewConverterService office detection", () => {
  it("prefers a configured soffice path and parses the version", async () => {
    existing.add("/opt/soffice");
    spawnPlan({ version: { stdout: "LibreOffice 7.6.4.2 47 Build:abcdef" } });

    const availability = await service({ PREVIEW_SOFFICE_PATH: " /opt/soffice " }).officeAvailability();

    expect(availability).toEqual({ command: "/opt/soffice", version: "7.6.4.2" });
    expect(spawnMock.mock.calls[0][0]).toBe("/opt/soffice");
    expect(spawnMock.mock.calls[0][1]).toEqual(["--version"]);
  });

  it("falls back to the first line when the version banner has no number", async () => {
    existing.add("/opt/soffice");
    spawnPlan({ version: { stdout: "custom build without a banner\nmore" } });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).officeAvailability()).resolves.toEqual({
      command: "/opt/soffice",
      version: "custom build without a banner",
    });
  });

  it("keeps the command but drops the version when the check cannot run", async () => {
    existing.add("/opt/soffice");
    spawnPlan({ version: { error: "spawn EACCES" } });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).officeAvailability()).resolves.toEqual({
      command: "/opt/soffice",
      version: null,
    });
  });

  it("ignores a configured path that does not exist and reports no command", async () => {
    spawnPlan({ code: 0 });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/missing" }).officeAvailability()).resolves.toEqual({
      command: null,
      version: null,
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("caches the detection for the lifetime of the process", async () => {
    existing.add("/opt/soffice");
    spawnPlan({ version: { stdout: "LibreOffice 7.6.4.2" } });
    const converter = service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" });

    await converter.officeAvailability();
    await converter.officeAvailability();

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("finds the binary on PATH when nothing is configured", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/usr/local/bin";
    existing.add(join("/usr/local/bin", process.platform === "win32" ? "soffice.EXE" : "soffice"));
    spawnPlan({ version: { stdout: "LibreOffice 24.2" } });

    try {
      await expect(service().officeAvailability()).resolves.toMatchObject({ version: "24.2" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("searches PATH with colon separators and no extension list off Windows", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/opt/posix-bin:/usr/bin";
    existing.add(join("/opt/posix-bin", "soffice"));
    spawnPlan({ version: { stdout: "LibreOffice 7.6" } });

    try {
      await withPlatform("linux", async () => {
        await expect(service().officeAvailability()).resolves.toMatchObject({ command: join("/opt/posix-bin", "soffice") });
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("falls back to the default extension list when PATHEXT is absent", async () => {
    const originalPath = process.env.PATH;
    const originalExt = process.env.PATHEXT;
    process.env.PATH = "C:\\Tools";
    delete process.env.PATHEXT;
    existing.add(join("C:\\Tools", "soffice.exe"));
    spawnPlan({ version: { stdout: "LibreOffice 7.5" } });

    try {
      await withPlatform("win32", async () => {
        await expect(service().officeAvailability()).resolves.toMatchObject({ command: join("C:\\Tools", "soffice.exe") });
      });
    } finally {
      process.env.PATH = originalPath;
      if (originalExt === undefined) delete process.env.PATHEXT;
      else process.env.PATHEXT = originalExt;
    }
  });

  it("treats an unset PATH as an empty search list", async () => {
    const originalPath = process.env.PATH;
    delete process.env.PATH;
    spawnPlan({ code: 0 });

    try {
      await expect(service().officeAvailability()).resolves.toEqual({ command: null, version: null });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("PreviewConverterService ODA detection", () => {
  it("reports the configured converter without a version probe", async () => {
    existing.add("/opt/oda/ODAFileConverter");

    await expect(service({ PREVIEW_ODA_PATH: "/opt/oda/ODAFileConverter" }).odaAvailability()).resolves.toEqual({
      command: "/opt/oda/ODAFileConverter",
      version: null,
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("falls back to the PATH lookup", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/usr/bin";
    const binary = join("/usr/bin", process.platform === "win32" ? "TeighaFileConverter.EXE" : "TeighaFileConverter");
    existing.add(binary);

    try {
      await expect(service().odaAvailability()).resolves.toEqual({ command: binary, version: null });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("scans the ODA install roots on Windows", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    process.env.PATHEXT = ".EXE;.CMD";
    existing.add("C:\\Program Files\\ODA");
    readdirSyncMock.mockReturnValue([
      { name: "not-a-dir.txt", isDirectory: () => false },
      { name: "Old ODA", isDirectory: () => true },
      { name: "ODAFileConverter 25.4.0", isDirectory: () => true },
    ]);
    existing.add("C:\\Program Files\\ODA\\ODAFileConverter 25.4.0\\ODAFileConverter.exe");

    try {
      await withPlatform("win32", async () => {
        await expect(service().odaAvailability()).resolves.toEqual({
          command: "C:\\Program Files\\ODA\\ODAFileConverter 25.4.0\\ODAFileConverter.exe",
          version: null,
        });
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("survives an unreadable ODA install root", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    existing.add("C:\\Program Files\\ODA");
    readdirSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });

    try {
      await withPlatform("win32", async () => {
        await expect(service().odaAvailability()).resolves.toEqual({ command: null, version: null });
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("does not scan Windows install roots off Windows", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    readdirSyncMock.mockReturnValue([]);

    try {
      await withPlatform("linux", async () => {
        await expect(service().odaAvailability()).resolves.toEqual({ command: null, version: null });
      });
    } finally {
      process.env.PATH = originalPath;
    }
    expect(readdirSyncMock).not.toHaveBeenCalled();
  });

  it("reports a version check failure that is not an Error instance", async () => {
    existing.add("/opt/soffice");
    spawnMock.mockImplementation(() => {
      throw { code: "EACCES" };
    });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).officeAvailability()).resolves.toEqual({
      command: "/opt/soffice",
      version: null,
    });
  });

  it("caches the detection", async () => {
    existing.add("/opt/soffice");
    existing.add("/opt/oda/ODAFileConverter");
    const converter = service({ PREVIEW_ODA_PATH: "/opt/oda/ODAFileConverter" });

    await converter.odaAvailability();
    await converter.odaAvailability();

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("summarises both tools for the capabilities endpoint", async () => {
    existing.add("/opt/soffice");
    existing.add("/opt/oda/ODAFileConverter");
    spawnPlan({ version: { stdout: "LibreOffice 7.6.4.2" } });

    await expect(
      service({ PREVIEW_SOFFICE_PATH: "/opt/soffice", PREVIEW_ODA_PATH: "/opt/oda/ODAFileConverter" }).capabilities(),
    ).resolves.toEqual({ office: { available: true, version: "7.6.4.2" }, dwg: { available: true } });

    existing.clear();
    spawnPlan({ code: 0 });
    await expect(service().capabilities()).resolves.toEqual({
      office: { available: false, version: null },
      dwg: { available: false },
    });
  });
});

describe("PreviewConverterService office conversion", () => {
  it("converts into a private output directory and returns the produced PDF", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    const source = join(dir, "report.docx");
    const outputDir = join(dir, "office-output");
    spawnMock.mockImplementation((command: string, args: string[]) => {
      const child = new FakeChild();
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
        return child;
      }
      setImmediate(async () => {
        expect(command).toBe("/opt/soffice");
        expect(args[args.indexOf("--outdir") + 1]).toBe(outputDir);
        expect(args).toContain(source);
        await writeFile(join(outputDir, "report.PDF"), "pdf").catch(() => undefined);
        child.emit("close", 0);
      });
      return child;
    });

    const outcome = await service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(source, dir, 30_000);

    expect(outcome.outputPath).toBe(join(outputDir, "report.PDF"));
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(0);
    await expect(readdir(join(dir, "office-output"))).resolves.toEqual(["report.PDF"]);
    await expect(readdir(join(dir, `office-profile-${dir.split(/[\\/]/).pop()}`))).resolves.toEqual([]);
  });

  it("fails when the converter produces no PDF", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnPlan({ code: 0 });

    await expect(
      service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000),
    ).rejects.toBeInstanceOf(ConversionOutputMissingError);
  });

  it("refuses to convert without an installed converter", async () => {
    const dir = await workDir();

    await expect(service().convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000)).rejects.toBeInstanceOf(ConverterUnavailableError);
  });

  it("surfaces the tail of the converter output when it exits non-zero", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnPlan({ code: 1, stderr: "line1\nline2\nline3\nline4\nline5\nfatal: cannot open" });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000)).rejects.toThrow(
      /Converter exited with code 1: line3 line4 line5 fatal: cannot open/,
    );
  });

  it("reports a missing code and no detail when the process dies silently", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnPlan({ code: null, stdout: "   " });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000)).rejects.toThrow(
      /Converter exited with code unknown$/,
    );
  });

  it("maps a spawn failure to a conversion error", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnPlan({ error: "EACCES: permission denied" });

    await expect(
      service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000),
    ).rejects.toBeInstanceOf(ConversionFailedError);
  });

  it("kills a conversion that exceeds the timeout", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new FakeChild();
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      }
      return child;
    });

    await withPlatform("win32", async () => {
      await expect(
        service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 20),
      ).rejects.toBeInstanceOf(ConversionTimeoutError);
    });

    expect(spawnMock.mock.calls.some(([command]) => command === "taskkill")).toBe(true);
  });

  it("times out a converter that never reported a pid", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new FakeChild();
      child.pid = undefined as unknown as number;
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      }
      return child;
    });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 20)).rejects.toBeInstanceOf(
      ConversionTimeoutError,
    );
    expect(spawnMock.mock.calls.some(([command]) => command === "taskkill")).toBe(false);
  });

  it("falls back to a direct kill when the taskkill helper cannot start", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    let conversion!: FakeChild;
    spawnMock.mockImplementation((command: string, args: string[]) => {
      if (command === "taskkill") throw new Error("spawn taskkill EACCES");
      const child = new FakeChild();
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      } else {
        conversion = child;
      }
      return child;
    });

    await withPlatform("win32", async () => {
      await expect(
        service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 20),
      ).rejects.toBeInstanceOf(ConversionTimeoutError);
    });

    expect(conversion.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills the process group directly off Windows", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new FakeChild();
      child.pid = 987_654_321;
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      }
      return child;
    });

    await withPlatform("linux", async () => {
      await expect(
        service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 20),
      ).rejects.toBeInstanceOf(ConversionTimeoutError);
    });
  });

  it("ignores process events that arrive after the timeout", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    let conversion!: FakeChild;
    spawnMock.mockImplementation((command: string, args: string[]) => {
      const child = new FakeChild();
      if (command !== "/opt/soffice") return child;
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      } else {
        conversion = child;
      }
      return child;
    });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 20)).rejects.toBeInstanceOf(
      ConversionTimeoutError,
    );

    conversion.emit("error", new Error("late spawn error"));
    conversion.emit("close", 0);
  });

  it("reports a missing output when the output directory disappears", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    const outputDir = join(dir, "office-output");
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new FakeChild();
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      } else {
        setImmediate(async () => {
          await rm(outputDir, { recursive: true, force: true });
          child.emit("close", 0);
        });
      }
      return child;
    });

    await expect(
      service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000),
    ).rejects.toBeInstanceOf(ConversionOutputMissingError);
  });

  it("caps the captured converter output", async () => {
    existing.add("/opt/soffice");
    const dir = await workDir();
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const child = new FakeChild();
      if (args.includes("--version")) {
        process.nextTick(() => {
          child.stdout.emit("data", Buffer.from("LibreOffice 7.6.4.2"));
          child.emit("close", 0);
        });
      } else {
        setImmediate(() => {
          child.stdout.emit("data", Buffer.from("x".repeat(40_000)));
          child.stdout.emit("data", Buffer.from("tail"));
          child.emit("close", 1);
        });
      }
      return child;
    });

    await expect(service({ PREVIEW_SOFFICE_PATH: "/opt/soffice" }).convertOfficeToPdf(join(dir, "a.docx"), dir, 30_000)).rejects.toThrow(
      /^Converter exited with code 1: x+$/,
    );
  });
});

describe("PreviewConverterService DWG conversion", () => {
  it("converts a DWG next to the source and returns the produced DXF", async () => {
    existing.add("/opt/oda/ODAFileConverter");
    const dir = await workDir();
    const outputDir = join(dir, "dwg-output");
    spawnMock.mockImplementation((command: string, args: string[]) => {
      const child = new FakeChild();
      setImmediate(async () => {
        await writeFile(join(outputDir, "plan.dxf"), "dxf").catch(() => undefined);
        expect(args).toEqual([dir, outputDir, "ACAD2018", "DXF", "0", "1", "*.dwg"]);
        expect(command).toBe("/opt/oda/ODAFileConverter");
        child.emit("close", 0);
      });
      return child;
    });
    const outcome = await service({ PREVIEW_ODA_PATH: "/opt/oda/ODAFileConverter" }).convertDwgToDxf(join(dir, "plan.dwg"), dir, 30_000);

    expect(outcome.outputPath).toBe(join(outputDir, "plan.dxf"));
  });

  it("fails when the converter produces no DXF", async () => {
    existing.add("/opt/oda/ODAFileConverter");
    const dir = await workDir();
    spawnPlan({ code: 0 });

    await expect(
      service({ PREVIEW_ODA_PATH: "/opt/oda/ODAFileConverter" }).convertDwgToDxf(join(dir, "plan.dwg"), dir, 30_000),
    ).rejects.toBeInstanceOf(ConversionOutputMissingError);
  });

  it("refuses to convert without an installed converter", async () => {
    const dir = await workDir();

    await expect(service().convertDwgToDxf(join(dir, "plan.dwg"), dir, 30_000)).rejects.toThrow(/ODA File Converter is not installed/);
  });
});
