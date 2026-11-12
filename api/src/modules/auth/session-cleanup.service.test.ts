import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCleanupService } from "./session-cleanup.service";
import type { SessionService } from "./session.service";

function build(count = 0) {
  const sessions = { purgeExpired: vi.fn().mockResolvedValue(count) };
  const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  const service = new SessionCleanupService(sessions as unknown as SessionService);
  return { service, sessions, log, error };
}

beforeEach(() => {
  vi.useFakeTimers();
  delete process.env.SESSION_CLEANUP_INTERVAL_MS;
});

afterEach(() => {
  delete process.env.SESSION_CLEANUP_INTERVAL_MS;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SessionCleanupService scheduling", () => {
  it("sweeps hourly by default and stops after shutdown", async () => {
    const { service, sessions, log } = build(2);

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(sessions.purgeExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sessions.purgeExpired).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Purged 2 expired session(s)");

    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(sessions.purgeExpired).toHaveBeenCalledOnce();
  });

  it("honours a configured interval above one minute", async () => {
    process.env.SESSION_CLEANUP_INTERVAL_MS = "120000";
    const { service, sessions } = build(1);

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(sessions.purgeExpired).toHaveBeenCalledOnce();
    service.onApplicationShutdown();
  });

  it("ignores a configured interval below one minute", async () => {
    process.env.SESSION_CLEANUP_INTERVAL_MS = "1000";
    const { service, sessions } = build();

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessions.purgeExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_540_000);
    expect(sessions.purgeExpired).toHaveBeenCalledOnce();
    service.onApplicationShutdown();
  });

  it("survives a sweep that throws and keeps the schedule alive", async () => {
    const { service, sessions, error } = build();
    sessions.purgeExpired.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(0);

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(error).toHaveBeenCalledWith("Session cleanup failed: db down");

    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(sessions.purgeExpired).toHaveBeenCalledTimes(2);
    service.onApplicationShutdown();
  });

  it("names a sweep that rejected with a value that is not an error", async () => {
    const { service, sessions, error } = build();
    sessions.purgeExpired.mockRejectedValueOnce("connection reset").mockResolvedValue(0);

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(error).toHaveBeenCalledWith("Session cleanup failed: connection reset");
    service.onApplicationShutdown();
  });

  it("tolerates shutdown before bootstrap", () => {
    const { service } = build();

    expect(() => service.onApplicationShutdown()).not.toThrow();
  });

  it("does not overlap a sweep that is still running", async () => {
    const { service, sessions } = build();
    let finish: (count: number) => void = () => undefined;
    sessions.purgeExpired.mockImplementation(() => new Promise((resolve) => (finish = resolve)));

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(sessions.purgeExpired).toHaveBeenCalledOnce();

    finish(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(sessions.purgeExpired).toHaveBeenCalledTimes(2);
    service.onApplicationShutdown();
  });
});
