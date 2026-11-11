import { useState } from "react";
import {
  BarChart3,
  FileChartColumn,
  Clock,
  Play,
  Plus,
  Download,
  Save,
  Activity,
  TrendingUp,
  FileText,
  Bug,
  Check,
  X,
  Database,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Table,
  PieChart as Pie,
} from "lucide-react";
import { useApp } from "../store";
import type { LucideIcon } from "lucide-react";
import { cn, Button, Card, Badge, Field, Input, Select, EmptyState } from "../components/ui";
import { PageHeader, SectionTitle, downloadCsv } from "../components/shared";
import { BarChartCard, LineChartCard, DonutChart } from "../components/charts";
import { deptName, STATUS_META } from "../data";
import { useDocsStore } from "../store-docs";
import { usePersistentState } from "../utils/persist";
import type { ErrorItem } from "../types";
/* ---------------- Report Builder (real data engine) ---------------- */
type Source = "documents" | "activity" | "errors" | "workflows" | "retention";
type ChartType = "table" | "bar" | "line" | "pie";
type CellValue = string | number | undefined;
type ReportRow = Record<string, CellValue>;
type FieldDef = { key: string; label: [string, string]; get: (r: ReportRow) => CellValue };

const FIELD_DEFS: Record<Source, FieldDef[]> = {
  documents: [
    { key: "docNo", label: ["رقم الوثيقة", "Document No."], get: (r) => r.docNo },
    { key: "title", label: ["العنوان", "Title"], get: (r) => r.title },
    { key: "category", label: ["التصنيف", "Category"], get: (r) => r.category },
    { key: "department", label: ["الإدارة", "Department"], get: (r) => r.department },
    { key: "owner", label: ["المالك", "Owner"], get: (r) => r.owner },
    { key: "status", label: ["الحالة", "Status"], get: (r) => r.status },
    { key: "classification", label: ["السرية", "Classification"], get: (r) => r.classification },
    { key: "version", label: ["الإصدار", "Version"], get: (r) => r.version },
    { key: "size", label: ["الحجم", "Size"], get: (r) => r.size },
    { key: "createdAt", label: ["تاريخ الإنشاء", "Created"], get: (r) => r.createdAt },
    { key: "modifiedAt", label: ["آخر تعديل", "Modified"], get: (r) => r.modifiedAt },
    { key: "retentionEnd", label: ["نهاية الاحتفاظ", "Retention end"], get: (r) => r.retentionEnd },
  ],
  activity: [
    { key: "datetime", label: ["الوقت", "Time"], get: (r) => r.datetime },
    { key: "user", label: ["المستخدم", "User"], get: (r) => r.user },
    { key: "module", label: ["الوحدة", "Module"], get: (r) => r.module },
    { key: "action", label: ["العملية", "Action"], get: (r) => r.action },
    { key: "entityType", label: ["نوع الكيان", "Entity type"], get: (r) => r.entityType },
    { key: "result", label: ["النتيجة", "Result"], get: (r) => r.result },
    { key: "ip", label: ["IP", "IP"], get: (r) => r.ip },
    { key: "correlation", label: ["الترابط", "Correlation"], get: (r) => r.correlation },
  ],
  errors: [
    { key: "datetime", label: ["الوقت", "Time"], get: (r) => r.datetime },
    { key: "severity", label: ["الخطورة", "Severity"], get: (r) => r.severity },
    { key: "code", label: ["الرمز", "Code"], get: (r) => r.code },
    { key: "module", label: ["الوحدة", "Module"], get: (r) => r.module },
    { key: "message", label: ["الرسالة", "Message"], get: (r) => r.message },
    { key: "affectedUser", label: ["المستخدم المتأثر", "Affected user"], get: (r) => r.affectedUser },
    { key: "status", label: ["الحالة", "Status"], get: (r) => r.status },
    { key: "owner", label: ["المسؤول", "Owner"], get: (r) => r.owner },
  ],
  workflows: [
    { key: "docTitle", label: ["الوثيقة", "Document"], get: (r) => r.docTitle },
    { key: "workflow", label: ["سير العمل", "Workflow"], get: (r) => r.workflow },
    { key: "step", label: ["الخطوة", "Step"], get: (r) => r.step },
    { key: "from", label: ["المرسل", "Sender"], get: (r) => r.from },
    { key: "priority", label: ["الأولوية", "Priority"], get: (r) => r.priority },
    { key: "due", label: ["الاستحقاق", "Due"], get: (r) => r.due },
    { key: "slaStatus", label: ["SLA", "SLA"], get: (r) => r.slaStatus },
    { key: "age", label: ["العمر", "Age"], get: (r) => r.age },
  ],
  retention: [
    { key: "docTitle", label: ["الوثيقة", "Document"], get: (r) => r.docTitle },
    { key: "policy", label: ["السياسة", "Policy"], get: (r) => r.policy },
    { key: "retentionEnd", label: ["نهاية الاحتفاظ", "Retention end"], get: (r) => r.retentionEnd },
    { key: "owner", label: ["المالك", "Owner"], get: (r) => r.owner },
    { key: "daysLeft", label: ["الأيام المتبقية", "Days left"], get: (r) => r.daysLeft },
    { key: "proposedAction", label: ["الإجراء المقترح", "Proposed action"], get: (r) => r.proposedAction },
    { key: "reviewStatus", label: ["حالة المراجعة", "Review status"], get: (r) => r.reviewStatus },
  ],
};

interface FilterRule {
  id: string;
  field: string;
  op: string;
  value: string;
}

export function ReportBuilder() {
  const { t, lang, toast, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { scopedDocs, tasks, auditLog, retention, errors: errorStore } = useDocsStore();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("documents");
  const [fields, setFields] = useState<string[]>(["docNo", "title", "department", "status"]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [groupField, setGroupField] = useState<string>("department");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [reportName, setReportName] = useState("");
  const [savedReports, setSavedReports] = usePersistentState<
    { id: string; name: string; by: string; at: string; source: Source; count: number; rows: Record<string, unknown>[] }[]
  >("reportBuilderSaved", []);

  const steps = [
    L("مصدر البيانات", "Data source"),
    L("الحقول", "Fields"),
    t("g.filter"),
    L("التجميع", "Grouping"),
    L("نوع العرض", "Chart type"),
    L("المعاينة", "Preview"),
  ];
  const sourceDefs: { id: Source; label: [string, string]; icon: LucideIcon; count: number }[] = [
    { id: "documents", label: ["الوثائق", "Documents"], icon: FileText, count: scopedDocs.length },
    { id: "activity", label: ["سجلات النشاط", "Activity logs"], icon: Activity, count: auditLog.length },
    { id: "errors", label: ["سجلات الأخطاء", "Error logs"], icon: Bug, count: errorStore.items.length },
    { id: "workflows", label: ["مسارات العمل", "Workflows"], icon: Play, count: tasks.length },
    { id: "retention", label: ["عناصر الاحتفاظ", "Retention items"], icon: Clock, count: retention.length },
  ];

  /* ---------- Data pipeline ---------- */
  const rawRows: ReportRow[] = (() => {
    switch (source) {
      case "documents":
        return scopedDocs.map((d) => ({
          docNo: d.docNo,
          title: lang === "en" ? d.titleEn : d.title,
          category: lang === "en" ? d.categoryEn : d.category,
          department: deptName(d.deptId, lang),
          owner: d.owner,
          status: STATUS_META[d.status] ? t(STATUS_META[d.status].key) : d.status,
          classification: t(`doc.classification.${d.classification}`),
          version: d.version,
          size: d.size,
          createdAt: d.createdAt,
          modifiedAt: d.modifiedAt,
          retentionEnd: d.retentionEnd,
        }));
      case "activity":
        return auditLog.map((a) => ({
          datetime: a.datetime,
          user: a.user,
          module: a.module,
          action: a.action,
          entityType: a.entityType,
          result: a.result,
          ip: a.ip,
          correlation: a.correlation,
        }));
      case "errors":
        return (errorStore.items as ErrorItem[]).map((e) => ({
          datetime: e.datetime,
          severity: e.severity,
          code: e.code,
          module: e.module,
          message: e.message,
          affectedUser: e.affectedUser,
          status: e.status,
          owner: e.owner,
        }));
      case "workflows":
        return tasks.map((w) => ({
          docTitle: w.docTitle,
          workflow: w.workflow,
          step: w.step,
          from: w.from,
          priority: w.priority,
          due: w.due,
          slaStatus: w.slaStatus,
          age: w.age,
        }));
      case "retention":
        return retention.map((r) => ({
          docTitle: r.docTitle,
          policy: r.policy,
          retentionEnd: r.retentionEnd,
          owner: r.owner,
          daysLeft: r.daysLeft,
          proposedAction: lang === "en" ? r.proposedActionEn : r.proposedAction,
          reviewStatus: r.reviewStatus,
        }));
      default:
        return [];
    }
  })();

  const OPS = [
    { id: "eq", label: ["يساوي", "equals"] },
    { id: "neq", label: ["لا يساوي", "not equals"] },
    { id: "contains", label: ["يحتوي", "contains"] },
    { id: "starts", label: ["يبدأ بـ", "starts with"] },
  ];

  const applyFilters = (rows: ReportRow[]) =>
    rows.filter((row) =>
      filters.every((f) => {
        const def = FIELD_DEFS[source].find((d) => d.key === f.field);
        if (!def || !f.value) return true;
        const val = String(def.get(row) ?? "");
        const target = f.value;
        switch (f.op) {
          case "eq":
            return val === target;
          case "neq":
            return val !== target;
          case "contains":
            return val.toLowerCase().includes(target.toLowerCase());
          case "starts":
            return val.toLowerCase().startsWith(target.toLowerCase());
          default:
            return true;
        }
      }),
    );

  const filtered = applyFilters(rawRows);
  const activeFields = fields.map((key) => FIELD_DEFS[source].find((f) => f.key === key)).filter((f): f is FieldDef => f !== undefined);

  /* ---------- Grouping ---------- */
  const grouped = (() => {
    const gDef = FIELD_DEFS[source].find((f) => f.key === groupField);
    if (!gDef) return [];
    const buckets = new Map<string, number>();
    for (const row of filtered) {
      const key = String(gDef.get(row) ?? "—");
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  })();

  const CHART_COLORS = ["#4f46e5", "#14a89c", "#f59e0b", "#8b5cf6", "#0ea5e9", "#f43f5e", "#10b981", "#6366f1", "#d946ef", "#06b6d4"];

  const buildRows = () => filtered.map((r) => Object.fromEntries(activeFields.map((f) => [f.label[lang === "en" ? 1 : 0], f.get(r)])));

  const saveReport = () => {
    if (!reportName.trim() || filtered.length === 0) return;
    setSavedReports((prev) => [
      {
        id: `rb-${Date.now()}`,
        name: reportName,
        by: user?.name ?? "—",
        at: new Date().toLocaleDateString(lang === "en" ? "en" : "ar-SA"),
        source,
        count: filtered.length,
        rows: buildRows(),
      },
      ...prev,
    ]);
    toast({ type: "success", title: L("تم حفظ التقرير", "Report saved"), message: reportName });
    setReportName("");
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    downloadCsv(`${reportName || source}.csv`, buildRows());
    toast({ type: "success", title: L("تم تنزيل CSV", "CSV downloaded"), message: `${filtered.length} ${L("صف", "rows")}` });
  };

  const exportSaved = (report: { name: string; rows: Record<string, unknown>[] }) => {
    if (report.rows.length === 0) return;
    downloadCsv(`${report.name}.csv`, report.rows);
    toast({ type: "success", title: L("تم تنزيل CSV", "CSV downloaded"), message: `${report.rows.length} ${L("صف", "rows")}` });
  };

  return (
    <div>
      <PageHeader
        title={t("nav.reportBuilder")}
        description={L("أنشئ تقريراً مخصصاً من بياناتك الفعلية", "Build a custom report from your actual data")}
        breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }, { label: t("nav.reportBuilder") }]}
        actions={
          <>
            <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!filtered.length}>
              {L("تصدير CSV", "Export CSV")}
            </Button>
            <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={saveReport} disabled={!reportName.trim() || !filtered.length}>
              {L("حفظ", "Save")}
            </Button>
          </>
        }
      />

      {/* Stepper */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
              i === step ? "bg-navy-600 text-white" : i < step ? "text-emerald-600" : "text-ink-500",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                i === step ? "bg-white/20" : i < step ? "bg-emerald-100" : "bg-ink-100 dark:bg-ink-800",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s}
          </button>
        ))}
      </div>

      {/* Live summary bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-xs dark:border-navy-800 dark:bg-navy-900/30">
        <Database className="h-3.5 w-3.5 text-navy-500" />
        <span className="font-semibold text-navy-700 dark:text-navy-200">
          {sourceDefs.find((s) => s.id === source)?.label[lang === "en" ? 1 : 0]}
        </span>
        <Badge className="bg-white text-navy-600 dark:bg-ink-900 dark:text-navy-300">
          {rawRows.length} {L("سجل", "records")}
        </Badge>
        {filters.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            {filters.length} {L("فلتر", "filters")}
          </Badge>
        )}
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {filtered.length} {L("نتيجة", "results")}
        </Badge>
        {fields.length > 0 && (
          <Badge className="bg-white text-ink-600 dark:bg-ink-900">
            {fields.length} {L("حقل", "fields")}
          </Badge>
        )}
        <span className="ms-auto text-ink-400">{L("البيانات تتحدث فورياً مع كل تغيير", "Data updates live with every change")}</span>
      </div>

      <Card className="min-h-64">
        {/* Step 0: Source */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {sourceDefs.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSource(s.id);
                  setFields(FIELD_DEFS[s.id].slice(0, 4).map((f) => f.key));
                  setGroupField(FIELD_DEFS[s.id][0].key);
                  setFilters([]);
                }}
                className={cn(
                  "group flex flex-col items-center rounded-2xl border-2 p-5 transition-all hover:-translate-y-0.5",
                  source === s.id
                    ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                    : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl transition-transform",
                    source === s.id ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-400 group-hover:scale-110 dark:bg-ink-800",
                  )}
                >
                  <s.icon className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-bold text-ink-700 dark:text-ink-200">{s.label[lang === "en" ? 1 : 0]}</p>
                <Badge
                  className={cn(
                    "mt-1.5",
                    source === s.id
                      ? "bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-200"
                      : "bg-ink-100 text-ink-500 dark:bg-ink-800",
                  )}
                >
                  {s.count} {L("سجل", "records")}
                </Badge>
                {source === s.id && <Check className="mt-2 h-4 w-4 text-navy-600" />}
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Fields (drag order) */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("الحقول المتاحة", "Available fields")}</p>
              <div className="space-y-1.5">
                {FIELD_DEFS[source].map((f) => {
                  const on = fields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFields((prev) => (on ? prev.filter((x) => x !== f.key) : [...prev, f.key]))}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-start text-sm transition-colors",
                        on
                          ? "border-navy-300 bg-navy-50 dark:border-navy-700 dark:bg-navy-900/40"
                          : "border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                          on
                            ? "border-navy-600 bg-navy-600 text-white dark:border-navy-400 dark:bg-navy-500"
                            : "border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-900",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className={cn("flex-1", on && "font-semibold text-navy-700 dark:text-navy-200")}>
                        {f.label[lang === "en" ? 1 : 0]}
                      </span>
                      {on && (
                        <Badge className="bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-300">
                          #{fields.indexOf(f.key) + 1}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("ترتيب الأعمدة", "Column order")}</p>
              <div className="space-y-1.5 rounded-xl border border-dashed border-ink-300 p-2 dark:border-ink-700">
                {activeFields.length === 0 && (
                  <p className="py-6 text-center text-xs text-ink-400">{L("اختر حقلاً واحداً على الأقل", "Select at least one field")}</p>
                )}
                {activeFields.map((f, i) => (
                  <div key={f.key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-soft dark:bg-ink-900">
                    <GripVertical className="h-3.5 w-3.5 text-ink-300" />
                    <Badge className="bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-300">{i + 1}</Badge>
                    <span className="flex-1 font-medium text-ink-700 dark:text-ink-200">{f.label[lang === "en" ? 1 : 0]}</span>
                    <button
                      type="button"
                      aria-label={L("نقل لأعلى", "Move up")}
                      onClick={() =>
                        setFields((prev) => {
                          if (i === 0) return prev;
                          const n = [...prev];
                          [n[i - 1], n[i]] = [n[i], n[i - 1]];
                          return n;
                        })
                      }
                      disabled={i === 0}
                      className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-800"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={L("نقل لأسفل", "Move down")}
                      onClick={() =>
                        setFields((prev) => {
                          if (i === prev.length - 1) return prev;
                          const n = [...prev];
                          [n[i + 1], n[i]] = [n[i], n[i + 1]];
                          return n;
                        })
                      }
                      disabled={i === activeFields.length - 1}
                      className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-800"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Filters (real engine) */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("قواعد التصفية", "Filter rules")}</p>
            {filters.length === 0 && (
              <div className="rounded-xl border border-dashed border-ink-300 py-8 text-center text-sm text-ink-400 dark:border-ink-700">
                {L("لا فلاتر — يتم عرض كل السجلات", "No filters — showing all records")}
              </div>
            )}
            {filters.map((f) => {
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/50 p-2.5 dark:border-ink-800 dark:bg-ink-950"
                >
                  <Select
                    className="w-44"
                    value={f.field}
                    onChange={(e) =>
                      setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, field: e.target.value, value: "" } : x)))
                    }
                  >
                    {FIELD_DEFS[source].map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label[lang === "en" ? 1 : 0]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="w-32"
                    value={f.op}
                    onChange={(e) => setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, op: e.target.value } : x)))}
                  >
                    {OPS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label[lang === "en" ? 1 : 0]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="min-w-32 flex-1"
                    placeholder={L("القيمة…", "Value…")}
                    value={f.value}
                    onChange={(e) => setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                  />
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {applyFilters(rawRows).length}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={L("حذف الفلتر", "Remove filter")}
                    onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  setFilters((prev) => [...prev, { id: `f-${Date.now()}`, field: FIELD_DEFS[source][0].key, op: "contains", value: "" }])
                }
              >
                {L("إضافة فلتر", "Add filter")}
              </Button>
              {filters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
                  {t("g.clear")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Grouping */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={L("تجميع حسب", "Group by")}>
                <Select value={groupField} onChange={(e) => setGroupField(e.target.value)}>
                  {FIELD_DEFS[source].map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label[lang === "en" ? 1 : 0]}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="self-end pb-2 text-xs text-ink-400">
                {L("يُجمَّع التقرير بعدد السجلات لكل قيمة.", "The report groups records by count for each value.")}
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("معاينة التجميع", "Grouping preview")}</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {grouped.slice(0, 12).map((g, i) => (
                  <div key={g.name} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 truncate text-xs font-semibold text-ink-600 dark:text-ink-300">{g.name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(g.value / Math.max(...grouped.map((x) => x.value))) * 100}%`,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="w-8 text-end text-xs font-bold text-ink-700 dark:text-ink-200">{g.value}</span>
                  </div>
                ))}
                {grouped.length === 0 && <p className="py-4 text-center text-xs text-ink-400">{L("لا بيانات", "No data")}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Chart type */}
        {step === 4 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                ["table", L("جدول", "Table"), Table],
                ["bar", L("أعمدة", "Bar"), BarChart3],
                ["line", L("خطي", "Line"), TrendingUp],
                ["pie", L("دائري", "Pie"), Pie],
              ] as [ChartType, string, any][]
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setChartType(v)}
                className={cn(
                  "group flex flex-col items-center rounded-2xl border-2 p-6 transition-all hover:-translate-y-0.5",
                  chartType === v
                    ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                    : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl transition-transform",
                    chartType === v ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-400 group-hover:scale-110 dark:bg-ink-800",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-bold text-ink-700 dark:text-ink-200">{label}</p>
                {chartType === v && <Check className="mt-2 h-4 w-4 text-navy-600" />}
              </button>
            ))}
          </div>
        )}

        {/* Step 5: Preview (live) */}
        {step === 5 && (
          <div className="space-y-4">
            <Field label={L("اسم التقرير", "Report name")}>
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder={L("مثال: وثائق المالية المعتمدة", "e.g. Approved Finance docs")}
              />
            </Field>

            {/* Chart preview */}
            {chartType !== "table" && grouped.length > 0 && (
              <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">
                  {L("الرسم البياني", "Chart")} · {L("عدد", "count")} {L("حسب", "by")}{" "}
                  {FIELD_DEFS[source].find((f) => f.key === groupField)?.label[lang === "en" ? 1 : 0]}
                </p>
                {chartType === "bar" && (
                  <BarChartCard
                    data={grouped}
                    xKey="name"
                    bars={[{ key: "value", name: L("العدد", "Count"), color: "#4f46e5" }]}
                    height={220}
                  />
                )}
                {chartType === "line" && (
                  <LineChartCard data={grouped} lines={[{ key: "value", name: L("العدد", "Count"), color: "#14a89c" }]} height={220} />
                )}
                {chartType === "pie" && (
                  <DonutChart
                    data={grouped.map((g, i) => ({ name: g.name, value: g.value, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                    height={220}
                  />
                )}
              </div>
            )}

            {/* Table preview */}
            {chartType === "table" && activeFields.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-50 text-[11px] font-bold uppercase text-ink-400 dark:bg-ink-950">
                      {activeFields.map((f) => (
                        <th key={f.key} className="px-3 py-2.5 text-start">
                          {f.label[lang === "en" ? 1 : 0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-t border-ink-100 dark:border-ink-800">
                        {activeFields.map((f) => (
                          <td key={f.key} className="px-3 py-2 text-ink-700 dark:text-ink-200">
                            {String(f.get(row) ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 8 && (
                  <p className="border-t border-ink-100 py-2 text-center text-xs text-ink-400 dark:border-ink-800">
                    {L(`عرض أول 8 من ${filtered.length} سجل`, `Showing first 8 of ${filtered.length} records`)}
                  </p>
                )}
              </div>
            )}
            {filtered.length === 0 && (
              <Card>
                <EmptyState
                  variant="search"
                  title={L("لا نتائج", "No results")}
                  description={L("عدّل الفلاتر أو مصدر البيانات", "Adjust filters or data source")}
                />
              </Card>
            )}
          </div>
        )}
      </Card>

      {/* Saved reports */}
      {savedReports.length > 0 && (
        <Card className="mt-4" pad={false}>
          <div className="px-4 pt-4">
            <SectionTitle title={L("التقارير المحفوظة", "Saved reports")} icon={<Save className="h-4 w-4 text-navy-500" />} />
            <p className="mt-1 text-xs text-ink-400">
              {L(
                "تُحفظ هذه التقارير في هذا المتصفح ولا تُخزَّن على الخادم.",
                "These reports are stored in this browser and are not saved on the server.",
              )}
            </p>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {savedReports.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileChartColumn className="h-4 w-4 shrink-0 text-navy-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-700 dark:text-ink-200">{r.name}</p>
                  <p className="text-xs text-ink-400">
                    {r.by} · {r.at}
                  </p>
                </div>
                <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                  {r.count} {L("سجل", "records")}
                </Badge>
                <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportSaved(r)}>
                  {L("تصدير", "Export")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600"
                  icon={<X className="h-3.5 w-3.5" />}
                  aria-label={L("حذف التقرير المحفوظ", "Remove saved report")}
                  onClick={() => setSavedReports((prev) => prev.filter((x) => x.id !== r.id))}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          {t("g.previous")}
        </Button>
        <div className="flex gap-2">
          {step < 5 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && activeFields.length === 0}>
              {t("g.next")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                icon={<Save className="h-4 w-4" />}
                onClick={saveReport}
                disabled={!reportName.trim() || !filtered.length}
              >
                {L("حفظ التقرير", "Save report")}
              </Button>
              <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!filtered.length}>
                {L("تصدير CSV", "Export CSV")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
