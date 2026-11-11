import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithLogContext } from "../logging/log-context";

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

export function correlationIdMiddleware(req: CorrelatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers["x-correlation-id"];
  const id = typeof header === "string" && header.length > 0 ? header : randomUUID();
  req.correlationId = id;
  res.setHeader("x-correlation-id", id);
  runWithLogContext({ correlationId: id, method: req.method, path: req.path }, next);
}
