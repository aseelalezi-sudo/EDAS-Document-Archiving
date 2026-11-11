export interface OidcSettings {
  issuer?: string;
  clientId?: string;
  scopes: string;
}

export interface AppConfig {
  apiBaseUrl?: string;
  oidc: OidcSettings;
  useApi: boolean;
}

function readEnv(key: string): string | undefined {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const value = env[key];
  return value && value.length > 0 ? value : undefined;
}

const apiBaseUrl = readEnv("VITE_API_URL");
const oidc: OidcSettings = {
  issuer: readEnv("VITE_OIDC_ISSUER"),
  clientId: readEnv("VITE_OIDC_CLIENT_ID"),
  scopes: readEnv("VITE_OIDC_SCOPES") ?? "openid profile email",
};

export const config: AppConfig = {
  apiBaseUrl,
  oidc,
  useApi: Boolean(apiBaseUrl) && Boolean(oidc.issuer) && Boolean(oidc.clientId),
};
