import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Check, X, Activity, Search, AlertTriangle, ScrollText, Copy } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Avatar, Modal, Input, Select, EmptyState } from "../components/ui";
import { PageHeader, DataTable, ExportMenu, MetaGrid, SectionTitle } from "../components/shared";
import { auditEntries } from "../data";
import { config } from "../config";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { mapAuditEvent } from "../lib/api-mappers";
import { loadAllPages } from "../lib/pagination";
import type { AuditChainBreakDto, AuditChainReportDto } from "@edas/shared";
import type { AuditEntry } from "../types";

const PAGE_SIZE = 50;

const BREAK_KIND_LABEL: Record<AuditChainBreakDto["kind"], [string, string]> = {
  hash_mismatch: ["تجزئة غير مطابقة", "Hash mismatch"],
  broken_link: ["رابط مقطوع", "Broken link"],
  missing_hash: ["تجزئة مفقودة", "Missing hash"],
};

interface AuditMeta {
  total: number;
  success: number;
  failure: number;
  entityTypes: string[];
}

const EMPTY_META: AuditMeta = { total: 0, success: 0, failure: 0, entityTypes: [] };

export function AuditTrail() {
  const { t, lang, toast, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const apiMode = config.useApi;
  const { auditLog, users } = useDocsStore();
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [q, setQ] = useState("");
  const [fUser, setFUser] = useState("all");
  const [fModule, setFModule] = useState("all");
  const [fResult, setFResult] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<AuditMeta>(EMPTY_META);
  const [loading, setLoading] = useState(apiMode);
  const [chain, setChain] = useState<AuditChainReportDto | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [baselining, setBaselining] = useState(false);
  const userList = users.items as { id: string; name: string }[];
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const errTitle = t("err.api");

  const verifyChain = async () => {
    setVerifying(true);
    setChainError(null);
    setConfirmingBaseline(false);
    try {
      const report = await domainApi.verifyAuditChain();
      setChain(report);
      toast({
        type: report.valid ? "success" : report.alarm ? "error" : "warning",
        title: report.valid
          ? L("سلسلة التدقيق سليمة", "Audit chain is intact")
          : report.alarm
            ? L("كسر جديد في سلسلة التدقيق", "New break detected in the audit chain")
            : L("تلف تاريخي معتمد في السلسلة", "Acknowledged historical damage"),
        message: report.valid
          ? L(`${report.events} حدثاً متسلسلاً بلا كسور ولا تفرعات.`, `${report.events} sequenced events, no breaks or forks.`)
          : report.alarm
            ? L(
                `${report.newBreakCount + report.newForkCount} كسراً أو تفرعاً خارج سجل التلف المعتمد.`,
                `${report.newBreakCount + report.newForkCount} break(s) or fork(s) outside the acknowledged damage register.`,
              )
            : L("راجع تقرير الفحص أدناه.", "Review the verification report below."),
      });
    } catch (error) {
      setChain(null);
      setChainError(serverReason(error) ?? errTitle);
      toast({ type: "error", title: errTitle });
    } finally {
      setVerifying(false);
    }
  };

  const recordBaseline = async () => {
    setBaselining(true);
    try {
      const report = await domainApi.recordAuditChainBaseline();
      setChain(report);
      setConfirmingBaseline(false);
      toast({
        type: report.alarm ? "warning" : "success",
        title: L("سُجّل التلف التاريخي", "Historical damage recorded"),
        message: L(
          `${report.knownBreakCount + report.knownForkCount} مشكلة معتمدة الآن؛ أي كسر لاحق يُعدّ تنبيهاً جديداً.`,
          `${report.knownBreakCount + report.knownForkCount} issue(s) acknowledged; any later break raises the alarm.`,
        ),
      });
    } catch (error) {
      toast({ type: "error", title: errTitle, message: serverReason(error) });
    } finally {
      setBaselining(false);
    }
  };

  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        try {
          const result = await domainApi.auditEvents({
            q: q || undefined,
            actorId: fUser === "all" ? undefined : fUser,
            entityType: fModule === "all" ? undefined : fModule,
            result: fResult === "all" ? undefined : (fResult as "success" | "failure"),
            page,
            pageSize: PAGE_SIZE,
          });
          if (cancelled) return;
          setRows(result.items.map((event) => mapAuditEvent(event, userList)));
          setMeta({
            total: result.meta.total,
            success: result.meta.success,
            failure: result.meta.failure,
            entityTypes: result.meta.entityTypes,
          });
        } catch {
          if (cancelled) return;
          setRows([]);
          setMeta(EMPTY_META);
          toastRef.current({ type: "error", title: errTitle });
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      q ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiMode, q, fUser, fModule, fResult, page, userList, errTitle]);

  const offlineEntries = useMemo(() => {
    const all = [...auditLog, ...auditEntries];
    return all.filter((entry) => {
      const ql = q.toLowerCase();
      if (
        q &&
        !(
          entry.user.includes(q) ||
          entry.action.includes(q) ||
          entry.entityId.toLowerCase().includes(ql) ||
          entry.correlation.toLowerCase().includes(ql) ||
          entry.ip.includes(q) ||
          entry.module.includes(q)
        )
      )
        return false;
      if (fUser !== "all" && entry.user !== fUser) return false;
      if (fModule !== "all" && entry.module !== fModule) return false;
      if (fResult !== "all" && entry.result !== fResult) return false;
      return true;
    });
  }, [auditLog, q, fUser, fModule, fResult]);

  const total = apiMode ? meta.total : offlineEntries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const visible = apiMode ? rows : offlineEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const successCount = apiMode ? meta.success : offlineEntries.filter((entry) => entry.result === "success").length;
  const failureCount = apiMode ? meta.failure : offlineEntries.filter((entry) => entry.result === "failure").length;

  const userOptions = apiMode
    ? userList.map((user) => ({ value: user.id, label: user.name }))
    : Array.from(new Set([...auditLog, ...auditEntries].map((entry) => entry.user))).map((name) => ({ value: name, label: name }));
  const moduleOptions = apiMode ? meta.entityTypes : Array.from(new Set([...auditLog, ...auditEntries].map((entry) => entry.module)));

  const resetPage = () => setPage(1);
  const toExportRow = (entry: AuditEntry) => ({
    datetime: entry.datetime,
    user: entry.user,
    module: entry.module,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    ip: entry.ip,
    result: entry.result,
    correlation: entry.correlation,
  });
  const loadAllRows = async () => {
    if (!apiMode) return offlineEntries.map(toExportRow);
    const all = await loadAllPages((query) =>
      domainApi.auditEvents({
        q: q || undefined,
        actorId: fUser === "all" ? undefined : fUser,
        entityType: fModule === "all" ? undefined : fModule,
        result: fResult === "all" ? undefined : (fResult as "success" | "failure"),
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
    return all.items.map((event) => toExportRow(mapAuditEvent(event, userList)));
  };

  const stats = [
    { label: L("إجمالي السجلات", "Total entries"), value: total, icon: ScrollText, color: "from-navy-400 to-navy-600" },
    {
      label: L("في هذه الصفحة", "On this page"),
      value: visible.length,
      icon: Activity,
      color: "from-sky-400 to-sky-600",
    },
    { label: L("ناجحة", "Successful"), value: successCount, icon: Check, color: "from-teal-400 to-teal-600" },
    { label: L("فاشلة", "Failed"), value: failureCount, icon: AlertTriangle, color: "from-rose-400 to-rose-600" },
  ];
  const moduleColor: Record<string, string> = {
    الوثائق: "bg-navy-100 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300",
    المستخدمون: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    السياسات: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    "سير العمل": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    الأمان: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    الإعدادات: "bg-ink-100 text-ink-600 dark:bg-ink-800",
    الصلاحيات: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  };

  return (
    <div>
      <PageHeader
        title={t("nav.auditTrail")}
        description={L(
          "سجل تدقيق للقراءة فقط يُكتب من الخادم ويُربط كل حدث بتجزئة الحدث السابق",
          "Read-only audit log written by the server, hash-chained to the previous event",
        )}
        breadcrumbs={[{ label: t("nav.reports"), to: "/reports" }, { label: t("nav.auditTrail") }]}
        actions={
          <>
            {apiMode && (
              <Button
                size="sm"
                variant="outline"
                icon={<ShieldCheck className="h-4 w-4" />}
                onClick={verifyChain}
                disabled={verifying}
                title={L(
                  "يُعاد حساب تجزئة كل حدث ويُقارن برابطه إلى الحدث السابق",
                  "Recomputes every event hash and checks its link to the previous event",
                )}
              >
                {verifying ? L("جارٍ الفحص…", "Verifying…") : L("تحقق السلسلة", "Verify chain")}
              </Button>
            )}
            <ExportMenu rows={visible.map(toExportRow)} loadRows={loadAllRows} filename="edas-audit-trail" />
          </>
        }
      />

      {/* Integrity notice */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="text-emerald-700 dark:text-emerald-300">
          {apiMode
            ? L(
                "كل حدث موقّع بتجزئة SHA-256 مرتبطة بالحدث السابق، والتعديل من واجهة المستخدم غير ممكن.",
                "Every event carries a SHA-256 hash chained to the previous event; the UI cannot modify entries.",
              )
            : L(
                "وضع العرض المحلي: السجلات المعروضة تجريبية ولا تُكتب إلى سجل الخادم.",
                "Offline demo mode: displayed entries are samples and are not written to the server trail.",
              )}
        </span>
      </div>

      {/* Chain verification report */}
      {apiMode && (chain || chainError) && (
        <div className="mb-4" role="status" aria-live="polite">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                  !chain || chain.alarm
                    ? "from-rose-400 to-rose-600"
                    : chain.valid
                      ? "from-emerald-400 to-emerald-600"
                      : "from-amber-400 to-amber-600",
                )}
              >
                {!chain || chain.alarm ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : chain.valid ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <Activity className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink-800 dark:text-ink-100">
                  {chainError
                    ? L("تعذّر فحص السلسلة", "Chain verification failed")
                    : chain?.alarm
                      ? L("كسر غير معتمد في سلسلة التدقيق", "Unacknowledged break in the audit chain")
                      : chain?.valid
                        ? L("السلسلة سليمة من أول حدث إلى آخره", "The chain is intact from genesis to head")
                        : L("التلف المحصور في سجل التلف المعتمد", "All damage falls inside the acknowledged register")}
                </p>
                <p className="text-xs text-ink-500">
                  {chainError ??
                    (chain &&
                      `${L("وقت الفحص", "Verified at")}: ${new Date(chain.verifiedAt).toLocaleString(lang === "en" ? "en-GB" : "ar-SA")}`)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setChain(null);
                  setChainError(null);
                }}
              >
                {L("إخفاء النتيجة", "Hide result")}
              </Button>
            </div>

            {chain && (
              <>
                <div className="mt-3">
                  <MetaGrid
                    items={[
                      { label: L("عدد الأحداث", "Events"), value: String(chain.events) },
                      { label: L("آخر تسلسل", "Last sequence"), value: chain.maxSeq === null ? "—" : String(chain.maxSeq) },
                      { label: L("فجوات التسلسل", "Sequence gaps"), value: String(chain.sequenceGaps) },
                      { label: L("كسور السلسلة", "Breaks"), value: String(chain.breakCount) },
                      { label: L("كسور غير معتمدة", "Unacknowledged breaks"), value: String(chain.newBreakCount) },
                      { label: L("تفرعات", "Forks"), value: String(chain.forkCount) },
                      { label: L("تفرعات غير معتمدة", "Unacknowledged forks"), value: String(chain.newForkCount) },
                      {
                        label: L("أحداث موقّعة التفاصيل", "Detail-signed events"),
                        value:
                          chain.detailSignedFromSeq === null
                            ? L("لا شيء", "none")
                            : `${chain.detailSignedEvents} · ${L("من التسلسل", "from seq")} ${chain.detailSignedFromSeq}`,
                      },
                      {
                        label: L("سجل التلف", "Damage register"),
                        value: chain.baseline
                          ? `${new Date(chain.baseline.recordedAt).toLocaleString(lang === "en" ? "en-GB" : "ar-SA")} · ${
                              chain.baseline.breakCount + chain.baseline.forkCount
                            }`
                          : L("لم يُعتمد بعد", "not recorded"),
                      },
                      { label: L("أحداث الجذر", "Genesis events"), value: String(chain.genesisCount) },
                      {
                        label: L("أول كسر", "First break"),
                        value: chain.firstBrokenSeq === null ? "—" : String(chain.firstBrokenSeq),
                      },
                    ]}
                  />
                </div>

                {chain.breaks.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <caption className="mb-1 text-start text-[11px] font-semibold text-ink-500">
                        {L("أحداث لا تطابق تجزئتها أو رابطها", "Events whose hash or link does not match")}
                      </caption>
                      <thead>
                        <tr className="border-b border-ink-200 text-[11px] text-ink-500 dark:border-ink-800">
                          <th scope="col" className="py-1.5 pe-2 font-semibold">
                            {L("التسلسل", "Seq")}
                          </th>
                          <th scope="col" className="py-1.5 pe-2 font-semibold">
                            {L("الوقت", "Time")}
                          </th>
                          <th scope="col" className="py-1.5 pe-2 font-semibold">
                            {L("العملية", "Action")}
                          </th>
                          <th scope="col" className="py-1.5 pe-2 font-semibold">
                            {L("المشكلة", "Issue")}
                          </th>
                          <th scope="col" className="py-1.5 pe-2 font-semibold">
                            {L("الحالة", "Status")}
                          </th>
                          <th scope="col" className="py-1.5 font-semibold">
                            {L("التجزئة (مرصودة/متوقعة)", "Hash (found/expected)")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {chain.breaks.map((brk) => (
                          <tr key={brk.seq} className="border-b border-ink-100 last:border-0 dark:border-ink-800/60">
                            <td className="py-1.5 pe-2 font-mono text-[11px]">{brk.seq}</td>
                            <td className="py-1.5 pe-2 font-mono text-[11px] text-ink-500">
                              {new Date(brk.ts).toLocaleString(lang === "en" ? "en-GB" : "ar-SA")}
                            </td>
                            <td className="py-1.5 pe-2">
                              {brk.action} · {brk.entityType}
                            </td>
                            <td className="py-1.5 pe-2">
                              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                {lang === "en" ? BREAK_KIND_LABEL[brk.kind][1] : BREAK_KIND_LABEL[brk.kind][0]}
                              </Badge>
                            </td>
                            <td className="py-1.5 pe-2">
                              <Badge
                                className={cn(
                                  brk.known
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                                )}
                              >
                                {brk.known ? L("معتمد سابقاً", "Previously acknowledged") : L("غير معتمد", "Unacknowledged")}
                              </Badge>
                            </td>
                            <td className="py-1.5 font-mono text-[10px] text-ink-500">
                              {(brk.found ?? "—").slice(0, 12)} / {(brk.expected ?? "—").slice(0, 12)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {chain.truncated && (
                      <p className="mt-1 text-[11px] text-amber-600">
                        {L(
                          "يُعرض أول 50 كسراً فقط؛ الرصيد الكامل مذكور في جدول الملخص.",
                          "Only the first 50 breaks are listed; the full count is in the summary.",
                        )}
                      </p>
                    )}
                  </div>
                )}

                {chain.forks.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold text-ink-500">
                      {L("تجزئة أم واحدة ولها أكثر من حدث تالٍ", "One parent hash with more than one child event")}
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px]">
                      {chain.forks.map((fork) => (
                        <li key={fork.prevHash} className="font-mono text-ink-600 dark:text-ink-300">
                          {fork.prevHash.slice(0, 12)} · {fork.children} · {L("أحداث", "events")} {fork.seqs.join(", ")} ·{" "}
                          {fork.known ? L("معتمد سابقاً", "acknowledged") : L("غير معتمد", "unacknowledged")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {chain.valid && chain.sequenceGaps > 0 && (
                  <p className="mt-3 text-[11px] text-amber-600">
                    {L(
                      "التسلسل يحتوي فجوات رقمياً رغم سلامة الروابط، وهي علامة على أحداث حُذفت من الجدول.",
                      "The sequence has numeric gaps while the links stay valid, which marks events removed from the table.",
                    )}
                  </p>
                )}

                {!chain.valid && !chain.alarm && (
                  <p className="mt-3 text-[11px] text-amber-700">
                    {L(
                      "كل المشاكل المرصودة مسجّلة في سجل التلف المعتمد، فهي سابقة على قفل السلسلة ولا يمكن إصلاحها دون إعادة كتابة التاريخ — وهو ما يمنعه السجل.",
                      "Every detected issue is listed in the acknowledged damage register, so it predates the chain lock and cannot be repaired without rewriting history, which the ledger forbids.",
                    )}
                  </p>
                )}

                {!chain.baseline && (chain.breakCount > 0 || chain.forkCount > 0) && (
                  <p className="mt-3 text-[11px] text-rose-600">
                    {L(
                      "لم يُعتمد أي سجل تلف بعد، لذلك تُحسب كل المشاكل كغير معتمدة وتُرفع التنبيهة.",
                      "No damage register has been recorded yet, so every issue counts as unacknowledged and raises the alarm.",
                    )}
                  </p>
                )}

                {!chain.valid && role === "system_admin" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {confirmingBaseline ? (
                      <>
                        <Button size="sm" variant="danger" loading={baselining} onClick={recordBaseline}>
                          {L("تأكيد الاعتماد", "Confirm acknowledgement")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingBaseline(false)} disabled={baselining}>
                          {L("إلغاء", "Cancel")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<ShieldCheck className="h-4 w-4" />}
                        onClick={() => setConfirmingBaseline(true)}
                      >
                        {L("اعتماد التلف الحالي", "Acknowledge current damage")}
                      </Button>
                    )}
                    <p className="text-[11px] text-ink-400">
                      {L(
                        "يُثبّت هذا الإجراء قائمة الكسور والتفرعات الحالية في حدث تدقيق موقّع؛ بعدها يُعدّ أي كسر جديد خارج القائمة تنبيهاً حقيقياً.",
                        "This writes the current break and fork list into a signed audit event; afterwards any break outside that list is a real alarm.",
                      )}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-[11px] text-ink-400">
                  {L(
                    chain.detailSignedFromSeq === null
                      ? "لا يوقّع التقرير تفاصيل الأحداث بعد؛ الحقول الموقّعة هي الوقت والعملية والكيان والمستخدم والنتيجة."
                      : `تُشمل تفاصيل الحدث في التجزئة منذ التسلسل ${chain.detailSignedFromSeq}؛ الأحداث الأقدم منها وقّعت الحقول فقط ولا يمكن إعادة توقيعها دون إعادة كتابة التاريخ.`,
                    chain.detailSignedFromSeq === null
                      ? "Event detail is not hashed yet; the signed fields are time, action, entity, actor and result."
                      : `From sequence ${chain.detailSignedFromSeq} the event detail is part of the hash; older events signed only the columns and cannot be re-signed without rewriting history.`,
                  )}
                </p>
              </>
            )}
          </Card>
        </div>
      )}

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
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <div className="relative min-w-40 flex-1 md:max-w-60">
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
            placeholder={L("ابحث في السجل…", "Search audit log…")}
            aria-label={L("ابحث في سجل التدقيق", "Search audit log")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
          />
        </div>
        <Select
          className="h-8 w-40 text-xs"
          aria-label={L("تصفية حسب المستخدم", "Filter by user")}
          value={fUser}
          onChange={(e) => {
            setFUser(e.target.value);
            resetPage();
          }}
        >
          <option value="all">
            {t("g.all")} — {L("المستخدم", "User")}
          </option>
          {userOptions.map((user) => (
            <option key={user.value} value={user.value}>
              {user.label}
            </option>
          ))}
        </Select>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الوحدة", "Filter by module")}
          value={fModule}
          onChange={(e) => {
            setFModule(e.target.value);
            resetPage();
          }}
        >
          <option value="all">
            {t("g.all")} — {L("الوحدة", "Module")}
          </option>
          {moduleOptions.map((moduleName) => (
            <option key={moduleName} value={moduleName}>
              {moduleName}
            </option>
          ))}
        </Select>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب النتيجة", "Filter by result")}
          value={fResult}
          onChange={(e) => {
            setFResult(e.target.value);
            resetPage();
          }}
        >
          <option value="all">{t("g.all")}</option>
          <option value="success">{L("نجاح", "Success")}</option>
          <option value="failure">{L("فشل", "Failure")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {visible.length} {L("من", "of")} {total}
        </span>
      </div>

      <DataTable
        rows={visible}
        loading={loading}
        pageSize={PAGE_SIZE}
        empty={
          <Card>
            <EmptyState
              variant="search"
              title={L("لا توجد سجلات مطابقة", "No matching entries")}
              description={L("جرّب تعديل البحث أو الفلاتر.", "Adjust search or filters.")}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setFUser("all");
                    setFModule("all");
                    setFResult("all");
                    resetPage();
                  }}
                >
                  {L("مسح الفلاتر", "Clear filters")}
                </Button>
              }
            />
          </Card>
        }
        onRowClick={(r) => setDetail(r)}
        columns={[
          {
            key: "datetime",
            header: L("الوقت", "Time"),
            sortValue: (r) => r.datetime,
            render: (r) => <span className="font-mono text-xs font-semibold text-ink-700 dark:text-ink-200">{r.datetime}</span>,
          },
          {
            key: "user",
            header: L("المستخدم", "User"),
            sortValue: (r) => r.user,
            render: (r) => (
              <div className="flex items-center gap-2">
                <Avatar initials={r.user.slice(0, 2)} color="bg-navy-600" size="xs" />
                <span className="truncate text-xs font-medium text-ink-700 dark:text-ink-200">{r.user}</span>
              </div>
            ),
          },
          {
            key: "module",
            header: L("الوحدة", "Module"),
            sortValue: (r) => r.module,
            render: (r) => <Badge className={moduleColor[r.module] ?? "bg-ink-100 text-ink-600 dark:bg-ink-800"}>{r.module}</Badge>,
          },
          {
            key: "action",
            header: L("العملية", "Action"),
            sortValue: (r) => r.action,
            render: (r) => <span className="text-xs font-medium text-ink-700 dark:text-ink-200">{r.action}</span>,
          },
          {
            key: "entity",
            header: L("الكيان", "Entity"),
            render: (r) => (
              <span className="font-mono text-[11px] text-ink-500">
                {r.entityType} · {r.entityId || "—"}
              </span>
            ),
          },
          {
            key: "ip",
            header: "IP",
            sortValue: (r) => r.ip,
            render: (r) => <span className="font-mono text-[11px] text-ink-400">{r.ip}</span>,
          },
          {
            key: "res",
            header: L("النتيجة", "Result"),
            sortValue: (r) => r.result,
            render: (r) => (
              <Badge
                className={
                  r.result === "success"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                }
                dot={r.result === "success" ? "bg-emerald-500" : "bg-rose-500"}
              >
                {r.result === "success" ? L("نجاح", "Success") : L("فشل", "Failure")}
              </Badge>
            ),
          },
          {
            key: "corr",
            header: L("الترابط", "Correlation"),
            render: (r) => <span className="font-mono text-[10px] text-ink-400">{r.correlation || "—"}</span>,
          },
        ]}
      />

      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <span>
            {L("صفحة", "Page")} {safePage} {L("من", "of")} {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={safePage <= 1 || loading} onClick={() => setPage(safePage - 1)}>
              {L("السابق", "Previous")}
            </Button>
            <Button size="sm" variant="outline" disabled={safePage >= pageCount || loading} onClick={() => setPage(safePage + 1)}>
              {L("التالي", "Next")}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={L("تفاصيل سجل التدقيق", "Audit entry details")}
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              icon={<Copy className="h-4 w-4" />}
              disabled={!detail?.correlation}
              onClick={() => {
                if (!detail?.correlation) return;
                navigator.clipboard
                  ?.writeText(detail.correlation)
                  .then(() => toast({ type: "success", title: L("تم نسخ رقم الترابط", "Correlation copied") }))
                  .catch(() => toast({ type: "error", title: L("تعذر النسخ", "Copy failed") }));
              }}
            >
              {L("نسخ الترابط", "Copy correlation")}
            </Button>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t("g.close")}
            </Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-xl border-2 p-3.5",
                detail.result === "success"
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                    detail.result === "success" ? "from-emerald-400 to-emerald-600" : "from-rose-400 to-rose-600",
                  )}
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{detail.action}</p>
                  <p className="text-xs text-ink-500">
                    {detail.module} · {detail.entityType} · {detail.entityId || "—"}
                  </p>
                </div>
                <Badge
                  className={
                    detail.result === "success"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                  }
                >
                  {detail.result === "success" ? L("نجاح", "Success") : L("فشل", "Failure")}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
              <SectionTitle title={L("بيانات الحدث", "Event data")} />
              <div className="mt-2">
                <MetaGrid
                  items={[
                    { label: L("الوقت", "Time"), value: detail.datetime },
                    { label: L("المستخدم", "User"), value: detail.user },
                    { label: L("الوحدة", "Module"), value: detail.module },
                    { label: "IP", value: detail.ip },
                    { label: L("رقم الترابط", "Correlation"), value: detail.correlation || "—" },
                    { label: L("معرّف الكيان", "Entity id"), value: detail.entityId || "—" },
                  ]}
                />
              </div>
            </div>
            <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
              <SectionTitle title={L("تفاصيل مسجّلة من الخادم", "Detail recorded by the server")} />
              {detail.detail ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 font-mono text-[11px] leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
                  {detail.detail}
                </pre>
              ) : (
                <p className="mt-2 text-xs text-ink-500">
                  {L("لم يسجّل الخادم تفاصيل إضافية لهذا الحدث.", "The server recorded no extra detail for this event.")}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
