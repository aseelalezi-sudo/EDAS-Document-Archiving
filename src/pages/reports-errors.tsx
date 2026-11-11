import { useState } from "react";
import { Check, X, Activity, Search, AlertTriangle, Clock, Eye, Server, Bug, Users } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Avatar, Input, Select, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu, ExportMenu } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { ErrorItem } from "../types";
import { ErrorDetailModal } from "./reports-errors-parts";
export function Errors() {
  const { t, lang, toast, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [detail, setDetail] = useState<ErrorItem | null>(null);
  const [q, setQ] = useState("");
  const [fSev, setFSev] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [note, setNote] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const { errors: errStore, setErrorStatus, assignError, addErrorNote, clearErrors } = useDocsStore();
  const errList = errStore.items;

  const filtered = errList.filter((e) => {
    const ql = q.toLowerCase();
    if (
      q &&
      !(
        e.code.toLowerCase().includes(ql) ||
        e.message.includes(q) ||
        e.module.includes(q) ||
        (e.affectedUser ?? "").includes(q) ||
        (e.owner ?? "").includes(q)
      )
    )
      return false;
    if (fSev !== "all" && e.severity !== fSev) return false;
    if (fStatus !== "all" && e.status !== fStatus) return false;
    return true;
  });

  const sevCls = (s: string) =>
    s === "critical"
      ? "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
      : s === "high"
        ? "bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30"
        : s === "medium"
          ? "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30"
          : "bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30";
  const sevGrad = (s: string) =>
    s === "critical"
      ? "from-rose-400 to-rose-600"
      : s === "high"
        ? "from-orange-400 to-orange-600"
        : s === "medium"
          ? "from-amber-400 to-amber-600"
          : "from-sky-400 to-sky-600";
  const sevLabel = (s: string) =>
    s === "critical" ? L("حرج", "Critical") : s === "high" ? L("عالي", "High") : s === "medium" ? L("متوسط", "Medium") : L("منخفض", "Low");
  const stCls = (s: string) =>
    s === "new"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : s === "investigating"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : s === "resolved"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-ink-100 text-ink-500 dark:bg-ink-800";
  const statusLabel = (s: string) =>
    s === "new"
      ? L("جديد", "New")
      : s === "investigating"
        ? L("قيد التحقيق", "Investigating")
        : s === "resolved"
          ? L("محلول", "Resolved")
          : L("متجاهل", "Ignored");

  const moduleCount = errList.reduce((acc: Record<string, number>, e) => {
    acc[e.module] = (acc[e.module] ?? 0) + 1;
    return acc;
  }, {});
  const topModule = Object.entries(moduleCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const stats = [
    {
      label: L("جديدة", "New"),
      value: errList.filter((e) => e.status === "new").length,
      icon: AlertTriangle,
      color: "from-rose-400 to-rose-600",
      f: "new",
    },
    {
      label: L("حرجة", "Critical"),
      value: errList.filter((e) => e.severity === "critical").length,
      icon: Bug,
      color: "from-rose-500 to-rose-700",
      f: null,
    },
    {
      label: L("قيد التحقيق", "Investigating"),
      value: errList.filter((e) => e.status === "investigating").length,
      icon: Clock,
      color: "from-amber-400 to-amber-600",
      f: "investigating",
    },
    {
      label: L("محلولة", "Resolved"),
      value: errList.filter((e) => e.status === "resolved").length,
      icon: Check,
      color: "from-emerald-400 to-emerald-600",
      f: "resolved",
    },
    { label: L("أكثر وحدة", "Top module"), value: topModule, icon: Server, color: "from-purple-400 to-purple-600", f: null },
  ];

  const changeStatus = (id: string, status: ErrorItem["status"]) => {
    setErrorStatus(id, status);
    setDetail((d) => (d && d.id === id ? { ...d, status } : d));
    toast({
      type: status === "resolved" ? "success" : "info",
      title: L("تم تحديث الحالة", "Status updated"),
      message: statusLabel(status),
    });
  };
  const doAssign = (id: string, owner: string) => {
    assignError(id, owner);
    setDetail((d) => (d && d.id === id ? { ...d, owner } : d));
    toast({ type: "info", title: L("تم التعيين", "Assigned"), message: owner });
  };
  const addNote = () => {
    if (!note.trim() || !detail) return;
    const entry = {
      by: user?.name ?? "—",
      text: note.trim(),
      at: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
    };
    addErrorNote(detail.id, entry);
    setDetail((d) => (d && d.id === detail.id ? { ...d, notes: [...(d.notes ?? []), entry] } : d));
    setNote("");
  };

  return (
    <div>
      <PageHeader
        title={t("nav.errors")}
        description={L(
          "أخطاء واجهة الويب المسجّلة في هذا المتصفح مع إمكانية المتابعة والتعيين",
          "Web-client errors recorded in this browser, with triage and assignment",
        )}
        breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }, { label: t("nav.errors") }]}
        actions={
          <div className="flex items-center gap-2">
            {errList.length > 0 && (
              <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setClearOpen(true)}>
                {L("مسح السجل", "Clear log")}
              </Button>
            )}
            <ExportMenu
              rows={filtered.map((e) => ({
                datetime: e.datetime,
                severity: e.severity,
                code: e.code,
                module: e.module,
                path: e.path,
                message: e.message,
                affectedUser: e.affectedUser,
                correlation: e.correlation,
                status: e.status,
                owner: e.owner,
              }))}
              filename="edas-errors"
            />
          </div>
        }
      />

      <div className="mb-3 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
        {L(
          "يُسجَّل هنا كل فشل في نداءات الخادم من هذه الواجهة (حتى 50 حدثاً). حالات المتابعة والتعيين محلية على هذا المتصفح؛ سجل الأخطاء المركزي على الخادم غير متاح بعد.",
          "Every failed server call from this interface is recorded here (up to 50 entries). Triage states and assignments are local to this browser; a central server-side error log is not available yet.",
        )}
      </div>

      {/* Clickable stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => {
          const active = s.f && fStatus === s.f;
          return (
            <button
              key={s.label}
              type="button"
              aria-pressed={!!active}
              onClick={() => s.f && setFStatus(active ? "all" : (s.f as string))}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-3.5 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card",
                active
                  ? "border-navy-400 bg-navy-50 dark:border-navy-600 dark:bg-navy-900/40"
                  : "border-ink-200/70 bg-white dark:border-ink-800 dark:bg-ink-900/80",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", s.color)}>
                  <s.icon className="h-4 w-4" />
                </span>
                {typeof s.value === "number" && <span className="text-xl font-extrabold text-ink-900 dark:text-white">{s.value}</span>}
              </div>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{s.label}</p>
              {typeof s.value === "string" && <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{s.value}</p>}
              {active && <Check className="absolute end-3 top-3 h-3.5 w-3.5 text-navy-600" />}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
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
            placeholder={L("ابحث في الأخطاء…", "Search errors…")}
            aria-label={L("ابحث في الأخطاء", "Search errors")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الخطورة", "Filter by severity")}
          value={fSev}
          onChange={(e) => setFSev(e.target.value)}
        >
          <option value="all">
            {t("g.all")} — {L("الخطورة", "Severity")}
          </option>
          <option value="critical">{L("حرج", "Critical")}</option>
          <option value="high">{L("عالي", "High")}</option>
          <option value="medium">{L("متوسط", "Medium")}</option>
          <option value="low">{L("منخفض", "Low")}</option>
        </Select>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الحالة", "Filter by status")}
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
        >
          <option value="all">{t("g.all")}</option>
          <option value="new">{L("جديد", "New")}</option>
          <option value="investigating">{L("قيد التحقيق", "Investigating")}</option>
          <option value="resolved">{L("محلول", "Resolved")}</option>
          <option value="ignored">{L("متجاهل", "Ignored")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {errList.length}
        </span>
      </div>

      {/* Table */}
      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              icon={<Bug className="h-8 w-8" />}
              title={L("لا توجد أخطاء مطابقة", "No matching errors")}
              description={L("لا أخطاء مطابقة للفلاتر الحالية — وهذا خبر جيد!", "No errors match the current filters — good news!")}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setFSev("all");
                    setFStatus("all");
                  }}
                >
                  {L("مسح الفلاتر", "Clear filters")}
                </Button>
              }
            />
          </Card>
        }
        onRowClick={(r) => {
          setDetail(r);
        }}
        columns={[
          {
            key: "sev",
            header: L("الخطورة", "Severity"),
            sortValue: (r) => r.severity,
            render: (r) => (
              <div className="flex items-center gap-2">
                <span className={cn("flex h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b", sevGrad(r.severity))} />
                <Badge className={sevCls(r.severity)}>{sevLabel(r.severity)}</Badge>
              </div>
            ),
          },
          {
            key: "code",
            header: L("الرمز", "Code"),
            sortValue: (r) => r.code,
            render: (r) => <span className="font-mono text-xs font-bold text-ink-700 dark:text-ink-200">{r.code}</span>,
          },
          {
            key: "msg",
            header: L("الرسالة", "Message"),
            render: (r) => (
              <div className="max-w-64">
                <p className="truncate text-xs font-medium text-ink-700 dark:text-ink-200">{r.message}</p>
                <p className="truncate font-mono text-[10px] text-ink-400">
                  {r.module} · {r.path}
                </p>
              </div>
            ),
          },
          {
            key: "time",
            header: L("الوقت", "Time"),
            sortValue: (r) => r.datetime,
            render: (r) => <span className="font-mono text-[11px] text-ink-500">{r.datetime}</span>,
          },
          {
            key: "user",
            header: L("المتأثر", "Affected"),
            render: (r) => <span className="text-[11px] text-ink-500">{r.affectedUser}</span>,
          },
          {
            key: "owner",
            header: L("المسؤول", "Owner"),
            sortValue: (r) => r.owner,
            render: (r) => (
              <div className="flex items-center gap-1.5">
                {r.owner !== "—" && <Avatar initials={r.owner.slice(0, 2)} color="bg-purple-600" size="xs" />}
                <span className="text-[11px] text-ink-500">{r.owner}</span>
              </div>
            ),
          },
          {
            key: "status",
            header: t("g.status"),
            sortValue: (r) => r.status,
            render: (r) => (
              <Badge className={stCls(r.status)} dot={r.status === "new" ? "bg-rose-500" : undefined}>
                {statusLabel(r.status)}
              </Badge>
            ),
          },
        ]}
        rowActions={(r) => (
          <RowMenu
            items={[
              {
                label: L("عرض التفاصيل", "Details"),
                icon: <Eye className="h-4 w-4" />,
                onClick: () => {
                  setDetail(r);
                },
              },
              ...(r.status !== "resolved"
                ? [
                    {
                      label: L("تحديد كمحلول", "Mark resolved"),
                      icon: <Check className="h-4 w-4" />,
                      onClick: () => changeStatus(r.id, "resolved"),
                    },
                  ]
                : []),
              ...(r.status !== "investigating"
                ? [
                    {
                      label: L("بدء التحقيق", "Start investigating"),
                      icon: <Activity className="h-4 w-4" />,
                      onClick: () => changeStatus(r.id, "investigating"),
                    },
                  ]
                : []),
              ...(r.status !== "ignored"
                ? [{ label: L("تجاهل", "Ignore"), icon: <X className="h-4 w-4" />, onClick: () => changeStatus(r.id, "ignored") }]
                : []),
              {
                label: L("تعيين لي", "Assign to me"),
                icon: <Users className="h-4 w-4" />,
                onClick: () => doAssign(r.id, user?.name ?? "—"),
              },
            ]}
          />
        )}
      />

      <ErrorDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        onChangeStatus={changeStatus}
        onAssign={doAssign}
        notes={detail?.notes ?? []}
        note={note}
        onNote={setNote}
        onAddNote={addNote}
        sevCls={sevCls}
        sevGrad={sevGrad}
        sevLabel={sevLabel}
        statusLabel={statusLabel}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          clearErrors();
          setDetail(null);
          toast({ type: "success", title: L("تم مسح السجل", "Error log cleared") });
        }}
        title={L("مسح سجل الأخطاء", "Clear error log")}
        message={L(
          `سيتم حذف ${errList.length} خطأ مسجّلاً في هذا المتصفح نهائياً.`,
          `All ${errList.length} errors recorded in this browser will be permanently removed.`,
        )}
        confirmText={L("مسح", "Clear")}
        danger
      />
    </div>
  );
}
