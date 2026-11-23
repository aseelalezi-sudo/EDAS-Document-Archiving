import { Clock, Check, ShieldCheck, Download, AlertTriangle, Loader2 } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, Field, Input, Select, cn, Badge } from "../components/ui";
import { SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { MappedReportSchedule } from "../lib/api-mappers";

export type ScheduleCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface ScheduleForm {
  report: string;
  freq: ScheduleCadence;
  time: string;
  format: string;
  recipients: string;
  active: boolean;
}

export interface RunLogEntry {
  id: string;
  at: string;
  status: string;
  duration: string;
  by: string;
  fileId?: string | null;
}

export function ScheduleReportModal({
  open,
  form,
  apiMode,
  onFormChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: ScheduleForm;
  apiMode: boolean;
  onFormChange: (form: ScheduleForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t, lang } = useApp();
  const { templates: reportTemplates } = useDocsStore();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const cadences: { value: ScheduleCadence; label: string }[] = [
    { value: "daily", label: L("يومي", "Daily") },
    { value: "weekly", label: L("أسبوعي", "Weekly") },
    { value: "monthly", label: L("شهري", "Monthly") },
    { value: "quarterly", label: L("ربع سنوي", "Quarterly") },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={L("جدولة تقرير", "Schedule report")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button icon={<Clock className="h-4 w-4" />} onClick={onSubmit} disabled={!form.report}>
            {L("جدولة", "Schedule")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={L("التقرير", "Report")} required>
          <Select value={form.report} onChange={(e) => onFormChange({ ...form, report: e.target.value })}>
            <option value="">{L("اختر تقريراً…", "Select a report…")}</option>
            {reportTemplates.map((r) => (
              <option key={r.id} value={r.id}>
                {lang === "en" ? r.nameEn : r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("تكرار التشغيل", "Recurrence")}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {cadences.map((cadence) => (
              <button
                key={cadence.value}
                onClick={() => onFormChange({ ...form, freq: cadence.value })}
                className={cn(
                  "rounded-xl border-2 py-3 text-center transition-all",
                  form.freq === cadence.value
                    ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                    : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                )}
              >
                <Clock className={cn("mx-auto h-5 w-5", form.freq === cadence.value ? "text-navy-600" : "text-ink-400")} />
                <p className="mt-1.5 text-xs font-bold text-ink-700 dark:text-ink-200">{cadence.label}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("وقت التشغيل (UTC)", "Run at (UTC)")}>
            <Input type="time" value={form.time} onChange={(e) => onFormChange({ ...form, time: e.target.value })} />
          </Field>
          <Field label={L("الصيغة", "Format")}>
            <Select value={form.format} onChange={(e) => onFormChange({ ...form, format: e.target.value })}>
              <option>PDF</option>
              <option>Excel</option>
              <option>CSV</option>
            </Select>
          </Field>
        </div>
        <Field label={L("المستلمون (بريد)", "Recipients (email)")} hint={L("افصل بين العناوين بفاصلة", "Separate with commas")}>
          <Input
            dir="ltr"
            value={form.recipients}
            onChange={(e) => onFormChange({ ...form, recipients: e.target.value })}
            placeholder="finance@edas.gov, it@edas.gov"
          />
        </Field>
        {apiMode && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {L(
              "لا يوجد إرسال بريد فعلي بعد؛ يُسجَّل التشغيل كإشعار داخل التطبيق لكل مستخدم مطابق لعنوان بريد في القائمة.",
              "Email delivery is not available yet; each run is recorded as an in-app notification for users whose account email matches the list.",
            )}
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
          <input
            id="schedule-active"
            name="schedule-active"
            type="checkbox"
            checked={form.active}
            onChange={(e) => onFormChange({ ...form, active: e.target.checked })}
            className="h-4 w-4 accent-navy-600"
          />
          <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{L("تفعيل الجدولة فوراً", "Activate immediately")}</span>
        </label>
      </div>
    </Modal>
  );
}

export function RunHistoryModal({
  history,
  runLog,
  onClose,
  onDownload,
}: {
  history: MappedReportSchedule | null;
  runLog: RunLogEntry[];
  onClose: () => void;
  onDownload?: (runId: string) => void;
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const statusLabel = (status: string) =>
    status === "completed" || status === "success"
      ? L("ناجح", "Completed")
      : status === "failed"
        ? L("فاشل", "Failed")
        : status === "queued"
          ? L("قيد التنفيذ", "Queued")
          : status;
  return (
    <Modal
      open={!!history}
      onClose={onClose}
      title={`${L("سجل التشغيل", "Run history")} — ${history?.name ?? ""}`}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t("g.close")}
        </Button>
      }
    >
      {history && (
        <div className="space-y-4">
          <div className="rounded-xl border border-navy-200 bg-navy-50 p-3.5 dark:border-navy-800 dark:bg-navy-900/30">
            <div className="flex flex-wrap items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-navy-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink-800 dark:text-ink-100">{history.name}</p>
                <p className="text-xs text-ink-400">
                  {history.freq} · {history.time} · {history.format}
                </p>
              </div>
              <Badge className="bg-navy-100 text-navy-700 dark:bg-navy-900 dark:text-navy-200">
                {history.runs} {L("تشغيل", "runs")}
              </Badge>
            </div>
          </div>
          <div>
            <SectionTitle title={`${L("سجل التشغيلات", "Run log")} (${runLog.length})`} />
            <div className="space-y-2">
              {runLog.length === 0 && (
                <p className="rounded-xl border border-dashed border-ink-300 py-6 text-center text-xs text-ink-400 dark:border-ink-700">
                  {L("اضغط «تشغيل الآن» لتسجيل تشغيلة جديدة", 'Press "Run now" to log a new run')}
                </p>
              )}
              {runLog.map((r) => {
                const failed = r.status === "failed";
                const queued = r.status === "queued";
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-ink-200 p-2.5 dark:border-ink-800">
                    {failed ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                    ) : queued ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-semibold text-ink-700 dark:text-ink-200">{r.at}</p>
                      <p className="text-[11px] text-ink-400">
                        {r.by} · {r.duration}
                      </p>
                    </div>
                    <Badge
                      className={
                        failed
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          : queued
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      }
                    >
                      {statusLabel(r.status)}
                    </Badge>
                    {r.fileId && onDownload && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={L("تنزيل التقرير", "Download report")}
                        onClick={() => onDownload(r.id)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
