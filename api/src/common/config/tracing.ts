import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export function tracingEndpoint(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return endpoint ? endpoint : undefined;
}

export function tracesUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return base.endsWith("/v1/traces") ? base : `${base}/v1/traces`;
}

export function startTracing(env: NodeJS.ProcessEnv = process.env): NodeSDK | undefined {
  const endpoint = tracingEndpoint(env);
  if (!endpoint) return undefined;
  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME?.trim() || "edas-api",
    textMapPropagator: new W3CTraceContextPropagator(),
    traceExporter: new OTLPTraceExporter({ url: tracesUrl(endpoint) }),
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  });
  try {
    sdk.start();
    return sdk;
  } catch (error) {
    console.error("OpenTelemetry failed to start", error);
    return undefined;
  }
}
