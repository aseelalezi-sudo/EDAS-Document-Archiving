export const SESSION_COOKIE = "edas_session";
export const CSRF_COOKIE = "edas_csrf";
export const LOGIN_COOKIE = "edas_login";
export const CSRF_HEADER = "x-csrf-token";

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Parses a raw Cookie header into a name/value map without pulling in a middleware dependency. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

export function readCookie(header: string | undefined, name: string): string | null {
  return parseCookies(header)[name] ?? null;
}
