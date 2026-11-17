import { describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import { activeTraceContext, newTraceContext, parseTraceparent, traceContextFromHeader, traceparentHeader } from "./trace-context";

const VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("W3C trace context", () => {
  it("accepts a valid traceparent and keeps the incoming trace id", () => {
    const trace = parseTraceparent(VALID);

    expect(trace).toMatchObject({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
    });
    expect(trace?.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects malformed, all-zero, unsupported and missing headers", () => {
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
    expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });

  it("generates a sampled root trace when the header is absent", () => {
    const trace = traceContextFromHeader(undefined);

    expect(trace.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(trace.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(trace.sampled).toBe(true);
    expect(traceparentHeader(trace)).toBe(`00-${trace.traceId}-${trace.spanId}-01`);
  });

  it("creates fresh ids on each call", () => {
    expect(newTraceContext().traceId).not.toBe(newTraceContext().traceId);
  });

  it("prefers the active OpenTelemetry span so logs match exported traces", () => {
    const getActiveSpan = vi.spyOn(trace, "getActiveSpan").mockReturnValue({
      spanContext: () => ({
        traceId: "119b12f27e6022a4ecdfee88c44e1059",
        spanId: "2b6ba78b115f5a58",
        traceFlags: 1,
      }),
    } as never);

    expect(activeTraceContext()).toMatchObject({
      traceId: "119b12f27e6022a4ecdfee88c44e1059",
      spanId: "2b6ba78b115f5a58",
      sampled: true,
    });
    expect(traceContextFromHeader(undefined)).toMatchObject({ traceId: "119b12f27e6022a4ecdfee88c44e1059" });
    getActiveSpan.mockRestore();
  });

  it("ignores an empty active span context", () => {
    const getActiveSpan = vi.spyOn(trace, "getActiveSpan").mockReturnValue({
      spanContext: () => ({ traceId: "00000000000000000000000000000000", spanId: "0000000000000000", traceFlags: 0 }),
    } as never);

    expect(activeTraceContext()).toBeUndefined();
    getActiveSpan.mockRestore();
  });
});
