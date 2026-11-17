import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock, Play, Plus, Eye, Activity, Check, X, ScrollText, Trash2, Search } from "lucide-react";
import type { ReportCadenceDto, ReportRunDto } from "@edas/shared";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Input, Select, Avatar, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { openDownload } from "../lib/download";
import { mapReportSchedule, type MappedReportSchedule } from "../lib/api-mappers";
import { RunHistoryModal, ScheduleReportModal, type RunLogEntry, type ScheduleForm } from "./reports-scheduled-parts";

type Schedule = MappedReportSchedule;

const emptyForm: ScheduleForm = { report: "", freq: "daily", time: "08:00", format: "Excel", recipients: "", active: true };

export function ScheduledReports() {
  const { t, lang, toast, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const apiMode = config.useApi;
  const { templates: reportTemplates, users: usersStore } = useDocsStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<Schedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [runLog, setRunLog] = useState<RunLogEntry[]>([]);
  const [runs, setRuns] = useState<ReportRunDto[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>(() =>
    apiMode
      ? []
      : reportTemplates
          .filter((r) => r.schedule !== "—")
          .map((r, i) => ({
            id: `sch-${i + 1}`,
            reportId: r.id,
            name: lang === "en" ? r.nameEn : r.name,
            category: lang === "en" ? r.categoryEn : r.category,
            categoryEn: r.categoryEn,
            freq: r.schedule,
            freqKey: ["daily", "weekly", "monthly"][i % 3],
            time: ["08:00", "07:30", "06:00"][i % 3],
            recipients: ["finance@edas.gov", "admin@edas.gov"],
            format: i % 2 ? "Excel" : "PDF",
            lastRun: r.lastRun,
            nextRun: ["2026-02-01 08:00", "2026-02-03 07:30", "2026-03-01 06:00", "2026-02-02 08:00", "2026-02-07 07:30"][i % 5],
            status: i === 1 ? "paused" : "active",
            runs: 42 - i * 7,
            successRate: [100, 98, 96, 100, 94][i % 5],
          })),
  );

  const reloadRef = useRef<() => Promise<void>>(async () => undefined);
  reloadRef.current = async () => {
    const [schedulesPage, runsPage] = await Promise.all([domainApi.reportSchedules(), domainApi.reportRuns()]);
    setRuns(runsPage.items);
    setSchedules(schedulesPage.items.map((schedule) => mapReportSchedule(schedule, runsPage.items)));
  };

  useEffect(() => {
    if (!apiMode) return;
    void reloadRef.current().catch(() => toast({ type: "error", title: t("err.api") }));
  }, [apiMode, t, toast]);

  const reportParam = searchParams.get("report");
  useEffect(() => {
    if (!reportParam) return;
    if (!reportTemplates.some((template) => template.id === reportParam)) return;
    setForm((previous) => ({ ...previous, report: reportParam }));
    setScheduleOpen(true);
  }, [reportParam, reportTemplates]);

  const closeSchedule = () => {
    setScheduleOpen(false);
    if (reportParam) setSearchParams({}, { replace: true });
  };

  const filtered = schedules.filter((s) => {
    if (q && !(s.name.includes(q) || s.freq.includes(q) || s.format.toLowerCase().includes(q.toLowerCase()))) return false;
    if (fStatus !== "all" && s.status !== fStatus) return false;
    return true;
  });

  const rated = schedules.filter((s) => s.successRate !== null);
  const avgSuccess = rated.length ? `${Math.round(rated.reduce((total, s) => total + (s.successRate ?? 0), 0) / rated.length)}%` : "—";

  const stats = [
    { label: L("إجمالي الجداول", "Schedules"), value: schedules.length, icon: Clock, color: "from-navy-400 to-navy-600" },
    {
      label: L("نشطة", "Active"),
      value: schedules.filter((s) => s.status === "active").length,
      icon: Play,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: L("متوقفة", "Paused"),
      value: schedules.filter((s) => s.status === "paused").length,
      icon: X,
      color: "from-amber-400 to-amber-600",
    },
    {
      label: L("إجمالي التشغيلات", "Total runs"),
      value: schedules.reduce((a: number, s) => a + s.runs, 0),
      icon: Activity,
      color: "from-teal-400 to-teal-600",
    },
    {
      label: L("متوسط النجاح", "Avg success"),
      value: avgSuccess,
      icon: Check,
      color: "from-purple-400 to-purple-600",
    },
  ];

  const freqLbl = (k: string) =>
    k === "daily"
      ? L("يومياً", "Daily")
      : k === "weekly"
        ? L("أسبوعياً", "Weekly")
        : k === "quarterly"
          ? L("ربع سنوي", "Quarterly")
          : L("شهرياً", "Monthly");
  const fmtIco = (f: string) => (f === "PDF" ? "📄" : f === "Excel" ? "📊" : "📋");

  const submit = async () => {
    const template = reportTemplates.find((x) => x.id === form.report);
    if (!template) return;
    const recipients = form.recipients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const fallbackRecipients = user?.email ? [user.email] : [];
    if (apiMode) {
      try {
        await domainApi.createReportSchedule({
          name: lang === "en" ? template.nameEn : template.name,
          reportType: template.id,
          cadence: form.freq.toUpperCase() as ReportCadenceDto,
          recipients: recipients.length ? recipients : fallbackRecipients,
          filters: { time: form.time, format: form.format },
          isActive: form.active,
        });
        await reloadRef.current();
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
        return;
      }
      closeSchedule();
      setForm(emptyForm);
      toast({ type: "success", title: L("تمت الجدولة", "Scheduled"), message: lang === "en" ? template.nameEn : template.name });
      return;
    }
    setSchedules((previous) => [
      ...previous,
      {
        id: `sch-${Date.now()}`,
        reportId: template.id,
        name: lang === "en" ? template.nameEn : template.name,
        category: lang === "en" ? template.categoryEn : template.category,
        categoryEn: template.categoryEn,
        freq: form.freq,
        freqKey: form.freq,
        time: form.time,
        recipients: recipients.length ? recipients : fallbackRecipients,
        format: form.format,
        lastRun: "—",
        nextRun: `${L("التالي", "Next")} ${form.time}`,
        status: form.active ? "active" : "paused",
        runs: 0,
        successRate: null,
      },
    ]);
    closeSchedule();
    setForm(emptyForm);
    toast({ type: "success", title: L("تمت الجدولة", "Scheduled"), message: lang === "en" ? template.nameEn : template.name });
  };

  const runNow = async (schedule: Schedule) => {
    if (apiMode) {
      try {
        const run = await domainApi.runReportSchedule(schedule.id);
        await reloadRef.current();
        if (run.status === "failed") {
          toast({ type: "error", title: L("فشل تشغيل التقرير", "Report run failed"), message: schedule.name });
          return;
        }
        toast({ type: "success", title: L("تم تشغيل التقرير", "Report generated"), message: schedule.name });
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
      }
      return;
    }
    const entry: RunLogEntry = {
      id: `run-${Date.now()}`,
      at: new Date().toLocaleString(lang === "en" ? "en-US" : "ar-SA"),
      status: "success",
      duration: "—",
      by: L("يدوي", "Manual"),
    };
    setRunLog((previous) => [entry, ...previous]);
    setSchedules((previous) =>
      previous.map((x) => (x.id === schedule.id ? { ...x, lastRun: entry.at.split(" ")[0], runs: x.runs + 1 } : x)),
    );
    toast({ type: "success", title: L("تم تشغيل التقرير", "Report started"), message: schedule.name });
  };

  const toggleStatus = async (id: string) => {
    const schedule = schedules.find((x) => x.id === id);
    if (!schedule) return;
    const nextActive = schedule.status !== "active";
    if (apiMode) {
      try {
        await domainApi.updateReportSchedule(id, { isActive: nextActive });
        await reloadRef.current();
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
        return;
      }
    } else {
      setSchedules((previous) => previous.map((x) => (x.id === id ? { ...x, status: nextActive ? "active" : "paused" } : x)));
    }
    toast({
      type: nextActive ? "success" : "info",
      title: nextActive ? L("تم التفعيل", "Activated") : L("تم الإيقاف", "Paused"),
      message: schedule.name,
    });
  };

  const doDelete = async (id: string) => {
    const schedule = schedules.find((x) => x.id === id);
    if (apiMode) {
      try {
        await domainApi.deleteReportSchedule(id);
        await reloadRef.current();
      } catch (error) {
        toast({ type: "error", title: t("err.api"), message: serverReason(error) });
        return;
      }
    } else {
      setSchedules((previous) => previous.filter((x) => x.id !== id));
    }
    toast({ type: "success", title: L("تم حذف الجدولة", "Schedule deleted"), message: schedule?.name });
  };

  const userName = (id?: string | null) => {
    if (!id) return L("النظام", "System");
    const known = (usersStore.items as { id: string; name: string }[]).find((item) => item.id === id);
    return known?.name ?? L("مستخدم محذوف", "Deleted user");
  };

  const openHistory = (schedule: Schedule) => {
    setHistoryOpen(schedule);
    const own = runs.filter((run) => run.scheduleId === schedule.id);
    setRunLog(
      apiMode
        ? own.map((run) => {
            const created = new Date(run.createdAt).getTime();
            const done = run.completedAt ? new Date(run.completedAt).getTime() : null;
            return {
              id: run.id,
              at: new Date(run.createdAt).toLocaleString(lang === "en" ? "en-US" : "ar-SA"),
              status: run.status,
              duration: done ? `${Math.max(1, Math.round((done - created) / 1000))}${L("ث", "s")}` : "—",
              by: userName(run.requestedById),
              fileId: run.fileId,
            };
          })
        : runLog,
    );
  };

  const downloadRun = (runId: string) => {
    void domainApi
      .downloadReportRun(runId)
      .then((result) => openDownload(result.url))
      .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
  };

  return (
    <div>
      <PageHeader
        title={t("nav.scheduled")}
        description={L("التقارير المجدولة والتسليم الدوري وسجل التشغيل", "Scheduled reports, recurring delivery and run history")}
        breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }, { label: t("nav.scheduled") }]}
        actions={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setForm(emptyForm);
              setScheduleOpen(true);
            }}
          >
            {L("جدولة تقرير", "Schedule report")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
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
            placeholder={L("ابحث في الجداول…", "Search schedules…")}
            aria-label={L("ابحث في الجداول", "Search schedules")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الحالة", "Filter by status")}
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
        >
          <option value="all">{t("g.all")}</option>
          <option value="active">{t("g.active")}</option>
          <option value="paused">{L("متوقفة", "Paused")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {schedules.length}
        </span>
      </div>
      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title={L("لا توجد جداول", "No schedules")}
              description={L("أنشئ جدولة لتسليم التقارير دورياً.", "Create a schedule for recurring report delivery.")}
              action={
                <Button
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setForm(emptyForm);
                    setScheduleOpen(true);
                  }}
                >
                  {L("جدولة", "Schedule")}
                </Button>
              }
            />
          </Card>
        }
        columns={[
          {
            key: "name",
            header: L("التقرير", "Report"),
            sortValue: (r) => r.name,
            render: (r) => (
              <div>
                <p className="truncate font-bold text-navy-700 dark:text-navy-200">{r.name}</p>
                <Badge className="mt-0.5 bg-ink-100 text-[10px] text-ink-500 dark:bg-ink-800">
                  {lang === "en" ? r.categoryEn : r.category}
                </Badge>
              </div>
            ),
          },
          {
            key: "sched",
            header: L("الجدول", "Schedule"),
            sortValue: (r) => r.freqKey,
            render: (r) => (
              <div className="flex flex-col">
                <Badge className="w-fit bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                  <Clock className="h-3 w-3" /> {freqLbl(r.freqKey)}
                </Badge>
                <span className="mt-0.5 font-mono text-[10px] text-ink-400">{r.time}</span>
              </div>
            ),
          },
          {
            key: "rec",
            header: L("المستلمون", "Recipients"),
            render: (r) => (
              <div className="flex items-center gap-1" title={r.recipients.join(", ")}>
                <div className="flex -space-x-2">
                  {r.recipients.slice(0, 3).map((x: string) => (
                    <Avatar key={x} initials={x.slice(0, 2)} color="bg-navy-500" size="xs" ring />
                  ))}
                </div>
                {r.recipients.length > 3 && <span className="text-[10px] text-ink-400">+{r.recipients.length - 3}</span>}
              </div>
            ),
          },
          {
            key: "fmt",
            header: L("الصيغة", "Format"),
            sortValue: (r) => r.format,
            render: (r) => (
              <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">
                {fmtIco(r.format)} {r.format}
              </Badge>
            ),
          },
          {
            key: "last",
            header: L("آخر تشغيل", "Last run"),
            sortValue: (r) => r.lastRun,
            render: (r) => <span className="text-xs text-ink-500">{r.lastRun}</span>,
          },
          {
            key: "next",
            header: L("التشغيل القادم", "Next run"),
            render: (r) => (
              <div>
                <p className="font-mono text-[11px] font-semibold text-teal-600 dark:text-teal-400">{r.nextRun}</p>
                <span className="text-[10px] text-ink-400">
                  {r.runs} {L("تشغيل", "runs")}
                </span>
              </div>
            ),
          },
          {
            key: "sr",
            header: L("النجاح", "Success"),
            sortValue: (r) => r.successRate ?? -1,
            render: (r) =>
              r.successRate === null ? (
                <span className="text-xs text-ink-400" title={L("لا توجد تشغيلات مسجلة", "No runs recorded")}>
                  —
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "font-bold",
                      r.successRate >= 98
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : r.successRate >= 90
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                    )}
                  >
                    {r.successRate}%
                  </Badge>
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className={cn("h-full rounded-full", r.successRate >= 98 ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${r.successRate}%` }}
                    />
                  </div>
                </div>
              ),
          },
          {
            key: "status",
            header: t("g.status"),
            sortValue: (r) => r.status,
            render: (r) => (
              <Badge
                className={
                  r.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                }
                dot={r.status === "active" ? "bg-emerald-500" : undefined}
              >
                {r.status === "active" ? t("g.active") : L("متوقفة", "Paused")}
              </Badge>
            ),
          },
        ]}
        rowActions={(r) => (
          <RowMenu
            items={[
              { label: L("تشغيل الآن", "Run now"), icon: <Play className="h-4 w-4" />, onClick: () => void runNow(r) },
              {
                label: L("سجل التشغيل", "Run history"),
                icon: <ScrollText className="h-4 w-4" />,
                onClick: () => openHistory(r),
              },
              {
                label: L("عرض التقرير", "View report"),
                icon: <Eye className="h-4 w-4" />,
                onClick: () => navigate(`/reports/${r.reportId}`),
              },
              {
                label: r.status === "active" ? L("إيقاف", "Pause") : L("تفعيل", "Activate"),
                icon: r.status === "active" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />,
                onClick: () => void toggleStatus(r.id),
              },
              { label: t("g.delete"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTarget(r) },
            ]}
          />
        )}
      />
      <ScheduleReportModal
        open={scheduleOpen}
        form={form}
        apiMode={apiMode}
        onFormChange={setForm}
        onClose={closeSchedule}
        onSubmit={() => void submit()}
      />

      <RunHistoryModal history={historyOpen} runLog={runLog} onClose={() => setHistoryOpen(null)} onDownload={downloadRun} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void doDelete(deleteTarget.id);
        }}
        title={L("حذف الجدولة", "Delete schedule")}
        message={L(
          `سيتم حذف جدولة «${deleteTarget?.name ?? ""}» ولن تُسلَّم التقارير دورياً بعد الآن.`,
          `The schedule "${deleteTarget?.name ?? ""}" will be deleted and periodic delivery will stop.`,
        )}
        confirmText={t("g.delete")}
        danger
      />
    </div>
  );
}
