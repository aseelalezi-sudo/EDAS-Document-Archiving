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

    runWithLogContext({ correlationId: "corr-9", userId: "user-3", method: "GET", path: "/api/v1/documents" }, () =>
      logger.log("fetched", "DocumentsService"),
    );

    expect(parse()[0]).toMatchObject({
      correlationId: "corr-9",
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
});
