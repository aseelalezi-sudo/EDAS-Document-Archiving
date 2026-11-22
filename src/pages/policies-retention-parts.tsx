import { AlertTriangle, Clock, FileCheck2, ShieldCheck } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, Badge, cn } from "../components/ui";
import type { RetentionItem } from "../types";
import type { DestructionCertificateDto } from "@edas/shared";
import { config } from "../config";
import { formatBytes } from "../lib/api-mappers";

export function ExtendRetentionModal({
  item,
  years,
  onYears,
  onClose,
  onExtend,
  urgencyCls,
  urgencyLbl,
}: {
  item: RetentionItem | null;
  years: string;
  onYears: (y: string) => void;
  onClose: () => void;
  onExtend: () => void;
  urgencyCls: (d: number) => string;
  urgencyLbl: (d: number) => string;
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={L("تمديد مدة الاحتفاظ", "Extend retention period")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button icon={<Clock className="h-4 w-4" />} onClick={onExtend}>
            {L("تمديد", "Extend")}
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
            <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{item.docTitle}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-400">
              {item.docNo} · {item.policy}
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-xs">
              <Badge className={urgencyCls(item.daysLeft)}>{urgencyLbl(item.daysLeft)}</Badge>
              <span className="text-ink-400">
                → {L("نهاية حالية", "current end")}: <strong className="text-ink-600">{item.retentionEnd}</strong>
              </span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-200">{L("اختر مدة التمديد", "Select extension period")}</p>
            <div className="grid grid-cols-4 gap-2">
              {["1", "2", "5", "10"].map((y) => (
                <button
                  key={y}
                  onClick={() => onYears(y)}
                  className={cn(
                    "rounded-xl border-2 py-3 text-center transition-all",
                    years === y
                      ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                      : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                  )}
                >
                  <p className="text-lg font-extrabold text-ink-800 dark:text-ink-100">{y}</p>
                  <p className="text-[10px] font-bold text-ink-400">{L("سنة", "year(s)")}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{L("المدة الجديدة", "New period")}</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-800 dark:text-emerald-200">
              +{years} {L("سنة إضافية", "additional year(s)")}
            </p>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              {L(
                "سيتم تسجيل التمديد في سجل التدقيق مع إخطار المالك",
                "The extension will be recorded in the audit trail and the owner notified",
              )}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function DestructionCertificateModal({
  certificate,
  loading,
  onClose,
}: {
  certificate: DestructionCertificateDto | null;
  loading: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const demoMode = !config.useApi;
  const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "ar-SA") : "—");
  return (
    <Modal
      open={!!certificate || loading}
      onClose={onClose}
      title={L("شهادة إتلاف رسمية", "Certificate of Destruction")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => window.print()} disabled={!certificate}>
            <FileCheck2 className="h-4 w-4" /> {L("طباعة", "Print")}
          </Button>
          <Button onClick={onClose}>{t("g.close")}</Button>
        </>
      }
    >
      {loading && <p className="py-8 text-center text-sm text-ink-500">{L("جارٍ استخراج الشهادة…", "Fetching the certificate…")}</p>}
      {certificate && (
        <div className="rounded-xl border-2 border-navy-800 p-6 text-sm dark:border-navy-500">
          <div className="flex items-center justify-between border-b-2 border-navy-800 pb-4 dark:border-navy-500">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-navy-800">
                <ShieldCheck className="h-5 w-5 text-teal-300" />
              </div>
              <div>
                <p className="font-extrabold text-navy-900 dark:text-navy-100">
                  EDAS — {L("هيئة المؤسسات الحكومية", "Government Entities Authority")}
                </p>
                <p className="text-xs text-ink-500">{L("نظام الأرشفة الإلكترونية للوثائق", "Electronic Document Archiving System")}</p>
              </div>
            </div>
            <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              {L("شهادة إتلاف", "DESTRUCTION CERTIFICATE")}
            </Badge>
          </div>
          <p className="mt-5 text-center font-display text-xl font-extrabold text-navy-900 dark:text-navy-100">
            {L("شهادة إتلاف وثيقة", "Certificate of Document Destruction")}
          </p>
          <p className="mt-1 text-center font-mono text-xs text-ink-500">
            {L("مرجع الشهادة", "Certificate ref")}: {certificate.certificateRef}
          </p>
          {demoMode && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {L(
                "وضع العرض: صدرت الشهادة من المتصفح ولا يوجد سجل خادمي ولا حدث تدقيق مرتبط. ربط الإتلاف بالخادم يتطلب تشغيل وضع API.",
                "Demo mode: this certificate was produced in the browser — there is no server-side destruction and no linked audit event. Run in API mode for a verifiable certificate.",
              )}
            </p>
          )}
          {certificate.storageErrors > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {L(
                `تم حذف البيانات الوصفية لكن تعذّر حذف ${certificate.storageErrors} من الكائنات المخزنة. راجع مسؤول التخزين لمتابعة المفاتيح المسجلة في سجل التدقيق.`,
                `Records were removed but ${certificate.storageErrors} stored object(s) could not be deleted. Contact the storage administrator to reconcile the keys in the audit log.`,
              )}
            </p>
          )}
          {!demoMode && certificate.storageErrors === 0 && (
            <p className="mt-3 text-xs font-semibold">
              {certificate.storageCleanup === "accepted"
                ? L("قبل مخزن الملفات طلبات حذف الكائنات الحالية.", "Storage accepted the current-object deletion requests.")
                : certificate.storageCleanup === "not_required"
                  ? L("لم تتطلب هذه العملية حذف كائنات من التخزين.", "This operation required no storage deletions.")
                  : L("نتيجة حذف كائنات التخزين غير مؤكدة في سجل التدقيق.", "The audit trail has no confirmed storage deletion outcome.")}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              [L("رقم الوثيقة", "Document no."), certificate.document.docNo],
              [L("عنوان الوثيقة", "Document title"), certificate.document.title],
              [L("السياسة المطبقة", "Applied policy"), certificate.policy.name],
              [
                L("مدة الاحتفاظ", "Retention period"),
                certificate.policy.retentionMonths ? `${certificate.policy.retentionMonths} ${L("شهر", "months")}` : "—",
              ],
              [L("الأساس النظامي", "Legal basis"), certificate.policy.legalBasis ?? "—"],
              [L("تاريخ نهاية الاحتفاظ", "Retention end"), stamp(certificate.dueAt)],
              [L("طريقة الإتلاف", "Destruction method"), L("إزالة ارتباطات إصدارات الوثيقة", "Removal of document version references")],
              [L("تاريخ الإتلاف", "Destruction date"), stamp(certificate.destroyedAt)],
              [L("تم بواسطة", "Performed by"), certificate.performedBy ?? "—"],
              [L("ملاحظة المنفّذ", "Operator note"), certificate.note ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-dashed border-ink-200 pb-1.5 dark:border-ink-700">
                <p className="text-[10px] font-semibold uppercase text-ink-400">{k}</p>
                <p className="font-semibold text-ink-800 dark:text-ink-100">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="mb-2 text-[10px] font-semibold uppercase text-ink-400">
              {L(`الإصدارات المسجلة (${certificate.fileCount})`, `Recorded versions (${certificate.fileCount})`)}
            </p>
            {certificate.files.length === 0 ? (
              <p className="text-xs text-ink-500">
                {L("لا توجد ملفات مرتبطة بالوثيقة وقت الإتلاف.", "No files were attached at disposal time.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink-200 text-start font-semibold text-ink-500 dark:border-ink-700">
                      <th className="py-1.5 pe-3 text-start">{L("الإصدار", "Version")}</th>
                      <th className="py-1.5 pe-3 text-start">{L("الملف", "File")}</th>
                      <th className="py-1.5 pe-3 text-start">{L("الحجم", "Size")}</th>
                      <th className="py-1.5 text-start">{L("بصمة SHA-256", "SHA-256 fingerprint")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificate.files.map((file) => (
                      <tr key={`${file.version}-${file.checksumSha256}`} className="border-b border-ink-100 dark:border-ink-800">
                        <td className="py-1.5 pe-3">{file.version}</td>
                        <td className="py-1.5 pe-3 font-semibold text-ink-800 dark:text-ink-100">{file.originalName}</td>
                        <td className="py-1.5 pe-3 whitespace-nowrap">{formatBytes(file.sizeBytes)}</td>
                        <td className="py-1.5 font-mono text-[10px] break-all text-ink-500">{file.checksumSha256}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] font-semibold text-ink-500">
                  {L("الحجم الإجمالي للإصدارات", "Total version size")}: {formatBytes(certificate.totalBytes)}
                </p>
              </div>
            )}
          </div>
          {!demoMode && (
            <p className="mt-4 font-mono text-[10px] break-all text-ink-400">
              {L("حدث التدقيق", "Audit event")}: {certificate.auditEventId}
              {certificate.auditHash ? ` · ${certificate.auditHash}` : ""}
            </p>
          )}
          <p className="mt-4 rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
            {L(
              "يوثّق هذا السجل إجراء الاحتفاظ على الوثيقة. يتطلب إثبات المحو المادي للإصدارات السابقة والمشتقات والنسخ الاحتياطية تحققاً مستقلاً.",
              "This record documents the retention action. Physical erasure of historical object versions, derivatives and backups requires separate verification.",
            )}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            {[L("مسؤول الأرشفة", "Archiving Officer"), L("المراجع القانوني", "Legal Reviewer"), L("الشهيد", "Witness")].map((role) => (
              <div key={role}>
                <p className="mx-auto w-40 border-b border-ink-400 pb-8 dark:border-ink-600" />
                <p className="mt-1 text-xs font-semibold text-ink-600 dark:text-ink-300">{role}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
