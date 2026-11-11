import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Modal } from "../components/ui";
import { PageHeader, StatCard, SectionTitle, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { config } from "../config";
import { clearPersistedState } from "../utils/persist";
import type { Lang } from "../i18n";
import type { FileVerificationDto, FileVerificationReasonDto, StorageIntegrityDto, StoragePurgeResultDto } from "@edas/shared";

const PREFIX = "edas.v1.";

const REASON_LABEL: Record<FileVerificationReasonDto, [string, string]> = {
  missing_object: ["الكائن مفقود من التخزين", "Object missing from storage"],
  size_mismatch: ["الحجم المخزّن غير مطابق", "Stored size does not match"],
  unreadable_object: ["تعذّرت قراءة الكائن", "Object could not be read"],
  checksum_mismatch: ["البصمة غير مطابقة", "Checksum does not match"],
};

function localFootprint() {
  let keys = 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        keys++;
        bytes += (localStorage.getItem(key) ?? "").length * 2;
      }
    }
  } catch {
    /* ignore storage access errors */
  }
  return { keys, bytes };
}

function IntegrityRow({
  tone,
  title,
  detail,
  check,
  lang,
  busy,
  onCheck,
}: {
  tone: "bad" | "warn";
  title: string;
  detail: string;
  check?: FileVerificationDto | string;
  lang: Lang;
  busy: boolean;
  onCheck: () => void;
}) {
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  let status: { text: string; ok: boolean } | null = null;
  if (typeof check === "string") status = { text: check, ok: false };
  else if (check?.ok) status = { text: L("البصمة مطابقة", "Checksum matches"), ok: true };
  else if (check?.reason) status = { text: lang === "en" ? REASON_LABEL[check.reason][1] : REASON_LABEL[check.reason][0], ok: false };

  return (
    <div
      className={
        tone === "bad"
          ? "flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs dark:border-rose-500/30 dark:bg-rose-950/30"
          : "flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-500/30 dark:bg-amber-950/30"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-800 dark:text-ink-100">{title}</p>
        <p className="truncate font-mono text-[10px] text-ink-500">{detail}</p>
      </div>
      {status && (
        <Badge
          className={
            status.ok
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
          }
        >
          {status.text}
        </Badge>
      )}
      <Button size="sm" variant="outline" onClick={onCheck} disabled={busy}>
        {busy ? L("جارٍ الحساب…", "Computing…") : L("تحقق البصمة", "Verify checksum")}
      </Button>
    </div>
  );
}

export function Maintenance() {
  const { t, lang, toast, apiMode, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { summary, refreshOrgDirectory, refreshUsers } = useDocsStore();
  const [resetting, setResetting] = useState(false);
  const [footprint, setFootprint] = useState(localFootprint);
  const [checking, setChecking] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inventory, setInventory] = useState<StorageIntegrityDto | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checks, setChecks] = useState<Record<string, FileVerificationDto | string>>({});
  const [checkBusy, setCheckingId] = useState<string | null>(null);
  const [purgePlan, setPurgePlan] = useState<StoragePurgeResultDto | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeBusy, setPurgeBusy] = useState<null | "preview" | "execute">(null);
  const [purgeAcknowledged, setPurgeAcknowledged] = useState(false);

  const runInventory = async () => {
    setScanning(true);
    setInventoryError(null);
    try {
      setInventory(await domainApi.storageIntegrity());
      setChecks({});
    } catch (error) {
      setInventory(null);
      setInventoryError(serverReason(error) ?? t("err.api"));
    } finally {
      setScanning(false);
    }
  };

  const runFileCheck = async (id: string) => {
    setCheckingId(id);
    try {
      const result = await domainApi.verifyFile(id);
      setChecks((current) => ({ ...current, [id]: result }));
    } catch (error) {
      setChecks((current) => ({ ...current, [id]: serverReason(error) ?? t("err.api") }));
    } finally {
      setCheckingId(null);
    }
  };

  const runPurge = async (confirm: boolean) => {
    setPurgeBusy(confirm ? "execute" : "preview");
    setPurgeError(null);
    try {
      const result = await domainApi.purgeUnreferencedFiles(confirm ? { confirm: true } : {});
      setPurgePlan(result);
      if (!result.dryRun) {
        setPurgeAcknowledged(false);
        setInventory(await domainApi.storageIntegrity());
        setChecks({});
        toast({
          type: result.deleted && result.deleted.failures.length > 0 ? "warning" : "success",
          title: L("انتهى التنظيف", "Cleanup finished"),
          message: L(
            `حُذفت ${result.deleted?.files ?? 0} صفوف ملفات و${result.deleted?.objects ?? 0} كائنات تخزين.`,
            `Removed ${result.deleted?.files ?? 0} file rows and ${result.deleted?.objects ?? 0} storage objects.`,
          ),
        });
      }
    } catch (error) {
      setPurgeError(serverReason(error) ?? t("err.api"));
      toast({ type: "error", title: t("err.api"), message: serverReason(error) });
    } finally {
      setPurgeBusy(null);
    }
  };

  useEffect(() => {
    setFootprint(localFootprint());
  }, [resetting]);

  const runCheck = async () => {
    if (!apiMode) return;
    setChecking(true);
    const started = performance.now();
    try {
      await domainApi.health();
      setLatency(Math.round(performance.now() - started));
      setCheckFailed(false);
    } catch {
      setLatency(null);
      setCheckFailed(true);
    } finally {
      setLastCheck(new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "ar-SA"));
      setChecking(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOrgDirectory(), refreshUsers()]);
      toast({ type: "success", title: L("تم تحديث البيانات من الخادم", "Data refreshed from the server") });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("nav.maintenance")}
        description={L("حالة النظام والبيانات التشغيلية", "System status and operational data")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.maintenance") }]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={L("الوثائق", "Documents")}
          value={summary ? summary.documents.total : "—"}
          icon={<Database className="h-5 w-5" />}
          accent="navy"
        />
        <StatCard
          label={L("المستخدمون", "Users")}
          value={summary ? summary.users.total : "—"}
          icon={<Users className="h-5 w-5" />}
          accent="teal"
        />
        <StatCard
          label={L("مهام مفتوحة", "Open tasks")}
          value={summary ? summary.tasks.open : "—"}
          icon={<Wrench className="h-5 w-5" />}
          accent="amber"
        />
        <StatCard
          label={L("موافقات معلّقة", "Pending approvals")}
          value={summary ? summary.approvals.pending : "—"}
          icon={<Server className="h-5 w-5" />}
          accent="purple"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={L("حالة الاتصال بالخادم", "Server connectivity")} icon={<Server className="h-4 w-4 text-navy-500" />} />
          <MetaGrid
            items={[
              {
                label: L("وضع التشغيل", "Runtime mode"),
                value: apiMode ? L("متصل بواجهة API", "Connected to API") : L("النموذج المحلي", "Local prototype"),
              },
              { label: L("العنوان", "Endpoint"), value: config.apiBaseUrl || "—" },
              {
                label: L("زمن الاستجابة", "Latency"),
                value: latency !== null ? `${latency} ms` : checkFailed ? L("فشل", "Failed") : "—",
              },
              { label: L("آخر فحص", "Last check"), value: lastCheck ?? L("لم يُجرَ بعد", "Not run yet") },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={runCheck} disabled={!apiMode || checking}>
              {L("فحص الاتصال", "Test connection")}
            </Button>
            <Button size="sm" variant="outline" onClick={refreshData} disabled={!apiMode || refreshing}>
              {L("إعادة تحميل دليل الهيكل والمستخدمين", "Reload directory & users")}
            </Button>
            {checkFailed ? (
              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                <XCircle className="me-1 h-3.5 w-3.5" /> {L("تعذّر الوصول", "Unreachable")}
              </Badge>
            ) : latency !== null ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckCircle2 className="me-1 h-3.5 w-3.5" /> {L("يعمل", "Operational")}
              </Badge>
            ) : null}
          </div>
        </Card>
        <Card>
          <SectionTitle title={L("النسخ الاحتياطي والصيانة", "Backup & maintenance")} icon={<Wrench className="h-4 w-4 text-navy-500" />} />
          <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>
              {L(
                "النسخ الاحتياطي وجدولة الصيانة ووضع الصيانة تُدار من فريق البنية التحتية خارج هذه الواجهة. هذه الصفحة للعرض فقط ولا تنفّذ عمليات على الخادم.",
                "Backups, maintenance windows and maintenance mode are operated by the infrastructure team outside this interface. This page is read-only and does not run server operations.",
              )}
            </p>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            {L(
              "لمزيد من التفاصيل راجع دليل التشغيل أو تواصل مع مدير النظام.",
              "See the operations runbook or contact a system administrator for details.",
            )}
          </p>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle
            title={L("مطابقة التخزين وسلامة البصمات", "Storage reconciliation & checksums")}
            icon={<ShieldAlert className="h-4 w-4 text-navy-500" />}
          />
          <p className="mb-3 text-xs text-ink-500">
            {L(
              "يقارن الفحص سجل الملفات في قاعدة البيانات مع محتويات الدلو في MinIO ومؤشرات الإصدارات الحالية. القراءة فقط: لا يحذف ولا يعدّل شيئاً، وأي تصرف بالملفات اليتيمة يبقى قرار مسؤول.",
              "The scan compares the database file registry with the MinIO bucket contents and the current-version pointers. It is read-only: it deletes and edits nothing, and acting on orphaned files stays an owner decision.",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={runInventory}
              disabled={!apiMode || scanning}
            >
              {scanning ? L("جارٍ الجرد…", "Scanning…") : L("جرد التخزين", "Run storage inventory")}
            </Button>
            {!apiMode && (
              <span className="text-[11px] text-ink-400">{L("غير متاح في النموذج المحلي.", "Not available in the local prototype.")}</span>
            )}
          </div>

          {inventoryError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{inventoryError}</span>
            </div>
          )}

          {inventory && (
            <div className="mt-3" role="status" aria-live="polite">
              <MetaGrid
                items={[
                  { label: L("الدلو", "Bucket"), value: inventory.bucket },
                  { label: L("ملفات مسجّلة", "Registered files"), value: String(inventory.files.total) },
                  { label: L("مرتبطة بوثائق", "Attached to documents"), value: String(inventory.files.attachedToDocuments) },
                  { label: L("مرتبطة بتقارير", "Attached to reports"), value: String(inventory.files.attachedToReportRuns) },
                  { label: L("غير مرتبطة", "Unreferenced"), value: String(inventory.files.unreferencedCount) },
                  { label: L("كائنات في الدلو", "Objects listed"), value: String(inventory.storage.listedObjects) },
                  { label: L("كائنات مفقودة", "Missing objects"), value: String(inventory.storage.missingObjectsCount) },
                  { label: L("كائنات يتيمة", "Orphan objects"), value: String(inventory.storage.orphanObjectsCount) },
                  {
                    label: L("مؤشرات إصدارات غير متسقة", "Inconsistent version pointers"),
                    value: String(inventory.versions.mismatchCount),
                  },
                  { label: L("وقت الجرد", "Scanned at"), value: new Date(inventory.generatedAt).toLocaleString() },
                ]}
              />

              {inventory.storage.listingFailed && (
                <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  {L(
                    `تعذّر سرد الدلو (${inventory.storage.listingError ?? "—"})؛ لا يمكن الحكم على الكائنات المفقودة أو اليتيمة في هذه الجولة.`,
                    `The bucket listing failed (${inventory.storage.listingError ?? "—"}); missing and orphan objects cannot be judged in this pass.`,
                  )}
                </p>
              )}

              {inventory.storage.listingTruncated && !inventory.storage.listingFailed && (
                <p className="mt-2 text-[11px] text-amber-600">
                  {L(
                    "توقف الجرد عند 5000 كائن؛ الدلو أكبر من المعروض، فعدد الكائنات اليتيمة حدّ أدنى لا حصر.",
                    "The listing stopped at 5,000 objects; the bucket holds more, so the orphan count is a lower bound.",
                  )}
                </p>
              )}

              <div className="mt-3 space-y-3">
                {inventory.storage.missingObjects.map((file) => (
                  <IntegrityRow
                    key={file.id}
                    tone="bad"
                    title={`${L("مفقود", "Missing")} · ${file.originalName}`}
                    detail={`${file.storageKey} · ${file.sizeBytes} B`}
                    check={checks[file.id]}
                    lang={lang}
                    busy={checkBusy === file.id}
                    onCheck={() => runFileCheck(file.id)}
                  />
                ))}
                {inventory.storage.missingObjectsTruncated && (
                  <p className="text-[11px] text-amber-600">
                    {L(
                      `تُعرض أول ${inventory.storage.missingObjects.length} من ${inventory.storage.missingObjectsCount} كائناً مفقوداً.`,
                      `Showing the first ${inventory.storage.missingObjects.length} of ${inventory.storage.missingObjectsCount} missing objects.`,
                    )}
                  </p>
                )}
                {inventory.files.unreferenced.map((file) => (
                  <IntegrityRow
                    key={file.id}
                    tone="warn"
                    title={`${L("غير مرتبط", "Unreferenced")} · ${file.originalName}`}
                    detail={`${file.storageKey} · ${file.mimeType} · ${file.sizeBytes} B`}
                    check={checks[file.id]}
                    lang={lang}
                    busy={checkBusy === file.id}
                    onCheck={() => runFileCheck(file.id)}
                  />
                ))}
                {inventory.files.unreferencedTruncated && (
                  <p className="text-[11px] text-amber-600">
                    {L(
                      `تُعرض أول ${inventory.files.unreferenced.length} من ${inventory.files.unreferencedCount} ملفاً غير مرتبط.`,
                      `Showing the first ${inventory.files.unreferenced.length} of ${inventory.files.unreferencedCount} unreferenced files.`,
                    )}
                  </p>
                )}
                {inventory.storage.orphanObjects.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
                    <p className="font-semibold">{L("كائنات في التخزين بلا سجل في القاعدة", "Objects in storage with no database row")}</p>
                    <ul className="mt-1 space-y-0.5 font-mono">
                      {inventory.storage.orphanObjects.map((key) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                    {inventory.storage.orphanObjectsTruncated && (
                      <p className="mt-1">
                        {L(
                          `تُعرض أول ${inventory.storage.orphanObjects.length} من ${inventory.storage.orphanObjectsCount} كائناً يتيماً.`,
                          `Showing the first ${inventory.storage.orphanObjects.length} of ${inventory.storage.orphanObjectsCount} orphan objects.`,
                        )}
                      </p>
                    )}
                  </div>
                )}
                {inventory.versions.mismatches.length > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300">
                    <p className="font-semibold">
                      {L("تعارض بين الإصدار الحالي ورأية التفعيل", "Current version disagrees with the active flag")}
                    </p>
                    <ul className="mt-1 space-y-0.5 font-mono">
                      {inventory.versions.mismatches.map((row) => (
                        <li key={row.id}>
                          {row.docNo} · {L("الحالي", "current")} {row.currentVersion} · {L("مفعّلة", "flagged")} {row.currentFlags} ·{" "}
                          {L("معلّمة", "marked")} {row.flaggedVersion ?? "—"}
                        </li>
                      ))}
                    </ul>
                    {inventory.versions.mismatchesTruncated && (
                      <p className="mt-1">
                        {L(
                          `تُعرض أول ${inventory.versions.mismatches.length} من ${inventory.versions.mismatchCount} تعارضاً.`,
                          `Showing the first ${inventory.versions.mismatches.length} of ${inventory.versions.mismatchCount} mismatches.`,
                        )}
                      </p>
                    )}
                  </div>
                )}
                {role === "system_admin" && (inventory.files.unreferencedCount > 0 || inventory.storage.orphanObjectsCount > 0) && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-500/30 dark:bg-rose-950/25">
                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                      {L("تنظيف البيات غير المرجعي", "Purge unreferenced debris")}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                      {L(
                        "المعاينة تُدرج ما سيُحذف ولا تحذف شيئاً. التنفيذ يحذف صفوف الملفات غير المرتبطة وكائنات التخزين اليتيمة نهائياً ولا يمكن التراجع عنه؛ سجل التدقيق وسلامة سلسلتهما يبقيان كما هما.",
                        "The preview lists what would be deleted and deletes nothing. Executing removes the unreferenced file rows and the orphan storage objects permanently, with no undo; the audit trail and its chain stay untouched.",
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {purgePlan && !purgePlan.dryRun ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<RefreshCw className="h-4 w-4" />}
                          onClick={() => runPurge(false)}
                          disabled={purgeBusy !== null}
                        >
                          {purgeBusy === "preview" ? L("جارٍ المعاينة…", "Previewing…") : L("معاينة خطة التنظيف", "Preview cleanup plan")}
                        </Button>
                      )}
                      {purgePlan && purgePlan.dryRun && !purgeAcknowledged && (
                        <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setPurgeAcknowledged(true)}>
                          {L("حذف ما في الخطة", "Delete what the plan lists")}
                        </Button>
                      )}
                      {purgeAcknowledged && purgePlan && purgePlan.dryRun && (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 className="h-4 w-4" />}
                            onClick={() => runPurge(true)}
                            disabled={purgeBusy !== null}
                          >
                            {purgeBusy === "execute" ? L("جارٍ الحذف…", "Deleting…") : L("تأكيد الحذف النهائي", "Confirm permanent delete")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPurgeAcknowledged(false)} disabled={purgeBusy !== null}>
                            {t("g.cancel")}
                          </Button>
                        </>
                      )}
                      {purgePlan && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPurgePlan(null);
                            setPurgeAcknowledged(false);
                          }}
                          disabled={purgeBusy !== null}
                        >
                          {L("إخفاء الخطة", "Hide plan")}
                        </Button>
                      )}
                    </div>

                    {purgeError && <p className="mt-2 text-[11px] text-rose-700 dark:text-rose-300">{purgeError}</p>}

                    {purgePlan && !purgePlan.dryRun && purgePlan.deleted && (
                      <div
                        className={
                          purgePlan.deleted.failures.length > 0
                            ? "mt-2 rounded-lg bg-white/70 p-2.5 text-[11px] text-rose-700 dark:bg-ink-900/40 dark:text-rose-300"
                            : "mt-2 rounded-lg bg-white/70 p-2.5 text-[11px] text-emerald-700 dark:bg-ink-900/40 dark:text-emerald-300"
                        }
                        role="status"
                        aria-live="polite"
                      >
                        <p className="font-semibold">
                          {L(
                            `نُفّذ التنظيف: ${purgePlan.deleted.files} صفوف ملفات و${purgePlan.deleted.objects} كائنات تخزين حُذفت.`,
                            `Cleanup ran: ${purgePlan.deleted.files} file rows and ${purgePlan.deleted.objects} storage objects deleted.`,
                          )}
                        </p>
                        {purgePlan.deleted.failures.length > 0 && (
                          <>
                            <p className="mt-1">
                              {L(
                                `تعذّر حذف ${purgePlan.deleted.failures.length} كائناً من الدلو؛ ستبقى ظاهرة ككائنات يتيمة عند إعادة الجرد.`,
                                `${purgePlan.deleted.failures.length} objects could not be removed from the bucket; they will still show as orphans on the next inventory.`,
                              )}
                            </p>
                            <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
                              {purgePlan.deleted.failures.map((key) => (
                                <li key={key}>{key}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}

                    {purgePlan && purgePlan.dryRun && (
                      <div className="mt-2 rounded-lg bg-white/70 p-2.5 text-[11px] dark:bg-ink-900/40" role="status" aria-live="polite">
                        <p className="font-semibold text-ink-800 dark:text-ink-100">
                          {L(
                            `خطة الحذف في الدلو ${purgePlan.bucket}: ${purgePlan.files.length} صفوف ملفات و${purgePlan.storageKeys.length} كائنات تخزين.`,
                            `Delete plan in bucket ${purgePlan.bucket}: ${purgePlan.files.length} file rows and ${purgePlan.storageKeys.length} storage objects.`,
                          )}
                        </p>
                        {purgePlan.files.length + purgePlan.storageKeys.length === 0 ? (
                          <p className="mt-1 text-ink-500">
                            {L(
                              "لا شيء مطابقاً للحذف في هذه الجولة — الجرد الحالي لا يرى بياتاً.",
                              "Nothing matches for deletion in this pass — the current inventory sees no debris.",
                            )}
                          </p>
                        ) : (
                          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-ink-500">
                            {purgePlan.files.map((file) => (
                              <li key={file.id}>
                                {file.originalName} · {file.storageKey}
                              </li>
                            ))}
                            {purgePlan.storageKeys
                              .filter((key) => !purgePlan.files.some((file) => file.storageKey === key))
                              .map((key) => (
                                <li key={key}>{key}</li>
                              ))}
                          </ul>
                        )}
                        {purgePlan.files.length < inventory.files.unreferencedCount && (
                          <p className="mt-1 text-amber-700 dark:text-amber-300">
                            {L(
                              `الخطة مقيّدة بأول 50 صفاً؛ البيات الكلي ${inventory.files.unreferencedCount}. أعد المعاينة بعد تنفيذ هذه الدفعة.`,
                              `The plan is capped at the first 50 rows; total debris is ${inventory.files.unreferencedCount}. Re-run the preview after this batch.`,
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!inventory.storage.listingFailed &&
                  inventory.storage.missingObjectsCount === 0 &&
                  inventory.files.unreferencedCount === 0 &&
                  inventory.storage.orphanObjectsCount === 0 &&
                  inventory.versions.mismatchCount === 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      {L("لا فروق بين القاعدة والتخزين في هذه الدفعة.", "No differences between the database and storage in this pass.")}
                    </div>
                  )}
              </div>
            </div>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle
            title={L("البيانات المخزّنة في هذا المتصفح", "Data stored in this browser")}
            icon={<HardDrive className="h-4 w-4 text-navy-500" />}
          />
          <MetaGrid
            items={[
              { label: L("عدد المفاتيح", "Keys"), value: String(footprint.keys) },
              { label: L("الحجم التقريبي", "Approx. size"), value: `${Math.max(1, Math.round(footprint.bytes / 1024))} KB` },
            ]}
          />
          <p className="mt-3 text-xs text-ink-400">
            {L(
              "تُخزَّن التفضيلات ومسودات الواجهة محلياً تحت البادئة edas.v1. مسحها يعيد الواجهة إلى حالتها الافتراضية ولا يؤثر على بيانات الخادم.",
              "Preferences and UI state are stored locally under the edas.v1 prefix. Clearing them resets the interface to defaults and does not affect server data.",
            )}
          </p>
          <Button
            size="sm"
            variant="danger"
            className="mt-3"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setResetting(true)}
            disabled={footprint.keys === 0}
          >
            {L("مسح البيانات المحلية", "Clear local data")}
          </Button>
        </Card>
      </div>
      <Modal
        open={resetting}
        onClose={() => setResetting(false)}
        title={L("مسح البيانات المحلية", "Clear local data")}
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(false)}>
              {t("g.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearPersistedState();
                setResetting(false);
                setFootprint(localFootprint());
                toast({
                  type: "success",
                  title: L("تم مسح البيانات المحلية", "Local data cleared"),
                  message: L("أعد تحميل الصفحة لتطبيق الحالة الافتراضية.", "Reload the page to apply defaults."),
                });
              }}
            >
              {L("مسح", "Clear")}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {L(
              "سيتم حذف التفضيلات والقيم المحفوظة في هذا المتصفح فقط. لن تُحذف أي وثيقة أو بيانات على الخادم.",
              "Only preferences and cached values in this browser will be deleted. No documents or server data will be affected.",
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
}
