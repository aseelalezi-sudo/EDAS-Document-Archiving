import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ChevronLeft, CheckCheck, AlertTriangle } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Modal } from "./ui";
/* ---------------- Toasts ---------------- */
export function ToastHost() {
  const { toasts, dismissToast, t } = useApp();
  const icons = {
    success: (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <CheckCheck className="h-5 w-5" />
      </span>
    ),
    error: (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5" />
      </span>
    ),
    warning: (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        <AlertTriangle className="h-5 w-5" />
      </span>
    ),
    info: (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-100 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300">
        <ShieldCheck className="h-5 w-5" />
      </span>
    ),
  };
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="fixed bottom-4 end-4 z-[200] flex w-full max-w-sm flex-col gap-2.5">
      {toasts.map((tt) => (
        <div
          key={tt.id}
          className="flex items-start gap-3 rounded-2xl border border-ink-200/80 bg-white p-3.5 shadow-float animate-slide-in dark:border-ink-700 dark:bg-ink-900"
        >
          {icons[tt.type]}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{tt.title}</p>
            {tt.message && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{tt.message}</p>}
          </div>
          <button
            onClick={() => dismissToast(tt.id)}
            aria-label={t("g.close")}
            className="text-ink-400 transition-colors hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4 flip-x" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Session expiry watcher ---------------- */
// Strict government-LAN inactivity policy (demo-tuned for visibility)
const IDLE_MS = 5 * 60 * 1000;
const WARN_SECS = 120;

export function SessionWatcher() {
  const { t, logout } = useApp();
  const [show, setShow] = useState(false);
  const [secs, setSecs] = useState(120);

  useEffect(() => {
    let last = Date.now();
    const reset = () => {
      last = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const interval = window.setInterval(() => {
      if (Date.now() - last > IDLE_MS) {
        setShow(true);
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    setSecs(WARN_SECS);
    const i = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(i);
          sessionStorage.setItem("edas_session_expired", "1");
          logout();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [show, logout]);

  const extend = () => setShow(false);

  return (
    <Modal open={show} onClose={extend} title={t("session.warning")}>
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg className="absolute h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" className="text-ink-100 dark:text-ink-800" />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 28}
              strokeDashoffset={2 * Math.PI * 28 * (1 - secs / WARN_SECS)}
              className={secs <= 30 ? "text-rose-500" : "text-navy-500"}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className={cn("text-lg font-bold", secs <= 30 ? "text-rose-500" : "text-ink-700 dark:text-ink-200")}>{secs}</span>
        </div>
        <p className="text-sm text-ink-500">{t("session.warning")}</p>
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              sessionStorage.setItem("edas_session_expired", "1");
              logout();
            }}
          >
            {t("auth.logout")}
          </Button>
          <Button className="flex-1" onClick={extend}>
            {t("session.extend")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Global keyboard shortcuts ---------------- */
const SHORTCUTS: { keys: string; to?: string; label: [string, string]; act?: () => void }[] = [
  { keys: "g d", to: "/dashboard", label: ["لوحة المعلومات", "Dashboard"] },
  { keys: "g l", to: "/library", label: ["المكتبة", "Library"] },
  { keys: "g a", to: "/documents", label: ["كل الوثائق", "All documents"] },
  { keys: "g s", to: "/search", label: ["البحث", "Search"] },
  { keys: "g t", to: "/workflow/my-tasks", label: ["المهام", "Tasks"] },
  { keys: "g r", to: "/reports", label: ["التقارير", "Reports"] },
  { keys: "g u", to: "/admin/users", label: ["المستخدمون", "Users"] },
  { keys: "g p", to: "/admin/permissions", label: ["الصلاحيات", "Permissions"] },
  { keys: "n d", to: "/documents/new", label: ["وثيقة جديدة", "New document"] },
  { keys: "?", label: ["عرض الاختصارات", "Show shortcuts"] },
];

export function KeyboardShortcuts() {
  const { lang, t, theme, toggleTheme, setLang } = useApp();
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const chordRef = useRef("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?" || (e.key === "h" && chordRef.current === "" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      if (e.key === "t" && !chordRef.current) {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (e.key === "/" && !chordRef.current) {
        e.preventDefault();
        setLang(lang === "ar" ? "en" : "ar");
        return;
      }

      const k = e.key.toLowerCase();
      if (chordRef.current === "g" || chordRef.current === "n") {
        const combo = `${chordRef.current} ${k}`;
        const sc = SHORTCUTS.find((s) => s.keys === combo);
        if (sc?.to) {
          e.preventDefault();
          navigate(sc.to);
        }
        chordRef.current = "";
        return;
      }
      if (k === "g" || k === "n") {
        e.preventDefault();
        chordRef.current = k;
        window.setTimeout(() => (chordRef.current = ""), 1200);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lang, navigate, toggleTheme, setLang]);

  return (
    <Modal
      open={showHelp}
      onClose={() => setShowHelp(false)}
      title={lang === "en" ? "Keyboard shortcuts" : "اختصارات لوحة المفاتيح"}
      footer={
        <Button variant="outline" onClick={() => setShowHelp(false)}>
          {t("g.close")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">{lang === "en" ? "Navigation" : "التنقل"}</p>
          <div className="space-y-1.5">
            {SHORTCUTS.filter((s) => s.to).map((s) => (
              <div key={s.keys} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950">
                <span className="text-sm text-ink-700 dark:text-ink-200">{s.label[lang === "en" ? 1 : 0]}</span>
                <span className="flex gap-1">
                  {s.keys.split(" ").map((k) => (
                    <kbd
                      key={k}
                      className="flex h-6 min-w-6 items-center justify-center rounded-md border border-ink-200 bg-white px-1.5 text-[11px] font-bold text-ink-600 shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
                    >
                      {k.toUpperCase()}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">
            {lang === "en" ? "Quick actions" : "إجراءات سريعة"}
          </p>
          <div className="space-y-1.5">
            {[
              {
                k: "T",
                l: [
                  theme === "light" ? "التبديل للنمط الداكن" : "التبديل للنمط الفاتح",
                  theme === "light" ? "Toggle dark mode" : "Toggle light mode",
                ],
              },
              {
                k: "/",
                l: [lang === "ar" ? "التبديل للإنجليزية" : "التبديل للعربية", lang === "ar" ? "Switch to English" : "Switch to Arabic"],
              },
              { k: "?", l: ["عرض هذه القائمة", "Show this help"] },
            ].map((s) => (
              <div key={s.k} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950">
                <span className="text-sm text-ink-700 dark:text-ink-200">{s.l[lang === "en" ? 1 : 0]}</span>
                <kbd className="flex h-6 min-w-6 items-center justify-center rounded-md border border-ink-200 bg-white px-1.5 text-[11px] font-bold text-ink-600 shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
                  {s.k}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
