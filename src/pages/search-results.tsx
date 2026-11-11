import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search as SearchIcon,
  SlidersHorizontal,
  Eye,
  Download,
  X,
  List as ListIcon,
  LayoutGrid,
  Pencil,
  Check,
  Filter,
  RefreshCw,
  Loader2,
  BookmarkPlus,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Select, Badge, StatusBadge, ClassificationBadge, EmptyState, Tooltip } from "../components/ui";
import { PageHeader, FileIcon, ExportMenu, SectionTitle } from "../components/shared";
import { deptName, STATUS_META } from "../data";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { docsApi } from "../lib/docs-api";
import { mapDocument } from "../lib/api-mappers";
import { loadAllPages } from "../lib/pagination";
import {
  CLASSIFICATION_VALUES,
  FILE_TYPE_VALUES,
  STATUS_VALUES,
  activeConditions,
  filterDocuments,
  hasFacets,
  parseConditions,
  parseFacets,
  summarizeConditions,
  type SearchCondition,
  type SearchFacets,
} from "../lib/search-query";
import type { Document, FileType } from "../types";

type SortKey = "relevance" | "recent" | "title";

interface SearchRouteState {
  advancedQuery?: string;
  advancedConditions?: unknown;
  advancedFacets?: unknown;
}

interface FacetOption {
  id: string;
  label: string;
  count: number;
}

const TYPE_LABELS: Record<string, [string, string]> = {
  pdf: ["PDF", "PDF"],
  office: ["Office", "Office"],
  image: ["صورة", "Image"],
  cad: ["DWG", "DWG"],
  text: ["TXT", "TXT"],
};

export function SearchResults() {
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as SearchRouteState | null;
  const queryParam = new URLSearchParams(location.search).get("q") ?? "";
  const [conditions, setConditions] = useState<SearchCondition[]>(() => parseConditions(routeState?.advancedConditions));
  const [q, setQ] = useState(() => queryParam || routeState?.advancedQuery || "");
  const [view, setView] = useState<"list" | "grid">("list");
  const [fDept, setFDept] = useState<string[]>(() => parseFacets(routeState?.advancedFacets).dept);
  const [fType, setFType] = useState<string[]>(() => parseFacets(routeState?.advancedFacets).type);
  const [fStatus, setFStatus] = useState<string[]>(() => parseFacets(routeState?.advancedFacets).status);
  const [fClass, setFClass] = useState<string[]>(() => parseFacets(routeState?.advancedFacets).class);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [remoteDocs, setRemoteDocs] = useState<Document[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteTruncated, setRemoteTruncated] = useState(false);
  const [remoteMs, setRemoteMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { scopedDocs, docsMeta, docsReady, downloadDocument, departments: deptStore } = useDocsStore();
  const departmentOptions = deptStore.items;

  useEffect(() => {
    const next = parseConditions(routeState?.advancedConditions);
    const facets = parseFacets(routeState?.advancedFacets);
    setConditions(next);
    setQ(queryParam || routeState?.advancedQuery || "");
    setFDept(facets.dept);
    setFType(facets.type);
    setFStatus(facets.status);
    setFClass(facets.class);
  }, [location.key, routeState, queryParam]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const term = q.trim();
  const hasConditions = activeConditions(conditions).length > 0;
  const serverTerm = config.useApi && !hasConditions ? term : "";
  const scopeLoaded = config.useApi ? docsMeta.loaded : scopedDocs.length;
  const scopeTotal = config.useApi ? docsMeta.total : scopedDocs.length;
  const repositoryEmpty = docsReady && (config.useApi ? docsMeta.total : scopedDocs.length) === 0;

  useEffect(() => {
    if (!serverTerm) {
      setRemoteDocs(null);
      setRemoteTotal(0);
      setRemoteTruncated(false);
      setRemoteMs(0);
      setLoading(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setRemoteDocs(null);
    setRemoteTotal(0);
    setRemoteTruncated(false);
    const timer = window.setTimeout(() => {
      const started = performance.now();
      loadAllPages((page) => docsApi.listDocuments({ ...page, q: serverTerm }), { maxPages: 5 })
        .then((page) => {
          if (cancelled) return;
          setRemoteDocs(page.items.map(mapDocument));
          setRemoteTotal(page.total);
          setRemoteTruncated(page.truncated);
          setRemoteMs(performance.now() - started);
        })
        .catch(() => {
          if (cancelled) return;
          setRemoteDocs([]);
          setRemoteTotal(0);
          setRemoteTruncated(false);
          setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [serverTerm, reloadToken]);

  const candidates = useMemo(() => {
    if (serverTerm) return remoteDocs ?? [];
    return scopedDocs;
  }, [serverTerm, remoteDocs, scopedDocs]);

  const base = useMemo(() => {
    const started = performance.now();
    const docs = filterDocuments(candidates, { term: serverTerm ? "" : term, conditions }, lang);
    return { docs, ms: performance.now() - started };
  }, [candidates, serverTerm, term, conditions, lang]);

  const filtered = useMemo(() => {
    let docs = base.docs;
    if (fDept.length) docs = docs.filter((doc) => fDept.includes(doc.deptId));
    if (fType.length) docs = docs.filter((doc) => fType.includes(doc.fileType));
    if (fStatus.length) docs = docs.filter((doc) => fStatus.includes(doc.status));
    if (fClass.length) docs = docs.filter((doc) => fClass.includes(doc.classification));
    return docs;
  }, [base, fDept, fType, fStatus, fClass]);

  const results = useMemo(() => {
    if (sort === "recent") return [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    if (sort === "title") {
      return [...filtered].sort((a, b) =>
        (lang === "en" ? a.titleEn || a.title : a.title).localeCompare(lang === "en" ? b.titleEn || b.title : b.title),
      );
    }
    return filtered;
  }, [filtered, sort, lang]);

  const filterCount = fDept.length + fType.length + fStatus.length + fClass.length;
  const scopeLoading = config.useApi && !docsReady;
  const elapsedMs = serverTerm ? remoteMs : base.ms;
  const elapsed = elapsedMs < 1 ? "<1" : elapsedMs < 100 ? elapsedMs.toFixed(1) : Math.round(elapsedMs).toString();
  const advancedSummary = useMemo(() => summarizeConditions(conditions, lang), [conditions, lang]);
  const currentFacets: SearchFacets = { dept: fDept, type: fType, status: fStatus, class: fClass };
  const hasCurrentSearch = Boolean(term) || hasConditions || hasFacets(currentFacets);
  const noResults = results.length === 0;

  const clearAllFilters = () => {
    setFDept([]);
    setFType([]);
    setFStatus([]);
    setFClass([]);
  };
  const saveThisSearch = () => {
    navigate("/search/saved", {
      state: {
        ...(term ? { prefillQuery: term } : {}),
        ...(hasConditions ? { prefillConditions: activeConditions(conditions) } : {}),
        ...(hasFacets(currentFacets) ? { prefillFacets: currentFacets } : {}),
      },
    });
  };
  const toggleIn = (arr: string[], set: (value: string[]) => void, value: string) =>
    set(arr.includes(value) ? arr.filter((item) => item !== value) : [...arr, value]);

  const departmentFacets: FacetOption[] = departmentOptions
    .map((dept) => ({
      id: dept.id,
      label: lang === "en" ? dept.nameEn : dept.name,
      count: base.docs.filter((doc) => doc.deptId === dept.id).length,
    }))
    .filter((option) => option.count > 0 || fDept.includes(option.id));
  const statusFacets: FacetOption[] = STATUS_VALUES.filter(
    (status) => fStatus.includes(status) || base.docs.some((doc) => doc.status === status),
  ).map((status) => ({
    id: status,
    label: t(STATUS_META[status].key),
    count: base.docs.filter((doc) => doc.status === status).length,
  }));
  const typeFacets: FacetOption[] = FILE_TYPE_VALUES.filter(
    (type) => fType.includes(type) || base.docs.some((doc) => doc.fileType === type),
  ).map((type) => ({
    id: type,
    label: typeLabel(type, lang),
    count: base.docs.filter((doc) => doc.fileType === type).length,
  }));
  const classFacets: FacetOption[] = CLASSIFICATION_VALUES.map((level) => ({
    id: level,
    label: t(`doc.classification.${level}`),
    count: base.docs.filter((doc) => doc.classification === level).length,
  }));

  return (
    <div>
      <PageHeader
        title={t("nav.search")}
        description={lang === "en" ? "Full-text search across all documents you can access" : "بحث نصي كامل في كل الوثائق المتاحة لك"}
        breadcrumbs={[{ label: t("nav.search") }]}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              icon={<BookmarkPlus className="h-4 w-4" />}
              onClick={saveThisSearch}
              disabled={!hasCurrentSearch}
            >
              {lang === "en" ? "Save this search" : "حفظ هذا البحث"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() =>
                navigate("/search/advanced", {
                  state: {
                    ...(term ? { prefillQuery: term } : {}),
                    ...(hasConditions ? { prefillConditions: activeConditions(conditions) } : {}),
                  },
                })
              }
            >
              {t("nav.advancedSearch")}
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-l from-navy-500/10 to-teal-500/10 opacity-0 transition-opacity focus-within:opacity-100" />
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "en" ? "Search titles, numbers, owners, and content…" : "ابحث في العناوين والأرقام والمالكين والمحتوى…"}
            aria-label={t("nav.search")}
            className="relative h-14 w-full rounded-2xl border-2 border-ink-200 bg-white ps-12 pe-28 text-base shadow-soft transition-all focus:border-navy-400 focus:outline-none focus:ring-4 focus:ring-navy-500/10 dark:border-ink-700 dark:bg-ink-900"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={lang === "en" ? "Clear search" : "مسح البحث"}
              className="absolute end-24 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="absolute end-4 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-bold text-ink-400 dark:border-ink-700 dark:bg-ink-800 lg:flex">
            Ctrl K
          </kbd>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-ink-400">{lang === "en" ? "Try:" : "جرّب:"}</span>
          {[
            lang === "en" ? "contracts" : "عقود",
            lang === "en" ? "financial" : "مالية",
            lang === "en" ? "engineering" : "هندسة",
            lang === "en" ? "policy" : "سياسة",
          ].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="rounded-full border border-navy-200/70 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-navy-800 dark:bg-ink-900 dark:text-navy-200"
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-ink-400">
          {scopeLoading
            ? t("search.loadingScope")
            : serverTerm
              ? t("search.scope.server", { term })
              : scopeTotal > scopeLoaded
                ? t("search.scope.partial", { loaded: scopeLoaded, total: scopeTotal })
                : t("search.scope.all", { count: scopeLoaded })}
        </p>
      </div>

      {hasConditions && (
        <Card className="mb-3 border-navy-200 bg-navy-50/60 dark:border-navy-800 dark:bg-navy-900/20">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-navy-500" />
            <span className="text-xs font-bold text-navy-700 dark:text-navy-200">{t("search.advancedActive")}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-500 dark:text-ink-400">{advancedSummary}</span>
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setConditions([])} className="shrink-0">
              {t("search.clearAdvanced")}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex gap-4">
        <div className="hidden w-64 shrink-0 space-y-3 lg:block">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle
                title={lang === "en" ? "Filters" : "تصفية النتائج"}
                icon={<SlidersHorizontal className="h-4 w-4 text-navy-500" />}
              />
              {filterCount > 0 && <Badge className="bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-300">{filterCount}</Badge>}
            </div>
            <div className="space-y-4">
              <FilterGroup
                title={t("g.department")}
                lang={lang}
                options={departmentFacets}
                selected={fDept}
                onToggle={(id) => toggleIn(fDept, setFDept, id)}
                onClear={() => setFDept([])}
              />
              <FilterGroup
                title={lang === "en" ? "File type" : "نوع الملف"}
                lang={lang}
                options={typeFacets}
                selected={fType}
                onToggle={(id) => toggleIn(fType, setFType, id)}
                onClear={() => setFType([])}
              />
              <FilterGroup
                title={t("g.status")}
                lang={lang}
                options={statusFacets}
                selected={fStatus}
                onToggle={(id) => toggleIn(fStatus, setFStatus, id)}
                onClear={() => setFStatus([])}
              />
              <FilterGroup
                title={lang === "en" ? "Classification" : "السرية"}
                lang={lang}
                options={classFacets}
                selected={fClass}
                onToggle={(id) => toggleIn(fClass, setFClass, id)}
                onClear={() => setFClass([])}
              />
            </div>
            {filterCount > 0 && (
              <Button size="sm" variant="ghost" className="mt-3 w-full" icon={<X className="h-3.5 w-3.5" />} onClick={clearAllFilters}>
                {lang === "en" ? "Clear all filters" : "مسح كل الفلاتر"}
              </Button>
            )}
          </Card>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
            <div className="flex flex-wrap items-center gap-2">
              {loading || scopeLoading ? (
                <span className="text-sm font-medium text-ink-500">{t("search.searching")}</span>
              ) : noResults && !failed ? (
                <span className="text-sm font-medium text-ink-500">{lang === "en" ? "No results" : "لا نتائج"}</span>
              ) : (
                <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  <strong className="text-navy-600 dark:text-navy-300">{results.length}</strong>{" "}
                  {lang === "en" ? (results.length === 1 ? "result" : "results") : "نتيجة"}
                  {base.docs.length > results.length && (
                    <span className="ms-1 text-xs font-normal text-ink-400">{t("search.ofTotal", { total: base.docs.length })}</span>
                  )}{" "}
                  <span className="font-mono text-xs text-ink-400">{elapsed}ms</span>
                </span>
              )}
              {filterCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {filterCount} {lang === "en" ? "filters" : "فلتر"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Select
                className="h-8 w-36 text-xs"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label={lang === "en" ? "Sort results" : "ترتيب النتائج"}
              >
                <option value="relevance">{lang === "en" ? "Sort: Relevance" : "ترتيب: الصلة"}</option>
                <option value="recent">{lang === "en" ? "Sort: Recent" : "ترتيب: الأحدث"}</option>
                <option value="title">{lang === "en" ? "Sort: Title" : "ترتيب: العنوان"}</option>
              </Select>
              <SegmentedLite value={view} onChange={setView} lang={lang} />
              <ExportMenu
                rows={results.map((d) => ({
                  docNo: d.docNo,
                  title: lang === "en" ? d.titleEn || d.title : d.title,
                  category: d.category,
                  department: deptName(d.deptId, lang),
                  owner: lang === "en" ? d.ownerEn || d.owner : d.owner,
                  status: d.status,
                  size: d.size,
                }))}
                filename="edas-search-results"
              />
            </div>
          </div>

          {failed && (
            <Card className="mb-3 border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{t("search.error")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => setReloadToken((value) => value + 1)}
                >
                  {t("err.retry")}
                </Button>
              </div>
            </Card>
          )}

          {remoteTruncated && !loading && !failed && (
            <Card className="mb-3 border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {t("search.truncated", { shown: remoteDocs?.length ?? 0, total: remoteTotal })}
              </p>
            </Card>
          )}

          {noResults ? (
            <Card>
              {loading || scopeLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm font-medium text-ink-500 dark:text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("search.searching")}
                </div>
              ) : repositoryEmpty && !term && !hasConditions && filterCount === 0 ? (
                <EmptyState
                  variant="folder"
                  title={t("search.emptyRepo.title")}
                  description={t("search.emptyRepo.desc")}
                  action={
                    <Button size="sm" onClick={() => navigate("/documents/new")}>
                      {t("search.emptyRepo.action")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  variant="search"
                  title={lang === "en" ? "No matching documents" : "لا توجد نتائج مطابقة"}
                  description={
                    lang === "en"
                      ? "No documents match your search or filters. Try a different keyword, remove some filters, or request access."
                      : "لا توجد وثائق تطابق بحثك أو فلاترك. جرّب كلمة مختلفة، أو أزل بعض الفلاتر، أو اطلب صلاحية وصول."
                  }
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQ("");
                          setConditions([]);
                          clearAllFilters();
                        }}
                      >
                        {lang === "en" ? "Clear everything" : "مسح الكل"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast({
                            type: "info",
                            title: lang === "en" ? "Access request" : "طلب صلاحية وصول",
                            message:
                              lang === "en"
                                ? "Self-service access requests are not enabled; contact the document owner or your department manager."
                                : "طلبات الصلاحية الذاتية غير مفعّلة؛ تواصل مع مالك الوثيقة أو مدير إدارتك.",
                          })
                        }
                      >
                        {lang === "en" ? "Request access" : "طلب صلاحية وصول"}
                      </Button>
                    </div>
                  }
                />
              )}
            </Card>
          ) : view === "list" ? (
            <div className="space-y-2.5">
              {results.map((d, i) => (
                <Card key={d.id} className="group hover:border-navy-300 hover:shadow-card">
                  <div className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-400 dark:bg-ink-800">
                      {i + 1}
                    </span>
                    <FileIcon type={d.fileType} />
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => navigate(`/documents/${d.id}`)} className="block w-full text-start">
                        <p
                          className="truncate text-[15px] font-bold text-navy-700 group-hover:underline dark:text-navy-200"
                          dangerouslySetInnerHTML={{ __html: highlight(displayTitle(d, lang), term) }}
                        />
                      </button>
                      <p className="mt-0.5 truncate text-xs text-ink-400">
                        <span className="font-mono">{d.docNo}</span> · {deptName(d.deptId, lang)} ·{" "}
                        {lang === "en" ? d.ownerEn || d.owner : d.owner} · {d.modifiedAt}
                      </p>
                      {snippet(d, term) && (
                        <p
                          className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400"
                          dangerouslySetInnerHTML={{ __html: `…${snippet(d, term)}…` }}
                        />
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={d.status} />
                        <ClassificationBadge level={d.classification} />
                        <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">v{d.version}</Badge>
                        <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{d.size}</Badge>
                        {d.signatureStatus === "signed" && (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            ✍︎ {d.signedBy}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <Tooltip label={t("g.preview")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/documents/${d.id}/preview`)}
                          aria-label={t("g.preview")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip label={t("g.download")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void downloadDocument(d.id)}
                          aria-label={t("g.download")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip label={t("g.edit")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/documents/${d.id}/edit`)}
                          aria-label={t("g.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {results.map((d) => (
                <Card
                  key={d.id}
                  pad={false}
                  className="group flex cursor-pointer flex-col overflow-hidden transition-all hover:-translate-y-1 hover:border-navy-300 hover:shadow-card"
                  onClick={() => navigate(`/documents/${d.id}`)}
                >
                  <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-ink-50 via-ink-100 to-ink-50 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
                    <FileIcon type={d.fileType} size="lg" />
                    <span className="absolute bottom-1.5 end-1.5 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                      {typeLabel(d.fileType, lang)}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p
                      className="line-clamp-2 text-[13px] font-bold leading-snug text-ink-700 dark:text-ink-200"
                      dangerouslySetInnerHTML={{ __html: highlight(displayTitle(d, lang), term) }}
                    />
                    <p className="mt-1 truncate text-[10px] text-ink-400">
                      {d.docNo} · {lang === "en" ? d.ownerEn || d.owner : d.owner}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-1 pt-2">
                      <StatusBadge status={d.status} />
                      <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{d.size}</Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  lang,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  lang: "ar" | "en";
  options: FacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">{title}</p>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="text-[10px] font-bold text-navy-500 hover:underline">
            {lang === "en" ? "Clear" : "مسح"}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {options.map((option) => {
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors",
                on
                  ? "bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                  : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  on
                    ? "border-navy-600 bg-navy-600 text-white dark:border-navy-400 dark:bg-navy-500"
                    : "border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-900",
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="flex-1 truncate">{option.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  on ? "bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-300" : "text-ink-400",
                )}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SegmentedLite({ value, onChange, lang }: { value: "list" | "grid"; onChange: (v: "list" | "grid") => void; lang: "ar" | "en" }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 dark:border-ink-700 dark:bg-ink-900">
      {[
        { v: "list" as const, icon: ListIcon, label: lang === "en" ? "List view" : "عرض قائمة" },
        { v: "grid" as const, icon: LayoutGrid, label: lang === "en" ? "Grid view" : "عرض شبكة" },
      ].map((option) => (
        <button
          key={option.v}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.v}
          onClick={() => onChange(option.v)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md",
            value === option.v ? "bg-white text-navy-700 shadow-sm dark:bg-ink-800 dark:text-navy-200" : "text-ink-400",
          )}
        >
          <option.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function displayTitle(doc: Document, lang: "ar" | "en"): string {
  return lang === "en" ? doc.titleEn || doc.title : doc.title || doc.titleEn;
}

function typeLabel(type: FileType | string, lang: "ar" | "en"): string {
  const labels = TYPE_LABELS[type];
  if (labels) return labels[lang === "en" ? 1 : 0];
  return type.toUpperCase();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function highlight(text: string, term: string): string {
  if (!term) return escapeHtml(text);
  const needle = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapeHtml(text).replace(
    new RegExp(needle, "gi"),
    (match) => `<mark class="rounded bg-amber-200 px-0.5 text-ink-900 dark:bg-amber-500/60 dark:text-white">${match}</mark>`,
  );
}

function snippet(doc: Document, term: string): string | null {
  const content = doc.content ?? "";
  const index = content.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1 || !term) return null;
  const start = Math.max(0, index - 34);
  const end = Math.min(content.length, index + term.length + 64);
  return (
    escapeHtml(content.slice(start, index)) +
    `<mark class="rounded bg-amber-200 px-0.5 text-ink-900 dark:bg-amber-500/60 dark:text-white">${escapeHtml(
      content.slice(index, index + term.length),
    )}</mark>` +
    escapeHtml(content.slice(index + term.length, end))
  );
}
