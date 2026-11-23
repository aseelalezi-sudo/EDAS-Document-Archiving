import type { ProfileDto } from "@edas/shared";
import { config } from "../config";
import { clearUserPersistedState } from "../utils/persist";
import { apiRequest } from "./api-client";

/**
 * The browser never holds a token: the API runs the OIDC flow, keeps the tokens server-side and gives
 * this app an opaque httpOnly session cookie. These helpers only talk to that cookie-based flow.
 */
export function beginLogin(returnTo = "/dashboard"): string {
  const base = (config.apiBaseUrl ?? "").replace(/\/$/, "");
  const target = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  return `${base}/api/v1/auth/login?returnTo=${encodeURIComponent(target)}`;
}

const CSRF_COOKIE = "edas_csrf";

function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => {
    const cookie = part.trim();
    return cookie.startsWith(`${CSRF_COOKIE}=`) && cookie.length > CSRF_COOKIE.length + 1;
  });
}

export async function restoreSession(): Promise<ProfileDto | null> {
  if (!hasSessionHint()) return null;
  try {
    return await apiRequest<ProfileDto>("/auth/me");
  } catch {
    return null;
  }
}

export function clearSession(): void {
  clearUserPersistedState();
}

export async function endSession(): Promise<string | null> {
  clearUserPersistedState();
  try {
    const { logoutUrl } = await apiRequest<{ logoutUrl: string }>("/auth/logout", { method: "POST", body: {} });
    return logoutUrl ?? null;
  } catch {
    return null;
  }
}
