import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Move,
  Download,
  Archive,
  Trash2,
  List as ListIcon,
  LayoutGrid,
  Columns3,
  Eye,
  History,
  Check,
  X,
  ShieldCheck,
  Search,
  Pencil,
  RotateCcw,
  Lock,
  Info,
  AlertTriangle,
  FileText,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { BulkMoveModal } from "./documents-all-parts";
import { useApp } from "../store";
import {
  cn,
  Button,
  Card,
  Input,
  Select,
  Field,
  Badge,
  StatusBadge,
  ClassificationBadge,
  EmptyState,
  Checkbox,
  Tooltip,
  ConfirmDialog,
} from "../components/ui";
import { PageHeader, DataTable, RowMenu, Toolbar, Segmented, FileIcon, ExportMenu, downloadCsv, type Column } from "../components/shared";
import { deptName, STATUS_META, CATEGORIES } from "../data";
import { useDocsStore } from "../store-docs";
import type { Document } from "../types";

const STATUS_ICONS = {
  draft: FileText,
  pending: Clock3,
  approved: CheckCircle2,
  archived: Archive,
  hold: Lock,
} as const;

const STATUS_ACCENTS: Record<string, string> = {
  draft: "from-ink-400 to-ink-600 shadow-ink-500/30",
  pending: "from-amber-400 to-amber-600 shadow-amber-500/30",
  approved: "from-emerald-500 to-emerald-600 shadow-emerald-500/30",
  archived: "from-navy-500 to-navy-700 shadow-navy-600/30",
  hold: "from-purple-500 to-purple-700 shadow-purple-600/30",
};

const STATUS_GLOWS: Record<string, string> = {
  draft: "#94a3b8",
  pending: "#fbbf24",
  approved: "#34d399",
  archived: "#6366f1",
  hold: "#a78bfa",
};

export function AllDocuments() {
  const { t, lang, toast, user } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid" | "kanban">("list");
  const [showFilters, setShowFilters] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<string[]>(["ret"]);
  const [fDept, setFDept] = useState(() => searchParams.get("dept") ?? "all");
  const [fClass, setFClass] = useState("all");
  const [fCat, setFCat] = useState(() => searchParams.get("category") ?? "all");
  const [fType, setFType] = useState("all");
  const [fPeriod, setFPeriod] = useState("all");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ kind: "archive" | "delete"; ids: string[] } | null>(null);
  const {
    docs,
    docsMeta,
    docsLoadingMore,
    loadMoreDocuments,
    docsReady,
    scopedDocs,
    can,
    archiveDocs,
    deleteDocs,
    checkOut,
    checkIn,
    moveDocs,
    downloadDocument,
    folders: allFolders2,
    departments: deptStore,
  } = useDocsStore();
  const { role } = useApp();

  const allCats = CATEGORIES.filter((category) => scopedDocs.some((d) => d.categoryId === category.id));
  const allTypes = Array.from(new Set(scopedDocs.map((d) => d.fileType)));
  const typeLabel = (f: string) =>
    (({ pdf: "PDF", office: "Office", image: lang === "en" ? "Image" : "صورة", cad: "DWG", text: "TXT" }) as Record<string, string>)[f] ??
    f.toUpperCase();
  const cutoff = fPeriod === "week" ? 7 : fPeriod === "month" ? 30 : fPeriod === "quarter" ? 90 : 0;
  const cutoffStr = cutoff ? new Date(Date.now() - cutoff * 86400000).toISOString().slice(0, 10) : "";

  const filtered = scopedDocs.filter((d) => {
    if (status !== "all" && d.status !== status) return false;
    const ql = q.toLowerCase();
    if (
      q &&
      !(
        d.title.includes(q) ||
        d.titleEn.toLowerCase().includes(ql) ||
        d.docNo.includes(q) ||
        d.owner.includes(q) ||
        (d.content ?? "").toLowerCase().includes(ql)
      )
    )
      return false;
    if (fDept !== "all" && d.deptId !== fDept) return false;
    if (fClass !== "all" && d.classification !== fClass) return false;
    if (fCat !== "all" && d.categoryId !== fCat) return false;
    if (fType !== "all" && d.fileType !== fType) return false;
    if (cutoffStr && d.modifiedAt < cutoffStr) return false;
    return true;
  });
  const advCount = [fDept, fClass, fCat, fType, fPeriod].filter((x) => x !== "all").length;
  const clearAdv = () => {
    setFDept("all");
    setFClass("all");
    setFCat("all");
    setFType("all");
    setFPeriod("all");
  };

  const bulkMove = () => {
    if (!moveTarget) return;
    const count = selected.length;
    const tf = allFolders2.find((f) => f.id === moveTarget);
    moveDocs(selected, moveTarget, (ok) => {
      if (!ok) return;
      toast({
        type: "success",
        title: lang === "en" ? "Documents moved" : "تم نقل الوثائق",
        message: `${count} → ${tf ? (lang === "en" ? tf.nameEn : tf.name) : moveTarget}`,
      });
      setSelected([]);
      setMoveOpen(false);
      setMoveTarget("");
    });
  };
  const bulkArchive = () => {
    if (selected.length === 0) return;
    setConfirmAction({ kind: "archive", ids: selected });
  };
  const bulkDelete = () => {
    if (selected.length === 0) return;
    setConfirmAction({ kind: "delete", ids: selected });
  };
  const runConfirmedAction = () => {
    if (!confirmAction) return;
    const ids = confirmAction.ids;
    if (confirmAction.kind === "archive") {
      archiveDocs(ids, (ok) => {
        if (!ok) return;
        toast({
          type: "success",
          title: t("doc.archiveNow"),
          message: `${ids.length} ${lang === "en" ? "documents archived" : "وثيقة مؤرشفة"}`,
        });
        setSelected([]);
      });
      return;
    }
    deleteDocs(ids, (ok) => {
      if (!ok) return;
      toast({
        type: "error",
        title: lang === "en" ? "Moved to trash" : "نقل إلى السلة",
        message: `${ids.length} ${lang === "en" ? "documents" : "وثيقة"}`,
      });
      setSelected([]);
    });
  };
  const colDefs = [
    { key: "docNo", header: t("doc.docNo") },
    { key: "title", header: t("doc.title") },
    { key: "cat", header: t("g.category") },
    { key: "dept", header: t("g.department") },
    { key: "owner", header: t("g.owner") },
    { key: "ver", header: t("g.version") },
    { key: "class", header: t("doc.classification") },
    { key: "status", header: t("g.status") },
    { key: "ret", header: lang === "en" ? "Retention end" : "نهاية الاحتفاظ" },
    { key: "size", header: t("g.size") },
  ];
  const toggleCol = (k: string) => setHiddenCols((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const statusCounts = (["draft", "pending", "approved", "archived", "hold"] as const).map((s) => ({
    key: s,
    count: scopedDocs.filter((d) => d.status === s).length,
  }));

  const emptyState = (
    <Card>
      <EmptyState
        variant="search"
        title={lang === "en" ? "No matching documents" : "لا توجد وثائق مطابقة"}
        description={
          lang === "en"
            ? "No documents match your current search or filters. Try adjusting them, or upload a new document."
            : "لا توجد وثائق تطابق بحثك أو فلاترك الحالية. جرّب تعديلها، أو ارفع وثيقة جديدة."
        }
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQ("");
                setStatus("all");
              }}
            >
              {lang === "en" ? "Clear filters" : "مسح الفلاتر"}
            </Button>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/documents/new")}>
              {t("doc.newDoc")}
            </Button>
          </div>
        }
      />
    </Card>
  );

  if (!docsReady) {
    return (
      <div aria-busy="true">
        <PageHeader title={t("nav.documents")} breadcrumbs={[{ label: t("nav.documents") }]} />
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          ))}
        </div>
        <div className="mb-4 flex gap-2">
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
          ))}
        </div>
        <span className="sr-only">{lang === "en" ? "Loading documents…" : "جارٍ تحميل الوثائق…"}</span>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("nav.documents")}
        description={`${lang === "en" ? `${filtered.length} of ${docsMeta.total || docs.length} documents` : `${filtered.length} من ${docsMeta.total || docs.length} وثيقة`} — ${lang === "en" ? "central repository" : "المستودع المركزي"}`}
        breadcrumbs={[{ label: t("nav.documents") }]}
        actions={
          <>
            <ExportMenu
              rows={filtered.map((d) => ({
                docNo: d.docNo,
                title: lang === "en" ? d.titleEn : d.title,
                category: d.category,
                department: deptName(d.deptId, lang),
                owner: d.owner,
                version: d.version,
                status: d.status,
                size: d.size,
                created: d.createdAt,
                modified: d.modifiedAt,
              }))}
              filename="edas-documents"
            />
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/documents/new")}>
              {t("doc.newDoc")}
            </Button>
          </>
        }
      />

      {/* Status overview */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {statusCounts.map((s) => {
          const meta = STATUS_META[s.key];
          const Icon = STATUS_ICONS[s.key];
          const active = status === s.key;
          const total = scopedDocs.length;
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? "all" : s.key)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-4 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-950",
                active
                  ? "border-navy-400 bg-navy-50 dark:border-navy-500 dark:bg-navy-900/40"
                  : "border-ink-200/70 bg-white dark:border-ink-800 dark:bg-ink-900/80",
              )}
            >
              <div
                className="pointer-events-none absolute -end-10 -top-10 h-28 w-28 rounded-full opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
                style={{ background: STATUS_GLOWS[s.key] }}
              />
              <div className="relative flex items-start justify-between">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform group-hover:scale-105",
                    STATUS_ACCENTS[s.key],
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    active
                      ? "bg-navy-100 text-navy-700 dark:bg-navy-500/20 dark:text-navy-200"
                      : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  {pct}%
                </span>
              </div>
              <p className="relative mt-3 text-[26px] font-extrabold leading-tight tabular-nums text-ink-900 dark:text-white">{s.count}</p>
              <p className="relative mt-0.5 text-[13px] font-medium text-ink-500 dark:text-ink-400">{t(meta.key)}</p>
            </button>
          );
        })}
      </div>

      {(role === "employee" || role === "supervisor" || role === "dept_manager") && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-sm text-navy-700 dark:border-navy-800 dark:bg-navy-900/30 dark:text-navy-200">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            {lang === "en" ? "Scoped view — showing documents of your department" : "عرض مُقيّد بصلاحياتك — تُعرض وثائق قسمك"}{" "}
            <strong>{deptName(user?.department ?? "exec", lang)}</strong>{" "}
            {lang === "en" ? "and folders you have access to." : "والمجلدات المتاحة لك."}
          </span>
        </div>
      )}

      {docsMeta.total > docsMeta.loaded && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {lang === "en"
              ? `Loaded ${docsMeta.loaded} of ${docsMeta.total} documents.`
              : `تم تحميل ${docsMeta.loaded} من ${docsMeta.total} وثيقة.`}
          </span>
          <button
            type="button"
            onClick={() => void loadMoreDocuments()}
            disabled={docsLoadingMore}
            className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-400/40 dark:text-amber-100 dark:hover:bg-amber-500/20"
          >
            {docsLoadingMore ? (lang === "en" ? "Loading…" : "جارٍ التحميل…") : lang === "en" ? "Load more" : "تحميل المزيد"}
          </button>
        </div>
      )}

      <Toolbar>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label={t("g.clear")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            className="px-9"
            placeholder={lang === "en" ? "Search title, number, owner…" : "ابحث بالعنوان أو الرقم أو المالك…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("g.status")}>
          <option value="all">
            {t("g.all")} - {t("g.status")}
          </option>
          {statusCounts
            .filter((s) => s.count > 0)
            .map((s) => (
              <option key={s.key} value={s.key}>
                {t(STATUS_META[s.key].key)} ({s.count})
              </option>
            ))}
        </Select>
        <Button variant="outline" size="sm" icon={<Info className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)}>
          {lang === "en" ? "Advanced" : "متقدمة"}
        </Button>
        <div className="relative">
          <Button variant="outline" size="sm" icon={<Columns3 className="h-4 w-4" />} onClick={() => setColsOpen((o) => !o)}>
            {t("g.columns")}
          </Button>
          {colsOpen && (
            <>
              <div aria-hidden="true" className="fixed inset-0 z-20" onClick={() => setColsOpen(false)} />
              <div className="absolute end-0 z-30 mt-1 w-52 rounded-xl border border-ink-200/80 bg-white p-1.5 shadow-float animate-scale-in dark:border-ink-800 dark:bg-ink-900">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t("g.columns")}</p>
                  <button onClick={() => setHiddenCols([])} className="text-[10px] font-bold text-navy-600 hover:underline">
                    {lang === "en" ? "All" : "الكل"}
                  </button>
                </div>
                {colDefs.map((c) => (
                  <label
                    key={c.key}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-ink-50 dark:hover:bg-ink-800"
                  >
                    <Checkbox checked={!hiddenCols.includes(c.key)} onChange={() => toggleCol(c.key)} />
                    <span className="text-ink-700 dark:text-ink-200">{c.header}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "", icon: <ListIcon className="h-4 w-4" />, ariaLabel: lang === "en" ? "List view" : "عرض القائمة" },
            { value: "grid", label: "", icon: <LayoutGrid className="h-4 w-4" />, ariaLabel: lang === "en" ? "Grid view" : "عرض الشبكة" },
            { value: "kanban", label: "", icon: <Columns3 className="h-4 w-4" />, ariaLabel: lang === "en" ? "Board view" : "عرض اللوحة" },
          ]}
        />
      </Toolbar>

      {/* Active filter chips */}
      {(q || status !== "all") && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-400">{lang === "en" ? "Active:" : "نشط:"}</span>
          {q && (
            <span className="flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 dark:border-navy-800 dark:bg-navy-900/40 dark:text-navy-200">
              🔍 {q}
              <button onClick={() => setQ("")} aria-label={t("g.clear")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {status !== "all" && (
            <span className="flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 dark:border-navy-800 dark:bg-navy-900/40 dark:text-navy-200">
              {t(STATUS_META[status as keyof typeof STATUS_META]?.key ?? status)}
              <button onClick={() => setStatus("all")} aria-label={t("g.clear")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
            className="text-xs font-bold text-rose-500 hover:underline"
          >
            {lang === "en" ? "Clear all" : "مسح الكل"}
          </button>
        </div>
      )}

      {showFilters && (
        <Card className="mb-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Field label={t("g.department")}>
              <Select value={fDept} onChange={(e) => setFDept(e.target.value)}>
                <option value="all">{t("g.all")}</option>
                {deptStore.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {lang === "en" ? (d.nameEn ?? d.name) : d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("doc.classification")}>
              <Select value={fClass} onChange={(e) => setFClass(e.target.value)}>
                <option value="all">{t("g.all")}</option>
                {(["public", "internal", "confidential", "restricted"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`doc.classification.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("g.category")}>
              <Select value={fCat} onChange={(e) => setFCat(e.target.value)}>
                <option value="all">{t("g.all")}</option>
                {allCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === "en" ? c.nameEn : c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={lang === "en" ? "File type" : "نوع الملف"}>
              <Select value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="all">{t("g.all")}</option>
                {allTypes.map((f) => (
                  <option key={f} value={f}>
                    {typeLabel(f)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={lang === "en" ? "Period" : "الفترة"}>
              <Select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
                <option value="all">{lang === "en" ? "All time" : "كل الأوقات"}</option>
                <option value="week">{lang === "en" ? "Last 7 days" : "آخر 7 أيام"}</option>
                <option value="month">{lang === "en" ? "Last 30 days" : "آخر 30 يوم"}</option>
                <option value="quarter">{lang === "en" ? "Last 90 days" : "آخر 90 يوم"}</option>
              </Select>
            </Field>
          </div>
          {advCount > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                {advCount} {lang === "en" ? "advanced filters" : "فلتر متقدم"}
              </Badge>
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={clearAdv}>
                {lang === "en" ? "Clear advanced" : "مسح المتقدمة"}
              </Button>
            </div>
          )}
        </Card>
      )}

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-navy-300 bg-gradient-to-l from-navy-600 to-navy-700 px-4 py-2.5 text-white shadow-card">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{selected.length}</span>
          <span className="text-sm font-semibold">{t("common.selected")}</span>
          <div className="ms-auto flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                downloadCsv(
                  "edas-documents-selection",
                  scopedDocs
                    .filter((d) => selected.includes(d.id))
                    .map((d) => ({
                      docNo: d.docNo,
                      title: lang === "en" ? d.titleEn : d.title,
                      category: d.category,
                      department: deptName(d.deptId, lang),
                      owner: d.owner,
                      version: d.version,
                      status: d.status,
                      size: d.size,
                      created: d.createdAt,
                      modified: d.modifiedAt,
                    })),
                );
                toast({ type: "success", title: t("g.export") });
              }}
            >
              {t("g.export")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              icon={<Archive className="h-4 w-4" />}
              onClick={bulkArchive}
            >
              {t("doc.archiveNow")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              icon={<Move className="h-4 w-4" />}
              onClick={() => {
                setMoveTarget("");
                setMoveOpen(true);
              }}
            >
              {t("common.move")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-rose-500/40"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={bulkDelete}
            >
              {t("g.delete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:bg-white/10"
              icon={<X className="h-4 w-4" />}
              onClick={() => setSelected([])}
            />
          </div>
        </div>
      )}

      {view === "list" && (
        <DataTable<Document>
          rows={filtered}
          empty={emptyState}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          onRowClick={(d) => navigate(`/documents/${d.id}`)}
          columns={(
            [
              {
                key: "docNo",
                header: t("doc.docNo"),
                sortValue: (d: Document) => d.docNo,
                render: (d: Document) => <span className="font-mono text-xs text-ink-500">{d.docNo}</span>,
              },
              {
                key: "title",
                header: t("doc.title"),
                sortValue: (d: Document) => (lang === "en" ? d.titleEn : d.title),
                render: (d) => (
                  <div className="flex items-center gap-2.5">
                    <FileIcon type={d.fileType} size="sm" />
                    <span className="flex items-center gap-1.5 font-medium text-navy-700 dark:text-navy-200">
                      {lang === "en" ? d.titleEn : d.title}
                      {d.checkedOutBy && (
                        <Tooltip label={`${lang === "en" ? "Checked out by" : "محجوزة بواسطة"} ${d.checkedOutBy}`}>
                          <Lock className="h-3.5 w-3.5 text-amber-500" />
                        </Tooltip>
                      )}
                    </span>
                  </div>
                ),
              },
              {
                key: "cat",
                header: t("g.category"),
                sortValue: (d: Document) => (lang === "en" ? d.categoryEn : d.category),
                render: (d) => <span className="text-ink-500">{lang === "en" ? d.categoryEn : d.category}</span>,
              },
              {
                key: "dept",
                header: t("g.department"),
                sortValue: (d: Document) => deptName(d.deptId, lang),
                render: (d) => <span className="text-ink-500">{deptName(d.deptId, lang)}</span>,
              },
              {
                key: "owner",
                header: t("g.owner"),
                sortValue: (d: Document) => d.owner,
                render: (d) => <span className="text-ink-500">{d.owner}</span>,
              },
              {
                key: "ver",
                header: t("g.version"),
                sortValue: (d: Document) => d.version,
                render: (d) => <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">{d.version}</Badge>,
              },
              {
                key: "class",
                header: t("doc.classification"),
                sortValue: (d: Document) => d.classification,
                render: (d) => <ClassificationBadge level={d.classification} />,
              },
              {
                key: "status",
                header: t("g.status"),
                sortValue: (d: Document) => d.status,
                render: (d) => <StatusBadge status={d.status} />,
              },
              {
                key: "ret",
                header: lang === "en" ? "Retention end" : "نهاية الاحتفاظ",
                sortValue: (d: Document) => d.retentionDays,
                render: (d: Document) => (
                  <Tooltip label={lang === "en" ? `${d.retentionDays} days remaining` : `${d.retentionDays} يوم متبقٍ`}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        d.retentionDays < 0
                          ? "font-bold text-rose-500"
                          : d.retentionDays < 30
                            ? "font-semibold text-amber-600"
                            : "text-ink-400",
                      )}
                    >
                      {d.retentionEnd}
                      {d.retentionDays < 30 && <AlertTriangle className="h-3 w-3" />}
                    </span>
                  </Tooltip>
                ),
              },
              {
                key: "size",
                header: t("g.size"),
                sortValue: (d: Document) => d.size,
                render: (d: Document) => <span className="font-mono text-xs text-ink-400">{d.size}</span>,
              },
            ] as Column<Document>[]
          ).filter((c) => !hiddenCols.includes(c.key))}
          rowActions={(d) => (
            <RowMenu
              items={[
                { label: t("g.preview"), icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/documents/${d.id}/preview`) },
                { label: t("doc.versions"), icon: <History className="h-4 w-4" />, onClick: () => navigate(`/documents/${d.id}/versions`) },
                {
                  label: d.checkedOutBy
                    ? lang === "en"
                      ? "Check-in (release)"
                      : "إعادة (تحرير)"
                    : lang === "en"
                      ? "Check-out (lock)"
                      : "حجز للتحرير",
                  icon: d.checkedOutBy ? <RotateCcw className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                  onClick: () => {
                    if (d.checkedOutBy) {
                      checkIn(d.id, (ok) => {
                        if (ok)
                          toast({ type: "success", title: lang === "en" ? "Document released" : "تم تحرير الوثيقة", message: d.title });
                      });
                    } else {
                      checkOut(d.id, user?.name ?? "", (ok) => {
                        if (ok)
                          toast({
                            type: "info",
                            title: lang === "en" ? "Document locked for editing" : "تم حجز الوثيقة للتحرير",
                            message: `${d.title} — ${user?.name}`,
                          });
                      });
                    }
                  },
                },
                ...(can("edit", d.folderId, d.deptId)
                  ? [{ label: t("g.edit"), icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/documents/${d.id}/edit`) }]
                  : []),
                ...(can("delete", d.folderId, d.deptId)
                  ? [
                      {
                        label: t("g.delete"),
                        icon: <Trash2 className="h-4 w-4" />,
                        danger: true,
                        onClick: () => setConfirmAction({ kind: "delete", ids: [d.id] }),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        />
      )}

      {view === "grid" &&
        (filtered.length === 0 ? (
          emptyState
        ) : (
          <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((d) => (
              <Card
                key={d.id}
                pad={false}
                className="group flex cursor-pointer flex-col overflow-hidden transition-all hover:-translate-y-1 hover:border-navy-300 hover:shadow-card"
                onClick={() => navigate(`/documents/${d.id}`)}
              >
                <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-ink-50 via-ink-100 to-ink-50 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
                  <FileIcon type={d.fileType} size="lg" />
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-ink-950/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 bg-white/90 text-ink-800 hover:bg-white"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/documents/${d.id}/preview`);
                      }}
                    >
                      {lang === "en" ? "View" : "عرض"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 bg-white/90 text-ink-800 hover:bg-white"
                      icon={<Download className="h-3.5 w-3.5" />}
                      aria-label={t("g.download")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void downloadDocument(d.id);
                      }}
                    />
                  </div>
                  {d.checkedOutBy && (
                    <span className="absolute top-2 end-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      <Lock className="inline h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink-700 dark:text-ink-200">
                    {lang === "en" ? d.titleEn : d.title}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-ink-400">{d.docNo}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <StatusBadge status={d.status} />
                    <span className="text-[10px] text-ink-400">{d.size}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {/* Kanban board view */}
      {view === "kanban" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(["draft", "pending", "approved", "archived", "hold"] as const).map((st) => {
            const meta = STATUS_META[st];
            const col = filtered.filter((d) => d.status === st);
            return (
              <div
                key={st}
                className="flex min-h-48 flex-col rounded-2xl border border-ink-200/70 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-950/30"
              >
                <div className="flex items-center justify-between border-b border-ink-200/70 px-3 py-2.5 dark:border-ink-800">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    {t(meta.key)}
                  </span>
                  <Badge className="bg-white text-ink-500 dark:bg-ink-900">{col.length}</Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "32rem" }}>
                  {col.length === 0 && <p className="py-8 text-center text-[11px] text-ink-400">{lang === "en" ? "Empty" : "فارغ"}</p>}
                  {col.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900"
                    >
                      <div className="flex items-start gap-2">
                        <FileIcon type={d.fileType} size="sm" />
                        <p className="line-clamp-2 flex-1 text-[11px] font-bold leading-snug text-ink-700 dark:text-ink-200">
                          {lang === "en" ? d.titleEn : d.title}
                        </p>
                        {d.checkedOutBy && <Lock className="h-3 w-3 shrink-0 text-amber-500" />}
                      </div>
                      <p className="mt-1.5 truncate text-[9px] text-ink-400">
                        {d.docNo} · {d.owner}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <ClassificationBadge level={d.classification} />
                        <span className="shrink-0 text-[9px] text-ink-400">{d.size}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BulkMoveModal
        open={moveOpen}
        count={selected.length}
        folders={allFolders2}
        target={moveTarget}
        onTarget={setMoveTarget}
        onClose={() => setMoveOpen(false)}
        onMove={bulkMove}
      />
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
        danger={confirmAction?.kind === "delete"}
        title={
          confirmAction?.kind === "archive"
            ? lang === "en"
              ? "Archive selected documents?"
              : "أرشفة الوثائق المحددة؟"
            : lang === "en"
              ? "Move selected documents to trash?"
              : "نقل الوثائق المحددة إلى السلة؟"
        }
        message={
          lang === "en"
            ? `${confirmAction?.ids.length ?? 0} document(s) will be ${confirmAction?.kind === "archive" ? "archived" : "moved to trash"}.`
            : `سيتم ${confirmAction?.kind === "archive" ? "أرشفة" : "نقل"} ${confirmAction?.ids.length ?? 0} وثيقة.`
        }
        confirmText={confirmAction?.kind === "archive" ? t("doc.archiveNow") : t("g.delete")}
      />
    </div>
  );
}
