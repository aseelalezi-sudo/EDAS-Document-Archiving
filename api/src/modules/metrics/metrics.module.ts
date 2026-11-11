import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsInterceptor } from "../../common/metrics/metrics.interceptor";
import { MetricsService } from "../../common/metrics/metrics.service";
import { MetricsController } from "./metrics.controller";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}
