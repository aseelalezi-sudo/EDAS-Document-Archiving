export interface CspOptions {
  apiOrigin?: string;
  allowInline?: boolean;
}

export function cspApiOrigin(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function buildCsp({ apiOrigin, allowInline = false }: CspOptions = {}): string {
  const inline = allowInline ? " 'unsafe-inline'" : "";
  const connect = apiOrigin ? `'self' ${apiOrigin}` : "'self'";
  return [
    "default-src 'self'",
    `script-src 'self'${inline}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
