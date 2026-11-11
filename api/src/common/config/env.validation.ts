const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_AUDIENCE",
  "KEYCLOAK_ADMIN",
  "KEYCLOAK_ADMIN_PASSWORD",
  "MINIO_ENDPOINT",
  "MINIO_BUCKET",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "CORS_ORIGINS",
  "SESSION_SECRET",
];

const DEV_SECRET_VALUES = new Set(["admin", "edas_dev_pw", "edas_minio_dev_pw", "password", "changeme", "secret"]);
const PRODUCTION_SECRET_KEYS = ["KEYCLOAK_ADMIN_PASSWORD", "MINIO_SECRET_KEY"];
const SEALING_SECRET_KEYS = ["SESSION_SECRET", "DOWNLOAD_TICKET_SECRET"];
const MIN_SECRET_LENGTH = 32;
const LOG_LEVELS = new Set(["error", "warn", "log", "debug", "verbose"]);

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const port = Number(config.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port (received ${String(config.PORT)})`);
  }
  const logLevel = String(config.LOG_LEVEL ?? "")
    .trim()
    .toLowerCase();
  if (logLevel && !LOG_LEVELS.has(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${[...LOG_LEVELS].join(", ")} (received ${String(config.LOG_LEVEL)})`);
  }
  if (config.NODE_ENV !== "production") return config;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !String(config[key] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  const origins = String(config.CORS_ORIGINS)
    .split(",")
    .map((origin) => origin.trim());
  if (origins.includes("*")) {
    throw new Error("CORS_ORIGINS must list explicit origins in production");
  }
  const insecureOrigin = origins.find((origin) => !origin.startsWith("https://"));
  if (insecureOrigin) {
    throw new Error(`CORS_ORIGINS must use https:// in production (received ${insecureOrigin})`);
  }

  for (const key of SEALING_SECRET_KEYS) {
    const value = String(config[key] ?? "").trim();
    if (value && value.length < MIN_SECRET_LENGTH) {
      throw new Error(`${key} must be at least ${MIN_SECRET_LENGTH} characters in production`);
    }
  }

  const metricsToken = String(config.METRICS_TOKEN ?? "").trim();
  if (metricsToken && metricsToken.length < MIN_SECRET_LENGTH) {
    throw new Error(`METRICS_TOKEN must be at least ${MIN_SECRET_LENGTH} characters in production`);
  }

  const reusedDefaults = PRODUCTION_SECRET_KEYS.filter((key) => DEV_SECRET_VALUES.has(String(config[key]).trim().toLowerCase()));
  if (String(config.DATABASE_URL).includes("edas_dev_pw")) reusedDefaults.push("DATABASE_URL");
  if (reusedDefaults.length > 0) {
    throw new Error(`Replace the development defaults of: ${reusedDefaults.join(", ")}`);
  }

  return config;
}
