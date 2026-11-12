import { EventEmitter } from "node:events";
import type { ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { MetricsInterceptor } from "./metrics.interceptor";
import { MetricsService } from "./metrics.service";

const build = () => new MetricsService();

describe("MetricsService", () => {
  it("exposes HTTP counters, the duration histogram and Node defaults", async () => {
    const metrics = build();
    metrics.requests.inc({ method: "GET", route: "/documents", status: "200" });
    metrics.duration.observe({ method: "GET", route: "/documents", status: "200" }, 0.12);

    const text = await metrics.scrape();

    expect(text).toContain('edas_http_requests_total{method="GET",route="/documents",status="200"} 1');
    expect(text).toContain('edas_http_request_duration_seconds_bucket{le="0.25",method="GET",route="/documents",status="200"} 1');
    expect(text).toContain("edas_process_cpu_user_seconds_total");
  });
});

describe("MetricsInterceptor", () => {
  it("records the route, status, duration and in-flight gauge", async () => {
    const metrics = build();
    const interceptor = new MetricsInterceptor(metrics);
    const response = Object.assign(new EventEmitter(), { statusCode: 201 }) as unknown as Response & EventEmitter;
    const request = { method: "POST", route: { path: "/documents" } };
    const context = {
      getType: () => "http",
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, { handle: () => of({ ok: true }) }).subscribe({
        complete: () => {
          response.emit("finish");
          resolve();
        },
      });
    });

    const text = await metrics.scrape();
    expect(text).toContain('edas_http_requests_total{method="POST",route="/documents",status="201"} 1');
    expect(text).toContain("edas_http_requests_in_flight 0");
  });

  it("labels unmatched requests instead of leaking the raw path", async () => {
    const metrics = build();
    const interceptor = new MetricsInterceptor(metrics);
    const response = Object.assign(new EventEmitter(), { statusCode: 404 }) as unknown as Response & EventEmitter;
    const request = { method: "GET", route: undefined };
    const context = {
      getType: () => "http",
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, { handle: () => of(undefined) }).subscribe({
        complete: () => {
          response.emit("close");
          resolve();
        },
      });
    });

    expect(await metrics.scrape()).toContain('edas_http_requests_total{method="GET",route="unmatched",status="404"} 1');
  });

  it("passes a non-HTTP context through without timing it", async () => {
    const metrics = build();
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => "rpc",
      switchToHttp: () => {
        throw new Error("should not switch to http");
      },
    } as unknown as ExecutionContext;

    const result = interceptor.intercept(context, { handle: () => of(null) });

    expect(result).toBeDefined();
    expect(await metrics.scrape()).not.toContain("edas_http_requests_total{");
  });

  it("records one sample when the response reports both finish and close", async () => {
    const metrics = build();
    const interceptor = new MetricsInterceptor(metrics);
    const response = Object.assign(new EventEmitter(), { statusCode: 500 }) as unknown as Response & EventEmitter;
    const request = { method: "PATCH", route: { path: "/documents/:id" } };
    const context = {
      getType: () => "http",
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, { handle: () => of(undefined) }).subscribe({
        complete: () => {
          response.emit("finish");
          response.emit("close");
          resolve();
        },
      });
    });

    const text = await metrics.scrape();
    expect(text).toContain('edas_http_requests_total{method="PATCH",route="/documents/:id",status="500"} 1');
    expect(text).not.toContain('method="PATCH",route="/documents/:id",status="500"} 2');
    expect(text).toContain("edas_http_requests_in_flight 0");
  });
});
