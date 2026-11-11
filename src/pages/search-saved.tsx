import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SlidersHorizontal, Star, Play, Copy, Share2, Trash2, Plus, Pencil, Lock, Filter } from "lucide-react";
import type { SavedSearchDto } from "@edas/shared";
import { useApp } from "../store";
import { cn, Button, Card, Input, Badge, Modal, Field, EmptyState, ConfirmDialog, LoadingState } from "../components/ui";
import { PageHeader, ExportMenu } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import {
  activeConditions,
  emptyFacets,
  filterDocuments,
  hasFacets,
  parseConditions,
  parseFacets,
  summarizeConditions,
  summarizeFacets,
  type SearchCondition,
  type SearchFacets,
} from "../lib/search-query";

interface SavedSearchRow {
  id: string;
  name: string;
  owner: string;
  shared: string;
  filters: string;
  createdAt: string;
  query: string;
  conditions: SearchCondition[];
  facets: SearchFacets;
}

interface SavedRouteState {
  prefillQuery?: string;
  prefillConditions?: unknown;
  prefillFacets?: unknown;
  editId?: string;
  editName?: string;
}

export function SavedSearches() {
  const { t, lang, toast, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as SavedRouteState | null;
  const { scopedDocs, docsMeta } = useDocsStore();
  const [savedList, setSavedList] = useState<SavedSearchRow[]>(() => (config.useApi ? [] : seedSearches(lang)));
  const [loaded, setLoaded] = useState(!config.useApi);
  const [editingId, setEditingId] = useState<string | null>(routeState?.editId ?? null);
  const [addOpen, setAddOpen] = useState(
    () =>
      Boolean(routeState?.editId) ||
      Boolean(routeState?.prefillQuery) ||
      Boolean(parseConditions(routeState?.prefillConditions).length) ||
      hasFacets(parseFacets(routeState?.prefillFacets)),
  );
  const [newName, setNewName] = useState(routeState?.editName ?? "");
  const [newQuery, setNewQuery] = useState(routeState?.prefillQuery ?? "");
  const [newConditions, setNewConditions] = useState<SearchCondition[]>(() => parseConditions(routeState?.prefillConditions));
  const [newFacets, setNewFacets] = useState<SearchFacets>(() => parseFacets(routeState?.prefillFacets));
  const [deleteTarget, setDeleteTarget] = useState<SavedSearchRow | null>(null);

  useEffect(() => {
    const conditions = parseConditions(routeState?.prefillConditions);
    const facets = parseFacets(routeState?.prefillFacets);
    if (routeState?.editId) {
      setEditingId(routeState.editId);
      setNewName(routeState.editName ?? "");
      setNewQuery(routeState.prefillQuery ?? "");
      setNewConditions(conditions);
      setNewFacets(facets);
      setAddOpen(true);
      return;
    }
    if (routeState?.prefillQuery || conditions.length > 0 || hasFacets(facets)) {
      setNewQuery(routeState?.prefillQuery ?? "");
      setNewConditions(conditions);
      setNewFacets(facets);
      setAddOpen(true);
    }
  }, [location.key, routeState]);

  const fromDto = (dto: SavedSearchDto): SavedSearchRow => {
    const query = typeof dto.query.q === "string" ? dto.query.q : "";
    const conditions = parseConditions(dto.query.conditions);
    const facets = parseFacets(dto.query.facets);
    return {
      id: dto.id,
      name: dto.name,
      owner: user?.name ?? "—",
      shared: lang === "en" ? "Private" : "خاص",
      filters: describeFilters(query, conditions, facets, lang),
      createdAt: dto.createdAt.slice(0, 10),
      query,
      conditions,
      facets,
    };
  };

  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => {
    void domainApi
      .savedSearches()
      .then((page) => {
        setSavedList(page.items.map(fromDto));
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
        toast({ type: "error", title: t("err.api") });
      });
  };

  useEffect(() => {
    if (config.useApi) reloadRef.current();
  }, []);

  const queryBody = (query: string, conditions: SearchCondition[], facets: SearchFacets = emptyFacets()): Record<string, unknown> => ({
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(conditions.length ? { conditions } : {}),
    ...(hasFacets(facets) ? { facets } : {}),
  });

  const closeModal = () => {
    setAddOpen(false);
    setEditingId(null);
    setNewName("");
    setNewQuery("");
    setNewConditions([]);
    setNewFacets(emptyFacets());
  };

  const save = () => {
    const name = newName.trim();
    if (!name) return;
    const conditions = activeConditions(newConditions);
    const facets = parseFacets(newFacets);
    const editing = editingId;
    if (config.useApi) {
      const request = editing
        ? domainApi.updateSavedSearch(editing, { name, query: queryBody(newQuery, conditions, facets) })
        : domainApi.createSavedSearch({ name, query: queryBody(newQuery, conditions, facets) });
      void request
        .then(() => {
          closeModal();
          reloadRef.current();
          toast({
            type: "success",
            title: editing ? (lang === "en" ? "Search updated" : "تم تحديث البحث") : lang === "en" ? "Search saved" : "تم حفظ البحث",
            message: name,
          });
        })
        .catch(() => toast({ type: "error", title: t("err.api") }));
      return;
    }
    if (editing) {
      setSavedList((prev) =>
        prev.map((row) =>
          row.id === editing
            ? {
                ...row,
                name,
                query: newQuery.trim(),
                conditions,
                facets,
                filters: describeFilters(newQuery, conditions, facets, lang),
              }
            : row,
        ),
      );
      closeModal();
      toast({ type: "success", title: lang === "en" ? "Search updated" : "تم تحديث البحث", message: name });
      return;
    }
    setSavedList((prev) => [
      {
        id: `s-${Date.now()}`,
        name,
        owner: user?.name ?? "—",
        shared: lang === "en" ? "Private" : "خاص",
        filters: describeFilters(newQuery, conditions, facets, lang),
        createdAt: new Date().toISOString().slice(0, 10),
        query: newQuery.trim(),
        conditions,
        facets,
      },
      ...prev,
    ]);
    closeModal();
    toast({ type: "success", title: lang === "en" ? "Search saved" : "تم حفظ البحث", message: name });
  };

  const runCount = (query: string, conditions: SearchCondition[], facets: SearchFacets = emptyFacets()): number =>
    filterDocuments(scopedDocs, { term: query, conditions, facets }, lang).length;

  const runSearch = (row: SavedSearchRow) => {
    navigate("/search", {
      state: {
        ...(row.query ? { advancedQuery: row.query } : {}),
        ...(row.conditions.length ? { advancedConditions: row.conditions } : {}),
        ...(hasFacets(row.facets) ? { advancedFacets: row.facets } : {}),
      },
    });
  };

  const sharedKey = lang === "en" ? "Shared" : "مشترك";

  const confirmDelete = (row: SavedSearchRow) => {
    if (!config.useApi) {
      setSavedList((prev) => prev.filter((item) => item.id !== row.id));
      toast({ type: "success", title: lang === "en" ? "Deleted" : "تم الحذف", message: row.name });
      return;
    }
    void domainApi
      .deleteSavedSearch(row.id)
      .then(() => {
        reloadRef.current();
        toast({ type: "success", title: lang === "en" ? "Deleted" : "تم الحذف", message: row.name });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }));
  };

  return (
    <div>
      <PageHeader
        title={t("nav.savedSearches")}
        description={
          lang === "en"
            ? "Your saved searches — run them again with one click"
            : "عمليات البحث المحفوظة الخاصة بك — شغّلها مرة أخرى بضغطة واحدة"
        }
        breadcrumbs={[{ label: t("nav.search"), to: "/search" }, { label: t("nav.savedSearches") }]}
        actions={
          <>
            <ExportMenu
              rows={savedList.map((s) => ({
                name: s.name,
                owner: s.owner,
                shared: s.shared,
                filters: s.filters,
                created: s.createdAt,
                results: runCount(s.query, s.conditions, s.facets),
              }))}
              filename="edas-saved-searches"
            />
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              {lang === "en" ? "New saved search" : "حفظ بحث جديد"}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: lang === "en" ? "Total saved" : "إجمالي المحفوظة",
            value: savedList.length,
            icon: Star,
            color: "from-amber-400 to-amber-600",
          },
          {
            label: lang === "en" ? "With conditions" : "بشروط متقدمة",
            value: savedList.filter((s) => s.conditions.length > 0).length,
            icon: SlidersHorizontal,
            color: "from-teal-400 to-teal-600",
          },
          {
            label: lang === "en" ? "With facets" : "بفلاتر نتائج",
            value: savedList.filter((s) => hasFacets(s.facets)).length,
            icon: Filter,
            color: "from-navy-400 to-navy-600",
          },
          {
            label: lang === "en" ? "Total results" : "إجمالي النتائج",
            value: savedList.reduce((total, s) => total + runCount(s.query, s.conditions, s.facets), 0),
            icon: Play,
            color: "from-purple-400 to-purple-600",
          },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3">
            <span
              className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", stat.color)}
            >
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xl font-extrabold text-ink-900 dark:text-white">{stat.value}</p>
              <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {config.useApi && docsMeta.loaded < docsMeta.total && (
        <p className="mb-3 text-[11px] font-medium text-ink-400">
          {lang === "en"
            ? `Result counts are computed on the ${docsMeta.loaded} of ${docsMeta.total} documents loaded in this session.`
            : `أعداد النتائج محسوبة على ${docsMeta.loaded} من أصل ${docsMeta.total} وثيقة محمّلة في هذه الجلسة.`}
        </p>
      )}

      <Modal
        open={addOpen}
        onClose={closeModal}
        title={editingId ? (lang === "en" ? "Edit saved search" : "تعديل البحث المحفوظ") : lang === "en" ? "Save search" : "حفظ بحث"}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              {t("g.cancel")}
            </Button>
            <Button onClick={save} disabled={!newName.trim()}>
              {t("g.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {editingId && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {lang === "en"
                ? "Saving replaces this saved search; it does not create a new one."
                : "الحفظ يستبدل هذا البحث المحفوظ ولا يُنشئ بحثاً جديداً."}
            </p>
          )}
          <Field label={lang === "en" ? "Search name" : "اسم البحث"} required>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={lang === "en" ? "Active contracts" : "العقود النشطة"}
            />
          </Field>
          <Field
            label={lang === "en" ? "Query / filters" : "الاستعلام / الفلاتر"}
            hint={lang === "en" ? "Leave empty to match all documents" : "اتركه فارغاً لمطابقة كل الوثائق"}
          >
            <Input
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder={lang === "en" ? "e.g. contracts, pending" : "مثال: عقود، معلقة"}
            />
          </Field>
          {newConditions.length > 0 && (
            <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-3 dark:border-navy-800 dark:bg-navy-900/20">
              <p className="text-xs font-bold text-navy-700 dark:text-navy-200">{t("search.advancedActive")}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-500 dark:text-ink-400">{summarizeConditions(newConditions, lang)}</p>
            </div>
          )}
          {hasFacets(newFacets) && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-800 dark:bg-teal-900/20">
              <p className="text-xs font-bold text-teal-700 dark:text-teal-200">{lang === "en" ? "Result filters" : "فلاتر النتائج"}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-500 dark:text-ink-400">{summarizeFacets(newFacets, lang)}</p>
            </div>
          )}
          {(newQuery.trim() || newConditions.length > 0 || hasFacets(newFacets)) && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{lang === "en" ? "Live preview" : "معاينة فورية"}</p>
              <p className="mt-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                <strong>{runCount(newQuery, activeConditions(newConditions), newFacets)}</strong>{" "}
                {lang === "en" ? "documents match this query" : "وثيقة تطابق هذا الاستعلام"}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {!loaded ? (
        <Card pad={false}>
          <LoadingState rows={3} />
        </Card>
      ) : savedList.length === 0 ? (
        <Card>
          <EmptyState
            variant="search"
            title={lang === "en" ? "No saved searches" : "لا توجد عمليات بحث محفوظة"}
            description={
              lang === "en"
                ? "Save a search to run it again later with one click. Build one in advanced search first."
                : "احفظ بحثاً لإعادة تشغيله لاحقاً بضغطة واحدة. أنشئ واحداً من البحث المتقدم أولاً."
            }
            action={
              <Button size="sm" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => navigate("/search/advanced")}>
                {lang === "en" ? "Go to advanced search" : "الانتقال للبحث المتقدم"}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {savedList.map((s) => {
            const count = runCount(s.query, s.conditions, s.facets);
            const isShared = s.shared === sharedKey;
            return (
              <Card key={s.id} className="group transition-all hover:border-navy-300 hover:shadow-card">
                <div className="flex flex-wrap items-start gap-4">
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                      isShared ? "from-teal-400 to-teal-600" : "from-navy-400 to-navy-600",
                    )}
                  >
                    {isShared ? <Share2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-bold text-ink-800 dark:text-ink-100">{s.name}</p>
                      <Badge
                        className={
                          isShared
                            ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                            : "bg-ink-100 text-ink-600 dark:bg-ink-800"
                        }
                      >
                        {s.shared}
                      </Badge>
                      <Badge
                        className={cn(
                          "font-bold",
                          count > 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                        )}
                        dot={count > 0 ? "bg-emerald-500" : "bg-rose-500"}
                      >
                        {count} {lang === "en" ? "results" : "نتيجة"}
                      </Badge>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                      {s.query && <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono dark:bg-ink-800">{s.query}</span>}
                      {s.conditions.length > 0 && (
                        <span className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                          {summarizeConditions(s.conditions, lang)}
                        </span>
                      )}
                      {hasFacets(s.facets) && (
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                          {summarizeFacets(s.facets, lang)}
                        </span>
                      )}
                      <span>
                        · {lang === "en" ? "by" : "بواسطة"} {s.owner}
                      </span>
                      <span>
                        · {lang === "en" ? "created" : "أُنشئ في"} {s.createdAt}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} disabled={count === 0} onClick={() => runSearch(s)}>
                      {lang === "en" ? "Run" : "تشغيل"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() =>
                        navigate("/search/advanced", {
                          state: {
                            ...(s.query ? { prefillQuery: s.query } : {}),
                            ...(s.conditions.length ? { prefillConditions: s.conditions } : {}),
                            ...(hasFacets(s.facets) ? { prefillFacets: s.facets } : {}),
                            editId: s.id,
                            editName: s.name,
                          },
                        })
                      }
                    >
                      {t("g.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={lang === "en" ? "Duplicate" : "نسخ"}
                      icon={<Copy className="h-3.5 w-3.5" />}
                      onClick={() => {
                        const copyName = `${s.name} (${lang === "en" ? "copy" : "نسخة"})`;
                        if (config.useApi) {
                          void domainApi
                            .createSavedSearch({ name: copyName, query: queryBody(s.query, s.conditions, s.facets) })
                            .then(() => {
                              reloadRef.current();
                              toast({ type: "info", title: lang === "en" ? "Duplicated" : "تم النسخ", message: s.name });
                            })
                            .catch(() => toast({ type: "error", title: t("err.api") }));
                          return;
                        }
                        setSavedList((prev) => [
                          { ...s, id: `s-${Date.now()}`, name: copyName, shared: lang === "en" ? "Private" : "خاص" },
                          ...prev,
                        ]);
                        toast({ type: "info", title: lang === "en" ? "Duplicated" : "تم النسخ", message: s.name });
                      }}
                    />
                    {!config.useApi && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={isShared ? (lang === "en" ? "Unshare" : "إلغاء المشاركة") : lang === "en" ? "Share" : "مشاركة"}
                        icon={<Share2 className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setSavedList((prev) =>
                            prev.map((row) =>
                              row.id === s.id ? { ...row, shared: isShared ? (lang === "en" ? "Private" : "خاص") : sharedKey } : row,
                            ),
                          );
                          toast({
                            type: isShared ? "info" : "success",
                            title: isShared
                              ? lang === "en"
                                ? "Unshared"
                                : "تم إلغاء المشاركة"
                              : lang === "en"
                                ? "Shared with department"
                                : "تمت المشاركة مع القسم",
                            message: s.name,
                          });
                        }}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      aria-label={lang === "en" ? "Delete" : "حذف"}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setDeleteTarget(s)}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) confirmDelete(deleteTarget);
        }}
        danger
        title={lang === "en" ? "Delete saved search?" : "حذف البحث المحفوظ؟"}
        message={
          lang === "en"
            ? `“${deleteTarget?.name ?? ""}” will be removed from your saved searches.`
            : `سيتم حذف «${deleteTarget?.name ?? ""}» من عمليات البحث المحفوظة.`
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}

function describeFilters(query: string, conditions: SearchCondition[], facets: SearchFacets, lang: "ar" | "en"): string {
  return (
    [
      query.trim() ? `q=${query.trim()}` : "",
      conditions.length ? summarizeConditions(conditions, lang) : "",
      hasFacets(facets) ? summarizeFacets(facets, lang) : "",
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function seedSearches(lang: "ar" | "en"): SavedSearchRow[] {
  return [
    {
      id: "s1",
      name: lang === "en" ? "Active contracts this year" : "العقود النشطة هذا العام",
      owner: "أحمد البلوي",
      shared: lang === "en" ? "Private" : "خاص",
      filters: lang === "en" ? "type=contract, status=approved, year=2026" : "نوع=عقد, حالة=معتمدة, سنة=2026",
      createdAt: "2026-01-20",
      query: lang === "en" ? "contract" : "عقد",
      conditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
      facets: emptyFacets(),
    },
    {
      id: "s2",
      name: lang === "en" ? "Pending financial reports" : "تقارير مالية معلقة",
      owner: "سعد المالكي",
      shared: lang === "en" ? "Shared" : "مشترك",
      filters: lang === "en" ? "type=financial report, status=pending" : "نوع=تقرير مالي, حالة=معلقة",
      createdAt: "2026-01-22",
      query: lang === "en" ? "report" : "تقرير",
      conditions: [{ field: "status", op: "eq", value: "pending", connector: "AND" }],
      facets: emptyFacets(),
    },
    {
      id: "s3",
      name: lang === "en" ? "Documents on legal hold" : "وثائق تحت الحجز القانوني",
      owner: "سارة المطيري",
      shared: lang === "en" ? "Shared" : "مشترك",
      filters: lang === "en" ? "status=on hold" : "حالة=تحت الحجز",
      createdAt: "2026-01-18",
      query: "",
      conditions: [{ field: "status", op: "eq", value: "hold", connector: "AND" }],
      facets: emptyFacets(),
    },
  ];
}
