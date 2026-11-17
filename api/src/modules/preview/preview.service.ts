import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FileObject } from "@prisma/client";
import { API_PREFIX, type FilePreviewDto, type FilePreviewKind, type FilePreviewReason, type FilePreviewSource } from "@edas/shared";
import { AccessService, type Actor } from "../../common/access/access.service";
import { denialReason } from "../../common/access/denial-reason";
import { StorageService } from "../../common/storage/storage.service";
import type { Principal } from "../../common/auth/principal";
import { AuditService, type AuditInput } from "../audit/audit.service";
import { FilesService, type ReadableFile } from "../files/files.service";
import {
  ConversionFailedError,
  ConversionOutputMissingError,
  ConversionTimeoutError,
  ConverterUnavailableError,
  PreviewConverterService,
} from "./preview-converter.service";
import { detectFileContent, isOfficePreviewType, type DetectedFile } from "./preview-file-type";
import {
  PreviewQueueService,
  type PreviewJobActor,
  type PreviewJobData,
  type PreviewJobResult,
  type PreviewQueueState,
} from "./preview-queue.service";

export const PREVIEW_CACHE_PREFIX = "previews/";
const JOB_RETENTION_MS = 15 * 60 * 1000;
const AUDIT_DEDUPE_MS = 5 * 60 * 1000;

type PreviewFile = Omit<FileObject, "versions">;
type PreviewAccessAction = "preview.open" | "preview.stream";

export type { PreviewJobActor } from "./preview-queue.service";

export interface PreviewJobResultInput {
  status: "queued" | "running" | "ready" | "failed";
  reason: FilePreviewReason | null;
  message: string | null;
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
}

export function previewJobResult(job: PreviewJobResultInput): PreviewJobResult {
  return {
    status: job.status === "ready" ? "ready" : "failed",
    reason: job.reason,
    message: job.message,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? Date.now(),
    elapsedMs: job.elapsedMs ?? 0,
    retryable: job.reason ? retryablePreviewReason(job.reason) : false,
  };
}

function retryablePreviewReason(reason: FilePreviewReason): boolean {
  return reason === "conversion_failed" || reason === "conversion_timeout" || reason === "conversion_produced_no_output";
}

interface ConversionJob {
  key: string;
  fileId: string;
  checksum: string;
  detected: DetectedFile;
  cacheKey: string;
  status: "queued" | "running" | "ready" | "failed";
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  reason: FilePreviewReason | null;
  message: string | null;
  actor: PreviewJobActor;
}

export interface PreviewContent {
  key: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private readonly jobs = new Map<string, ConversionJob>();
  private readonly auditSeen = new Map<string, number>();
  private activeConversions = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly converter: PreviewConverterService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
    @Optional() private readonly queue?: PreviewQueueService,
  ) {
    this.queue?.registerProcessor((data) => this.processDistributed(data));
  }

  private get maxSourceBytes(): number {
    const value = Number(this.config.get<string>("PREVIEW_MAX_SOURCE_BYTES"));
    return Number.isFinite(value) && value > 0 ? value : 50 * 1024 * 1024;
  }

  private get maxOutputBytes(): number {
    const value = Number(this.config.get<string>("PREVIEW_MAX_OUTPUT_BYTES"));
    return Number.isFinite(value) && value > 0 ? value : 200 * 1024 * 1024;
  }

  private get timeoutMs(): number {
    const value = Number(this.config.get<string>("PREVIEW_TIMEOUT_MS"));
    return Number.isFinite(value) && value > 0 ? value : 120_000;
  }

  private get concurrency(): number {
    const value = Number(this.config.get<string>("PREVIEW_CONCURRENCY"));
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 2;
  }

  private get prewarmEnabled(): boolean {
    const value = (this.config.get<string>("PREVIEW_PREWARM") ?? "").trim().toLowerCase();
    return !["0", "false", "off", "no"].includes(value);
  }

  async capabilities() {
    const tools = await this.converter.capabilities();
    return { ...tools, limits: { maxSourceBytes: this.maxSourceBytes, timeoutMs: this.timeoutMs, concurrency: this.concurrency } };
  }

  /**
   * Converts a freshly uploaded Office/CAD file in the background so its first preview opens instantly.
   * Best effort: unsupported types, missing converters, oversized files and failures are silently skipped.
   */
  async prewarm(fileId: string, actor: PreviewJobActor): Promise<void> {
    try {
      if (!this.prewarmEnabled) return;
      if ([...this.jobs.values()].some((job) => job.fileId === fileId)) return;
      const file = await this.files.fileForJob(fileId);
      if (!file) return;
      if (Number(file.sizeBytes) > this.maxSourceBytes) return;
      const head = await this.storage.readHead(file.storageKey, 8192);
      if (!head) return;
      const detected = detectFileContent(head, file.originalName, file.mimeType);
      if (detected.mismatch) return;
      const source: "office" | "dwg" | null = detected.type === "dwg" ? "dwg" : isOfficePreviewType(detected.type) ? "office" : null;
      if (!source) return;
      const availability = source === "dwg" ? await this.converter.odaAvailability() : await this.converter.officeAvailability();
      if (!availability.command) return;
      const key = this.cacheKey(file.id, file.checksumSha256, source === "dwg" ? "dxf" : "pdf");
      const cached = await this.storage.head(key);
      if (cached && cached.sizeBytes > 0) return;
      await this.enqueue(actor, file, detected, key, source);
    } catch (error) {
      this.logger.warn(`preview prewarm failed for ${fileId}: ${(error as Error).message}`);
    }
  }

  async getPreview(principal: Principal, fileId: string): Promise<FilePreviewDto> {
    this.pruneJobs();
    const { actor, file, documents } = await this.readable(principal, fileId, "preview.open");
    const downloadable = await this.files.canDownloadAny(actor, file.uploadedById, documents);
    await this.auditOnce(`preview.open:${actor.id}:${file.id}`, {
      action: "preview.open",
      entityType: "File",
      entityId: file.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { fileName: file.originalName, mimeType: file.mimeType, downloadable },
    });

    const preview = await this.previewFor(actor, file);
    return { ...preview, downloadable };
  }

  async retry(principal: Principal, fileId: string): Promise<FilePreviewDto> {
    const { file } = await this.readable(principal, fileId, "preview.open");
    const key = this.jobKey(file.id, file.checksumSha256);
    if (this.queue?.distributed) {
      await this.queue.remove({ fileId: file.id, checksum: file.checksumSha256, source: "office" });
      await this.queue.remove({ fileId: file.id, checksum: file.checksumSha256, source: "dwg" });
    }
    const job = this.jobs.get(key);
    if (job && (job.status === "queued" || job.status === "running")) return this.getPreview(principal, fileId);
    if (job) {
      this.jobs.delete(key);
      await this.audit.record({
        action: "preview.retry",
        entityType: "File",
        entityId: file.id,
        actorId: job.actor.id,
        departmentId: job.actor.departmentId,
        detail: { previousReason: job.reason },
      });
    }
    return this.getPreview(principal, fileId);
  }

  async resolveContent(principal: Principal, fileId: string, kind: "original" | "preview"): Promise<PreviewContent> {
    const { actor, file } = await this.readable(principal, fileId, "preview.stream");
    const content = await this.contentFor(file, kind);
    await this.auditOnce(`preview.stream:${actor.id}:${file.id}:${kind}`, {
      action: "preview.stream",
      entityType: "File",
      entityId: file.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { kind, contentType: content.contentType, sizeBytes: content.sizeBytes },
    });
    return content;
  }

  async cleanupCache(principal: Principal, olderThanDays = 30) {
    const actor = await this.access.resolveActor(principal);
    const days = Math.min(3650, Math.max(1, Math.floor(Number.isFinite(olderThanDays) ? olderThanDays : 30)));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const scanLimit = Number(this.config.get<string>("PREVIEW_CACHE_SCAN_LIMIT")) || 5000;
    const listing = await this.storage.listObjects(PREVIEW_CACHE_PREFIX, scanLimit);
    const stale = listing.objects.filter((object) => object.lastModified && object.lastModified.getTime() < cutoff);
    let removed = 0;
    let failed = 0;
    for (const object of stale) {
      try {
        await this.storage.remove(object.key);
        removed += 1;
      } catch (error) {
        this.logger.warn(`preview cleanup could not remove ${object.key}: ${(error as Error).message}`);
        failed += 1;
      }
    }
    await this.audit.record({
      action: "preview.cache.cleanup",
      entityType: "File",
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { olderThanDays: days, removed, failed, truncated: listing.truncated },
    });
    return { olderThanDays: days, removed, failed, truncated: listing.truncated };
  }

  private async previewFor(actor: Actor, file: PreviewFile): Promise<FilePreviewDto> {
    const sizeBytes = Number(file.sizeBytes);
    const base = {
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      retryable: false,
      expiresInSeconds: this.storage.presignExpiresSeconds,
      startedAt: null as string | null,
      elapsedMs: null as number | null,
    };

    if (sizeBytes > this.maxSourceBytes) {
      return this.unavailable(base, "unsupported", "original", "unknown", "too_large", null);
    }

    const head = await this.storage.readHead(file.storageKey, 8192);
    if (!head) return this.unavailable(base, "unsupported", "original", "unknown", "unreadable", null);

    const detected = detectFileContent(head, file.originalName, file.mimeType);
    if (detected.mismatch) {
      return this.unavailable(base, "unsupported", "original", detected.type, "type_mismatch", null);
    }

    switch (detected.type) {
      case "pdf":
        return this.ready(base, "pdf", "original", detected, this.urlFor(file.id, "original"));
      case "image":
        return this.ready(base, "image", "original", detected, this.urlFor(file.id, "original"));
      case "text":
        return this.ready(base, "text", "original", detected, this.urlFor(file.id, "original"));
      case "dxf":
        return this.ready(base, "cad", "original", detected, this.urlFor(file.id, "original"));
      case "dwg":
        return this.cadPreview(actor, file, detected);
      default:
        if (isOfficePreviewType(detected.type)) return this.officePreview(actor, file, detected);
        return this.unavailable(base, "unsupported", "original", detected.type, "unsupported_type", null);
    }
  }

  private async contentFor(file: PreviewFile, kind: "original" | "preview"): Promise<PreviewContent> {
    if (Number(file.sizeBytes) > this.maxSourceBytes) throw new ForbiddenException("This file is too large to preview");
    const head = await this.storage.readHead(file.storageKey, 8192);
    if (!head) throw new NotFoundException("The stored file is unreadable");
    const detected = detectFileContent(head, file.originalName, file.mimeType);

    if (kind === "original") {
      if (detected.mismatch) throw new ForbiddenException("The stored content does not match its declared type");
      const inlineTypes = new Set(["pdf", "image", "text", "dxf"]);
      if (!inlineTypes.has(detected.type)) throw new BadRequestException("This file type is not streamed inline; download it instead");
      return {
        key: file.storageKey,
        contentType: detected.mimeType,
        fileName: basename(file.originalName),
        sizeBytes: Number(file.sizeBytes),
      };
    }

    const isDwg = detected.type === "dwg";
    if (!isDwg && !isOfficePreviewType(detected.type)) throw new BadRequestException("This file has no converted preview");
    const extension = isDwg ? "dxf" : "pdf";
    const key = this.cacheKey(file.id, file.checksumSha256, extension);
    const cached = await this.storage.head(key);
    if (!cached) throw new NotFoundException("The preview is not ready yet");
    const baseName = basename(file.originalName).replace(/\.[^.]*$/, "") || "preview";
    return {
      key,
      contentType: isDwg ? "application/dxf" : "application/pdf",
      fileName: `${baseName}.${extension}`,
      sizeBytes: cached.sizeBytes,
    };
  }

  private async officePreview(actor: Actor, file: PreviewFile, detected: DetectedFile): Promise<FilePreviewDto> {
    const base = {
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      retryable: false,
      expiresInSeconds: this.storage.presignExpiresSeconds,
      startedAt: null as string | null,
      elapsedMs: null as number | null,
    };
    const availability = await this.converter.officeAvailability();
    if (!availability.command) {
      return this.unavailable(base, "unsupported", "office", detected.type, "converter_unavailable", null);
    }
    const key = this.cacheKey(file.id, file.checksumSha256, "pdf");
    const cached = await this.storage.head(key);
    if (cached && cached.sizeBytes > 0) {
      return this.ready(base, "pdf", "office", detected, this.urlFor(file.id, "preview"));
    }
    return this.enqueue(actor, file, detected, key, "office");
  }

  private async cadPreview(actor: Actor, file: PreviewFile, detected: DetectedFile): Promise<FilePreviewDto> {
    const base = {
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      retryable: false,
      expiresInSeconds: this.storage.presignExpiresSeconds,
      startedAt: null as string | null,
      elapsedMs: null as number | null,
    };
    const availability = await this.converter.odaAvailability();
    if (!availability.command) {
      return this.unavailable(base, "cad", "dwg", detected.type, "converter_unavailable", null);
    }
    const key = this.cacheKey(file.id, file.checksumSha256, "dxf");
    const cached = await this.storage.head(key);
    if (cached && cached.sizeBytes > 0) {
      return this.ready(base, "cad", "dwg", detected, this.urlFor(file.id, "preview"));
    }
    return this.enqueue(actor, file, detected, key, "dwg");
  }

  private async enqueue(
    actor: PreviewJobActor,
    file: PreviewFile,
    detected: DetectedFile,
    cacheKey: string,
    source: "office" | "dwg",
  ): Promise<FilePreviewDto> {
    const data: PreviewJobData = {
      key: this.jobKey(file.id, file.checksumSha256),
      fileId: file.id,
      checksum: file.checksumSha256,
      detected,
      cacheKey,
      source,
      actor: { id: actor.id, departmentId: actor.departmentId },
    };
    if (this.queue?.distributed) {
      try {
        const state = await this.queue.enqueue(data);
        return this.convertingFromState(data, state, file);
      } catch (error) {
        this.logger.warn(`preview queue unavailable, using the in-process converter: ${(error as Error).message}`);
      }
    }
    return this.enqueueLocal(data, file);
  }

  private enqueueLocal(data: PreviewJobData, file: PreviewFile): FilePreviewDto {
    const { actor, detected, cacheKey, source } = data;
    const key = data.key;
    const base = {
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      expiresInSeconds: this.storage.presignExpiresSeconds,
    };
    const existing = this.jobs.get(key);
    if (existing) {
      if (existing.status === "queued" || existing.status === "running" || existing.status === "failed") {
        return this.converting(base, existing, source);
      }
      this.jobs.delete(key);
    }

    const job: ConversionJob = {
      key,
      fileId: file.id,
      checksum: file.checksumSha256,
      detected,
      cacheKey,
      status: "queued",
      startedAt: Date.now(),
      finishedAt: null,
      elapsedMs: null,
      reason: null,
      message: null,
      actor: { id: actor.id, departmentId: actor.departmentId },
    };
    this.jobs.set(key, job);
    void this.runJob(job, file, source).catch((error) => {
      this.logger.error(`preview job ${key} crashed: ${(error as Error).message}`);
    });
    return this.converting(base, job, source);
  }

  private async runJob(job: ConversionJob, file: PreviewFile, source: "office" | "dwg"): Promise<PreviewJobResult> {
    await this.acquireSlot();
    job.status = "running";
    job.startedAt = Date.now();
    let workDir: string | null = null;
    await this.audit.record({
      action: "preview.convert.start",
      entityType: "File",
      entityId: file.id,
      actorId: job.actor.id,
      detail: { source, detectedType: job.detected.type },
    });
    try {
      workDir = await mkdtemp(join(tmpdir(), "edas-preview-"));
      const sourcePath = join(workDir, `source.${job.detected.extension}`);
      await this.storage.downloadToFile(file.storageKey, sourcePath, this.maxSourceBytes);
      const outcome =
        source === "dwg"
          ? await this.converter.convertDwgToDxf(sourcePath, workDir, this.timeoutMs)
          : await this.converter.convertOfficeToPdf(sourcePath, workDir, this.timeoutMs);
      const info = await stat(outcome.outputPath);
      if (info.size <= 0) throw new ConversionOutputMissingError(`.${source === "dwg" ? "dxf" : "pdf"}`);
      if (info.size > this.maxOutputBytes) {
        throw new ConversionFailedError(`Converted preview exceeds the ${this.maxOutputBytes} byte limit`);
      }
      const body = await readFile(outcome.outputPath);
      const contentType = source === "dwg" ? "application/dxf" : "application/pdf";
      await this.storage.put(job.cacheKey, body, contentType);
      job.status = "ready";
      job.elapsedMs = outcome.elapsedMs;
      job.message = null;
      await this.audit.record({
        action: "preview.convert.done",
        entityType: "File",
        entityId: file.id,
        actorId: job.actor.id,
        result: "success",
        detail: { source, detectedType: job.detected.type, outputBytes: info.size, elapsedMs: outcome.elapsedMs },
      });
    } catch (error) {
      const reason = this.reasonFor(error);
      job.status = "failed";
      job.reason = reason;
      job.message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`preview conversion failed for ${file.id}: ${job.message}`);
      await this.audit.record({
        action: "preview.convert.done",
        entityType: "File",
        entityId: file.id,
        actorId: job.actor.id,
        result: "failure",
        detail: { source, detectedType: job.detected.type, reason },
      });
    } finally {
      job.finishedAt = Date.now();
      if (job.elapsedMs === null) job.elapsedMs = job.finishedAt - job.startedAt;
      this.releaseSlot();
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
    return previewJobResult(job);
  }

  private async processDistributed(data: PreviewJobData): Promise<PreviewJobResult> {
    const file = await this.files.fileForJob(data.fileId);
    if (!file) throw new Error("conversion_failed|the stored file disappeared before conversion");
    const job: ConversionJob = {
      key: data.key,
      fileId: data.fileId,
      checksum: data.checksum,
      detected: data.detected,
      cacheKey: data.cacheKey,
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      elapsedMs: null,
      reason: null,
      message: null,
      actor: data.actor,
    };
    return this.runJob(job, file, data.source);
  }

  private reasonFor(error: unknown): FilePreviewReason {
    if (error instanceof ConversionTimeoutError) return "conversion_timeout";
    if (error instanceof ConversionOutputMissingError) return "conversion_produced_no_output";
    if (error instanceof ConverterUnavailableError) return "converter_unavailable";
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("byte preview limit") || message.includes("byte limit")) return "too_large";
    return "conversion_failed";
  }

  private safeMessage(reason: FilePreviewReason | null): string {
    switch (reason) {
      case "conversion_timeout":
        return "The conversion exceeded the server time limit";
      case "conversion_produced_no_output":
        return "The converter produced no preview file";
      case "converter_unavailable":
        return "The required converter is not installed on the server";
      case "too_large":
        return "The file is too large to preview";
      default:
        return "The file could not be converted for preview";
    }
  }

  private async readable(principal: Principal, fileId: string, action: PreviewAccessAction): Promise<ReadableFile> {
    try {
      return await this.files.readableFile(principal, fileId);
    } catch (error) {
      await this.auditDenied(principal, fileId, action, error);
      throw error;
    }
  }

  private async auditDenied(principal: Principal, fileId: string, action: PreviewAccessAction, error: unknown): Promise<void> {
    let actorId: string | null = null;
    let departmentId: string | null = null;
    try {
      const actor = await this.access.resolveActor(principal);
      actorId = actor.id;
      departmentId = actor.departmentId;
    } catch (resolveError) {
      this.logger.debug(`denied preview audit could not resolve the actor: ${(resolveError as Error).message}`);
    }
    await this.auditOnce(`${action}:denied:${actorId ?? principal.sub}:${fileId}`, {
      action,
      entityType: "File",
      entityId: fileId,
      actorId,
      departmentId,
      result: "failure",
      detail: { reason: denialReason(error) },
    });
  }

  /**
   * The audit chain is serialised by an advisory lock, so repeated range requests for one preview must not each append
   * an event: one row per actor/file/action per window is enough to prove who read what.
   */
  private async auditOnce(key: string, input: AuditInput): Promise<void> {
    const now = Date.now();
    const seen = this.auditSeen.get(key);
    if (seen !== undefined && now - seen < AUDIT_DEDUPE_MS) return;
    this.auditSeen.set(key, now);
    if (this.auditSeen.size > 5000) {
      for (const [entryKey, timestamp] of this.auditSeen) {
        if (now - timestamp >= AUDIT_DEDUPE_MS) this.auditSeen.delete(entryKey);
      }
    }
    try {
      await this.audit.record(input);
    } catch (error) {
      this.logger.warn(`preview audit write failed: ${(error as Error).message}`);
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeConversions < this.concurrency) {
      this.activeConversions += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.activeConversions += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeConversions = Math.max(0, this.activeConversions - 1);
  }

  private pruneJobs(): void {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const [key, job] of this.jobs) {
      if (job.finishedAt && job.finishedAt < cutoff) this.jobs.delete(key);
    }
  }

  private jobKey(fileId: string, checksum: string): string {
    return `${fileId}:${checksum.toLowerCase()}`;
  }

  private cacheKey(fileId: string, checksum: string, extension: "pdf" | "dxf"): string {
    return `${PREVIEW_CACHE_PREFIX}${fileId}/${checksum.toLowerCase()}.${extension}`;
  }

  private urlFor(fileId: string, kind: "original" | "preview"): string {
    return `${API_PREFIX}/preview/files/${encodeURIComponent(fileId)}/content?kind=${kind}`;
  }

  private ready(
    base: { fileId: string; fileName: string; mimeType: string; expiresInSeconds: number },
    kind: FilePreviewKind,
    source: FilePreviewSource,
    detected: DetectedFile,
    url: string,
  ): FilePreviewDto {
    return {
      ...base,
      kind,
      status: "ready",
      source,
      detectedType: detected.type,
      url,
      reason: null,
      message: null,
      retryable: false,
      startedAt: null,
      elapsedMs: null,
    };
  }

  private unavailable(
    base: { fileId: string; fileName: string; mimeType: string; expiresInSeconds: number },
    kind: FilePreviewKind,
    source: FilePreviewSource,
    detectedType: string,
    reason: FilePreviewReason,
    message: string | null,
  ): FilePreviewDto {
    return {
      ...base,
      kind,
      status: "unavailable",
      source,
      detectedType,
      url: null,
      reason,
      message,
      retryable: reason === "conversion_failed" || reason === "conversion_timeout" || reason === "conversion_produced_no_output",
      startedAt: null,
      elapsedMs: null,
    };
  }

  private convertingFromState(data: PreviewJobData, state: PreviewQueueState, file: PreviewFile): FilePreviewDto {
    const base = {
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      expiresInSeconds: this.storage.presignExpiresSeconds,
    };
    const job: ConversionJob = {
      key: data.key,
      fileId: data.fileId,
      checksum: data.checksum,
      detected: data.detected,
      cacheKey: data.cacheKey,
      status: state.status,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      elapsedMs: state.elapsedMs,
      reason: state.reason,
      message: state.message,
      actor: data.actor,
    };
    return this.converting(base, job, data.source);
  }

  private converting(
    base: { fileId: string; fileName: string; mimeType: string; expiresInSeconds: number },
    job: ConversionJob,
    source: "office" | "dwg",
  ): FilePreviewDto {
    if (job.status === "failed") {
      return {
        ...base,
        kind: source === "dwg" ? "cad" : "pdf",
        status: "failed",
        source,
        detectedType: job.detected.type,
        url: null,
        reason: job.reason,
        message: this.safeMessage(job.reason),
        retryable: true,
        startedAt: new Date(job.startedAt).toISOString(),
        elapsedMs: job.elapsedMs,
      };
    }
    return {
      ...base,
      kind: source === "dwg" ? "cad" : "pdf",
      status: "converting",
      source,
      detectedType: job.detected.type,
      url: null,
      reason: null,
      message: job.status === "queued" ? "Waiting for an available conversion slot" : "Converting the file for preview",
      retryable: false,
      startedAt: new Date(job.startedAt).toISOString(),
      elapsedMs: job.elapsedMs,
    };
  }
}
