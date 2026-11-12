import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { of } from "rxjs";
import type { LogContext } from "./log-context";
import { currentLogContext, runWithLogContext } from "./log-context";
import { RequestLogInterceptor } from "./request-log.interceptor";

interface Harness {
  interceptor: RequestLogInterceptor;
  finish: (status: number) => void;
  request: { method: string; path?: string; originalUrl?: string; user?: { sub: string }; route?: { path: string } };
}

function harness(status = 200, overrides: Partial<Harness["request"]> = {}, type: "http" | "ws" = "http"): Harness {
  let onFinish: (() => void) | undefined;
  let onClose: (() => void) | undefined;
  const request: Harness["request"] = {
    method: "GET",
    path: "/api/v1/documents",
    user: { sub: "user-3" },
    route: { path: "/documents" },
    ...overrides,
  };
  const response = {
    statusCode: status,
    once: (event: string, handler: () => void) => {
      if (event === "finish") onFinish = handler;
      if (event === "close") onClose = handler;
      return response;
    },
  };
  const context = {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(null) };
  const interceptor = new RequestLogInterceptor();
  interceptor.intercept(context, next).subscribe();
  return {
    interceptor,
    request,
    finish: (code: number) => {
      response.statusCode = code;
      onFinish?.();
      onClose?.();
    },
  };
}

describe("RequestLogInterceptor", () => {
  it("passes a non-HTTP context through without timing or logging", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const handler = { handle: vi.fn(() => of(null)) };
    const context = {
      getType: () => "ws",
      switchToHttp: () => {
        throw new Error("should not switch to http");
      },
    } as unknown as ExecutionContext;

    new RequestLogInterceptor().intercept(context, handler as CallHandler).subscribe();

    expect(handler.handle).toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("logs once even when both finish and close fire", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { finish } = harness();

    finish(200);

    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("ignores a request without a resolved user or a matched route", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const seen: LogContext[] = [];
    log.mockImplementation(() => {
      const store = currentLogContext();
      if (store) seen.push({ ...store });
    });

    runWithLogContext({ correlationId: "corr-2" }, () => {
      const { finish } = harness(200, { user: undefined, route: undefined });
      finish(200);
    });

    expect(seen[0]).toEqual({ correlationId: "corr-2" });
    log.mockRestore();
  });

  it("falls back to the original URL and then to an empty path", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    harness(200, { path: undefined, originalUrl: "/api/v1/fallback" }).finish(200);
    harness(200, { path: undefined, originalUrl: undefined }).finish(200);

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines[0]).toMatch(/^GET \/api\/v1\/fallback 200 /);
    expect(lines[1]).toMatch(/^GET {2}200 /);
    log.mockRestore();
  });

  it("logs one access line per finished request with status and duration", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { finish } = harness();

    expect(log).not.toHaveBeenCalled();
    finish(201);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^GET \/api\/v1\/documents 201 \d+\.\dms$/);
    log.mockRestore();
  });

  it("exposes the resolved user and route to the log context", () => {
    const seen: LogContext[] = [];
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {
      const store = currentLogContext();
      if (store) seen.push({ ...store });
    });

    runWithLogContext({ correlationId: "corr-1", method: "GET", path: "/api/v1/documents" }, () => {
      const { finish } = harness();
      finish(200);
    });

    expect(log).toHaveBeenCalled();
    expect(seen[0]).toMatchObject({ correlationId: "corr-1", userId: "user-3", route: "/documents" });
    log.mockRestore();
  });

  it("maps the status to the matching level", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const debug = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    harness().finish(404);
    harness().finish(500);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
    debug.mockRestore();
  });

  it("keeps health checks on the debug level so probes do not flood the log", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const debug = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    const built = harness();
    built.request.path = "/api/v1/health/ready";

    built.finish(200);

    expect(log).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    log.mockRestore();
    debug.mockRestore();
  });
});
