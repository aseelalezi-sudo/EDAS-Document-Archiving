import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn, type ChildProcess } from "node:child_process";

export class ConverterUnavailableError extends Error {
  constructor(readonly tool: string) {
    super(`${tool} is not installed or not configured`);
    this.name = "ConverterUnavailableError";
  }
}

export class ConversionTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Conversion exceeded the ${timeoutMs} ms limit`);
    this.name = "ConversionTimeoutError";
  }
}

export class ConversionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionFailedError";
  }
}

export class ConversionOutputMissingError extends Error {
  constructor(readonly expectedExtension: string) {
    super(`Converter finished without producing a ${expectedExtension} file`);
    this.name = "ConversionOutputMissingError";
  }
}

export interface ToolAvailability {
  command: string | null;
  version: string | null;
}

export interface ConversionOutcome {
  outputPath: string;
  elapsedMs: number;
}

const WINDOWS_OFFICE_CANDIDATES = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files\\LibreOffice 7\\program\\soffice.exe",
];

const POSIX_OFFICE_CANDIDATES = [
  "/usr/bin/soffice",
  "/usr/local/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/opt/libreoffice/program/soffice",
  "/snap/bin/libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

const POSIX_ODA_CANDIDATES = [
  "/usr/bin/ODAFileConverter",
  "/usr/local/bin/ODAFileConverter",
  "/opt/oda/ODAFileConverter",
  "/usr/lib/oda/ODAFileConverter",
  "/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter",
];

function executableExtensions(): string[] {
  if (process.platform !== "win32") return [""];
  const pathExt = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean);
  return [...pathExt.map((ext) => ext.toLowerCase()), ...pathExt.map((ext) => ext.toUpperCase()), ""];
}

function findInPath(names: string[]): string | null {
  const entries = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  for (const name of names) {
    for (const dir of entries) {
      for (const ext of executableExtensions()) {
        const candidate = join(dir, `${name}${ext}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function firstExisting(paths: string[]): string | null {
  return paths.find((candidate) => existsSync(candidate)) ?? null;
}

function scanOdaDirectory(): string | null {
  if (process.platform !== "win32") return null;
  const roots = ["C:\\Program Files\\ODA", "C:\\Program Files (x86)\\ODA"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = win32.join(root, entry.name, "ODAFileConverter.exe");
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      /* unreadable directory: ignore */
    }
  }
  return null;
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    } catch {
      child.kill("SIGKILL");
    }
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

const OUTPUT_LIMIT = 16 * 1024;

function appendCapped(current: string, chunk: Buffer): string {
  if (current.length >= OUTPUT_LIMIT) return current;
  return current + chunk.toString("utf8").slice(0, OUTPUT_LIMIT - current.length);
}

const CONVERTER_ENV_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "windir",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "ProgramFiles",
  "PROGRAMFILES(X86)",
  "ProgramW6432",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "DISPLAY",
];

/** Converters process untrusted documents, so they inherit a minimal environment instead of the API's secrets. */
function converterEnv(workDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CONVERTER_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  if (workDir) {
    env.HOME = workDir;
    env.TMPDIR = workDir;
    env.TEMP = workDir;
    env.TMP = workDir;
  }
  return env;
}

function runProcess(command: string, args: string[], timeoutMs: number, options: { cwd?: string } = {}): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: converterEnv(options.cwd),
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child);
      reject(new ConversionTimeoutError(timeoutMs));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new ConversionFailedError(error.message));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = (stderr || stdout).trim().split(/\r?\n/).slice(-4).join(" ");
      reject(new ConversionFailedError(`Converter exited with code ${code ?? "unknown"}${detail ? `: ${detail}` : ""}`));
    });
  });
}

export function officeArgs(sourcePath: string, outputDir: string, profileDir: string): string[] {
  return [
    "--headless",
    "--norestore",
    "--invisible",
    "--nodefault",
    "--nologo",
    "--nolockcheck",
    "--nofirststartwizard",
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    sourcePath,
  ];
}

export function odaArgs(inputDir: string, outputDir: string): string[] {
  return [inputDir, outputDir, "ACAD2018", "DXF", "0", "1", "*.dwg"];
}

async function findOutput(directory: string, extension: string): Promise<string | null> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension));
    return match ? join(directory, match.name) : null;
  } catch {
    return null;
  }
}

@Injectable()
export class PreviewConverterService {
  private readonly logger = new Logger(PreviewConverterService.name);
  private officeCache: { value: ToolAvailability; checkedAt: number } | null = null;
  private odaCache: { value: ToolAvailability; checkedAt: number } | null = null;
  private readonly detectionTtlMs = 5 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  private configuredPath(key: string): string | null {
    const value = (this.config.get<string>(key) ?? "").trim();
    if (!value) return null;
    return existsSync(value) ? value : null;
  }

  private officeCommand(): string | null {
    const configured = this.configuredPath("PREVIEW_SOFFICE_PATH");
    if (configured) return configured;
    const known = firstExisting(process.platform === "win32" ? WINDOWS_OFFICE_CANDIDATES : POSIX_OFFICE_CANDIDATES);
    return known ?? findInPath(["soffice", "libreoffice"]);
  }

  private odaCommand(): string | null {
    const configured = this.configuredPath("PREVIEW_ODA_PATH");
    if (configured) return configured;
    return firstExisting(POSIX_ODA_CANDIDATES) ?? findInPath(["ODAFileConverter", "TeighaFileConverter"]) ?? scanOdaDirectory();
  }

  private async versionOf(command: string, pattern: RegExp): Promise<string | null> {
    try {
      const result = await runProcess(command, ["--version"], 5000);
      const text = `${result.stdout}\n${result.stderr}`;
      return text.match(pattern)?.[1] ?? text.trim().split(/\r?\n/)[0]?.slice(0, 80) ?? null;
    } catch (error) {
      this.logger.debug(`version check failed for ${command}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async officeAvailability(): Promise<ToolAvailability> {
    const now = Date.now();
    if (this.officeCache && now - this.officeCache.checkedAt < this.detectionTtlMs) return this.officeCache.value;
    const command = this.officeCommand();
    const value: ToolAvailability = { command, version: command ? await this.versionOf(command, /LibreOffice\s+([\d.]+)/i) : null };
    this.officeCache = { value, checkedAt: now };
    return value;
  }

  async odaAvailability(): Promise<ToolAvailability> {
    const now = Date.now();
    if (this.odaCache && now - this.odaCache.checkedAt < this.detectionTtlMs) return this.odaCache.value;
    const command = this.odaCommand();
    const value: ToolAvailability = { command, version: null };
    this.odaCache = { value, checkedAt: now };
    return value;
  }

  async capabilities() {
    const [office, oda] = await Promise.all([this.officeAvailability(), this.odaAvailability()]);
    return { office: { available: Boolean(office.command), version: office.version }, dwg: { available: Boolean(oda.command) } };
  }

  async convertOfficeToPdf(sourcePath: string, workDir: string, timeoutMs: number): Promise<ConversionOutcome> {
    const { command } = await this.officeAvailability();
    if (!command) throw new ConverterUnavailableError("LibreOffice");
    const outputDir = join(workDir, "office-output");
    const profileDir = join(workDir, `office-profile-${basename(workDir)}`);
    await mkdir(outputDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    const startedAt = Date.now();
    await runProcess(command, officeArgs(sourcePath, outputDir, profileDir), timeoutMs, { cwd: workDir });
    const outputPath = await findOutput(outputDir, ".pdf");
    if (!outputPath) throw new ConversionOutputMissingError(".pdf");
    return { outputPath, elapsedMs: Date.now() - startedAt };
  }

  async convertDwgToDxf(sourcePath: string, workDir: string, timeoutMs: number): Promise<ConversionOutcome> {
    const { command } = await this.odaAvailability();
    if (!command) throw new ConverterUnavailableError("ODA File Converter");
    const outputDir = join(workDir, "dwg-output");
    await mkdir(outputDir, { recursive: true });
    const startedAt = Date.now();
    await runProcess(command, odaArgs(dirname(sourcePath), outputDir), timeoutMs, { cwd: workDir });
    const outputPath = await findOutput(outputDir, ".dxf");
    if (!outputPath) throw new ConversionOutputMissingError(".dxf");
    return { outputPath, elapsedMs: Date.now() - startedAt };
  }
}
