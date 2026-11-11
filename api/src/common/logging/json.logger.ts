import type { LoggerService } from "@nestjs/common";
import { currentLogContext } from "./log-context";

export type LogLevel = "error" | "warn" | "log" | "debug" | "verbose";

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, log: 2, debug: 3, verbose: 4 };

const LEVELS = Object.keys(LEVEL_WEIGHT) as LogLevel[];

export type LogSink = Pick<Console, "log" | "warn" | "error">;

export function resolveLogLevel(value: string | undefined, fallback: LogLevel = "log"): LogLevel {
  const normalized = value?.trim().toLowerCase();
  return LEVELS.find((level) => level === normalized) ?? fallback;
}

function serialize(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (typeof value === "undefined") return null;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function splitContext(args: unknown[]): { messages: unknown[]; context?: string } {
  if (args.length <= 1) return { messages: args };
  const last = args[args.length - 1];
  if (typeof last !== "string") return { messages: args };
  return { messages: args.slice(0, -1), context: last };
}

function isStack(value: unknown): boolean {
  return typeof value === "string" && (value.includes("\n    at ") || value.startsWith("Error:"));
}

export class JsonLogger implements LoggerService {
  constructor(
    private readonly threshold: LogLevel = "log",
    private readonly sink: LogSink = console,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("log", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("verbose", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[this.threshold];
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (!this.enabled(level)) return;

    const { messages, context } = splitContext([message, ...optionalParams]);
    const [head, ...rest] = messages;
    const stack = head instanceof Error ? head.stack : rest.find(isStack);
    const params = rest.filter((value) => value !== stack && value !== undefined);

    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      message: head instanceof Error ? head.message : serialize(head),
    };
    if (context) record.context = context;
    if (params.length > 0) record.params = params.map(serialize);
    if (stack) record.stack = stack;

    const ctx = currentLogContext();
    if (ctx) {
      record.correlationId = ctx.correlationId;
      if (ctx.userId) record.userId = ctx.userId;
      if (ctx.method) record.method = ctx.method;
      if (ctx.route) record.route = ctx.route;
      else if (ctx.path) record.path = ctx.path;
    }

    const line = JSON.stringify(record, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    if (level === "error") this.sink.error(line);
    else if (level === "warn") this.sink.warn(line);
    else this.sink.log(line);
  }
}
