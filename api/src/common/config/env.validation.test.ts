import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const PRODUCTION = {
  NODE_ENV: "production",
  PORT: "4000",
  DATABASE_URL: "postgresql://user:strong-db-password@db:5432/edas",
  KEYCLOAK_ISSUER: "https://id.example.com/realms/edas",
  KEYCLOAK_AUDIENCE: "edas-api",
  KEYCLOAK_ADMIN: "admin",
  KEYCLOAK_ADMIN_PASSWORD: "a-strong-admin-password",
  MINIO_ENDPOINT: "minio",
  MINIO_BUCKET: "edas",
  MINIO_ACCESS_KEY: "key",
  MINIO_SECRET_KEY: "a-strong-minio-secret",
  CORS_ORIGINS: "https://app.example.com",
  SESSION_SECRET: "a".repeat(32),
};

describe("validateEnv", () => {
  it("allows development defaults but rejects an invalid port", () => {
    expect(validateEnv({ NODE_ENV: "development" }).NODE_ENV).toBe("development");
    expect(() => validateEnv({ NODE_ENV: "development", PORT: "abc" })).toThrow(/PORT/);
  });

  it("requires the production dependencies", () => {
    expect(() => validateEnv({ NODE_ENV: "production", PORT: "4000" })).toThrow(/Missing required production environment variables/);
  });

  it("rejects unknown log levels instead of silently falling back", () => {
    expect(validateEnv({ NODE_ENV: "development", LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
    expect(() => validateEnv({ NODE_ENV: "development", LOG_LEVEL: "silly" })).toThrow(/LOG_LEVEL/);
  });

  it("rejects wildcard CORS origins in production", () => {
    expect(() => validateEnv({ ...PRODUCTION, CORS_ORIGINS: "https://app.example.com,*" })).toThrow(/explicit origins/);
  });

  it("rejects plain-http origins in production", () => {
    expect(() => validateEnv({ ...PRODUCTION, CORS_ORIGINS: "http://app.example.com" })).toThrow(/https:\/\//);
    expect(() => validateEnv({ ...PRODUCTION, CORS_ORIGINS: "https://app.example.com,http://localhost:5173" })).toThrow(
      /http:\/\/localhost:5173/,
    );
  });

  it("rejects short sealing secrets", () => {
    expect(() => validateEnv({ ...PRODUCTION, SESSION_SECRET: "too-short" })).toThrow(/SESSION_SECRET must be at least 32/);
    expect(() => validateEnv({ ...PRODUCTION, DOWNLOAD_TICKET_SECRET: "too-short" })).toThrow(
      /DOWNLOAD_TICKET_SECRET must be at least 32/,
    );
    expect(() => validateEnv({ ...PRODUCTION, METRICS_TOKEN: "too-short" })).toThrow(/METRICS_TOKEN must be at least 32/);
  });

  it("rejects the docker-compose development credentials", () => {
    expect(() => validateEnv({ ...PRODUCTION, MINIO_SECRET_KEY: "edas_minio_dev_pw" })).toThrow(/MINIO_SECRET_KEY/);
    expect(() => validateEnv({ ...PRODUCTION, KEYCLOAK_ADMIN_PASSWORD: "admin" })).toThrow(/KEYCLOAK_ADMIN_PASSWORD/);
    expect(() =>
      validateEnv({ ...PRODUCTION, DATABASE_URL: "postgresql://edas:edas_dev_pw@db:5432/edas" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("accepts a complete production configuration", () => {
    const config = validateEnv(PRODUCTION);
    expect(config.NODE_ENV).toBe("production");
  });
});
