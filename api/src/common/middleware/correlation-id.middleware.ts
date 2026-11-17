import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithLogContext } from "../logging/log-context";
import { traceContextFromHeader, traceparentHeader, type TraceContext } from "./trace-context";

export interface CorrelatedRequest extends Request {
  correlationId?: string;
  traceContext?: TraceContext;
}

export function correlationIdMiddleware(req: CorrelatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers["x-correlation-id"];
  const id = typeof header === "string" && header.length > 0 ? header : randomUUID();
  const trace = traceContextFromHeader(req.headers.traceparent);
  req.correlationId = id;
  req.traceContext = trace;
  res.setHeader("x-correlation-id", id);
  res.setHeader("x-trace-id", trace.traceId);
  res.setHeader("traceparent", traceparentHeader(trace));
  runWithLogContext(
    {
      correlationId: id,
      traceId: trace.traceId,
      spanId: trace.spanId,
      method: req.method,
      path: req.path,
    },
    next,
  );
}
