import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  live() {
    return { status: "ok", uptime: process.uptime() };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "up" };
    } catch {
      throw new ServiceUnavailableException("Database is not reachable");
    }
  }
}
