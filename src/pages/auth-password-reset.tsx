import { useState } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle2, ExternalLink, ShieldCheck, Info } from "lucide-react";
import { useApp } from "../store";
import { config } from "../config";
import { cn, Button, Field, Input } from "../components/ui";
import { AuthShell } from "./auth-login";

const CHECKS = [
  { re: /.{12,}/, key: "auth.reset.req.min" },
  { re: /[A-Z]/, key: "auth.reset.req.upper" },
  { re: /[a-z]/, key: "auth.reset.req.lower" },
  { re: /[0-9]/, key: "auth.reset.req.digit" },
  { re: /[!@#$%^&*]/, key: "auth.reset.req.symbol" },
];

const STRENGTH_KEYS = [
  "auth.reset.strength.veryWeak",
  "auth.reset.strength.weak",
  "auth.reset.strength.fair",
  "auth.reset.strength.good",
  "auth.reset.strength.strong",
  "auth.reset.strength.excellent",
];

function IdentityProviderReset() {
  const { t } = useApp();
  const accountUrl = config.oidc.issuer ? `${config.oidc.issuer}/account` : null;
  const steps = [t("auth.reset.apiStep1"), t("auth.reset.apiStep2"), t("auth.reset.apiStep3")];

  return (
    <div className="mt-6 space-y-4">
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-3 rounded-xl border border-ink-200/70 bg-white p-3.5 shadow-soft dark:border-ink-800 dark:bg-ink-900"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-xs font-bold text-navy-700 dark:bg-navy-500/15 dark:text-navy-300">
              {index + 1}
            </span>
            <p className="text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">{step}</p>
          </li>
        ))}
      </ol>
      {accountUrl && (
        <Button
          type="button"
          className="w-full"
          size="lg"
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => window.open(accountUrl, "_blank", "noopener,noreferrer")}
        >
          {t("auth.reset.openAccount")}
        </Button>
      )}
      <p className="flex items-start gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("auth.secure")}
      </p>
    </div>
  );
}

function DemoResetFlow() {
  const { t } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passed = CHECKS.filter((c) => c.re.test(pw)).length;
  const strengthColor = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"][passed];

  if (step === 3) {
    return (
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow-teal">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <p className="mt-4 text-lg font-bold text-ink-800 dark:text-ink-50">{t("auth.reset.success")}</p>
        <Button className="mt-6" onClick={() => (window.location.hash = "/login")}>
          {t("auth.login")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {step === 1 && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              setStep(2);
            }, 700);
          }}
        >
          <Field label={t("auth.username")} required>
            <Input
              type="email"
              placeholder="name@edas.gov"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            {t("auth.reset.send")}
          </Button>
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("auth.reset.demoNotice")}
          </p>
        </form>
      )}

      {step === 2 && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{6}$/.test(code)) {
              setError(t("auth.reset.invalidCode"));
              return;
            }
            if (passed < CHECKS.length) {
              setError(t("auth.reset.requirements"));
              return;
            }
            if (pw !== confirmPw) {
              setError(t("auth.reset.mismatch"));
              return;
            }
            setError(null);
            setStep(3);
          }}
        >
          <Field label={t("auth.reset.code")} required>
            <Input
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl font-bold tracking-[0.5em]"
              invalid={Boolean(error) && !/^\d{6}$/.test(code)}
              required
            />
          </Field>
          <Field label={t("auth.reset.new")} required>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="px-10"
                placeholder="••••••••••••"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("auth.hide") : t("auth.show")}
                aria-pressed={show}
                title={show ? t("auth.hide") : t("auth.show")}
                className="absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-400"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-ink-400">{t("auth.reset.strength")}</span>
              <span className="font-bold text-ink-600 dark:text-ink-300">{pw.length > 0 ? t(STRENGTH_KEYS[passed]) : ""}</span>
            </div>
            <div className="flex gap-1">
              {CHECKS.map((check, i) => (
                <div
                  key={check.key}
                  className={cn("h-1.5 flex-1 rounded-full transition-colors", i < passed ? strengthColor : "bg-ink-100 dark:bg-ink-800")}
                />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-1">
              {CHECKS.map((check, i) => (
                <li
                  key={check.key}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    i < passed ? "text-emerald-600 dark:text-emerald-400" : "text-ink-400",
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t(check.key)}
                </li>
              ))}
            </ul>
          </div>
          <Field label={t("auth.reset.confirm")} required>
            <Input
              type={show ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="new-password"
              invalid={confirmPw.length > 0 && confirmPw !== pw}
              required
            />
          </Field>
          {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
            >
              {t("g.back")}
            </Button>
            <Button type="submit" className="flex-1">
              {t("g.save")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export function PasswordReset() {
  const { t, apiMode } = useApp();

  return (
    <AuthShell showBack>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-500 to-navy-700 text-white shadow-glow">
        <KeyRound className="h-7 w-7" />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-white">{t("auth.reset.title")}</h1>
      <p className="mt-1.5 text-sm text-ink-500">{apiMode ? t("auth.reset.apiBody") : t("auth.reset.subtitle")}</p>
      {apiMode ? <IdentityProviderReset /> : <DemoResetFlow />}
    </AuthShell>
  );
}
