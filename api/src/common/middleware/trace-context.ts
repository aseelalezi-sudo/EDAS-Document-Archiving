import { randomBytes } from "node:crypto";
import { trace } from "@opentelemetry/api";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  sampled: boolean;
}

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

function nonZero(value: string): boolean {
  return /[1-9a-f]/.test(value);
}

export function parseTraceparent(value: unknown): TraceContext | null {
  if (typeof value !== "string") return null;
  const match = TRACEPARENT.exec(value.trim().toLowerCase());
  if (!match) return null;
  const [, version, traceId, parentSpanId, flags] = match;
  if (version !== "00" || !nonZero(traceId) || !nonZero(parentSpanId)) return null;
  return {
    traceId,
    spanId: randomBytes(8).toString("hex"),
    parentSpanId,
    sampled: (Number.parseInt(flags, 16) & 0x01) === 0x01,
  };
}

export function newTraceContext(): TraceContext {
  return {
    traceId: randomBytes(16).toString("hex"),
    spanId: randomBytes(8).toString("hex"),
    parentSpanId: null,
    sampled: true,
  };
}

export function activeTraceContext(): TraceContext | undefined {
  const span = trace.getActiveSpan()?.spanContext();
  if (!span || !nonZero(span.traceId) || !nonZero(span.spanId)) return undefined;
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: null,
    sampled: (span.traceFlags & 0x01) === 0x01,
  };
}

export function traceContextFromHeader(value: unknown): TraceContext {
  return activeTraceContext() ?? parseTraceparent(value) ?? newTraceContext();
}

export function traceparentHeader(trace: TraceContext): string {
  return `00-${trace.traceId}-${trace.spanId}-${trace.sampled ? "01" : "00"}`;
}
