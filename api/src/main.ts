import { tracing } from "./tracing";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { correlationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { resolveTrustProxy } from "./common/config/trust-proxy";
import { JsonLogger, resolveLogLevel } from "./common/logging/json.logger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new JsonLogger(resolveLogLevel(config.get("LOG_LEVEL")));
  app.useLogger(logger);

  app.set("trust proxy", resolveTrustProxy(config.get<string>("TRUST_PROXY")));
  app.setGlobalPrefix("api/v1");
  app.use(correlationIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  const bodyLimit = config.get<string>("BODY_LIMIT", "2mb");
  app.useBodyParser("json", { limit: bodyLimit });
  app.useBodyParser("urlencoded", { limit: bodyLimit, extended: true });
  app.enableCors({
    origin: config
      .get<string>("CORS_ORIGINS", "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableShutdownHooks();

  const port = Number(config.get("PORT", 4000));
  await app.listen(port, "0.0.0.0");
  logger.log(`EDAS API ready on http://localhost:${port}/api/v1`, "Bootstrap");

  const shutdownTracing = (): void => {
    void tracing?.shutdown().catch((error: unknown) => logger.error(error, "Tracing"));
  };
  process.once("SIGTERM", shutdownTracing);
  process.once("SIGINT", shutdownTracing);
}

void bootstrap();
