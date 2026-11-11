import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { arabicReason } from "../errors/error-reasons-ar";
import type { CorrelatedRequest } from "../middleware/correlation-id.middleware";

interface ErrorBody {
  code: string;
  message: string;
  messageAr: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_ERROR",
  429: "TOO_MANY_REQUESTS",
};

function codeForStatus(status: number): string {
  return STATUS_CODES[status] ?? (status >= 500 ? "INTERNAL_ERROR" : `HTTP_${status}`);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<CorrelatedRequest>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ErrorBody = { code: codeForStatus(status), message: "Internal server error", messageAr: "" };

    if (status === HttpStatus.UNAUTHORIZED) {
      body.message = "Authentication required";
    } else if (status === HttpStatus.FORBIDDEN) {
      body.message = "Insufficient permissions";
    } else if (status === HttpStatus.NOT_FOUND) {
      body.message = "Resource not found";
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        body.message = payload;
      } else if (payload && typeof payload === "object") {
        const record = payload as { message?: string | string[]; error?: string; code?: string };
        if (Array.isArray(record.message)) {
          body.code = "VALIDATION_ERROR";
          body.message = "Validation failed";
          body.details = record.message;
        } else if (typeof record.message === "string") {
          body.message = record.message;
          if (record.code) body.code = record.code;
        }
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (status >= 400 && status < 500) {
      const target = [request.method, request.path].filter(Boolean).join(" ");
      this.logger.debug(`${status} ${body.code} ${body.message}${target ? ` ${target}` : ""}`);
    }

    body.messageAr = arabicReason(body.message, status);
    response.status(status).json({ error: body, correlationId: request.correlationId ?? null });
  }
}
