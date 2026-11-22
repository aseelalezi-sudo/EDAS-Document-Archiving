import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Gavel, Check, AlertTriangle, Trash2, Eye, Archive, FileClock, Lock, Search, X, Activity, FileCheck2 } from "lucide-react";
import type { DestructionCertificateDto } from "@edas/shared";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Input, Select, ConfirmDialog, EmptyState } from "../components/ui";
import { PageHeader, DataTable, RowMenu, SectionTitle, ExportMenu } from "../components/shared";
import { retentionItems } from "../data";
import { useDocsStore } from "../store-docs";
import { DestructionCertificateModal, ExtendRetentionModal } from "./policies-retention-parts";
export function RetentionQueue() {
  const { t, lang, toast, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [dispose, setDispose] = useState<(typeof retentionItems)[number] | null>(null);
  const [certificate, setCertificate] = useState<DestructionCertificateDto | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [extendOpen, setExtendOpen] = useState<(typeof retentionItems)[number] | null>(null);
  const [extendYears, setExtendYears] = useState("1");
  const [q, setQ] = useState("");
  const [fUrg, setFUrg] = useState("all");
  const [fHold, setFHold] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDisposeOpen, setBulkDisposeOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { retention: items, removeRetention: removeItem, addHold, retentionCertificate } = useDocsStore();
  const navigate = useNavigate();
  const pendingItems = items.filter((item) => item.reviewStatus === "pending");
  const disposedItems = items
    .filter((item) => item.reviewStatus === "reviewed" && item.action === "DESTROY")
    .slice()
    .sort((a, b) => (b.executedAt || b.retentionEnd || "").localeCompare(a.executedAt || a.retentionEnd || ""));
  const selectedItems = pendingItems.filter((item) => selected.includes(item.id));
  const heldSelected = selectedItems.filter((item) => item.onHold);
  const disposables = selectedItems.filter((item) => !item.onHold);

  const stats = [
    {
      label: L("مستحقة الآن", "Due now"),
      value: pendingItems.filter((r) => r.daysLeft <= 0).length,
      icon: AlertTriangle,
      color: "from-rose-400 to-rose-600",
      f: "due",
    },
    {
      label: L("هذا الأسبوع", "This week"),
      value: pendingItems.filter((r) => r.daysLeft > 0 && r.daysLeft <= 7).length,
      icon: Clock,
      color: "from-amber-400 to-amber-600",
      f: "week",
    },
    {
      label: L("هذا الشهر", "This month"),
      value: pendingItems.filter((r) => r.daysLeft > 7 && r.daysLeft <= 30).length,
      icon: FileClock,
      color: "from-teal-400 to-teal-600",
      f: "month",
    },
    {
      label: L("تحت حجز قانوني", "On legal hold"),
      value: pendingItems.filter((r) => r.onHold).length,
      icon: Lock,
      color: "from-purple-400 to-purple-600",
      f: "hold",
    },
    { label: L("الإجمالي", "Total"), value: pendingItems.length, icon: Archive, color: "from-navy-400 to-navy-600", f: "all" },
  ];

  const filtered = pendingItems.filter((r) => {
    if (q && !(r.docTitle.includes(q) || r.docNo.toLowerCase().includes(q.toLowerCase()) || r.owner.includes(q) || r.policy.includes(q)))
      return false;
    if (fHold === "held" && !r.onHold) return false;
    if (fHold === "free" && r.onHold) return false;
    if (fUrg === "due" && r.daysLeft > 0) return false;
    if (fUrg === "week" && !(r.daysLeft > 0 && r.daysLeft <= 7)) return false;
    if (fUrg === "month" && !(r.daysLeft > 7 && r.daysLeft <= 30)) return false;
    return true;
  });

  const urgencyCls = (d: number) =>
    d < 0
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : d <= 7
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : d <= 30
          ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  const urgencyLbl = (d: number) =>
    d < 0
      ? lang === "en"
        ? `Overdue ${Math.abs(d)}d`
        : `متأخرة ${Math.abs(d)} ي`
      : d === 0
        ? lang === "en"
          ? "Due today"
          : "اليوم"
        : lang === "en"
          ? `${d} days`
          : `${d} يوم`;
  const urgencyPct = (d: number) => (d < 0 ? 100 : d <= 7 ? 85 : d <= 30 ? 55 : 25);
  const actionIcon = (a: string) =>
    a.includes("إتلاف") || a.includes("Dispose") ? (
      <Trash2 className="h-3.5 w-3.5" />
    ) : a.includes("أرشفة") || a.includes("Archive") ? (
      <Archive className="h-3.5 w-3.5" />
    ) : a.includes("تمديد") || a.includes("Extend") ? (
      <Clock className="h-3.5 w-3.5" />
    ) : (
      <Eye className="h-3.5 w-3.5" />
    );
  const actionCls = (a: string) =>
    a.includes("إتلاف") || a.includes("Dispose")
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : a.includes("أرشفة") || a.includes("Archive")
        ? "bg-navy-100 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300"
        : a.includes("تمديد") || a.includes("Extend")
          ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
          : "bg-ink-100 text-ink-600 dark:bg-ink-800";

  const openCertificate = async (id: string) => {
    setCertLoading(true);
    setCertificate(null);
    const found = await retentionCertificate(id);
    setCertLoading(false);
    setCertificate(found);
    if (!found)
      toast({
        type: "error",
        title: L("تعذّر استخراج شهادة الإتلاف", "Could not load the destruction certificate"),
        message: L("لم يُعثر على سجل إتلاف خادمي لهذا العنصر.", "No server-side destruction record was found for this item."),
      });
  };
  const doExtend = async () => {
    if (!extendOpen) return;
    const base = new Date(extendOpen.retentionEnd || Date.now());
    const due = new Date(base.getTime());
    due.setFullYear(due.getFullYear() + Number(extendYears || 1));
    const ok = await removeItem(extendOpen.id, { dueAt: due.toISOString() });
    if (!ok) return;
    toast({
      type: "success",
      title: L("تم تمديد الاحتفاظ", "Retention extended"),
      message: `${extendOpen.docTitle} — +${extendYears} ${L("سنة", "year(s)")}`,
    });
    setExtendOpen(null);
    setExtendYears("1");
  };
  const doHold = async (r: (typeof pendingItems)[number]) => {
    const ok = await addHold({
      ref: `LEGAL-HOLD-${r.docNo}`,
      reason: L("حجز قانوني على وثيقة قاربت نهاية الاحتفاظ", "Legal hold on a document nearing retention end"),
      caseRef: `CASE-${r.docNo}`,
      placedBy: user?.name ?? "—",
      placedAt: new Date().toISOString().slice(0, 10),
      items: 1,
      documentIds: r.documentId ? [r.documentId] : undefined,
    });
    if (!ok) return;
    toast({
      type: "warning",
      title: L("تم وضع الحجز القانوني", "Legal hold placed"),
      message: `${r.docTitle} — ${L("محفوظة من الإتلاف", "protected from disposal")}`,
    });
  };
  const bulkExtend = async () => {
    if (selectedItems.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const results = await Promise.all(
      selectedItems.map((r) => {
        const due = new Date(r.retentionEnd || Date.now());
        due.setFullYear(due.getFullYear() + 1);
        return removeItem(r.id, { dueAt: due.toISOString() });
      }),
    );
    setBulkBusy(false);
    const ok = results.filter(Boolean).length;
    setSelected([]);
    toast({
      type: ok > 0 ? "success" : "error",
      title: L(`تم تمديد ${ok} عنصراً`, `Extended ${ok} item(s)`),
      message: L("سنة واحدة لكل عنصر", "One year per item"),
    });
  };
  const bulkDispose = async () => {
    if (disposables.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const results = await Promise.all(disposables.map((r) => removeItem(r.id, { action: "DESTROY" })));
    setBulkBusy(false);
    setBulkDisposeOpen(false);
    const ok = results.filter(Boolean).length;
    setSelected([]);
    toast({
      type: ok > 0 ? "success" : "error",
      title: L(`تم إتلاف ${ok} وثيقة`, `Disposed ${ok} document(s)`),
      message: [
        heldSelected.length > 0
          ? L(`تم تخطي ${heldSelected.length} محجوزة قانونياً`, `Skipped ${heldSelected.length} on legal hold`)
          : undefined,
        ok > 0 ? L("شهادات الإتلاف متاحة من سجل الإتلافات المنفّذة", "Certificates are available in the disposal log below") : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  };

  return (
    <div>
      <PageHeader
        title={t("nav.retentionQueue")}
        description={L("وثائق تقترب من نهاية فترة الاحتفاظ وتتطلب إجراءً", "Documents nearing retention end requiring action")}
        breadcrumbs={[{ label: t("nav.policies"), to: "/policies" }, { label: t("nav.retentionQueue") }]}
        actions={
          <ExportMenu
            rows={filtered.map((r) => ({
              docNo: r.docNo,
              title: r.docTitle,
              policy: r.policy,
              retentionEnd: r.retentionEnd,
              owner: r.owner,
              daysLeft: r.daysLeft,
              onHold: r.onHold ? "Yes" : "No",
              proposedAction: r.proposedAction,
            }))}
            filename="edas-retention-queue"
          />
        }
      />

      {/* Clickable urgency stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => {
          const active = fUrg === s.f;
          return (
            <button
              key={s.label}
              type="button"
              aria-pressed={active}
              onClick={() => setFUrg(active ? "all" : s.f)}
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
                {s.value > 0 && <span className="text-xl font-extrabold text-ink-900 dark:text-white">{s.value}</span>}
              </div>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{s.label}</p>
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
            placeholder={L("ابحث في القائمة…", "Search queue…")}
            aria-label={L("بحث في قائمة الاحتفاظ", "Search retention queue")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الحجز القانوني", "Filter by legal hold")}
          value={fHold}
          onChange={(e) => setFHold(e.target.value)}
        >
          <option value="all">{L("الكل — الحجز", "All — hold")}</option>
          <option value="held">{L("محجوزة", "On hold")}</option>
          <option value="free">{L("غير محجوزة", "Not held")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {pendingItems.length}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-200 bg-navy-50 px-3.5 py-2.5 dark:border-navy-800 dark:bg-navy-900/30">
          <p className="text-xs font-semibold text-navy-700 dark:text-navy-200">
            {selected.length} {L("عنصر محدد", "selected")}
            {heldSelected.length > 0 && (
              <span className="ms-2 font-normal text-purple-600 dark:text-purple-300">
                · {heldSelected.length} {L("محجوزة ستُتخطى عند الإتلاف", "held will be skipped on disposal")}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected([])} disabled={bulkBusy}>
              {L("إلغاء التحديد", "Clear selection")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Clock className="h-3.5 w-3.5" />}
              onClick={() => void bulkExtend()}
              disabled={bulkBusy}
            >
              {L("تمديد سنة", "Extend 1 year")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setBulkDisposeOpen(true)}
              disabled={bulkBusy || disposables.length === 0}
            >
              {L("إتلاف المحدد", "Dispose selected")}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline strip */}
      {pendingItems.length > 0 && (
        <Card className="mb-4">
          <SectionTitle title={L("توزيع الاستحقاق", "Maturity distribution")} icon={<Activity className="h-4 w-4 text-navy-500" />} />
          <div className="space-y-2">
            {[
              { label: L("متأخرة", "Overdue"), n: pendingItems.filter((r) => r.daysLeft < 0).length, c: "bg-rose-500" },
              { label: L("مستحقة الآن", "Due now"), n: pendingItems.filter((r) => r.daysLeft === 0).length, c: "bg-rose-400" },
              {
                label: L("خلال أسبوع", "Within a week"),
                n: pendingItems.filter((r) => r.daysLeft > 0 && r.daysLeft <= 7).length,
                c: "bg-amber-500",
              },
              {
                label: L("خلال شهر", "Within a month"),
                n: pendingItems.filter((r) => r.daysLeft > 7 && r.daysLeft <= 30).length,
                c: "bg-teal-500",
              },
              { label: L("أكثر من شهر", "Over a month"), n: pendingItems.filter((r) => r.daysLeft > 30).length, c: "bg-emerald-500" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 text-xs font-semibold text-ink-500">{b.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className={cn("h-full rounded-full transition-all", b.c)}
                    style={{ width: `${pendingItems.length ? (b.n / pendingItems.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 text-end text-xs font-bold text-ink-700 dark:text-ink-200">{b.n}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              variant="success"
              title={L("لا توجد عناصر", "No items")}
              description={L(
                "لا توجد وثائق تقترب من نهاية الاحتفاظ ضمن هذه الفلاتر.",
                "No documents nearing retention end within these filters.",
              )}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setFUrg("all");
                    setFHold("all");
                  }}
                >
                  {L("مسح الفلاتر", "Clear filters")}
                </Button>
              }
            />
          </Card>
        }
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        columns={[
          {
            key: "doc",
            header: t("wf.doc"),
            sortValue: (r) => r.docTitle,
            render: (r) => (
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    r.daysLeft < 0
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15"
                      : r.daysLeft <= 7
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
                  )}
                >
                  <FileClock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy-700 dark:text-navy-200">{r.docTitle}</p>
                  <p className="truncate font-mono text-[11px] text-ink-400">{r.docNo}</p>
                </div>
              </div>
            ),
          },
          {
            key: "pol",
            header: L("السياسة", "Policy"),
            sortValue: (r) => r.policy,
            render: (r) => <span className="text-xs text-ink-500">{r.policy}</span>,
          },
          {
            key: "end",
            header: L("نهاية الاحتفاظ", "Retention end"),
            sortValue: (r) => r.retentionEnd,
            render: (r) => <span className="font-mono text-xs text-ink-500">{r.retentionEnd}</span>,
          },
          {
            key: "owner",
            header: t("g.owner"),
            sortValue: (r) => r.owner,
            render: (r) => <span className="text-xs text-ink-500">{r.owner}</span>,
          },
          {
            key: "hold",
            header: L("الحجز", "Hold"),
            sortValue: (r) => (r.onHold ? 1 : 0),
            render: (r) =>
              r.onHold ? (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                  <Lock className="h-3 w-3" /> {L("محجوزة", "Held")}
                </Badge>
              ) : (
                <span className="text-xs text-ink-300">—</span>
              ),
          },
          {
            key: "days",
            header: L("المتبقي", "Remaining"),
            sortValue: (r) => r.daysLeft,
            render: (r) => (
              <div className="min-w-28">
                <Badge className={cn("font-bold", urgencyCls(r.daysLeft))}>{urgencyLbl(r.daysLeft)}</Badge>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      r.daysLeft < 0
                        ? "bg-rose-500"
                        : r.daysLeft <= 7
                          ? "bg-amber-500"
                          : r.daysLeft <= 30
                            ? "bg-teal-500"
                            : "bg-emerald-500",
                    )}
                    style={{ width: `${urgencyPct(r.daysLeft)}%` }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: "act",
            header: L("الإجراء المقترح", "Proposed"),
            render: (r) => (
              <Badge className={actionCls(r.proposedAction)}>
                {actionIcon(r.proposedAction)} {lang === "en" ? r.proposedActionEn : r.proposedAction}
              </Badge>
            ),
          },
        ]}
        rowActions={(r) => (
          <RowMenu
            items={[
              {
                label: L("مراجعة", "Review"),
                icon: <Eye className="h-4 w-4" />,
                onClick: () =>
                  r.documentId
                    ? navigate(`/documents/${r.documentId}/preview`)
                    : toast({ type: "error", title: L("لا توجد وثيقة مرتبطة", "No linked document"), message: r.docTitle }),
              },
              {
                label: L("تمديد الاحتفاظ", "Extend retention"),
                icon: <Clock className="h-4 w-4" />,
                onClick: () => {
                  setExtendOpen(r);
                  setExtendYears("1");
                },
              },
              { label: L("وضع حجز قانوني", "Place legal hold"), icon: <Gavel className="h-4 w-4" />, onClick: () => void doHold(r) },
              { label: L("إتلاف", "Dispose"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDispose(r) },
            ]}
          />
        )}
      />

      {disposedItems.length > 0 && (
        <Card className="mt-4">
          <SectionTitle
            title={L(`سجل الإتلافات المنفّذة (${disposedItems.length})`, `Executed disposals (${disposedItems.length})`)}
            icon={<FileCheck2 className="h-4 w-4 text-rose-500" />}
            action={
              <span className="text-[11px] text-ink-400">
                {L(
                  "المحتوى محذوف من التخزين — الشهادة صادرة من سجل التدقيق",
                  "Content removed from storage — certificates come from the audit trail",
                )}
              </span>
            }
          />
          <DataTable
            rows={disposedItems}
            columns={[
              {
                key: "doc",
                header: t("wf.doc"),
                sortValue: (r) => r.docTitle,
                render: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-bold text-navy-700 dark:text-navy-200">{r.docTitle}</p>
                    <p className="truncate font-mono text-[11px] text-ink-400">{r.docNo}</p>
                  </div>
                ),
              },
              {
                key: "pol",
                header: L("السياسة", "Policy"),
                sortValue: (r) => r.policy,
                render: (r) => <span className="text-xs text-ink-500">{r.policy}</span>,
              },
              {
                key: "exec",
                header: L("تاريخ الإتلاف", "Disposed on"),
                sortValue: (r) => r.executedAt || r.retentionEnd,
                render: (r) => (
                  <span className="font-mono text-xs text-ink-500">
                    {r.executedAt ? new Date(r.executedAt).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA") : r.retentionEnd}
                  </span>
                ),
              },
              {
                key: "state",
                header: L("حالة الوثيقة", "Document"),
                render: () => (
                  <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    <Trash2 className="h-3 w-3" /> {L("متلفة", "Disposed")}
                  </Badge>
                ),
              },
            ]}
            rowActions={(r) => (
              <Button
                size="sm"
                variant="outline"
                icon={<FileCheck2 className="h-3.5 w-3.5" />}
                onClick={() => void openCertificate(r.id)}
                disabled={certLoading}
              >
                {L("شهادة الإتلاف", "Certificate")}
              </Button>
            )}
          />
        </Card>
      )}

      <ExtendRetentionModal
        item={extendOpen}
        years={extendYears}
        onYears={setExtendYears}
        onClose={() => setExtendOpen(null)}
        onExtend={() => void doExtend()}
        urgencyCls={urgencyCls}
        urgencyLbl={urgencyLbl}
      />
      <ConfirmDialog
        open={!!dispose}
        onClose={() => setDispose(null)}
        onConfirm={() => {
          if (!dispose) return;
          const target = dispose;
          void removeItem(target.id, { action: "DESTROY" }).then((ok) => {
            if (!ok) return;
            toast({ type: "success", title: L("نُفّذ إجراء الاحتفاظ", "Retention action recorded"), message: target.docTitle });
            void openCertificate(target.id);
          });
        }}
        title={L("تأكيد الإتلاف", "Confirm disposal")}
        danger
        message={L(
          `ستُزال إصدارات الوثيقة من الأرشيف ويُطلب حذف ملفاتها غير المشتركة. تأكد من عدم وجود حجز قانوني.`,
          `Document versions will be removed from the archive and deletion requested for their unshared files. Ensure no legal hold exists.`,
        )}
        confirmText={L("إتلاف نهائي", "Dispose permanently")}
      />
      <ConfirmDialog
        open={bulkDisposeOpen}
        onClose={() => setBulkDisposeOpen(false)}
        onConfirm={() => void bulkDispose()}
        title={L("تأكيد إتلاف المحدد", "Confirm bulk disposal")}
        danger
        message={
          heldSelected.length > 0
            ? L(
                `سيتم إتلاف ${disposables.length} وثيقة نهائياً. سيتم تخطي ${heldSelected.length} وثيقة محجوزة قانونياً.`,
                `${disposables.length} documents will be permanently disposed. ${heldSelected.length} documents on legal hold will be skipped.`,
              )
            : L(
                `سيتم إتلاف ${disposables.length} وثيقة من الأرشيف. لا يمكن التراجع عن إزالة سجلات الإصدارات.`,
                `${disposables.length} documents will be removed from the archive. Version record removal cannot be undone.`,
              )
        }
        confirmText={L("إتلاف نهائي", "Dispose permanently")}
      />
      <DestructionCertificateModal certificate={certificate} loading={certLoading} onClose={() => setCertificate(null)} />
    </div>
  );
}
