import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { MetricsService } from "../../common/metrics/metrics.service";
import { MetricsController } from "./metrics.controller";

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
}

function response() {
  const res = {
    status: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & typeof res;
}

describe("MetricsController", () => {
  const metrics = () => new MetricsService();

  it("serves the Prometheus text format when no token is configured outside production", async () => {
    const res = response();
    const controller = new MetricsController(metrics(), config({ NODE_ENV: "development" }));

    await controller.scrape(undefined, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    expect(String(res.end.mock.calls[0][0])).toContain("edas_http_requests_total");
  });

  it("requires the configured bearer token", async () => {
    const controller = new MetricsController(metrics(), config({ METRICS_TOKEN: "t".repeat(32) }));

    await expect(controller.scrape(undefined, response())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.scrape("Bearer wrong", response())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses to expose metrics in production when no token is set", async () => {
    const controller = new MetricsController(metrics(), config({ NODE_ENV: "production" }));

    await expect(controller.scrape(undefined, response())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
