import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "./prisma.service";

function build() {
  const service = new PrismaService();
  const connect = vi.spyOn(service, "$connect").mockResolvedValue();
  const disconnect = vi.spyOn(service, "$disconnect").mockResolvedValue();
  const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  return { service, connect, disconnect, log };
}

describe("PrismaService lifecycle", () => {
  it("connects once on module init and announces the database", async () => {
    const { service, connect, log } = build();

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Connected to PostgreSQL");
  });

  it("disconnects on module destroy", async () => {
    const { service, disconnect } = build();

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
