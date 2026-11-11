import { type ReactNode, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "../store";
import { AIAssistant } from "./assistant";
import { Sidebar, Topbar } from "./navigation";
import { ToastHost, SessionWatcher, KeyboardShortcuts } from "./system";

/* ---------------- Layout ---------------- */
export function Layout({ children }: { children: ReactNode }) {
  const { t, user, lang } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm animate-fade-in lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto">
          <div className="print-header">
            <h1>EDAS — {t("app.full")}</h1>
            <p>
              {t("app.org")} · {user?.name} · {new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA")}
            </p>
          </div>
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <SessionWatcher />
      <KeyboardShortcuts />
      <AIAssistant />
      <ToastHost />
    </div>
  );
}
