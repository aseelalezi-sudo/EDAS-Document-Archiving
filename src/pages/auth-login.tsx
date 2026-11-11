import { useCallback, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  Building2,
  Languages,
  Moon,
  Sun,
  GitCompareArrows,
  ScrollText,
  Sparkles,
  Clock,
  Zap,
  FileCheck2,
  Users,
  HardDrive,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Input, Field, Checkbox } from "../components/ui";
import { DEMO_USERS, roleLabel } from "../data";
import { apiRequest } from "../lib/api-client";
import { config } from "../config";
import { applyRememberPreference, loadRememberedUsername, loadRememberPreference } from "../lib/remember";

/* ================= Brand Panel (left) ================= */
function BrandPanel() {
  const { t, apiMode } = useApp();
  return (
    <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[#070b16] p-10 text-white xl:flex">
      {/* Aurora */}
      <div className="aurora-bg absolute inset-0" />
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }}
      />
      {/* Concentric rings */}
      <div className="pointer-events-none absolute -end-40 -top-40 h-[480px] w-[480px] rounded-full border border-white/[0.06]" />
      <div className="pointer-events-none absolute -end-28 -top-28 h-[360px] w-[360px] rounded-full border border-white/[0.08]" />
      <div className="pointer-events-none absolute -end-16 -top-16 h-[240px] w-[240px] rounded-full border border-white/[0.1]" />
      <div className="pointer-events-none absolute -end-4 -top-4 h-[120px] w-[120px] rounded-full border border-teal-400/20" />
      {/* Bottom glow */}
      <div className="pointer-events-none absolute -bottom-32 -start-24 h-80 w-80 rounded-full bg-navy-500/20 blur-3xl" />
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070b16]/20 via-transparent to-[#070b16]/70" />

      {/* Header */}
      <div className="relative flex items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 shadow-glow ring-1 ring-white/20 backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-300" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M4 5h7l2 2h7v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
            <path d="M8 12h8M8 15h5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="font-display text-xl font-extrabold tracking-tight">EDAS</p>
          <p className="text-xs text-white/60">{t("app.full")}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="relative space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-teal-400/10 px-3.5 py-1.5 text-xs font-bold text-teal-200 ring-1 ring-teal-400/20 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          {t("auth.brand.badge")}
        </div>

        <div>
          <h2 className="font-display text-5xl font-extrabold leading-[1.15] tracking-tight">
            {t("auth.brand.title1")}
            <br />
            <span className="bg-gradient-to-l from-teal-300 via-sky-300 to-navy-300 bg-clip-text text-transparent">
              {t("auth.brand.title2")}
            </span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">{t("auth.brand.sub")}</p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: ShieldCheck, label: t("auth.brand.f1"), sub: t("auth.brand.f1sub") },
            { icon: GitCompareArrows, label: t("auth.brand.f2"), sub: t("auth.brand.f2sub") },
            { icon: ScrollText, label: t("auth.brand.f3"), sub: t("auth.brand.f3sub") },
            { icon: Sparkles, label: t("auth.brand.f4"), sub: t("auth.brand.f4sub") },
          ].map((f) => (
            <div
              key={f.label}
              className="group glass flex items-start gap-3 rounded-2xl p-3.5 ring-1 ring-white/10 transition-all hover:ring-white/20"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/20 to-navy-400/20 text-teal-300 ring-1 ring-white/10 transition-transform group-hover:scale-110">
                <f.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white/95">{f.label}</p>
                <p className="mt-0.5 text-[11px] text-white/50">{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom stats */}
      {!apiMode && (
        <div className="relative grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
          {[
            { icon: FileCheck2, value: "12,840+", label: t("auth.brand.s1") },
            { icon: Users, value: "340+", label: t("auth.brand.s2") },
            { icon: HardDrive, value: "99.9%", label: t("auth.brand.s3") },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-teal-300">
                <s.icon className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-lg font-extrabold">{s.value}</p>
                <p className="text-[10px] text-white/50">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Mobile logo ================= */
function MobileLogo() {
  const { t } = useApp();
  return (
    <div className="mb-6 flex items-center gap-2.5 lg:hidden">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-500 to-navy-800 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-300" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M4 5h7l2 2h7v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          <path d="M8 12h8M8 15h5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="font-display text-lg font-extrabold text-ink-800 dark:text-ink-50">{t("app.name")}</span>
    </div>
  );
}

/* ================= Auth shell ================= */
export function AuthShell({ children, showBack }: { children: React.ReactNode; showBack?: boolean }) {
  const { t } = useApp();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      <div className="relative flex flex-1 items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
        {/* Subtle background decoration */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(40% 60% at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 60%)" }}
        />
        <div className="relative w-full max-w-md">
          {showBack && (
            <button
              onClick={() => navigate("/login")}
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-400 transition-colors hover:text-navy-600"
            >
              <ArrowLeft className="h-4 w-4 flip-x" /> {t("auth.back")}
            </button>
          )}
          <MobileLogo />
          {children}
          <p className="mt-8 text-center text-xs text-ink-400">
            {t("app.version")} · {t("app.support")}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= Login ================= */
export function Login() {
  const { t, login, loginWithKeycloak, toast, lang, setLang, theme, toggleTheme, apiMode } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState(loadRememberedUsername);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(loadRememberPreference);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [checkingApi, setCheckingApi] = useState(false);

  const checkApi = useCallback(async () => {
    if (!apiMode) return;
    setCheckingApi(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      await apiRequest("/auth/config", { signal: controller.signal });
      setApiDown(false);
    } catch {
      setApiDown(true);
    } finally {
      window.clearTimeout(timer);
      setCheckingApi(false);
    }
  }, [apiMode]);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  useEffect(() => {
    if (sessionStorage.getItem("edas_session_expired") === "1") {
      setExpired(true);
      sessionStorage.removeItem("edas_session_expired");
    }
  }, []);

  const startOidc = async () => {
    setError(null);
    setRedirecting(true);
    try {
      await loginWithKeycloak("/dashboard");
    } catch {
      setError(t("auth.apiUnavailable"));
      setRedirecting(false);
    }
  };

  const doLogin = (demoRole?: (typeof DEMO_USERS)[number]["role"]) => {
    setError(null);
    setLocked(false);
    setExpired(false);
    setLoading(true);
    setTimeout(() => {
      const demo = DEMO_USERS.find((d) => d.role === demoRole) ?? DEMO_USERS[0];
      if (demoRole) {
        applyRememberPreference(remember, demo.user.username);
        login({
          id: demo.user.id,
          name: demo.user.name,
          nameEn: demo.user.nameEn,
          username: demo.user.username,
          email: demo.user.email,
          jobTitle: demo.user.jobTitle,
          jobTitleEn: demo.user.jobTitleEn,
          department: demo.user.deptId,
          section: "",
          role: demo.role,
          initials: demo.user.initials,
          color: demo.user.color,
        });
        toast({ type: "success", title: `مرحباً ${demo.user.name}`, message: roleLabel(demo.role, lang) });
        navigate(demo.role === "auditor" ? "/reports/audit-trail" : "/dashboard");
        setLoading(false);
        return;
      }
      if (!username || !password) {
        setError(t("auth.failed"));
        setLoading(false);
        return;
      }
      if (username.toLowerCase() === "locked") {
        setLocked(true);
        setLoading(false);
        return;
      }
      applyRememberPreference(remember, username);
      login({
        id: demo.user.id,
        name: demo.user.name,
        nameEn: demo.user.nameEn,
        username,
        email: demo.user.email,
        jobTitle: demo.user.jobTitle,
        jobTitleEn: demo.user.jobTitleEn,
        department: demo.user.deptId,
        section: "",
        role: demo.role,
        initials: demo.user.initials,
        color: demo.user.color,
      });
      toast({ type: "success", title: t("auth.login"), message: demo.user.name });
      navigate("/dashboard");
      setLoading(false);
    }, 650);
  };

  return (
    <AuthShell>
      {/* Theme/lang controls */}
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("topbar.lang")}
          title={t("topbar.lang")}
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
        >
          <Languages className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("topbar.theme")}
          title={t("topbar.theme")}
          aria-pressed={theme === "dark"}
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700 ring-1 ring-navy-200/50 dark:bg-navy-500/10 dark:text-navy-300 dark:ring-navy-500/20">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
          {t("app.org")}
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-white">{t("auth.login")}</h1>
        <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
          {t("app.full")} — {t("auth.env")}
        </p>
      </div>

      {/* Alerts */}
      {locked && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" /> {t("auth.locked")}
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {expired && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-navy-200 bg-navy-50 p-3.5 text-sm font-medium text-navy-700 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-300">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" /> {t("auth.expired")}
        </div>
      )}
      {apiMode && apiDown && (
        <div className="mb-5 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {t("auth.apiUnavailable")}
          </p>
          <p className="text-xs font-normal">{t("auth.apiDown.hint", { url: config.apiBaseUrl ?? "" })}</p>
          <Button type="button" size="sm" variant="outline" loading={checkingApi} onClick={() => void checkApi()}>
            {t("err.retry")}
          </Button>
        </div>
      )}

      {/* Form */}
      {apiMode ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-navy-200 bg-navy-50 p-3.5 text-sm font-medium text-navy-700 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-300">
            {t("auth.keycloakHint")}
          </p>
          <Button
            type="button"
            className="w-full"
            size="lg"
            loading={redirecting}
            icon={<ShieldCheck className="h-4 w-4" />}
            onClick={startOidc}
          >
            {t("auth.keycloak")}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            doLogin();
          }}
        >
          <Field label={t("auth.username")} required>
            <div className="relative">
              <User className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                className="h-11 ps-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ahmad.al-balawi"
                autoComplete="username"
                required
              />
            </div>
          </Field>
          <Field label={t("auth.password")} required>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                type={show ? "text" : "password"}
                className="h-11 px-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("auth.hide") : t("auth.show")}
                aria-pressed={show}
                title={show ? t("auth.hide") : t("auth.show")}
                className="absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-ink-700"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-600 dark:text-ink-300">
              <Checkbox checked={remember} onChange={setRemember} /> {t("auth.remember")}
            </label>
            <button
              type="button"
              onClick={() => navigate("/password/reset")}
              className="text-sm font-bold text-navy-600 transition-colors hover:text-navy-700"
            >
              {t("auth.forgot")}
            </button>
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {t("auth.login")}
          </Button>

          {/* Divider */}
          <div className="relative py-1 text-center">
            <span className="relative z-10 bg-ink-50 px-3 text-xs font-semibold text-ink-400 dark:bg-ink-950">{t("auth.or")}</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-ink-200 dark:bg-ink-800" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            icon={<Building2 className="h-4 w-4" />}
            onClick={() => doLogin("system_admin")}
          >
            {t("auth.ad")}
          </Button>
        </form>
      )}

      {/* Demo accounts */}
      {!apiMode && (
        <div className="mt-6 rounded-2xl border border-ink-200/70 bg-white p-3.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
            <Zap className="h-3.5 w-3.5 text-teal-500" /> {t("auth.demoAccounts")}
          </p>
          <div className="space-y-1.5">
            {DEMO_USERS.map((d) => (
              <button
                key={d.role}
                onClick={() => doLogin(d.role)}
                className="group flex w-full items-center gap-3 rounded-xl border border-ink-100 px-3 py-2.5 text-start transition-all hover:border-navy-300 hover:bg-navy-50/50 dark:border-ink-800 dark:hover:border-navy-700 dark:hover:bg-navy-500/10"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow-md",
                    d.user.color,
                  )}
                >
                  {d.user.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink-800 dark:text-ink-100">{d.user.name}</p>
                  <p className="text-[10px] font-medium text-ink-400">{roleLabel(d.role, lang)}</p>
                </div>
                <ArrowLeft className="h-4 w-4 shrink-0 text-ink-300 transition-all group-hover:-translate-x-0.5 group-hover:text-navy-500 flip-x" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Security badge */}
      <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("auth.secure")}
      </div>
    </AuthShell>
  );
}
