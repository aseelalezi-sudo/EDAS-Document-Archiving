import { Controller, ForbiddenException, Get, Headers, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { Public } from "../../common/auth/public.decorator";
import { MetricsService } from "../../common/metrics/metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async scrape(@Headers("authorization") authorization: string | undefined, @Res() response: Response) {
    const token = this.config.get<string>("METRICS_TOKEN")?.trim();
    if (token) {
      if (authorization !== `Bearer ${token}`) throw new UnauthorizedException("Invalid metrics token");
    } else if (this.config.get<string>("NODE_ENV") === "production") {
      throw new ForbiddenException("Metrics endpoint is disabled");
    }

    const body = await this.metrics.scrape();
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.status(200).send(body);
  }
}
