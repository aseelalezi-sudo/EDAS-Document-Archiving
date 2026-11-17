import { describe, expect, it } from "vitest";
import { newTraceContext, parseTraceparent, traceContextFromHeader, traceparentHeader } from "./trace-context";

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
});
