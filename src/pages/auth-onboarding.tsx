import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, Check, Languages, User, CheckCircle2 } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Field, Input } from "../components/ui";
import { roleLabel } from "../data";
import { markOnboardingSeen } from "../lib/onboarding";

export function Onboarding() {
  const { t, lang, setLang, theme, setTheme, user, toast } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const steps = [
    { icon: CheckCircle2, title: t("auth.onboarding.welcome") },
    { icon: User, title: t("auth.onboarding.profile") },
    { icon: Languages, title: t("auth.onboarding.language") },
    { icon: Moon, title: t("auth.onboarding.theme") },
    { icon: Check, title: t("auth.onboarding.done") },
  ];

  const finish = () => {
    if (user) markOnboardingSeen(user.id);
    toast({ type: "success", title: t("auth.onboarding.done") });
    navigate("/dashboard");
  };

  const skip = () => {
    if (user) markOnboardingSeen(user.id);
    navigate("/dashboard");
  };

  return (
    <div className="aurora-bg flex min-h-screen flex-col">
      <header className="glass flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-300" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M4 5h7l2 2h7v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
              <path d="M8 12h8M8 15h5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-display font-bold text-white">{t("app.name")}</span>
        </div>
        <span className="text-sm font-medium text-white/60">{t("auth.onboarding.title")}</span>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <ol className="mb-8 flex items-center justify-between" aria-label={t("auth.onboarding.title")}>
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-all",
                    i < step
                      ? "bg-emerald-500 text-white ring-emerald-400"
                      : i === step
                        ? "bg-white text-navy-700 ring-white shadow-glow"
                        : "bg-white/10 text-white/50 ring-white/20",
                  )}
                >
                  <s.icon className="h-4 w-4" />
                </div>
                <span className={cn("hidden text-[10px] font-semibold sm:block", i === step ? "text-white" : "text-white/50")}>
                  {s.title}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("mx-2 h-0.5 flex-1 rounded transition-colors", i < step ? "bg-emerald-400" : "bg-white/15")} />
              )}
            </li>
          ))}
        </ol>

        <div className="glass rounded-3xl border border-white/10 p-8 shadow-float">
          {step === 0 && (
            <div className="text-center text-white">
              <h2 className="font-display text-3xl font-extrabold">{t("auth.onboarding.welcome")}</h2>
              <p className="mt-2 text-white/70">{t("auth.onboarding.welcomeSub")}</p>
              {user && <p className="mt-4 text-sm font-semibold text-teal-200">{lang === "en" ? user.nameEn : user.name}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="mx-auto max-w-md space-y-4 text-white">
              <h2 className="font-display text-xl font-bold">{t("auth.onboarding.profile")}</h2>
              <p className="text-xs text-white/60">{t("auth.onboarding.profileSub")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("g.name")}>
                  <Input value={(lang === "en" ? user?.nameEn : user?.name) ?? ""} readOnly className="bg-white/5 text-white" />
                </Field>
                <Field label={t("auth.onboarding.username")}>
                  <Input value={user?.username ?? ""} readOnly className="bg-white/5 text-white" />
                </Field>
                <Field label={t("auth.onboarding.email")}>
                  <Input value={user?.email ?? ""} readOnly dir="ltr" className="bg-white/5 text-white" />
                </Field>
                <Field label={t("auth.onboarding.jobTitle")}>
                  <Input value={(lang === "en" ? user?.jobTitleEn : user?.jobTitle) ?? ""} readOnly className="bg-white/5 text-white" />
                </Field>
                <Field label={t("auth.onboarding.role")}>
                  <Input value={user ? roleLabel(user.role, lang) : ""} readOnly className="bg-white/5 text-white" />
                </Field>
              </div>
              <p className="text-xs text-white/50">{t("auth.onboarding.profileEdit")}</p>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-md space-y-3 text-white">
              <h2 className="font-display text-xl font-bold">{t("auth.onboarding.language")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "ar" as const, label: t("auth.onboarding.langAr") },
                  { value: "en" as const, label: t("auth.onboarding.langEn") },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={lang === option.value}
                    onClick={() => setLang(option.value)}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-sm font-bold transition-all",
                      lang === option.value ? "border-white bg-white/10 text-white" : "border-white/20 text-white/60 hover:border-white/40",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-md space-y-3 text-white">
              <h2 className="font-display text-xl font-bold">{t("auth.onboarding.theme")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "light" as const, label: t("auth.onboarding.themeLight"), icon: Sun, color: "text-amber-300" },
                  { value: "dark" as const, label: t("auth.onboarding.themeDark"), icon: Moon, color: "text-navy-200" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={theme === option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "rounded-2xl border-2 p-4 transition-all",
                      theme === option.value ? "border-white bg-white/10" : "border-white/20 hover:border-white/40",
                    )}
                  >
                    <option.icon className={cn("mx-auto h-8 w-8", option.color)} />
                    <span className={cn("mt-2 block text-sm font-bold", theme === option.value ? "text-white" : "text-white/70")}>
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center text-white">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-glow-teal">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold">{t("auth.onboarding.done")}</h2>
              <p className="mt-1 text-sm text-white/70">{t("auth.onboarding.doneSub")}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => (step === 0 ? skip() : setStep((s) => s - 1))}
          >
            {step === 0 ? t("auth.onboarding.skip") : t("g.previous")}
          </Button>
          <Button onClick={() => (step === steps.length - 1 ? finish() : setStep((s) => s + 1))}>
            {step === steps.length - 1 ? t("auth.onboarding.finish") : t("g.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
