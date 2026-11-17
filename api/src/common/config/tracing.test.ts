import { beforeEach, describe, expect, it, vi } from "vitest";

const start = vi.fn();
const shutdown = vi.fn();
const exporter = vi.fn();
const http = vi.fn();
const express = vi.fn();

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn(function (this: unknown, config: unknown) {
    exporter(config);
    return { start, shutdown };
  }),
}));
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
}));
vi.mock("@opentelemetry/instrumentation-http", () => ({
  HttpInstrumentation: vi.fn(function () {
    return http();
  }),
}));
vi.mock("@opentelemetry/instrumentation-express", () => ({
  ExpressInstrumentation: vi.fn(function () {
    return express();
  }),
}));

import { startTracing, tracesUrl, tracingEndpoint } from "./tracing";

describe("tracing configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    start.mockReset();
  });

  it("stays disabled without an OTLP endpoint", () => {
    expect(tracingEndpoint({})).toBeUndefined();
    expect(startTracing({})).toBeUndefined();
    expect(exporter).not.toHaveBeenCalled();
  });

  it("normalizes the OTLP traces URL", () => {
    expect(tracesUrl("http://collector:4318")).toBe("http://collector:4318/v1/traces");
    expect(tracesUrl("http://collector:4318/")).toBe("http://collector:4318/v1/traces");
    expect(tracesUrl("http://collector:4318/v1/traces")).toBe("http://collector:4318/v1/traces");
  });

  it("starts the SDK with the configured service name", () => {
    const sdk = startTracing({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318", OTEL_SERVICE_NAME: "edas-test" });

    expect(sdk).toEqual({ start, shutdown });
    expect(start).toHaveBeenCalledTimes(1);
    expect(exporter).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "edas-test",
        traceExporter: { options: { url: "http://collector:4318/v1/traces" } },
      }),
    );
  });

  it("defaults the service name and reports startup failures without crashing", () => {
    start.mockImplementationOnce(() => {
      throw new Error("collector down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(startTracing({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" })).toBeUndefined();
    expect(spy).toHaveBeenCalledWith("OpenTelemetry failed to start", expect.any(Error));
    expect(exporter).toHaveBeenLastCalledWith(expect.objectContaining({ serviceName: "edas-api" }));
    spy.mockRestore();
  });
});
