import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { Observable } from "rxjs";
import type { CorrelatedRequest } from "../middleware/correlation-id.middleware";
import { currentLogContext } from "./log-context";

interface RequestWithUser extends CorrelatedRequest {
  user?: { sub?: string };
}

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const store = currentLogContext();
    if (store) {
      if (request.user?.sub) store.userId = request.user.sub;
      if (request.route?.path) store.route = request.route.path;
    }

    let logged = false;
    const record = (): void => {
      if (logged) return;
      logged = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = request.path ?? request.originalUrl ?? "";
      const line = `${request.method} ${path} ${response.statusCode} ${durationMs.toFixed(1)}ms`;
      if (path.includes("/health")) this.logger.debug(line);
      else if (response.statusCode >= 500) this.logger.error(line);
      else if (response.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    };

    response.once("finish", record);
    response.once("close", record);

    return next.handle();
  }
}
