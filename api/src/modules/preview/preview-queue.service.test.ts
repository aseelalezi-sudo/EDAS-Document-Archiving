import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewQueueService, previewJobId } from "./preview-queue.service";

const mocks = vi.hoisted(() => {
  const queue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const worker = {
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const connection = { disconnect: vi.fn() };
  return {
    queue,
    worker,
    connection,
    Queue: vi.fn(function QueueMock() {
      return queue;
    }),
    Worker: vi.fn(function WorkerMock() {
      return worker;
    }),
    Redis: vi.fn(function RedisMock() {
      return connection;
    }),
  };
});

vi.mock("bullmq", () => ({ Queue: mocks.Queue, Worker: mocks.Worker }));
vi.mock("ioredis", () => ({ default: mocks.Redis }));

function service(values: Record<string, string> = {}) {
  const config = { get: (key: string) => values[key] };
  return new PreviewQueueService(config as never);
}

const data = {
  fileId: "file-1",
  checksum: "ABCDEF",
  source: "office" as const,
  detected: {
    type: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    family: "office",
    mismatch: false,
    declaredExtension: "docx",
  },
  key: "file-1:abcdef",
  cacheKey: "previews/file-1/abcdef.pdf",
  actor: { id: "user-1", departmentId: "dept-1" },
} as const;

function workerProcessor() {
  const calls = mocks.Worker.mock.calls as unknown as Array<[string, (job: { data: typeof data }) => Promise<unknown>]>;
  return calls[0][1];
}

function job(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: previewJobId(data),
    timestamp: 1000,
    processedOn: state === "active" ? 1100 : null,
    finishedOn: state === "completed" ? 1200 : null,
    returnvalue: null,
    failedReason: null,
    getState: vi.fn().mockResolvedValue(state),
    ...overrides,
  };
}

describe("previewJobId", () => {
  it("uses a stable Redis-safe id that includes the source and ignores checksum case", () => {
    expect(previewJobId(data)).toBe("file-1_abcdef_office");
  });

  it("keeps office and dwg jobs separate for the same file", () => {
    expect(previewJobId({ ...data, source: "dwg" })).toBe("file-1_abcdef_dwg");
  });
});

describe("PreviewQueueService without Redis", () => {
  it("stays in local mode and has no queue state", async () => {
    const queue = service();

    expect(queue.distributed).toBe(false);
    await expect(queue.state(data)).resolves.toBeNull();
    await expect(queue.enqueue(data)).rejects.toThrow("preview queue is unavailable");
    await expect(queue.remove(data)).resolves.toBeUndefined();
  });
});

describe("PreviewQueueService state mapping", () => {
  function withJob(jobValue: ReturnType<typeof job>) {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    (queue as unknown as { queue: unknown }).queue = { getJob: vi.fn().mockResolvedValue(jobValue) };
    return queue;
  }

  it("maps a waiting job to queued", async () => {
    await expect(withJob(job("waiting")).state(data)).resolves.toMatchObject({ status: "queued", startedAt: 1000 });
  });

  it("maps an active job to running", async () => {
    await expect(withJob(job("active")).state(data)).resolves.toMatchObject({ status: "running", startedAt: 1100 });
  });

  it("maps a completed conversion result", async () => {
    const result = { status: "ready", reason: null, message: null, startedAt: 1100, finishedAt: 1200, elapsedMs: 100, retryable: false };
    await expect(withJob(job("completed", { returnvalue: result })).state(data)).resolves.toMatchObject({
      status: "ready",
      elapsedMs: 100,
    });
  });

  it("falls back to the enqueue timestamp when BullMQ has no processed timestamp", async () => {
    const result = { status: "ready", reason: null, message: null, startedAt: 0, finishedAt: 0, elapsedMs: 0, retryable: false };
    const value = job("completed", { returnvalue: result, processedOn: null, finishedOn: null });
    await expect(withJob(value).state(data)).resolves.toMatchObject({ startedAt: 1000, finishedAt: null });
  });

  it("computes elapsed time for a failed job with both BullMQ timestamps", async () => {
    const value = job("failed", {
      failedReason: "conversion_failed|boom",
      processedOn: 1100,
      finishedOn: 1400,
    });
    await expect(withJob(value).state(data)).resolves.toMatchObject({ status: "failed", elapsedMs: 300 });
  });

  it("returns ready without timestamps when a completed job has no payload or timestamps", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    (queue as unknown as { queue: unknown }).queue = {
      getJob: vi.fn().mockResolvedValue({
        ...job("completed"),
        getState: vi.fn().mockResolvedValue("completed"),
        returnvalue: null,
        processedOn: null,
        finishedOn: null,
      }),
    };

    await expect(queue.state(data)).resolves.toMatchObject({
      status: "ready",
      startedAt: 1000,
      finishedAt: null,
      elapsedMs: null,
    });
  });

  it("fills missing result timestamps from the BullMQ job", async () => {
    const result = { status: "ready", reason: null, message: null, startedAt: 0, finishedAt: 0, elapsedMs: 0, retryable: false };
    await expect(withJob(job("completed", { returnvalue: result, processedOn: 1100, finishedOn: 1200 })).state(data)).resolves.toMatchObject({
      startedAt: 1100,
      finishedAt: 1200,
    });
  });

  it("maps a failed job with a known reason", async () => {
    const value = job("failed", { failedReason: "conversion_timeout|the converter timed out", finishedOn: 1300 });
    await expect(withJob(value).state(data)).resolves.toMatchObject({
      status: "failed",
      reason: "conversion_timeout",
      message: "the converter timed out",
    });
  });

  it("maps an empty failedReason to a generic failure without a message", async () => {
    const value = job("failed", { failedReason: null, processedOn: null, finishedOn: null });
    await expect(withJob(value).state(data)).resolves.toMatchObject({
      status: "failed",
      reason: "conversion_failed",
      message: null,
    });
  });

  it("returns null when the queue has no matching job", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    (queue as unknown as { queue: unknown }).queue = { getJob: vi.fn().mockResolvedValue(null) };

    await expect(queue.state(data)).resolves.toBeNull();
  });

  it("falls back to conversion_failed for an unknown reason", async () => {
    const value = job("failed", { failedReason: "worker crashed", finishedOn: 1300 });
    await expect(withJob(value).state(data)).resolves.toMatchObject({ status: "failed", reason: "conversion_failed" });
  });
});

describe("PreviewQueueService Redis lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queue.getJob.mockResolvedValue(null);
    mocks.queue.add.mockResolvedValue(undefined);
    mocks.queue.close.mockResolvedValue(undefined);
    mocks.worker.close.mockResolvedValue(undefined);
  });

  it("does nothing when REDIS_URL is empty", async () => {
    const queue = service();

    await queue.onModuleInit();
    await queue.onModuleDestroy();

    expect(mocks.Queue).not.toHaveBeenCalled();
    expect(mocks.Worker).not.toHaveBeenCalled();
  });

  it("swallows shutdown failures and still disconnects", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    mocks.worker.close.mockRejectedValueOnce(new Error("worker close failed"));
    mocks.queue.close.mockRejectedValueOnce(new Error("queue close failed"));

    await expect(queue.onModuleDestroy()).resolves.toBeUndefined();
    expect(mocks.connection.disconnect).toHaveBeenCalledTimes(2);
  });

  it("connects a queue and worker, then closes them gracefully", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379", PREVIEW_CONCURRENCY: "4" });

    await queue.onModuleInit();

    expect(mocks.Redis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ maxRetriesPerRequest: null, enableOfflineQueue: false }),
    );
    expect(mocks.Queue).toHaveBeenCalled();
    expect(mocks.Worker).toHaveBeenCalledWith(
      "edas-preview",
      expect.any(Function),
      expect.objectContaining({ concurrency: 4 }),
    );
    expect(mocks.worker.on).toHaveBeenCalledWith("failed", expect.any(Function));
    expect(mocks.worker.on).toHaveBeenCalledWith("error", expect.any(Function));

    await queue.onModuleDestroy();

    expect(mocks.worker.close).toHaveBeenCalledOnce();
    expect(mocks.queue.close).toHaveBeenCalledOnce();
    expect(mocks.connection.disconnect).toHaveBeenCalledTimes(2);
  });

  it("enqueues a new job with bounded retries and exponential backoff", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();

    await expect(queue.enqueue(data)).resolves.toMatchObject({ status: "queued" });
    expect(mocks.queue.add).toHaveBeenCalledWith(
      "convert",
      data,
      expect.objectContaining({
        jobId: "file-1_abcdef_office",
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }),
    );
  });

  it("reuses an existing queued job", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    const existing = {
      ...job("waiting"),
      getState: vi.fn().mockResolvedValue("waiting"),
    };
    mocks.queue.getJob.mockResolvedValue(existing);
    mocks.queue.add.mockClear();

    await expect(queue.enqueue(data)).resolves.toMatchObject({ status: "queued" });
    expect(mocks.queue.add).not.toHaveBeenCalled();
  });

  it("replaces a completed job whose cached preview is gone", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    const existing = {
      ...job("completed"),
      getState: vi.fn().mockResolvedValue("completed"),
      returnvalue: { status: "ready", reason: null, message: null, startedAt: 1, finishedAt: 2, elapsedMs: 1, retryable: false },
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mocks.queue.getJob.mockResolvedValue(existing);

    await queue.enqueue(data);

    expect(existing.remove).toHaveBeenCalledOnce();
    expect(mocks.queue.add).toHaveBeenCalledOnce();
  });

  it("ignores removal failures when replacing a finished job", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    const existing = {
      ...job("completed"),
      getState: vi.fn().mockResolvedValue("completed"),
      returnvalue: { status: "ready", reason: null, message: null, startedAt: 1, finishedAt: 2, elapsedMs: 1, retryable: false },
      remove: vi.fn().mockRejectedValue(new Error("locked")),
    };
    mocks.queue.getJob.mockResolvedValue(existing);

    await expect(queue.enqueue(data)).resolves.toMatchObject({ status: "queued" });
  });

  it("ignores removal failures on retry", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    mocks.queue.getJob.mockResolvedValue({ remove: vi.fn().mockRejectedValue(new Error("locked")) });

    await expect(queue.remove(data)).resolves.toBeUndefined();
  });

  it("removes an existing job on retry and tolerates a missing one", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    const existing = { remove: vi.fn().mockResolvedValue(undefined) };
    mocks.queue.getJob.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);

    await queue.remove(data);
    await queue.remove(data);

    expect(existing.remove).toHaveBeenCalledOnce();
  });

  it("returns ready when a completed job has no object payload", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    (queue as unknown as { queue: unknown }).queue = {
      getJob: vi.fn().mockResolvedValue({
        ...job("completed"),
        getState: vi.fn().mockResolvedValue("completed"),
        returnvalue: null,
        processedOn: 1100,
        finishedOn: 1200,
      }),
    };

    await expect(queue.state(data)).resolves.toMatchObject({ status: "ready", reason: null, elapsedMs: 100 });
  });

  it("uses the enqueue timestamp for an active job without a processed timestamp", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    (queue as unknown as { queue: unknown }).queue = {
      getJob: vi.fn().mockResolvedValue(job("active", { processedOn: null })),
    };
    await expect(queue.state(data)).resolves.toMatchObject({ status: "running", startedAt: 1000 });
  });

  it("runs the registered processor and rethrows retryable failures", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    const processor = vi.fn().mockResolvedValue({
      status: "failed",
      reason: "conversion_timeout",
      message: "timed out",
      startedAt: 1,
      finishedAt: 2,
      elapsedMs: 1,
      retryable: true,
    });
    queue.registerProcessor(processor);
    await queue.onModuleInit();
    await expect(workerProcessor()({ data })).rejects.toThrow("conversion_timeout|timed out");
  });

  it("uses the generic reason when a retryable failure carries no reason or message", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    queue.registerProcessor(
      vi.fn().mockResolvedValue({
        status: "failed",
        reason: null,
        message: null,
        startedAt: 1,
        finishedAt: 2,
        elapsedMs: 1,
        retryable: true,
      }),
    );
    await queue.onModuleInit();
    await expect(workerProcessor()({ data })).rejects.toThrow("conversion_failed|conversion failed");
  });

  it("returns non-retryable failures without retrying", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    const result = {
      status: "failed",
      reason: "too_large",
      message: "too large",
      startedAt: 1,
      finishedAt: 2,
      elapsedMs: 1,
      retryable: false,
    };
    queue.registerProcessor(vi.fn().mockResolvedValue(result));
    await queue.onModuleInit();
    await expect(workerProcessor()({ data })).resolves.toBe(result);
  });

  it("rejects work when no processor was registered", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    await expect(workerProcessor()({ data })).rejects.toThrow("preview processor is not registered");
  });

  it("invokes the worker error listeners", async () => {
    const queue = service({ REDIS_URL: "redis://localhost:6379" });
    await queue.onModuleInit();
    const failed = mocks.worker.on.mock.calls.find((call) => call[0] === "failed")?.[1] as (job: unknown, error: Error) => void;
    const error = mocks.worker.on.mock.calls.find((call) => call[0] === "error")?.[1] as (error: Error) => void;

    failed({ id: "job-1" }, new Error("boom"));
    failed(undefined, new Error("boom"));
    error(new Error("offline"));
  });
});
