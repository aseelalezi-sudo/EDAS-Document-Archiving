import { describe, expect, it } from "vitest";
import { JsonLogger, resolveLogLevel } from "./json.logger";
import { runWithLogContext } from "./log-context";

function capture(threshold?: "error" | "warn" | "log" | "debug" | "verbose") {
  const lines: { stream: "log" | "warn" | "error"; raw: string }[] = [];
  const sink = {
    log: (raw: string) => lines.push({ stream: "log", raw }),
    warn: (raw: string) => lines.push({ stream: "warn", raw }),
    error: (raw: string) => lines.push({ stream: "error", raw }),
  };
  const logger = new JsonLogger(threshold, sink);
  return { logger, lines, parse: () => lines.map((line) => JSON.parse(line.raw) as Record<string, unknown>) };
}

describe("JsonLogger", () => {
  it("writes one JSON object per line with time, level, message and context", () => {
    const { logger, parse } = capture();

    logger.log("server started", "Bootstrap");

    const [record] = parse();
    expect(record).toMatchObject({ level: "log", message: "server started", context: "Bootstrap" });
    expect(typeof record.time).toBe("string");
    expect(Number.isNaN(Date.parse(String(record.time)))).toBe(false);
  });

  it("attaches the correlation context of the current request", () => {
    const { logger, parse } = capture();

    runWithLogContext(
      {
        correlationId: "corr-9",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        userId: "user-3",
        method: "GET",
        path: "/api/v1/documents",
      },
      () => logger.log("fetched", "DocumentsService"),
    );

    expect(parse()[0]).toMatchObject({
      correlationId: "corr-9",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      userId: "user-3",
      method: "GET",
      path: "/api/v1/documents",
    });
  });

  it("drops records below the configured threshold", () => {
    const { logger, lines } = capture("warn");

    logger.verbose("noisy", "Test");
    logger.debug("also noisy", "Test");
    logger.log("still noisy", "Test");
    logger.warn("careful", "Test");

    expect(lines).toHaveLength(1);
    expect(lines[0].stream).toBe("warn");
  });

  it("keeps the stack of errors and writes them to stderr", () => {
    const { logger, lines, parse } = capture("error");

    logger.error(new Error("database down"), "PrismaService");

    expect(lines[0].stream).toBe("error");
    const [record] = parse();
    expect(record.message).toBe("database down");
    expect(String(record.stack)).toContain("database down");
  });

  it("serializes object payloads instead of dropping them", () => {
    const { logger, parse } = capture();

    logger.log({ documentId: "doc-1", size: 12 }, "DocumentsService");

    expect(parse()[0].message).toEqual({ documentId: "doc-1", size: 12 });
  });

  it("falls back to the default level for unknown values", () => {
    expect(resolveLogLevel("DEBUG")).toBe("debug");
    expect(resolveLogLevel("nonsense")).toBe("log");
    expect(resolveLogLevel(undefined, "warn")).toBe("warn");
  });

  it("writes a lone message without a context", () => {
    const { logger, parse } = capture();

    logger.log("bare");

    const [record] = parse();
    expect(record).toMatchObject({ level: "log", message: "bare" });
    expect(record.context).toBeUndefined();
  });

  it("keeps a trailing payload as a parameter instead of a context", () => {
    const { logger, parse } = capture();

    logger.log("failed", { attempt: 2 });

    const [record] = parse();
    expect(record.context).toBeUndefined();
    expect(record.params).toEqual([{ attempt: 2 }]);
  });

  it("moves a stack-looking parameter into the stack field", () => {
    const { logger, parse } = capture();

    logger.log("retrying", "Error: upstream refused", "Gateway");

    const [record] = parse();
    expect(record.stack).toBe("Error: upstream refused");
    expect(record.params).toBeUndefined();
  });

  it("serializes an undefined head as null", () => {
    const { logger, parse } = capture();

    logger.log(undefined, "Bootstrap");

    expect(parse()[0].message).toBeNull();
  });

  it("drops user, method and path when the context only carries a correlation id", () => {
    const { logger, parse } = capture();

    runWithLogContext({ correlationId: "corr-1" }, () => logger.log("quiet"));

    const [record] = parse();
    expect(record.correlationId).toBe("corr-1");
    expect(record.userId).toBeUndefined();
    expect(record.method).toBeUndefined();
    expect(record.path).toBeUndefined();
    expect(record.route).toBeUndefined();
  });

  it("prefers the matched route over the raw path", () => {
    const { logger, parse } = capture();

    runWithLogContext({ correlationId: "corr-2", route: "GET /api/v1/documents/:id", path: "/api/v1/documents/42" }, () =>
      logger.log("routed"),
    );

    const [record] = parse();
    expect(record.route).toBe("GET /api/v1/documents/:id");
    expect(record.path).toBeUndefined();
  });

  it("omits the stack field when only a plain string is given", () => {
    const { logger, parse } = capture();

    logger.log("plain", "Done");

    expect(parse()[0].stack).toBeUndefined();
  });

  it("serializes an Error and a BigInt parameter", () => {
    const { logger, parse } = capture();

    logger.log("retrying", new Error("socket closed"), 10n, "Gateway");

    const [record] = parse();
    expect(record.params).toEqual([{ name: "Error", message: "socket closed", stack: expect.any(String) }, "10"]);
  });

  it("writes fatal messages to the error sink", () => {
    const { logger, lines, parse } = capture();

    logger.fatal("process exiting", "Bootstrap");

    expect(lines[0].stream).toBe("error");
    expect(parse()[0]).toMatchObject({ level: "error", message: "process exiting", context: "Bootstrap" });
  });
});
