import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportsService } from "./reports.service";
import { ReportsScheduler } from "./reports.scheduler";

function build(count = 0) {
  const reports = { runDueSchedules: vi.fn().mockResolvedValue(count) };
  return { scheduler: new ReportsScheduler(reports as unknown as ReportsService), reports };
}

afterEach(() => {
  delete process.env.REPORT_SCHEDULER_INTERVAL_MS;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ReportsScheduler", () => {
  it("runs the due schedules on the default one-minute interval", async () => {
    vi.useFakeTimers();
    const { scheduler, reports } = build(2);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(reports.runDueSchedules).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(reports.runDueSchedules).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Executed 2 scheduled report(s)");

    scheduler.onApplicationShutdown();
  });

  it("honours a configured interval and ignores values below one second", async () => {
    vi.useFakeTimers();
    const configured = build(0);
    process.env.REPORT_SCHEDULER_INTERVAL_MS = "2000";
    configured.scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2000);
    expect(configured.reports.runDueSchedules).toHaveBeenCalledTimes(1);
    configured.scheduler.onApplicationShutdown();

    const tooSmall = build(0);
    process.env.REPORT_SCHEDULER_INTERVAL_MS = "10";
    tooSmall.scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10);
    expect(tooSmall.reports.runDueSchedules).not.toHaveBeenCalled();
    tooSmall.scheduler.onApplicationShutdown();
  });

  it("does not start a second sweep while one is still running", async () => {
    vi.useFakeTimers();
    let release: (value: number) => void = () => undefined;
    const reports = { runDueSchedules: vi.fn(() => new Promise<number>((resolve) => (release = resolve))) };
    const scheduler = new ReportsScheduler(reports as unknown as ReportsService);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reports.runDueSchedules).toHaveBeenCalledTimes(1);

    release(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reports.runDueSchedules).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("logs a failed sweep and keeps the timer alive", async () => {
    vi.useFakeTimers();
    const reports = {
      runDueSchedules: vi.fn().mockRejectedValueOnce(new Error("database is down")).mockResolvedValue(1),
    };
    const scheduler = new ReportsScheduler(reports as unknown as ReportsService);
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(error).toHaveBeenCalledWith("Scheduled report run failed: database is down");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(reports.runDueSchedules).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("stops sweeping after shutdown", async () => {
    vi.useFakeTimers();
    const { scheduler, reports } = build(0);

    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(180_000);

    expect(reports.runDueSchedules).not.toHaveBeenCalled();
  });

  it("names a sweep that rejected with a value that is not an error", async () => {
    vi.useFakeTimers();
    const reports = { runDueSchedules: vi.fn().mockRejectedValueOnce("connection reset").mockResolvedValue(0) };
    const scheduler = new ReportsScheduler(reports as unknown as ReportsService);
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(error).toHaveBeenCalledWith("Scheduled report run failed: connection reset");
    scheduler.onApplicationShutdown();
  });

  it("tolerates shutdown before bootstrap", () => {
    const { scheduler } = build();

    expect(() => scheduler.onApplicationShutdown()).not.toThrow();
  });
});
