import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";

/** Absolute API origin for links the browser opens directly; API_PUBLIC_URL wins over the request headers. */
export function publicOrigin(request: Request, config: ConfigService): string {
  const configured = (config.get<string>("API_PUBLIC_URL") ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.protocol;
  return `${protocol}://${request.get("host") ?? "localhost"}`;
}
