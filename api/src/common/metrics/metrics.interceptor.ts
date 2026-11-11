import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { Observable } from "rxjs";
import { MetricsService } from "./metrics.service";

interface RouteRequest {
  method: string;
  route?: { path?: string };
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RouteRequest>();
    const response = http.getResponse<Response>();
    const method = request.method;
    const route = request.route?.path ? String(request.route.path) : "unmatched";
    const startedAt = process.hrtime.bigint();

    this.metrics.inFlight.inc();
    let recorded = false;
    const record = (): void => {
      if (recorded) return;
      recorded = true;
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const status = String(response.statusCode);
      this.metrics.inFlight.dec();
      this.metrics.requests.inc({ method, route, status });
      this.metrics.duration.observe({ method, route, status }, seconds);
    };

    response.once("finish", record);
    response.once("close", record);

    return next.handle();
  }
}
