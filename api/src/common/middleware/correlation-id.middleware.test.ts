import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "./correlation-id.middleware";
import { currentLogContext } from "../logging/log-context";

function run(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; path: string; method: string; correlationId?: string } = {
    headers,
    path: "/api/v1/documents",
    method: "GET",
  };
  const headersOut: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => (headersOut[name] = value) };
  let seen: ReturnType<typeof currentLogContext>;
  const next = vi.fn(() => {
    seen = currentLogContext();
  });
  correlationIdMiddleware(request as never, response as never, next);
  return { request, headersOut, next, seen: () => seen };
}

describe("correlationIdMiddleware", () => {
  it("reuses a caller-provided correlation id", () => {
    const { request, headersOut, seen } = run({ "x-correlation-id": "caller-42" });

    expect(request).toMatchObject({ correlationId: "caller-42" });
    expect(headersOut["x-correlation-id"]).toBe("caller-42");
    expect(headersOut["x-trace-id"]).toMatch(/^[0-9a-f]{32}$/);
    expect(headersOut.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(seen()).toMatchObject({
      correlationId: "caller-42",
      traceId: headersOut["x-trace-id"],
      method: "GET",
      path: "/api/v1/documents",
    });
  });

  it("generates an id when the caller sends none", () => {
    const { request, headersOut, seen } = run({});

    expect(request).toMatchObject({ correlationId: expect.any(String) });
    expect(headersOut["x-correlation-id"]).toBe(request.correlationId);
    expect(seen()?.correlationId).toBe(headersOut["x-correlation-id"]);
    expect(seen()?.traceId).toBe(headersOut["x-trace-id"]);
  });

  it("continues a valid traceparent instead of starting a new trace", () => {
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const { headersOut, seen } = run({ traceparent });

    expect(headersOut["x-trace-id"]).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(headersOut.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
    expect(seen()).toMatchObject({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736" });
  });
});
