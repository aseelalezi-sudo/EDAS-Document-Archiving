import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly requests = new Counter({
    name: "edas_http_requests_total",
    help: "HTTP requests handled by the API, by method, route and status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  readonly duration = new Histogram({
    name: "edas_http_request_duration_seconds",
    help: "HTTP request duration in seconds, by method, route and status.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly inFlight = new Gauge({
    name: "edas_http_requests_in_flight",
    help: "HTTP requests currently being handled.",
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "edas_" });
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
