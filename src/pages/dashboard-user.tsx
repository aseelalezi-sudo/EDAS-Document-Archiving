import { useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Files,
  Upload,
  Clock3,
  FileEdit,
  AlertTriangle,
  Bell,
  Plus,
  FolderTree,
  ArrowUpRight,
  HardDrive,
  Users,
  TrendingUp,
  Activity,
  CalendarDays,
  ChevronLeft,
  Star,
  Search,
  BarChart3,
  ScrollText,
} from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { cn, Button, Card, Badge, StatusBadge } from "../components/ui";
import { SectionTitle, FileIcon, Progress, Timeline } from "../components/shared";
import { UploadTrendChart } from "../components/charts";
import { Sparkline } from "../components/dashboard-widgets";
import { hasAccess, PENDING_TASK_STATUSES } from "../components/nav-config";
import { uploadTrend } from "../data";
import { documentBytes, formatBytes } from "../lib/api-mappers";
import { config } from "../config";

type Kpi = {
  label: string;
  value: number;
  icon: ReactNode;
  grad: string;
  glow: string;
  delta?: { text: string; up: boolean };
  spark?: number[];
};

export function UserDashboard() {
  const { t, user, lang, role } = useApp();
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const {
    scopedDocs,
    tasks: taskList,
    notifications: notificationList,
    summary,
    auditLog,
    departments: deptStore,
    visibleFolders,
    docsMeta,
    docsReady,
  } = useDocsStore();
  const [chartRange, setChartRange] = useState<"3" | "6" | "all">("all");

  const recent = [...scopedDocs].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 6);
  const folders = [...visibleFolders].sort((a, b) => b.docs - a.docs).slice(0, 4);
  const pendingTasks = taskList.filter((task) => PENDING_TASK_STATUSES.includes(task.status));
  const pendingCount = pendingTasks.length;
  const unread = notificationList.filter((n) => !n.read);
  const nearing = summary ? summary.retention.overdue : scopedDocs.filter((d) => d.retentionDays <= 0).length;
  const totalDocs = summary?.documents.total ?? scopedDocs.length;
  const pendingApprovals = summary?.approvals.pending ?? pendingCount;
  const draftCount = summary?.documents.byStatus.DRAFT ?? 0;
  const uploadSeries = apiMode ? (summary?.trend.map((point) => point.uploaded) ?? []) : uploadTrend.map((point) => point.docs);
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(lang === "en" ? "en" : "ar", { month: "short" }).format(new Date(`${month}-01T00:00:00Z`));
  const trendSource = apiMode
    ? (summary?.trend ?? []).map((point) => ({
        m: monthLabel(point.month),
        mEn: monthLabel(point.month),
        docs: point.uploaded,
        archived: point.archived,
      }))
    : uploadTrend;
  const uploadsThisMonth = uploadSeries.length > 0 ? uploadSeries[uploadSeries.length - 1] : 0;
  const uploadDelta = (() => {
    if (uploadSeries.length < 2) return undefined;
    const previous = uploadSeries[uploadSeries.length - 2];
    const last = uploadSeries[uploadSeries.length - 1];
    if (!previous) return last > 0 ? { text: lang === "en" ? "New" : "جديد", up: true } : undefined;
    const change = Math.round(((last - previous) / previous) * 100);
    return { text: `${change > 0 ? "+" : ""}${change}%`, up: change >= 0 };
  })();
  const chartData = chartRange === "3" ? trendSource.slice(-3) : chartRange === "6" ? trendSource.slice(-6) : trendSource;
  const hasChartData = chartData.some((point) => point.docs > 0 || point.archived > 0);
  const usedBytes = scopedDocs.reduce((total, doc) => total + documentBytes(doc), 0);
  const usedLabel = formatBytes(usedBytes);
  const deptLabel = (id: string) => {
    const dept = deptStore.items.find((item) => item.id === id);
    return dept ? (lang === "en" ? dept.nameEn : dept.name) : "";
  };
  const unassignedLabel = lang === "en" ? "Unassigned" : "غير محدد";
  const deptShares = Object.values(
    scopedDocs.reduce<Record<string, { id: string; name: string; bytes: number }>>((totals, doc) => {
      const key = doc.deptId || "unassigned";
      totals[key] ??= {
        id: key,
        name: doc.deptId ? deptLabel(doc.deptId) || unassignedLabel : unassignedLabel,
        bytes: 0,
      };
      totals[key].bytes += documentBytes(doc);
      return totals;
    }, {}),
  )
    .filter((dept) => dept.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 4);
  const deptTotal = deptShares.reduce((total, dept) => total + dept.bytes, 0);
  const activity = [...auditLog]
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      title: entry.action,
      subtitle: entry.user ? `${entry.entityType} · ${entry.user}` : entry.entityType,
      time: entry.datetime,
      done: entry.result === "success",
    }));
  const dateStr = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const heroStats = [
    { icon: Files, value: totalDocs, label: t("dash.kpiDocs") },
    { icon: Clock3, value: pendingApprovals, label: t("dash.kpiApprovals") },
    { icon: Bell, value: unread.length, label: t("dash.kpiNotifs") },
    { icon: AlertTriangle, value: nearing, label: t("dash.kpiRetention") },
  ];

  const kpis: Kpi[] = [
    {
      label: t("dash.kpiDocs"),
      value: totalDocs,
      icon: <Files className="h-5 w-5" />,
      grad: "from-navy-500 to-navy-700",
      glow: "#6366f1",
    },
    {
      label: t("dash.kpiUploads"),
      value: uploadsThisMonth,
      delta: uploadDelta,
      icon: <Upload className="h-5 w-5" />,
      grad: "from-teal-500 to-teal-600",
      glow: "#14a89c",
      spark: uploadSeries,
    },
    {
      label: t("dash.kpiApprovals"),
      value: pendingApprovals,
      icon: <Clock3 className="h-5 w-5" />,
      grad: "from-amber-400 to-amber-600",
      glow: "#f59e0b",
    },
    {
      label: t("dash.kpiDrafts"),
      value: draftCount,
      icon: <FileEdit className="h-5 w-5" />,
      grad: "from-purple-500 to-purple-700",
      glow: "#8b5cf6",
    },
    {
      label: t("dash.kpiRetention"),
      value: nearing,
      icon: <AlertTriangle className="h-5 w-5" />,
      grad: "from-rose-500 to-rose-600",
      glow: "#f43f5e",
    },
    {
      label: t("dash.kpiNotifs"),
      value: unread.length,
      icon: <Bell className="h-5 w-5" />,
      grad: "from-sky-500 to-sky-600",
      glow: "#0ea5e9",
    },
  ];

  const actions: { icon: typeof Plus; label: string; to: string; grad: string; badge?: number }[] = [
    { icon: Plus, label: t("doc.upload"), to: "/documents/new", grad: "from-navy-500 to-navy-700" },
    { icon: FolderTree, label: t("nav.library"), to: "/library", grad: "from-teal-500 to-teal-600" },
    { icon: Clock3, label: t("nav.myTasks"), to: "/workflow/my-tasks", grad: "from-amber-400 to-amber-600", badge: pendingCount },
    { icon: Files, label: t("nav.documents"), to: "/documents", grad: "from-purple-500 to-purple-700" },
    { icon: Search, label: t("nav.search"), to: "/search", grad: "from-sky-500 to-sky-600" },
    { icon: BarChart3, label: t("nav.reportsHome"), to: "/reports", grad: "from-emerald-500 to-emerald-600" },
    { icon: ScrollText, label: t("nav.auditTrail"), to: "/reports/audit-trail", grad: "from-rose-500 to-rose-600" },
  ].filter((action) => hasAccess(role, action.to));
  const visibleActions = actions.slice(0, 4);
  const canUpload = hasAccess(role, "/documents/new");
  const canBrowse = hasAccess(role, "/library");
  const canOpenDocs = hasAccess(role, "/documents");

  if (!docsReady) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label={t("g.loading")}>
        <div className="h-64 animate-pulse rounded-3xl bg-ink-200/70 dark:bg-ink-800/70" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70 xl:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ============ HERO ============ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-navy-700 via-navy-800 to-navy-900 p-6 text-white shadow-card dark:from-navy-600 dark:via-navy-800 dark:to-ink-950 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(50% 120% at 100% 0%, rgba(20,168,156,0.35) 0%, transparent 60%), radial-gradient(40% 100% at 0% 100%, rgba(99,102,241,0.3) 0%, transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <div className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -end-12 -top-12 h-44 w-44 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-teal-400/10 blur-2xl" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-navy-200">
                <CalendarDays className="h-4 w-4" />
                <span>{dateStr}</span>
              </div>
              <h2 className="mt-2.5 font-display text-3xl font-extrabold">
                {t("dash.greeting")}، {lang === "en" ? user?.nameEn : user?.name} 👋
              </h2>
              <p className="mt-1.5 text-sm text-navy-100/80">
                {[lang === "en" ? user?.jobTitleEn : user?.jobTitle, deptLabel(user?.department ?? "")].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canUpload && (
                <Button
                  className="bg-teal-500 hover:bg-teal-600 shadow-glow-teal"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => navigate("/documents/new")}
                >
                  {t("doc.upload")}
                </Button>
              )}
              {canBrowse ? (
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  icon={<FolderTree className="h-4 w-4" />}
                  onClick={() => navigate("/library")}
                >
                  {t("nav.library")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  icon={<BarChart3 className="h-4 w-4" />}
                  onClick={() => navigate("/reports")}
                >
                  {t("nav.reportsHome")}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {heroStats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10 backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                    <s.icon className="h-4 w-4 text-teal-300" />
                  </span>
                  <span className="text-2xl font-extrabold">{s.value}</span>
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-navy-100/70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ QUICK ACTIONS ============ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {visibleActions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.to)}
            className="group flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white p-4 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900/80 dark:hover:border-navy-700"
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                a.grad,
              )}
            >
              <a.icon className="h-5 w-5" />
            </span>
            <span className="flex-1 text-sm font-bold text-ink-700 dark:text-ink-200">{a.label}</span>
            {a.badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {a.badge}
              </span>
            ) : (
              <ArrowUpRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-navy-500" />
            )}
          </button>
        ))}
      </div>

      {/* ============ KPI CARDS ============ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} hover className="group relative overflow-hidden">
            <div
              className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full opacity-[0.07] blur-xl transition-opacity group-hover:opacity-[0.16]"
              style={{ background: k.glow }}
            />
            <div className="relative flex items-start justify-between">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", k.grad)}>
                {k.icon}
              </span>
              {k.delta && (
                <span
                  className={cn(
                    "rounded-lg px-1.5 py-0.5 text-[10px] font-bold",
                    k.delta.up
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
                  )}
                >
                  {k.delta.text}
                </span>
              )}
            </div>
            <p className="relative mt-2.5 text-2xl font-extrabold text-ink-900 dark:text-white">{k.value}</p>
            <p className="relative text-xs font-medium text-ink-500 dark:text-ink-400">{k.label}</p>
            {k.spark && k.spark.length > 1 && (
              <div className="relative mt-2 -mb-1">
                <Sparkline data={k.spark} color={k.glow} />
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* ============ MAIN GRID ============ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Chart with range tabs */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle title={t("dash.chartUploads")} icon={<TrendingUp className="h-4 w-4 text-navy-500" />} />
              <div className="flex gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-ink-700 dark:bg-ink-950">
                {(
                  [
                    ["3", lang === "en" ? "3M" : "٣ أشهر"],
                    ["6", lang === "en" ? "6M" : "٦ أشهر"],
                    ["all", lang === "en" ? "All" : "الكل"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setChartRange(v)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                      chartRange === v
                        ? "bg-white text-navy-700 shadow-soft dark:bg-ink-800 dark:text-navy-300"
                        : "text-ink-500 hover:text-ink-800 dark:hover:text-ink-200",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {hasChartData ? (
              <UploadTrendChart data={chartData} />
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-ink-400">{t("dash.noChartData")}</div>
            )}
          </Card>

          {/* Recent documents */}
          <Card pad={false}>
            <div className="flex items-center justify-between px-4 pt-4">
              <SectionTitle title={t("dash.recentDocs")} icon={<Files className="h-4 w-4 text-navy-500" />} />
              {canOpenDocs && (
                <Button variant="ghost" size="sm" onClick={() => navigate("/documents")}>
                  {t("g.view")} ←
                </Button>
              )}
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {recent.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-400">{t("dash.noDocs")}</div>}
              {recent.map((d) => (
                <div
                  key={d.id}
                  {...(canOpenDocs
                    ? {
                        role: "button",
                        tabIndex: 0,
                        onClick: () => navigate(`/documents/${d.id}`),
                        onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/documents/${d.id}`);
                          }
                        },
                      }
                    : {})}
                  className={cn(
                    "group flex items-center gap-3 px-4 py-3",
                    canOpenDocs && "cursor-pointer transition-colors hover:bg-navy-50/50 dark:hover:bg-navy-500/5",
                  )}
                >
                  <FileIcon type={d.fileType} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">{lang === "en" ? d.titleEn : d.title}</p>
                    <p className="truncate text-xs text-ink-400">{[d.docNo, deptLabel(d.deptId), d.owner].filter(Boolean).join(" · ")}</p>
                  </div>
                  <StatusBadge status={d.status} />
                  <span className="hidden w-24 text-xs text-ink-400 lg:block">{d.modifiedAt}</span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:-translate-x-0.5 flip-x" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Storage usage */}
          <Card>
            <SectionTitle title={t("dash.storage")} icon={<HardDrive className="h-4 w-4 text-navy-500" />} />
            <div className="mt-3 rounded-2xl bg-ink-50/80 p-4 dark:bg-ink-950/50">
              <p className="text-2xl font-extrabold text-ink-900 dark:text-white">{usedLabel}</p>
              <p className="text-xs font-medium text-ink-400">{t("dash.storageUsed")}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
                {lang === "en" ? "Excludes previous versions and trash." : "لا يشمل الإصدارات السابقة أو سلة المحذوفات."}
              </p>
            </div>
            <div className="mt-4 space-y-2.5">
              <p className="text-xs font-bold text-ink-400">{t("dash.storageByDept")}</p>
              {deptShares.length === 0 && <p className="text-xs text-ink-400">{t("dash.noData")}</p>}
              {deptShares.map((dept, i) => {
                const pct = deptTotal > 0 ? Math.round((dept.bytes / deptTotal) * 100) : 0;
                return (
                  <div key={dept.id}>
                    <div className="mb-1 flex justify-between text-xs text-ink-500">
                      <span className="truncate">{dept.name}</span>
                      <span className="font-semibold">{formatBytes(dept.bytes)}</span>
                    </div>
                    <Progress
                      value={pct}
                      className="h-1.5"
                      color={["bg-navy-600", "bg-teal-500", "bg-amber-500", "bg-purple-500"][i % 4]}
                    />
                  </div>
                );
              })}
              {apiMode && docsMeta.total > docsMeta.loaded && (
                <p className="text-[10px] leading-relaxed text-ink-400">
                  {lang === "en"
                    ? `Computed from ${docsMeta.loaded} of ${docsMeta.total} loaded documents.`
                    : `تُحتسب من ${docsMeta.loaded} من ${docsMeta.total} وثيقة محمّلة.`}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 w-full"
              icon={<Users className="h-4 w-4" />}
              onClick={() => navigate("/reports")}
            >
              {t("dash.storageReport")}
            </Button>
          </Card>

          {/* Activity */}
          <Card>
            <SectionTitle title={t("dash.recentActivity")} icon={<Activity className="h-4 w-4 text-navy-500" />} />
            {activity.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-400">{t("dash.noActivity")}</p>
            ) : (
              <Timeline items={activity} />
            )}
          </Card>
        </div>
      </div>

      {/* ============ BOTTOM GRID ============ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending tasks */}
        <Card pad={false} className={cn("lg:col-span-2", !canBrowse && "lg:col-span-3")}>
          <div className="flex items-center justify-between px-4 pt-4">
            <SectionTitle title={t("dash.pendingTasks")} icon={<Clock3 className="h-4 w-4 text-amber-500" />} />
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" dot="bg-amber-500">
              {pendingCount}
            </Badge>
          </div>
          {pendingCount === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-400">{t("dash.noPendingTasks")}</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/workflow/${task.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/workflow/${task.id}`);
                    }
                  }}
                  className="group flex cursor-pointer items-start gap-3 rounded-xl border border-ink-100 p-3 transition-all hover:border-navy-200 hover:bg-navy-50/40 dark:border-ink-800 dark:hover:border-navy-700 dark:hover:bg-navy-500/5"
                >
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", task.slaStatus === "breached" ? "bg-rose-500" : "bg-amber-500")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">{task.docTitle}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {task.step} · {task.due}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/workflow/${task.id}`);
                    }}
                  >
                    {t("dash.followTask")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Folders */}
        {canBrowse && (
          <Card pad={false}>
            <div className="px-4 pt-4">
              <SectionTitle title={t(apiMode ? "dash.topFolders" : "dash.favorites")} icon={<Star className="h-4 w-4 text-amber-400" />} />
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {folders.length === 0 && <p className="px-4 py-8 text-center text-xs text-ink-400">{t("dash.noFolders")}</p>}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  role="button"
                  tabIndex={0}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-navy-50/50 dark:hover:bg-navy-500/5"
                  onClick={() => navigate(`/library/folders/${folder.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/library/folders/${folder.id}`);
                    }
                  }}
                >
                  <FolderTree className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-700 dark:text-ink-200">
                      {lang === "en" ? folder.nameEn : folder.name}
                    </p>
                    <p className="text-[11px] text-ink-400">
                      {folder.docs} {t("dash.docsUnit")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
