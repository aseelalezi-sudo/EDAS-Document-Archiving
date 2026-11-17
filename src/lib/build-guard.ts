export const API_BUILD_VARS = ["VITE_API_URL", "VITE_OIDC_ISSUER", "VITE_OIDC_CLIENT_ID"] as const;

export function missingApiConfig(env: Record<string, string | undefined>): string[] {
  return API_BUILD_VARS.filter((key) => !String(env[key] ?? "").trim());
}
