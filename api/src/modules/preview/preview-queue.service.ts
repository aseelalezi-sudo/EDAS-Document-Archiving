import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FilePreviewReason } from "@edas/shared";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { DetectedFile } from "./preview-file-type";

export const PREVIEW_QUEUE_NAME = "edas-preview";
const QUEUE_ATTEMPTS = 3;
const QUEUE_BACKOFF_MS = 5_000;

export interface PreviewJobActor {
  id: string | null;
  departmentId: string | null;
}

export interface PreviewJobData {
  key: string;
  fileId: string;
  checksum: string;
  detected: DetectedFile;
  cacheKey: string;
  source: "office" | "dwg";
  actor: PreviewJobActor;
}

export interface PreviewJobResult {
  status: "ready" | "failed";
  reason: FilePreviewReason | null;
  message: string | null;
  startedAt: number;
  finishedAt: number;
  elapsedMs: number;
  retryable: boolean;
}

export interface PreviewQueueState {
  status: "queued" | "running" | "ready" | "failed";
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  reason: FilePreviewReason | null;
  message: string | null;
}

export function previewJobId(data: Pick<PreviewJobData, "fileId" | "checksum" | "source">): string {
  return `${data.fileId}_${data.checksum.toLowerCase()}_${data.source}`;
}

function stateFromResult(job: Job<PreviewJobData>, result: PreviewJobResult): PreviewQueueState {
  return {
    status: result.status,
    startedAt: result.startedAt || job.processedOn || job.timestamp,
    finishedAt: result.finishedAt || job.finishedOn || null,
    elapsedMs: result.elapsedMs,
    reason: result.reason,
    message: result.message,
  };
}

function failedState(job: Job<PreviewJobData>): PreviewQueueState {
  const reason = (job.failedReason ?? "").split("|")[0] as FilePreviewReason;
  const known: FilePreviewReason[] = [
    "conversion_failed",
    "conversion_timeout",
    "conversion_produced_no_output",
    "converter_unavailable",
    "too_large",
  ];
  return {
    status: "failed",
    startedAt: job.processedOn ?? job.timestamp,
    finishedAt: job.finishedOn ?? Date.now(),
    elapsedMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    reason: known.includes(reason) ? reason : "conversion_failed",
    message: (job.failedReason ?? "").split("|").slice(1).join("|") || null,
  };
}

@Injectable()
export class PreviewQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreviewQueueService.name);
  private queue: Queue<PreviewJobData> | null = null;
  private worker: Worker<PreviewJobData> | null = null;
  private connection: IORedis | null = null;
  private workerConnection: IORedis | null = null;
  private processor: ((data: PreviewJobData) => Promise<PreviewJobResult>) | null = null;

  constructor(private readonly config: ConfigService) {}

  get distributed(): boolean {
    return Boolean((this.config.get<string>("REDIS_URL") ?? "").trim());
  }

  registerProcessor(processor: (data: PreviewJobData) => Promise<PreviewJobResult>): void {
    this.processor = processor;
  }

  async onModuleInit(): Promise<void> {
    const url = (this.config.get<string>("REDIS_URL") ?? "").trim();
    if (!url) return;
    const concurrency = Number(this.config.get<string>("PREVIEW_CONCURRENCY"));
    this.connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
    });
    this.workerConnection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
    });
    this.queue = new Queue<PreviewJobData>(PREVIEW_QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker<PreviewJobData>(
      PREVIEW_QUEUE_NAME,
      async (job) => {
        if (!this.processor) throw new Error("conversion_failed|preview processor is not registered");
        const result = await this.processor(job.data);
        if (result.status === "failed" && result.retryable) {
          throw new Error(`${result.reason ?? "conversion_failed"}|${result.message ?? "conversion failed"}`);
        }
        return result;
      },
      {
        connection: this.workerConnection,
        concurrency: Number.isFinite(concurrency) && concurrency >= 1 ? Math.floor(concurrency) : 2,
      },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.warn(`preview queue job ${job?.id ?? "unknown"} failed: ${error.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.warn(`preview queue worker error: ${error.message}`);
    });
    this.logger.log(`Preview queue connected to Redis (${PREVIEW_QUEUE_NAME})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
    this.workerConnection?.disconnect();
  }

  async enqueue(data: PreviewJobData): Promise<PreviewQueueState> {
    if (!this.queue) throw new Error("preview queue is unavailable");
    const id = previewJobId(data);
    const existing = await this.queue.getJob(id);
    if (existing) {
      const state = await this.stateOf(existing);
      if (state.status !== "ready") return state;
      await existing.remove().catch(() => undefined);
    }
    await this.queue.add("convert", data, {
      jobId: id,
      attempts: QUEUE_ATTEMPTS,
      backoff: { type: "exponential", delay: QUEUE_BACKOFF_MS },
      removeOnComplete: { age: 15 * 60, count: 1000 },
      removeOnFail: { age: 24 * 60 * 60, count: 1000 },
    });
    return {
      status: "queued",
      startedAt: Date.now(),
      finishedAt: null,
      elapsedMs: null,
      reason: null,
      message: "Waiting for an available conversion slot",
    };
  }

  async state(data: Pick<PreviewJobData, "fileId" | "checksum" | "source">): Promise<PreviewQueueState | null> {
    if (!this.queue) return null;
    const job = await this.queue.getJob(previewJobId(data));
    return job ? this.stateOf(job) : null;
  }

  async remove(data: Pick<PreviewJobData, "fileId" | "checksum" | "source">): Promise<void> {
    if (!this.queue) return;
    const job = await this.queue.getJob(previewJobId(data));
    if (job) await job.remove().catch(() => undefined);
  }

  private async stateOf(job: Job<PreviewJobData>): Promise<PreviewQueueState> {
    const state = await job.getState();
    if (state === "completed") {
      const result = job.returnvalue as PreviewJobResult | null;
      if (result && typeof result === "object") return stateFromResult(job, result);
      return {
        status: "ready",
        startedAt: job.processedOn ?? job.timestamp,
        finishedAt: job.finishedOn ?? null,
        elapsedMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
        reason: null,
        message: null,
      };
    }
    if (state === "failed") return failedState(job);
    if (state === "active") {
      return {
        status: "running",
        startedAt: job.processedOn ?? job.timestamp,
        finishedAt: null,
        elapsedMs: null,
        reason: null,
        message: "Converting the file for preview",
      };
    }
    return {
      status: "queued",
      startedAt: job.processedOn ?? job.timestamp,
      finishedAt: null,
      elapsedMs: null,
      reason: null,
      message: "Waiting for an available conversion slot",
    };
  }
}
