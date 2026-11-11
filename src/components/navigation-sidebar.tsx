import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, HardDrive } from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { documentBytes, formatBytes } from "../lib/api-mappers";
import { domainApi } from "../lib/domain-api";
import { config } from "../config";
import { cn } from "./ui";
import { NAV, hasAccess, pendingTaskCount } from "./nav-config";
function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-500 via-navy-600 to-navy-800 shadow-glow",
        s,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-300" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path d="M4 5h7l2 2h7v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
        <path d="M8 12h8M8 15h5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ---------------- Sidebar (dark) ---------------- */
export function Sidebar({ mobileOpen = false }: { mobileOpen?: boolean }) {
  const { t, sidebarCollapsed, setSidebarCollapsed, role, dir, lang } = useApp();
  const { tasks, scopedDocs, docsMeta, docsLoadingMore, loadMoreDocuments } = useDocsStore();
  const pendingTasks = pendingTaskCount(tasks);
  const apiMode = config.useApi;
  const [serverState, setServerState] = useState<"checking" | "ok" | "down">(apiMode ? "checking" : "down");
  const usedBytes = scopedDocs.reduce((total, doc) => total + documentBytes(doc), 0);
  const usedLabel = formatBytes(usedBytes);

  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    const check = () => {
      domainApi
        .health()
        .then((health) => {
          if (!cancelled) setServerState(health.database === "up" ? "ok" : "down");
        })
        .catch(() => {
          if (!cancelled) setServerState("down");
        });
    };
    check();
    const timer = window.setInterval(check, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiMode]);

  const statusLabel = !apiMode
    ? lang === "en"
      ? "Demo mode"
      : "وضع تجريبي"
    : serverState === "ok"
      ? lang === "en"
        ? "System operational"
        : "النظام يعمل"
      : serverState === "checking"
        ? lang === "en"
          ? "Checking server…"
          : "جارٍ التحقق…"
        : lang === "en"
          ? "Server unreachable"
          : "تعذر الاتصال بالخادم";
  const statusTone =
    !apiMode || serverState === "down"
      ? { dot: "bg-amber-400", box: "bg-amber-500/15 text-amber-400" }
      : serverState === "checking"
        ? { dot: "bg-sky-400", box: "bg-sky-500/15 text-sky-400" }
        : { dot: "bg-emerald-400", box: "bg-emerald-500/15 text-emerald-400" };
  const statusSubtitle = apiMode ? t("app.version") : `${lang === "en" ? "Local data" : "بيانات محلية"} · ${t("app.version")}`;
  const CollapseIcon = dir === "rtl" ? (sidebarCollapsed ? ChevronsLeft : ChevronsRight) : sidebarCollapsed ? ChevronsRight : ChevronsLeft;
  const accessible = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => hasAccess(role, i.to)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "sidebar-mobile relative z-30 flex h-screen shrink-0 flex-col border-e border-white/5 bg-[#080c18] text-slate-300 transition-all duration-300",
        sidebarCollapsed ? "w-[76px]" : "w-64",
        !mobileOpen && "sidebar-closed",
      )}
    >
      {/* aurora glow overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 40% at 20% 0%, rgba(99,102,241,0.18) 0%, transparent 70%), radial-gradient(50% 35% at 90% 10%, rgba(20,168,156,0.12) 0%, transparent 70%)",
        }}
      />

      <div className={cn("relative flex h-16 items-center gap-2.5 px-4", sidebarCollapsed && "justify-center px-0")}>
        <LogoMark />
        {!sidebarCollapsed && (
          <div className="leading-tight">
            <p className="font-display text-base font-extrabold text-white">EDAS</p>
            <p className="text-[10px] font-medium text-slate-400">{t("app.org")}</p>
          </div>
        )}
      </div>
      <div className="relative mx-3 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />

      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -end-3 top-7 z-40 hidden h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-md transition-colors hover:bg-navy-50 hover:text-navy-600 dark:border-ink-700 dark:bg-ink-900 lg:flex"
      >
        <CollapseIcon className="h-3.5 w-3.5" />
      </button>

      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {accessible.map((g) => (
          <div key={g.key}>
            {!sidebarCollapsed && (
              <p className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {t(g.key)}
                <span className="h-px flex-1 bg-white/[0.06]" />
              </p>
            )}
            <div className="space-y-1">
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={sidebarCollapsed ? t(item.key) : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200",
                        sidebarCollapsed && "justify-center",
                        isActive
                          ? "bg-gradient-to-l from-navy-600 to-navy-500 text-white shadow-glow ring-1 ring-white/15"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            isActive ? "text-teal-300" : "text-slate-400 group-hover:text-slate-200",
                          )}
                        />
                        {!sidebarCollapsed && <span className="flex-1">{t(item.key)}</span>}
                        {!sidebarCollapsed && item.badge && pendingTasks > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
                            {pendingTasks}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!sidebarCollapsed ? (
        <div className="relative space-y-2 border-t border-white/5 p-3">
          <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400">{lang === "en" ? "Document size" : "حجم الوثائق"}</span>
              <span className="font-bold text-white">{usedLabel}</span>
            </div>
            {apiMode && docsMeta.total > docsMeta.loaded && (
              <button
                type="button"
                onClick={() => void loadMoreDocuments()}
                disabled={docsLoadingMore}
                className="mt-1 text-[9px] text-sky-300 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {docsLoadingMore
                  ? lang === "en"
                    ? "Loading…"
                    : "جارٍ التحميل…"
                  : lang === "en"
                    ? `${docsMeta.loaded} of ${docsMeta.total} loaded — load more`
                    : `${docsMeta.loaded} من ${docsMeta.total} محمّلة — تحميل المزيد`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", statusTone.box)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-bold text-white">{statusLabel}</p>
              <p className="text-[10px] text-slate-400">{statusSubtitle}</p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative flex flex-col items-center gap-2 border-t border-white/5 p-3"
          title={lang === "en" ? `Document size: ${usedLabel}` : `حجم الوثائق: ${usedLabel}`}
        >
          <HardDrive className="h-4 w-4 text-slate-500" />
          <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} />
        </div>
      )}
    </aside>
  );
}
