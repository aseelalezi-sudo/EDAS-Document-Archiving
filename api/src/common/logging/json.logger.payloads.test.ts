import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonLogger } from "./json.logger";

function capture() {
  const lines: { stream: "log" | "warn" | "error"; raw: string }[] = [];
  const sink = {
    log: (raw: string) => lines.push({ stream: "log", raw }),
    warn: (raw: string) => lines.push({ stream: "warn", raw }),
    error: (raw: string) => lines.push({ stream: "error", raw }),
  };
  const logger = new JsonLogger("verbose", sink);
  return { logger, lines, parse: () => lines.map((line) => JSON.parse(line.raw) as Record<string, unknown>) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JsonLogger payload handling", () => {
  it("serialises an error passed as a parameter instead of losing it", () => {
    const { logger, parse } = capture();

    logger.log("conversion failed", new Error("boom"), "PreviewService");

    const [record] = parse();
    expect(record.context).toBe("PreviewService");
    expect(record.params).toEqual([{ name: "Error", message: "boom", stack: expect.any(String) }]);
  });

  it("falls back to String when a parameter cannot be serialised as JSON", () => {
    const { logger, parse } = capture();
    const circular: Record<string, unknown> = { name: "cycle" };
    circular.self = circular;

    logger.log("received", circular, "DocumentsService");

    const [record] = parse();
    expect(record.params).toEqual(["[object Object]"]);
  });

  it("lifts a stack string handed over as a parameter into the stack field", () => {
    const { logger, parse } = capture();
    const stack = "Error: upstream timeout\n    at handler (/srv/app.js:10:3)";

    logger.warn("retrying", stack, "ReportsService");

    const [record] = parse();
    expect(record.stack).toBe(stack);
    expect(record.params).toBeUndefined();
  });

  it("writes fatal records through the error stream", () => {
    const { logger, lines, parse } = capture();

    logger.fatal("cannot continue", "Bootstrap");

    expect(lines[0].stream).toBe("error");
    expect(parse()[0]).toMatchObject({ level: "error", message: "cannot continue", context: "Bootstrap" });
  });

  it("normalises undefined parameters to null", () => {
    const { logger, parse } = capture();

    logger.debug("probe", undefined, "Health");

    expect(parse()[0].params).toBeUndefined();
  });

  it("keeps the logger quiet at the default level for verbose chatter", () => {
    const sink = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = new JsonLogger(undefined, sink);

    logger.verbose("noise", "Test");
    logger.debug("noise", "Test");
    logger.log("kept", "Test");

    expect(sink.log).toHaveBeenCalledOnce();
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });
});
