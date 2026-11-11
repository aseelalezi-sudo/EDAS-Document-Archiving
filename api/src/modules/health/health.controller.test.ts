import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

function build(queryRaw = vi.fn().mockResolvedValue([{ "?column?": 1 }])) {
  return { controller: new HealthController({ $queryRaw: queryRaw } as never), queryRaw };
}

describe("HealthController", () => {
  it("reports liveness with the process uptime", () => {
    const { controller } = build();

    const body = controller.live();

    expect(body.status).toBe("ok");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("reports readiness once the database answers", async () => {
    const { controller, queryRaw } = build();

    await expect(controller.ready()).resolves.toEqual({ status: "ready", database: "up" });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the database does not answer", async () => {
    const { controller } = build(vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
