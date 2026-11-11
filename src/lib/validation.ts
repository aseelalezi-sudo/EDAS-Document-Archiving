export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_RE = /^[a-z0-9.-]+$/i;
export const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function validators(t: Translate) {
  const required = (value: string) => (value.trim() ? undefined : t("val.required"));
  const minLen = (n: number) => (value: string) => (value.trim().length >= n ? undefined : t("val.minLen", { n }));
  const email = (value: string) => (!value.trim() || EMAIL_RE.test(value) ? undefined : t("val.email"));
  const username = (value: string) => (!value.trim() || USERNAME_RE.test(value) ? undefined : t("val.username"));
  const phone = (value: string) => (!value.trim() || PHONE_RE.test(value) ? undefined : t("val.phone"));
  return { required, minLen, email, username, phone };
}
