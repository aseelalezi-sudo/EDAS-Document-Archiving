export type TrustProxySetting = number | boolean | string;

export function resolveTrustProxy(value: string | undefined): TrustProxySetting {
  const raw = String(value ?? "").trim();
  if (!raw) return 1;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
