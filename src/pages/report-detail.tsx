import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bug,
  Clock,
  Database,
  FileText,
  Layers,
  Play,
  Scale,
  Server,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, EmptyState } from "../components/ui";
import { PageHeader, DataTable, StatCard, SectionTitle, ExportMenu } from "../components/shared";
import { ChartCard, BarChartCard, DonutChart } from "../components/charts";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { openDownload } from "../lib/download";
import { isReportRunnable } from "../lib/report-catalog";
import { documentBytes, formatBytes } from "../lib/api-mappers";
import type { AuditEntry, ErrorItem, LegalHold, RetentionItem } from "../types";

type Accent = "navy" | "teal" | "emerald" | "amber" | "rose" | "purple";

interface PreviewRow {
  id: string;
  cells: string[];
}

interface PreviewChart {
  kind: "bar" | "donut";
  title: string;
  name?: string;
  color?: string;
  data: { name: string; value: number; color?: string }[];
}

interface Preview {
  stats: { label: string; value: string; icon: ReactNode; accent: Accent; hint?: string }[];
  title: string;
  note?: string;
  head: string[];
  rows: PreviewRow[];
  chart?: PreviewChart;
}

const DONUT_COLORS = ["#4f46e5", "#14a89c", "#6366f1", "#f59e0b", "#ef4444", "#a855f7"];

export function ReportDetail() {
  const { id } = useParams();
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const {
    templates: reportTemplates,
    scopedDocs,
    departments: deptStore,
    auditLog,
    retention,
    holds,
    errors,
    pendingApprovals,
    docsReady,
  } = useDocsStore();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const tpl = reportTemplates.find((r) => r.id === id);
  const tplFavorite = tpl?.favorite ?? false;
  const [favorite, setFavorite] = useState(tplFavorite);
  const [favBusy, setFavBusy] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setFavorite(tplFavorite);
  }, [tplFavorite]);

  const fmtNumber = (value: number) => value.toLocaleString(lang === "en" ? "en" : "ar");
  const fmtDay = (value?: string | null) => (value ? new Date(value).toLocaleDateString(lang === "en" ? "en" : "ar") : "—");
  const fmtTime = (value?: string | null) => (value ? new Date(value).toLocaleString(lang === "en" ? "en" : "ar") : "—");

  if (!tpl && !docsReady) {
    return (
      <div>
        <PageHeader title={L("جارٍ التحميل…", "Loading…")} breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }]} />
        <Card>
          <div className="space-y-3 py-6" aria-busy="true">
            <div className="h-5 w-1/3 animate-pulse rounded bg-ink-100 dark:bg-ink-800" />
            <div className="h-24 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
            <div className="h-40 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
          </div>
        </Card>
      </div>
    );
  }

  if (!tpl) {
    return (
      <div>
        <PageHeader title={t("nav.reports")} breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }]} />
        <EmptyState
          title={L("التقرير غير موجود", "Report not found")}
          description={L("قد يكون قالب التقرير قد حُذف أو أُعيدت تسميته.", "The report template may have been deleted or renamed.")}
          action={
            <Button size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate("/reports")}>
              {L("العودة إلى التقارير", "Back to reports")}
            </Button>
          }
        />
      </div>
    );
  }

  const name = lang === "en" ? tpl.nameEn : tpl.name;
  const runnable = isReportRunnable(tpl.id, apiMode);
  const departments = deptStore.items;
  const deptDocs = departments
    .map((department) => ({
      department,
      docs: scopedDocs.filter((doc) => doc.deptId === department.id),
    }))
    .sort((a, b) => b.docs.length - a.docs.length);
  const archivedDocs = scopedDocs.filter((doc) => doc.status === "archived");
  const totalBytes = scopedDocs.reduce((total, doc) => total + documentBytes(doc), 0);

  let view: Preview;
  switch (tpl.id) {
    case "rpt-1": {
      view = {
        stats: [
          {
            label: L("إجمالي الوثائق", "Total documents"),
            value: fmtNumber(scopedDocs.length),
            icon: <FileText className="h-5 w-5" />,
            accent: "navy",
          },
          {
            label: L("الوثائق المؤرشفة", "Archived"),
            value: fmtNumber(archivedDocs.length),
            icon: <Server className="h-5 w-5" />,
            accent: "teal",
          },
          {
            label: L("إدارات لديها وثائق", "Departments with documents"),
            value: fmtNumber(deptDocs.filter((row) => row.docs.length > 0).length),
            icon: <Layers className="h-5 w-5" />,
            accent: "purple",
          },
          {
            label: L("إجمالي الحجم", "Total size"),
            value: formatBytes(totalBytes),
            icon: <Database className="h-5 w-5" />,
            accent: "amber",
          },
        ],
        title: L("التفاصيل حسب الإدارة", "Details by department"),
        head: [L("الإدارة", "Department"), L("الرمز", "Code"), L("الوثائق", "Documents"), L("المؤرشفة", "Archived"), L("الحجم", "Size")],
        rows: deptDocs.map(({ department, docs }) => ({
          id: department.id,
          cells: [
            lang === "en" ? department.nameEn || department.name : department.name,
            department.code || "—",
            fmtNumber(docs.length),
            fmtNumber(docs.filter((doc) => doc.status === "archived").length),
            formatBytes(docs.reduce((total, doc) => total + documentBytes(doc), 0)),
          ],
        })),
        chart: {
          kind: "bar",
          title: L("الوثائق حسب الإدارة", "Documents by department"),
          name: L("الوثائق", "Documents"),
          color: "#4f46e5",
          data: deptDocs
            .filter((row) => row.docs.length > 0)
            .slice(0, 8)
            .map(({ department, docs }) => ({ name: department.code || department.name, value: docs.length })),
        },
      };
      break;
    }
    case "rpt-2": {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, index) =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1)).toISOString().slice(0, 7),
      );
      const buckets = months.map((month) => {
        const docs = scopedDocs.filter((doc) => doc.createdAt?.slice(0, 7) === month);
        return { month, count: docs.length, bytes: docs.reduce((total, doc) => total + documentBytes(doc), 0) };
      });
      const latest = buckets[buckets.length - 1];
      view = {
        stats: [
          {
            label: L("إجمالي الحجم", "Total size"),
            value: formatBytes(totalBytes),
            icon: <Database className="h-5 w-5" />,
            accent: "navy",
          },
          { label: L("الوثائق", "Documents"), value: fmtNumber(scopedDocs.length), icon: <FileText className="h-5 w-5" />, accent: "teal" },
          {
            label: L("متوسط حجم الوثيقة", "Average document size"),
            value: formatBytes(scopedDocs.length ? Math.round(totalBytes / scopedDocs.length) : 0),
            icon: <TrendingUp className="h-5 w-5" />,
            accent: "emerald",
          },
          {
            label: L("وثائق الشهر الحالي", "Documents this month"),
            value: fmtNumber(latest?.count ?? 0),
            icon: <Clock className="h-5 w-5" />,
            accent: "amber",
            hint: latest?.month,
          },
        ],
        title: L("الاستهلاك خلال الأشهر الستة الأخيرة", "Usage over the last six months"),
        head: [L("الشهر", "Month"), L("الوثائق", "Documents"), L("الحجم", "Size"), L("متوسط الوثيقة", "Average document")],
        rows: buckets
          .slice()
          .reverse()
          .map((bucket) => ({
            id: bucket.month,
            cells: [
              bucket.month,
              fmtNumber(bucket.count),
              formatBytes(bucket.bytes),
              formatBytes(bucket.count ? Math.round(bucket.bytes / bucket.count) : 0),
            ],
          })),
        chart: {
          kind: "bar",
          title: L("عدد الوثائق شهرياً", "Documents per month"),
          name: L("الوثائق", "Documents"),
          color: "#14a89c",
          data: buckets.map((bucket) => ({ name: bucket.month.slice(5), value: bucket.count })),
        },
      };
      break;
    }
    case "rpt-3": {
      const byUser = new Map<string, { user: string; count: number; last: string }>();
      for (const entry of auditLog as AuditEntry[]) {
        const key = entry.user || L("مستخدم غير معروف", "Unknown user");
        const current = byUser.get(key) ?? { user: key, count: 0, last: "" };
        current.count += 1;
        if (!current.last || new Date(entry.datetime).getTime() > new Date(current.last).getTime()) current.last = entry.datetime;
        byUser.set(key, current);
      }
      const users = [...byUser.values()].sort((a, b) => b.count - a.count);
      view = {
        stats: [
          {
            label: L("الأحداث المسجلة", "Recorded events"),
            value: fmtNumber(auditLog.length),
            icon: <Activity className="h-5 w-5" />,
            accent: "navy",
          },
          {
            label: L("مستخدمون نشطون", "Active users"),
            value: fmtNumber(users.length),
            icon: <Users className="h-5 w-5" />,
            accent: "teal",
          },
          {
            label: L("الأكثر نشاطاً", "Most active"),
            value: users[0]?.user ?? "—",
            icon: <TrendingUp className="h-5 w-5" />,
            accent: "emerald",
            hint: users[0] ? `${fmtNumber(users[0].count)} ${L("حدثاً", "events")}` : undefined,
          },
          {
            label: L("آخر نشاط", "Last activity"),
            value: fmtDay(auditLog[0]?.datetime),
            icon: <Clock className="h-5 w-5" />,
            accent: "amber",
          },
        ],
        title: L("النشاط حسب المستخدم", "Activity by user"),
        note: L(
          "تعرض المعاينة الأحداث المحمّلة في التطبيق (آخر 200 حدث)؛ يتضمن تصدير الخادم السجل الكامل.",
          "The preview shows the events loaded in the app (latest 200); the server export covers the full log.",
        ),
        head: [L("المستخدم", "User"), L("الأحداث", "Events"), L("آخر نشاط", "Last activity")],
        rows: users.map((user) => ({ id: user.user, cells: [user.user, fmtNumber(user.count), fmtTime(user.last)] })),
        chart: {
          kind: "bar",
          title: L("أكثر المستخدمين نشاطاً", "Most active users"),
          name: L("الأحداث", "Events"),
          color: "#6366f1",
          data: users.slice(0, 8).map((user) => ({ name: user.user, value: user.count })),
        },
      };
      break;
    }
    case "rpt-4": {
      const pending = pendingApprovals;
      const documents = new Set(pending.map((instance) => instance.documentId));
      const chains = new Set(pending.map((instance) => instance.chainName).filter((value): value is string => Boolean(value)));
      const oldest = pending
        .map((instance) => instance.startedAt)
        .filter(Boolean)
        .sort()[0];
      const ageDays = oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000)) : null;
      view = {
        stats: [
          {
            label: L("موافقات معلقة", "Pending approvals"),
            value: fmtNumber(pending.length),
            icon: <Activity className="h-5 w-5" />,
            accent: "navy",
          },
          {
            label: L("وثائق مرتبطة", "Linked documents"),
            value: fmtNumber(documents.size),
            icon: <FileText className="h-5 w-5" />,
            accent: "teal",
          },
          {
            label: L("سلاسل الموافقة", "Approval chains"),
            value: fmtNumber(chains.size),
            icon: <Layers className="h-5 w-5" />,
            accent: "purple",
          },
          {
            label: L("عمر أقدم طلب", "Oldest request"),
            value: ageDays === null ? "—" : `${fmtNumber(ageDays)} ${L("يوم", "days")}`,
            icon: <Clock className="h-5 w-5" />,
            accent: "amber",
          },
        ],
        title: L("الموافقات المعلّقة حالياً", "Pending approvals"),
        note: L(
          "تعرض المعاينة الطلبات المعلّقة؛ يتضمن تصدير الخادم الموافقات المكتملة أيضاً مع زمن الإنجاز بالساعات.",
          "The preview lists pending requests; the server export also includes completed instances with turnaround hours.",
        ),
        head: [
          L("رقم الوثيقة", "Document No."),
          L("العنوان", "Title"),
          L("السلسلة", "Chain"),
          L("الخطوة الحالية", "Current step"),
          L("البدء", "Started"),
        ],
        rows: pending.map((instance) => ({
          id: instance.id,
          cells: [
            instance.document.docNo,
            instance.document.title,
            instance.chainName ?? "—",
            instance.currentStep ? `${instance.currentStep.order} · ${instance.currentStep.role}` : "—",
            fmtDay(instance.startedAt),
          ],
        })),
      };
      break;
    }
    case "rpt-5": {
      const items = retention as RetentionItem[];
      const actionLabel = (item: RetentionItem) => (lang === "en" ? item.proposedActionEn : item.proposedAction);
      const actionCounts = new Map<string, number>();
      for (const item of items) actionCounts.set(actionLabel(item), (actionCounts.get(actionLabel(item)) ?? 0) + 1);
      view = {
        stats: [
          {
            label: L("عناصر الاحتفاظ", "Retention items"),
            value: fmtNumber(items.length),
            icon: <Clock className="h-5 w-5" />,
            accent: "navy",
          },
          {
            label: L("تجاوزت الاستحقاق", "Overdue"),
            value: fmtNumber(items.filter((item) => item.daysLeft < 0).length),
            icon: <AlertTriangle className="h-5 w-5" />,
            accent: "rose",
          },
          {
            label: L("تستحق خلال 30 يوماً", "Due within 30 days"),
            value: fmtNumber(items.filter((item) => item.daysLeft >= 0 && item.daysLeft <= 30).length),
            icon: <TrendingUp className="h-5 w-5" />,
            accent: "amber",
          },
          {
            label: L("على حجز قانوني", "Under legal hold"),
            value: fmtNumber(items.filter((item) => item.onHold).length),
            icon: <Scale className="h-5 w-5" />,
            accent: "purple",
          },
        ],
        title: L("التفاصيل حسب الوثيقة", "Details by document"),
        head: [
          L("رقم الوثيقة", "Document No."),
          L("العنوان", "Title"),
          L("السياسة", "Policy"),
          L("الإجراء", "Action"),
          L("الاستحقاق", "Due"),
          L("المتبقي", "Remaining"),
        ],
        rows: items.map((item) => ({
          id: item.id,
          cells: [
            item.docNo,
            item.docTitle,
            item.policy,
            actionLabel(item),
            fmtDay(item.retentionEnd),
            `${fmtNumber(item.daysLeft)} ${L("يوم", "days")}`,
          ],
        })),
        chart: {
          kind: "donut",
          title: L("التوزيع حسب الإجراء المقترح", "Distribution by proposed action"),
          data: [...actionCounts.entries()].map(([name, value], index) => ({
            name,
            value,
            color: DONUT_COLORS[index % DONUT_COLORS.length],
          })),
        },
      };
      break;
    }
    case "rpt-6": {
      const entries = (auditLog as AuditEntry[]).slice(0, 200);
      const failures = entries.filter((entry) => entry.result === "failure").length;
      const modules = new Set(entries.map((entry) => entry.module).filter(Boolean));
      view = {
        stats: [
          { label: L("الأحداث", "Events"), value: fmtNumber(entries.length), icon: <Activity className="h-5 w-5" />, accent: "navy" },
          {
            label: L("ناجحة", "Successful"),
            value: fmtNumber(entries.length - failures),
            icon: <ShieldCheck className="h-5 w-5" />,
            accent: "emerald",
          },
          { label: L("فاشلة", "Failed"), value: fmtNumber(failures), icon: <AlertTriangle className="h-5 w-5" />, accent: "rose" },
          { label: L("وحدات", "Modules"), value: fmtNumber(modules.size), icon: <Layers className="h-5 w-5" />, accent: "purple" },
        ],
        title: L("أحدث أحداث سجل التدقيق", "Latest audit events"),
        note: L(
          "تعرض المعاينة آخر 200 حدث محمّل؛ يتضمن تصدير الخادم السجل الكامل مع معرّف الترابط.",
          "The preview shows the latest 200 loaded events; the server export covers the full log with correlation ids.",
        ),
        head: [L("الوقت", "Time"), L("المستخدم", "User"), L("العملية", "Action"), L("الكيان", "Entity"), L("النتيجة", "Result")],
        rows: entries.map((entry) => ({
          id: entry.id,
          cells: [
            fmtTime(entry.datetime),
            entry.user || "—",
            entry.action,
            entry.entityType,
            entry.result === "success" ? L("ناجحة", "Success") : L("فاشلة", "Failure"),
          ],
        })),
        chart: {
          kind: "donut",
          title: L("النتيجة", "Result"),
          data: [
            { name: L("ناجحة", "Success"), value: entries.length - failures, color: "#10b981" },
            { name: L("فاشلة", "Failure"), value: failures, color: "#ef4444" },
          ].filter((slice) => slice.value > 0),
        },
      };
      break;
    }
    case "rpt-7": {
      const items = errors.items as ErrorItem[];
      const severityLabel = (severity: string) =>
        severity === "critical"
          ? L("حرج", "Critical")
          : severity === "high"
            ? L("مرتفع", "High")
            : severity === "medium"
              ? L("متوسط", "Medium")
              : L("منخفض", "Low");
      const statusLabel = (status: string) =>
        status === "new"
          ? L("جديد", "New")
          : status === "investigating"
            ? L("قيد التحقيق", "Investigating")
            : status === "resolved"
              ? L("محلول", "Resolved")
              : L("متجاهل", "Ignored");
      const severityCounts = new Map<string, number>();
      for (const item of items)
        severityCounts.set(severityLabel(item.severity), (severityCounts.get(severityLabel(item.severity)) ?? 0) + 1);
      view = {
        stats: [
          { label: L("إجمالي الأخطاء", "Total errors"), value: fmtNumber(items.length), icon: <Bug className="h-5 w-5" />, accent: "navy" },
          {
            label: L("حرجة", "Critical"),
            value: fmtNumber(items.filter((item) => item.severity === "critical").length),
            icon: <AlertTriangle className="h-5 w-5" />,
            accent: "rose",
          },
          {
            label: L("مفتوحة", "Open"),
            value: fmtNumber(items.filter((item) => item.status === "new" || item.status === "investigating").length),
            icon: <Activity className="h-5 w-5" />,
            accent: "amber",
          },
          {
            label: L("محلولة", "Resolved"),
            value: fmtNumber(items.filter((item) => item.status === "resolved").length),
            icon: <ShieldCheck className="h-5 w-5" />,
            accent: "emerald",
          },
        ],
        title: L("سجل الأخطاء المحلي", "Local error log"),
        note: L(
          "سجل الأخطاء محفوظ في هذا المتصفح فقط، لذلك لا يمكن توليد هذا التقرير على الخادم.",
          "The error log lives in this browser only, so this report cannot be generated on the server.",
        ),
        head: [L("الوقت", "Time"), L("الرمز", "Code"), L("الوحدة", "Module"), L("الشدّة", "Severity"), L("الحالة", "Status")],
        rows: items.map((item) => ({
          id: item.id,
          cells: [fmtTime(item.datetime), item.code, item.module, severityLabel(item.severity), statusLabel(item.status)],
        })),
        chart: {
          kind: "donut",
          title: L("التوزيع حسب الشدّة", "Distribution by severity"),
          data: [...severityCounts.entries()].map(([name, value], index) => ({
            name,
            value,
            color: DONUT_COLORS[index % DONUT_COLORS.length],
          })),
        },
      };
      break;
    }
    case "rpt-8": {
      const items = holds.items as LegalHold[];
      view = {
        stats: [
          { label: L("الحجوزات", "Holds"), value: fmtNumber(items.length), icon: <Scale className="h-5 w-5" />, accent: "navy" },
          {
            label: L("سارية", "Active"),
            value: fmtNumber(items.filter((item) => item.status === "active").length),
            icon: <ShieldCheck className="h-5 w-5" />,
            accent: "teal",
          },
          {
            label: L("مُفرج عنها", "Released"),
            value: fmtNumber(items.filter((item) => item.status === "released").length),
            icon: <Clock className="h-5 w-5" />,
            accent: "amber",
          },
          {
            label: L("وثائق محجوزة", "Documents held"),
            value: fmtNumber(items.reduce((total, item) => total + (item.items ?? 0), 0)),
            icon: <FileText className="h-5 w-5" />,
            accent: "purple",
          },
        ],
        title: L("سجل الحجوزات القانونية", "Legal hold register"),
        head: [
          L("رقم القضية", "Case No."),
          L("السبب", "Reason"),
          L("الحالة", "Status"),
          L("تاريخ الحجز", "Placed"),
          L("الوثائق", "Documents"),
        ],
        rows: items.map((item) => ({
          id: item.id,
          cells: [
            item.caseRef || item.ref,
            item.reason,
            item.status === "active" ? L("سارٍ", "Active") : L("مُفرج عنه", "Released"),
            fmtDay(item.placedAt),
            fmtNumber(item.items ?? 0),
          ],
        })),
      };
      break;
    }
    default:
      view = {
        stats: [],
        title: L("لا توجد معاينة لهذا القالب", "No preview for this template"),
        head: [],
        rows: [],
      };
  }

  const toggleFavorite = async () => {
    if (favBusy) return;
    const next = !favorite;
    setFavBusy(true);
    try {
      if (apiMode) await domainApi.setReportTemplateFavorite(tpl.id, next);
      setFavorite(next);
      toast({
        type: next ? "success" : "info",
        title: next ? L("أُضيف إلى المفضلة", "Added to favorites") : L("أُزيل من المفضلة", "Removed from favorites"),
        message: name,
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setFavBusy(false);
    }
  };

  const runReport = async () => {
    if (!runnable || running) return;
    setRunning(true);
    try {
      const run = await domainApi.createReportRun({ reportType: tpl.id, format: "pdf" });
      if (run.status !== "completed") throw new Error("Report run failed");
      const download = await domainApi.downloadReportRun(run.id);
      openDownload(download.url);
      toast({ type: "success", title: L("تم إنشاء التقرير", "Report generated"), message: name });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setRunning(false);
    }
  };

  const exportRows = view.rows.map((row) => Object.fromEntries(view.head.map((header, index) => [header, row.cells[index] ?? ""])));

  return (
    <div>
      <PageHeader
        title={name}
        description={lang === "en" ? tpl.descEn : tpl.desc}
        breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }, { label: name }]}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<Star className={favorite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} />}
              onClick={() => void toggleFavorite()}
              disabled={favBusy}
            >
              {favorite ? L("في المفضلة", "Favorited") : L("تفضيل", "Favorite")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Play className="h-4 w-4" />}
              onClick={() => void runReport()}
              disabled={!runnable || running}
              title={
                !apiMode
                  ? L("يتطلب توليد التقارير اتصالاً بالخادم", "Report generation requires the server")
                  : runnable
                    ? undefined
                    : L(
                        "هذا التقرير يُبنى من سجل الأخطاء المحلي في المتصفح ولا يمكن توليده على الخادم",
                        "This report is built from the browser-local error log and cannot be generated server-side",
                      )
              }
            >
              {running ? L("جارٍ التشغيل…", "Running…") : L("تشغيل", "Run")}
            </Button>
            <ExportMenu rows={exportRows} filename={`edas-${tpl.id}`} />
            <Button
              size="sm"
              variant="outline"
              icon={<Clock className="h-4 w-4" />}
              onClick={() => navigate(`/reports/scheduled?report=${tpl.id}`)}
            >
              {L("جدولة", "Schedule")}
            </Button>
          </>
        }
      />
      {view.stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {view.stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} accent={stat.accent} hint={stat.hint} />
          ))}
        </div>
      )}
      {view.chart && view.chart.data.length > 0 && (
        <ChartCard title={view.chart.title} className="mb-4">
          {view.chart.kind === "bar" ? (
            <BarChartCard
              data={view.chart.data}
              xKey="name"
              bars={[{ key: "value", name: view.chart.name ?? L("القيمة", "Value"), color: view.chart.color ?? "#4f46e5" }]}
            />
          ) : (
            <DonutChart
              data={view.chart.data.map((slice, index) => ({ ...slice, color: slice.color ?? DONUT_COLORS[index % DONUT_COLORS.length] }))}
            />
          )}
        </ChartCard>
      )}
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <SectionTitle title={view.title} />
          {view.rows.length > 0 && (
            <span className="text-xs text-ink-400">
              {fmtNumber(view.rows.length)} {L("صفاً", "rows")}
            </span>
          )}
        </div>
        {view.note && (
          <p className="mx-4 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {view.note}
          </p>
        )}
        <DataTable
          rows={view.rows}
          columns={view.head.map((header, index) => ({
            key: `c${index}`,
            header,
            render: (row: PreviewRow) => row.cells[index] ?? "—",
          }))}
          empty={<p className="py-10 text-center text-sm text-ink-400">{L("لا توجد بيانات لعرضها", "No data to display")}</p>}
        />
      </Card>
      {!runnable && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{L("محلي فقط", "Local only")}</Badge>
          {L(
            "هذا التقرير غير متاح على الخادم؛ تُعرض بيانات المتصفح فقط.",
            "This report is unavailable on the server; only browser data is shown.",
          )}
        </p>
      )}
    </div>
  );
}
