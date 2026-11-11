import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal, Save, Play, Plus, X, ChevronDown, ChevronLeft, Sparkles } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Input, Select, Badge, StatusBadge } from "../components/ui";
import { PageHeader, FileIcon, SectionTitle } from "../components/shared";
import { deptName } from "../data";
import { useDocsStore } from "../store-docs";
import {
  CLASSIFICATION_VALUES,
  FILE_TYPE_VALUES,
  SEARCH_FIELDS,
  SEARCH_OPERATORS,
  STATUS_VALUES,
  activeConditions,
  fieldLabel,
  filterDocuments,
  isSelectField,
  operatorLabel,
  parseConditions,
  parseFacets,
  hasFacets,
  summarizeConditions,
  summarizeFacets,
  emptyFacets,
  type SearchCondition,
  type SearchFacets,
  type SearchField,
} from "../lib/search-query";

interface AdvancedRouteState {
  prefillQuery?: string;
  prefillConditions?: unknown;
  prefillFacets?: unknown;
  editId?: string;
  editName?: string;
}

export function AdvancedSearch() {
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as AdvancedRouteState | null;
  const { scopedDocs, departments: deptStore } = useDocsStore();
  const departmentOptions = deptStore.items;
  const [conditions, setConditions] = useState<SearchCondition[]>(() => initialConditions(routeState));
  const [term, setTerm] = useState(() => routeState?.prefillQuery ?? "");
  const [facets, setFacets] = useState<SearchFacets>(() => parseFacets(routeState?.prefillFacets));

  useEffect(() => {
    setConditions(initialConditions(routeState));
    setTerm(routeState?.prefillQuery ?? "");
    setFacets(parseFacets(routeState?.prefillFacets));
  }, [location.key, routeState]);

  const active = activeConditions(conditions);
  const matches = useMemo(
    () => filterDocuments(scopedDocs, { term, conditions, facets }, lang),
    [scopedDocs, term, conditions, facets, lang],
  );
  const matchCount = matches.length;

  const update = (index: number, patch: Partial<SearchCondition>) =>
    setConditions((prev) => prev.map((condition, position) => (position === index ? { ...condition, ...patch } : condition)));

  const optionsFor = (field: SearchField): { value: string; label: string }[] => {
    switch (field) {
      case "dept":
        return departmentOptions.map((dept) => ({ value: dept.id, label: lang === "en" ? dept.nameEn : dept.name }));
      case "status":
        return STATUS_VALUES.map((value) => ({ value, label: t(`doc.status.${value}`) }));
      case "class":
        return CLASSIFICATION_VALUES.map((value) => ({ value, label: t(`doc.classification.${value}`) }));
      case "type":
        return FILE_TYPE_VALUES.map((value) => ({ value, label: value.toUpperCase() }));
      default:
        return [];
    }
  };

  const handoff = () => {
    const trimmed = term.trim();
    if (active.length === 0 && !trimmed && !hasFacets(facets)) {
      navigate("/search");
      return;
    }
    navigate("/search", {
      state: {
        ...(trimmed ? { advancedQuery: trimmed } : {}),
        ...(active.length > 0 ? { advancedConditions: active } : {}),
        ...(hasFacets(facets) ? { advancedFacets: facets } : {}),
      },
    });
  };

  const saveSearch = () => {
    const trimmed = term.trim();
    navigate("/search/saved", {
      state: {
        ...(trimmed ? { prefillQuery: trimmed } : {}),
        ...(active.length > 0 ? { prefillConditions: active } : {}),
        ...(hasFacets(facets) ? { prefillFacets: facets } : {}),
        ...(routeState?.editId ? { editId: routeState.editId, editName: routeState.editName } : {}),
      },
    });
    toast({ type: "info", title: lang === "en" ? "Name your search" : "سمِّ بحثك" });
  };

  return (
    <div>
      <PageHeader
        title={t("nav.advancedSearch")}
        description={
          lang === "en"
            ? "Search by free text plus linked conditions; AND binds tighter than OR"
            : "ابحث بنص حر إضافة إلى شروط مترابطة؛ AND أقوى من OR"
        }
        breadcrumbs={[{ label: t("nav.search"), to: "/search" }, { label: t("nav.advancedSearch") }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/search")}>
            {t("g.back")}
          </Button>
        }
      />
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle
            title={lang === "en" ? "Search conditions" : "شروط البحث"}
            icon={<SlidersHorizontal className="h-4 w-4 text-navy-500" />}
          />
          <Badge
            className={cn(
              matchCount > 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-ink-100 text-ink-500 dark:bg-ink-800",
            )}
            dot={matchCount > 0 ? "bg-emerald-500" : undefined}
          >
            {matchCount} {lang === "en" ? "matches" : "مطابقة"}
          </Badge>
        </div>

        {hasFacets(facets) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5 dark:border-teal-800 dark:bg-teal-900/20">
            <span className="text-xs font-bold text-teal-700 dark:text-teal-200">
              {lang === "en" ? "Saved result filters:" : "فلاتر نتائج محفوظة:"}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-500 dark:text-ink-400">
              {summarizeFacets(facets, lang)}
            </span>
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setFacets(emptyFacets())}>
              {t("g.clear")}
            </Button>
          </div>
        )}

        <div className="mb-3">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={
              lang === "en"
                ? "Free text: title, number, owner, tags, description…"
                : "نص حر: العنوان أو الرقم أو المالك أو الوسوم أو الوصف…"
            }
            aria-label={lang === "en" ? "Free text" : "نص حر"}
          />
          <p className="mt-1 text-[11px] font-medium text-ink-400">
            {lang === "en"
              ? "Free text matches any text field; conditions below are applied on top of it."
              : "النص الحر يطابق أي حقل نصي، وتُطبَّق الشروط أدناه فوقه."}
          </p>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const select = isSelectField(condition.field);
            return (
              <div key={index} className="space-y-1.5">
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-xl border p-2.5 transition-colors",
                    condition.op === "empty" || condition.value.trim()
                      ? "border-navy-200 bg-navy-50/40 dark:border-navy-800 dark:bg-navy-900/20"
                      : "border-ink-200 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-950",
                  )}
                >
                  {index > 0 ? (
                    <Select
                      className="w-20 font-bold"
                      value={condition.connector}
                      aria-label={lang === "en" ? "Connector" : "الرابط"}
                      onChange={(e) => update(index, { connector: e.target.value === "OR" ? "OR" : "AND" })}
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </Select>
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-xs font-bold text-navy-700 dark:bg-navy-900 dark:text-navy-300">
                      {index + 1}
                    </span>
                  )}
                  <Select
                    className="w-40"
                    value={condition.field}
                    aria-label={lang === "en" ? "Field" : "الحقل"}
                    onChange={(e) => {
                      const field = SEARCH_FIELDS.find((value) => value === e.target.value);
                      if (!field) return;
                      const select = isSelectField(field);
                      const op = select && (condition.op === "contains" || condition.op === "starts") ? "eq" : condition.op;
                      update(index, { field, op, value: "" });
                    }}
                  >
                    {SEARCH_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {fieldLabel(field, lang)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="w-32"
                    value={condition.op}
                    aria-label={lang === "en" ? "Operator" : "المعامل"}
                    onChange={(e) => {
                      const op = SEARCH_OPERATORS.find((value) => value === e.target.value);
                      if (op) update(index, { op, value: op === "empty" ? "" : condition.value });
                    }}
                  >
                    {SEARCH_OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {operatorLabel(op, lang)}
                      </option>
                    ))}
                  </Select>
                  {condition.op === "empty" ? (
                    <span className="min-w-36 flex-1 text-xs font-medium text-ink-400">
                      {lang === "en" ? "No value needed" : "لا يحتاج قيمة"}
                    </span>
                  ) : select ? (
                    <Select
                      className="min-w-36 flex-1"
                      value={condition.value}
                      aria-label={lang === "en" ? "Value" : "القيمة"}
                      onChange={(e) => update(index, { value: e.target.value })}
                    >
                      <option value="">{lang === "en" ? "Select…" : "اختر…"}</option>
                      {optionsFor(condition.field).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      className="min-w-36 flex-1"
                      placeholder={lang === "en" ? "Value…" : "القيمة…"}
                      value={condition.value}
                      onChange={(e) => update(index, { value: e.target.value })}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={lang === "en" ? "Remove condition" : "حذف الشرط"}
                    onClick={() => setConditions((prev) => prev.filter((_, position) => position !== index))}
                    disabled={conditions.length === 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {select && condition.value && condition.op === "neq" && (
                  <p className="ps-12 text-[11px] font-medium text-ink-400">
                    {lang === "en"
                      ? "Documents without a value in this field will not be listed."
                      : "لن تظهر الوثائق التي لا تحمل قيمة في هذا الحقل."}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setConditions((prev) => [...prev, { field: "title", op: "contains", value: "", connector: "AND" }])}
          >
            {lang === "en" ? "Add condition" : "إضافة شرط"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<ChevronDown className="h-4 w-4" />}
            onClick={() => setConditions((prev) => [...prev, { field: "title", op: "contains", value: "", connector: "OR" }])}
          >
            {lang === "en" ? "Add OR group" : "إضافة مجموعة OR"}
          </Button>
          {conditions.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => setConditions([{ field: "title", op: "contains", value: "", connector: "AND" }])}
            >
              {t("g.clear")}
            </Button>
          )}
        </div>
      </Card>

      {active.length > 0 && matchCount > 0 && (
        <Card className="mt-4" pad={false}>
          <div className="px-4 pt-4">
            <SectionTitle
              title={`${lang === "en" ? "Preview matches" : "معاينة المطابقات"} (${Math.min(5, matchCount)})`}
              icon={<Sparkles className="h-4 w-4 text-teal-500" />}
            />
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {matches.slice(0, 5).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-navy-50/50 dark:hover:bg-navy-500/5"
              >
                <FileIcon type={doc.fileType} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">
                    {lang === "en" ? doc.titleEn || doc.title : doc.title}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {doc.docNo} · {deptName(doc.deptId, lang)} · {lang === "en" ? doc.ownerEn || doc.owner : doc.owner}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
                <ChevronLeft className="h-4 w-4 shrink-0 text-ink-300 flip-x" />
              </button>
            ))}
          </div>
          {matchCount > 5 && (
            <p className="border-t border-ink-100 py-2 text-center text-xs text-ink-400 dark:border-ink-800">
              {lang === "en" ? `+ ${matchCount - 5} more` : `+ ${matchCount - 5} أخرى`}
            </p>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-teal-500" />
            <span className="text-ink-500">{lang === "en" ? "Active conditions:" : "الشروط النشطة:"}</span>
            <Badge className="bg-navy-100 text-navy-700 dark:bg-navy-900 dark:text-navy-200">{active.length}</Badge>
            <Badge
              className={cn(
                matchCount > 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
              )}
            >
              {matchCount} {lang === "en" ? "results" : "نتيجة"}
            </Badge>
            {active.length > 0 && <span className="font-mono text-[11px] text-ink-400">{summarizeConditions(conditions, lang)}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Save className="h-4 w-4" />} onClick={saveSearch}>
              {lang === "en" ? "Save search" : "حفظ البحث"}
            </Button>
            <Button size="sm" icon={<Play className="h-4 w-4" />} disabled={matchCount === 0} onClick={handoff}>
              {t("g.search")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function initialConditions(routeState: AdvancedRouteState | null): SearchCondition[] {
  const prefilled = parseConditions(routeState?.prefillConditions);
  if (prefilled.length > 0) return prefilled;
  return [{ field: "title", op: "contains", value: "", connector: "AND" }];
}
