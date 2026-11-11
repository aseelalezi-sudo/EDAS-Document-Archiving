import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  FileChartColumn,
  AlertTriangle,
  Clock,
  Star,
  Play,
  Download,
  ShieldCheck,
  Server,
  Activity,
  TrendingUp,
  Filter,
  X,
  Search,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Input, Select, EmptyState } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";

import { config } from "../config";
import { serverReason } from "../lib/api-client";
import { domainApi } from "../lib/domain-api";
import { openDownload } from "../lib/download";
import { isReportRunnable } from "../lib/report-catalog";
export function ReportsHome() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const { templates: reportTemplates } = useDocsStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [favs, setFavs] = useState<string[]>(reportTemplates.filter((r) => r.favorite).map((r) => r.id));
  const [favBusy, setFavBusy] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(reportTemplates.filter((r) => r.schedule !== "—").length);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof domainApi.reportRuns>>["items"]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const icons: Record<string, any> = {
    bar: BarChart3,
    gauge: Server,
    line: TrendingUp,
    clock: Clock,
    calendar: Clock,
    shield: ShieldCheck,
    alert: AlertTriangle,
    gavel: ShieldCheck,
  };

  const allCats = Array.from(new Set(reportTemplates.map((r) => (lang === "en" ? r.categoryEn : r.category))));
  const filtered = reportTemplates.filter((r) => {
    if (q && !((lang === "en" ? r.nameEn : r.name).includes(q) || (lang === "en" ? r.descEn : r.desc).includes(q))) return false;
    if (cat !== "all" && (lang === "en" ? r.categoryEn : r.category) !== cat) return false;
    return true;
  });
  useEffect(() => {
    setFavs(reportTemplates.filter((template) => template.favorite).map((template) => template.id));
    if (!apiMode) setScheduledCount(reportTemplates.filter((template) => template.schedule !== "—").length);
  }, [apiMode, reportTemplates]);
  useEffect(() => {
    if (!apiMode) return;
    setRunsError(null);
    void Promise.all([domainApi.reportRuns(), domainApi.reportSchedules()])
      .then(([runsPage, schedulesPage]) => {
        setRuns(runsPage.items);
        setScheduledCount(schedulesPage.items.length);
      })
      .catch((error) => {
        setRuns([]);
        setRunsError(serverReason(error) ?? "");
      });
  }, [apiMode, reloadKey]);

  const templateName = (reportId: string) => {
    const template = reportTemplates.find((item) => item.id === reportId);
    return template ? (lang === "en" ? template.nameEn : template.name) : reportId;
  };

  const favList = filtered.filter((r) => favs.includes(r.id));
  const toggleFav = async (id: string) => {
    if (favBusy) return;
    const next = !favs.includes(id);
    setFavBusy(true);
    try {
      if (apiMode) await domainApi.setReportTemplateFavorite(id, next);
      setFavs((prev) => (next ? [...prev, id] : prev.filter((x) => x !== id)));
      toast({
        type: next ? "success" : "info",
        title: next ? L("أُضيف إلى المفضلة", "Added to favorites") : L("أُزيل من المفضلة", "Removed from favorites"),
        message: templateName(id),
      });
    } catch (error) {
      toast({ type: "error", title: t("err.api"), message: serverReason(error) });
    } finally {
      setFavBusy(false);
    }
  };

  const clearFavs = async () => {
    if (favBusy) return;
    setFavBusy(true);
    try {
      if (apiMode) await Promise.all(favs.map((id) => domainApi.setReportTemplateFavorite(id, false)));
      setFavs([]);
      toast({ type: "success", title: L("أُزيلت المفضلة", "Favorites cleared") });
    } catch (error) {
      toast({ type: "error", title: t("err.api"), message: serverReason(error) });
    } finally {
      setFavBusy(false);
    }
  };

  const runReport = async (reportId: string) => {
    try {
      const run = await domainApi.createReportRun({ reportType: reportId, format: "xlsx" });
      if (run.status !== "completed") throw new Error("Report run is not ready");
      const download = await domainApi.downloadReportRun(run.id);
      openDownload(download.url);
      toast({ type: "success", title: L("تم إنشاء التقرير", "Report generated"), message: templateName(reportId) });
      setReloadKey((k) => k + 1);
    } catch (error) {
      toast({ type: "error", title: t("err.api"), message: serverReason(error) });
    }
  };

  const stats = [
    {
      label: L("إجمالي التقارير", "Total reports"),
      value: reportTemplates.length,
      icon: FileChartColumn,
      color: "from-navy-400 to-navy-600",
    },
    { label: L("المفضلة", "Favorites"), value: favs.length, icon: Star, color: "from-amber-400 to-amber-600" },
    {
      label: L("مجدولة", "Scheduled"),
      value: scheduledCount,
      icon: Clock,
      color: "from-teal-400 to-teal-600",
    },
    { label: L("الفئات", "Categories"), value: allCats.length, icon: Filter, color: "from-purple-400 to-purple-600" },
  ];

  const ReportCard = ({ r, featured }: { r: (typeof reportTemplates)[number]; featured?: boolean }) => {
    const Icon = icons[r.icon] ?? BarChart3;
    const isFav = favs.includes(r.id);
    return (
      <Card
        className={cn(
          "group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-card",
          featured && "p-4",
        )}
        onClick={() => navigate(`/reports/${r.id}`)}
      >
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
              featured
                ? "bg-gradient-to-br from-navy-500 to-navy-700 text-white shadow-md"
                : "bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300",
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFav(r.id);
            }}
            aria-label={L("تفضيل", "Favorite")}
            className={cn("rounded-lg p-1 transition-colors", isFav ? "text-amber-400" : "text-ink-300 hover:text-amber-400")}
          >
            <Star className={cn("h-4 w-4", isFav && "fill-amber-400")} />
          </button>
        </div>
        <p className={cn("mt-3 font-bold text-ink-800 dark:text-ink-100", featured ? "text-[15px]" : "text-sm")}>
          {lang === "en" ? r.nameEn : r.name}
        </p>
        {featured && <p className="mt-1 text-xs leading-relaxed text-ink-400">{lang === "en" ? r.descEn : r.desc}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{lang === "en" ? r.categoryEn : r.category}</Badge>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {r.lastRun}
          </span>
        </div>
        {featured && r.schedule !== "—" && (
          <Badge className="mt-2 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
            <Play className="h-3 w-3" /> {r.schedule}
          </Badge>
        )}
        <div className="mt-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1 text-xs"
            icon={<Play className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/reports/${r.id}`);
            }}
          >
            {L("تشغيل", "Run")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            icon={<Download className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation();
              if (!apiMode) return;
              void runReport(r.id);
            }}
            disabled={!apiMode || !isReportRunnable(r.id, apiMode)}
            title={
              !apiMode
                ? L("التصدير ينتجه الخادم؛ وضع العرض لا يولّد ملفات", "Exports are produced by the server; demo mode generates no files")
                : isReportRunnable(r.id, apiMode)
                  ? t("g.export")
                  : L(
                      "هذا التقرير يُبنى من سجل الأخطاء المحلي في المتصفح ولا يمكن توليده على الخادم",
                      "This report is built from the browser-local error log and cannot be generated server-side",
                    )
            }
            aria-label={t("g.export")}
          />
        </div>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title={t("nav.reportsHome")}
        description={L(
          "كتالوج التقارير والمؤشرات التحليلية مع الجدولة والتصدير",
          "Report catalog and analytics with scheduling and export",
        )}
        breadcrumbs={[{ label: t("nav.reports") }]}
        actions={
          <>
            <Button size="sm" variant="outline" icon={<Clock className="h-4 w-4" />} onClick={() => navigate("/reports/scheduled")}>
              {L("المجدولة", "Scheduled")}
            </Button>
            <Button size="sm" variant="outline" icon={<FileChartColumn className="h-4 w-4" />} onClick={() => navigate("/reports/builder")}>
              {t("nav.reportBuilder")}
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", s.color)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-extrabold text-ink-900 dark:text-white">{s.value}</p>
              <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <div className="relative min-w-40 flex-1 md:max-w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={L("مسح البحث", "Clear search")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            className="h-8 px-9 text-xs"
            placeholder={L("ابحث في التقارير…", "Search reports…")}
            aria-label={L("ابحث في التقارير", "Search reports")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الفئة", "Filter by category")}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="all">
            {t("g.all")} — {L("الفئة", "Category")}
          </option>
          {allCats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {/* Favorites */}
      {favList.length > 0 && (
        <div className="mb-5">
          <SectionTitle
            title={`${L("المفضلة", "Favorites")} (${favList.length})`}
            icon={<Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
            action={
              <Button size="sm" variant="ghost" onClick={() => void clearFavs()} disabled={favBusy}>
                {L("مسح المفضلة", "Clear all")}
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {favList.map((r) => (
              <ReportCard key={r.id} r={r} featured />
            ))}
          </div>
        </div>
      )}

      {/* All reports */}
      <SectionTitle
        title={`${L("جميع التقارير", "All reports")} (${filtered.length})`}
        icon={<FileChartColumn className="h-4 w-4 text-navy-500" />}
      />
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            variant="search"
            title={L("لا توجد تقارير مطابقة", "No matching reports")}
            description={L("جرّب كلمة بحث مختلفة أو أزل فلتر الفئة.", "Try a different keyword or remove the category filter.")}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQ("");
                  setCat("all");
                }}
              >
                {L("مسح الفلاتر", "Clear filters")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </div>
      )}

      {/* Recently run */}
      <div className="mt-6">
        <SectionTitle title={L("آخر التقارير المنشأة", "Recently run")} icon={<Activity className="h-4 w-4 text-navy-500" />} />
        <Card pad={false}>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {apiMode && runs.length > 0 ? (
              runs.slice(0, 4).map((run) => (
                <button
                  key={run.id}
                  onClick={() => {
                    if (run.status !== "completed") return;
                    void domainApi
                      .downloadReportRun(run.id)
                      .then((download) => openDownload(download.url))
                      .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
                  }}
                  disabled={run.status !== "completed"}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-navy-50/50 disabled:cursor-default dark:hover:bg-navy-500/5"
                >
                  <FileChartColumn className="h-4 w-4 shrink-0 text-navy-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">
                      {templateName(run.reportType)} · {run.format.toUpperCase()}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {L("آخر تشغيل", "Last run")} {new Date(run.completedAt ?? run.createdAt).toLocaleString(lang === "en" ? "en" : "ar")}
                    </p>
                  </div>
                  <Badge
                    className={
                      run.status === "completed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    }
                  >
                    {run.status === "completed" ? L("مكتمل", "Completed") : L("فشل", "Failed")}
                  </Badge>
                </button>
              ))
            ) : apiMode ? (
              runsError !== null ? (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                  <p className="flex-1 text-sm text-ink-700 dark:text-ink-200">
                    {runsError || L("تعذّر تحميل التقارير من الخادم", "Could not load reports from the server")}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                    {L("إعادة المحاولة", "Retry")}
                  </Button>
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-ink-400">
                  {L("لا توجد تقارير منشأة على الخادم بعد", "No report runs on the server yet")}
                </p>
              )
            ) : (
              reportTemplates.slice(0, 4).map((r) => {
                const Icon = icons[r.icon] ?? BarChart3;
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/reports/${r.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-navy-50/50 dark:hover:bg-navy-500/5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-navy-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? r.nameEn : r.name}</p>
                      <p className="truncate text-xs text-ink-400">
                        {L("آخر تشغيل", "Last run")} {r.lastRun} · {r.schedule !== "—" ? r.schedule : L("يدوي", "Manual")}
                      </p>
                    </div>
                    <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{lang === "en" ? r.categoryEn : r.category}</Badge>
                  </button>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
