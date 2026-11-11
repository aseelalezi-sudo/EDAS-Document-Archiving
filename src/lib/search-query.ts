import { deptName } from "../data";
import type { Lang } from "../i18n";
import type { Document } from "../types";

export type SearchField = "title" | "docNo" | "dept" | "owner" | "tags" | "status" | "class" | "type" | "version";
export type SearchOperator = "contains" | "eq" | "neq" | "starts" | "empty";
export type SearchConnector = "AND" | "OR";

export interface SearchCondition {
  field: SearchField;
  op: SearchOperator;
  value: string;
  connector: SearchConnector;
}

export const SEARCH_FIELDS: SearchField[] = ["title", "docNo", "dept", "owner", "tags", "status", "class", "type", "version"];
export const SEARCH_OPERATORS: SearchOperator[] = ["contains", "eq", "neq", "starts", "empty"];
export const SELECT_FIELDS: SearchField[] = ["dept", "status", "class", "type"];

export const STATUS_VALUES = ["draft", "pending", "approved", "rejected", "archived", "retention", "destroyed", "hold"] as const;
export const CLASSIFICATION_VALUES = ["public", "internal", "confidential", "topsecret"] as const;
export const FILE_TYPE_VALUES = ["pdf", "office", "image", "cad", "text"] as const;

export function isSearchField(value: unknown): value is SearchField {
  return typeof value === "string" && (SEARCH_FIELDS as string[]).includes(value);
}

export function isSearchOperator(value: unknown): value is SearchOperator {
  return typeof value === "string" && (SEARCH_OPERATORS as string[]).includes(value);
}

export function isSelectField(field: SearchField): boolean {
  return SELECT_FIELDS.includes(field);
}

export function fieldValue(doc: Document, field: SearchField, lang: Lang): string {
  switch (field) {
    case "title":
      return lang === "en" ? doc.titleEn || doc.title : doc.title || doc.titleEn;
    case "docNo":
      return doc.docNo;
    case "dept":
      return doc.deptId;
    case "owner":
      return lang === "en" ? doc.ownerEn || doc.owner : doc.owner || doc.ownerEn;
    case "tags":
      return doc.tags.join(" ");
    case "status":
      return doc.status;
    case "class":
      return doc.classification;
    case "type":
      return doc.fileType;
    case "version":
      return doc.version;
  }
}

export function matchesQueryText(doc: Document, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [
    doc.title,
    doc.titleEn,
    doc.docNo,
    doc.owner,
    doc.ownerEn,
    doc.category,
    doc.categoryEn,
    doc.content ?? "",
    doc.description,
    ...doc.tags,
  ].some((value) => value.toLowerCase().includes(needle));
}

export function isConditionActive(condition: SearchCondition): boolean {
  return condition.op === "empty" || condition.value.trim() !== "";
}

export function activeConditions(conditions: SearchCondition[]): SearchCondition[] {
  return conditions.filter(isConditionActive);
}

export function matchesCondition(doc: Document, condition: SearchCondition, lang: Lang): boolean {
  const raw = fieldValue(doc, condition.field, lang);
  const value = condition.value.trim();

  if (condition.op === "empty") return raw.trim() === "";

  const haystack = raw.toLowerCase();
  const needle = value.toLowerCase();
  if (isSelectField(condition.field)) {
    switch (condition.op) {
      case "eq":
      case "contains":
        return haystack === needle;
      case "neq":
        return haystack !== needle;
      case "starts":
        return haystack.startsWith(needle);
    }
  }

  switch (condition.op) {
    case "contains":
      return haystack.includes(needle);
    case "eq":
      return haystack === needle;
    case "neq":
      return haystack !== needle;
    case "starts":
      return haystack.startsWith(needle);
  }
}

export function matchesAll(doc: Document, conditions: SearchCondition[], lang: Lang): boolean {
  return activeConditions(conditions).every((condition) => matchesCondition(doc, condition, lang));
}

export function matchesAny(doc: Document, conditions: SearchCondition[], lang: Lang): boolean {
  return activeConditions(conditions).some((condition) => matchesCondition(doc, condition, lang));
}

export function groupConditions(conditions: SearchCondition[]): SearchCondition[][] {
  const active = activeConditions(conditions);
  const groups: SearchCondition[][] = [];
  for (const condition of active) {
    if (groups.length === 0 || condition.connector === "OR") groups.push([condition]);
    else groups[groups.length - 1].push(condition);
  }
  return groups;
}

export function matchesGroups(doc: Document, groups: SearchCondition[][], lang: Lang): boolean {
  return groups.some((group) => group.every((condition) => matchesCondition(doc, condition, lang)));
}

export function evaluateConditions(docs: Document[], conditions: SearchCondition[], lang: Lang): Document[] {
  const groups = groupConditions(conditions);
  if (groups.length === 0) return docs;
  return docs.filter((doc) => matchesGroups(doc, groups, lang));
}

export function queryFromConditions(conditions: SearchCondition[]): string {
  return activeConditions(conditions)
    .filter((condition) => !isSelectField(condition.field) && condition.op !== "empty")
    .map((condition) => condition.value.trim())
    .join(" ");
}

export function summarizeConditions(conditions: SearchCondition[], lang: Lang): string {
  const active = activeConditions(conditions);
  return active
    .map((condition, index) => {
      const field = fieldLabel(condition.field, lang);
      const op = operatorLabel(condition.op, lang);
      const value = condition.op === "empty" ? "" : condition.value.trim();
      const prefix = index === 0 ? "" : `${condition.connector} `;
      const selectValue = isSelectField(condition.field) && value ? optionLabel(condition.field, value, lang) : value;
      return `${prefix}${field} ${op}${selectValue ? ` ${selectValue}` : ""}`;
    })
    .join(" ");
}

export function fieldLabel(field: SearchField, lang: Lang): string {
  const labels: Record<SearchField, [string, string]> = {
    title: ["العنوان", "Title"],
    docNo: ["رقم الوثيقة", "Document No."],
    dept: ["الإدارة", "Department"],
    owner: ["المالك", "Owner"],
    tags: ["الوسوم", "Tags"],
    status: ["الحالة", "Status"],
    class: ["السرية", "Classification"],
    type: ["نوع الملف", "File type"],
    version: ["الإصدار", "Version"],
  };
  return labels[field][lang === "en" ? 1 : 0];
}

export function operatorLabel(op: SearchOperator, lang: Lang): string {
  const labels: Record<SearchOperator, [string, string]> = {
    contains: ["يحتوي", "contains"],
    eq: ["يساوي", "equals"],
    neq: ["لا يساوي", "is not"],
    starts: ["يبدأ بـ", "starts with"],
    empty: ["فارغ", "is empty"],
  };
  return labels[op][lang === "en" ? 1 : 0];
}

export function optionLabel(field: SearchField, value: string, lang: Lang): string {
  if (field === "dept") return deptName(value, lang);
  if (field === "status") return statusLabel(value, lang);
  if (field === "class") return classificationLabel(value, lang);
  if (field === "type") return value.toUpperCase();
  return value;
}

function statusLabel(value: string, lang: Lang): string {
  const labels: Record<string, [string, string]> = {
    draft: ["مسودة", "Draft"],
    pending: ["معلقة", "Pending"],
    approved: ["معتمدة", "Approved"],
    rejected: ["مرفوضة", "Rejected"],
    archived: ["مؤرشفة", "Archived"],
    retention: ["قيد الاحتفاظ", "Retention"],
    destroyed: ["متلفة", "Destroyed"],
    hold: ["تحت الحجز", "On hold"],
  };
  return labels[value]?.[lang === "en" ? 1 : 0] ?? value;
}

function classificationLabel(value: string, lang: Lang): string {
  const labels: Record<string, [string, string]> = {
    public: ["عام", "Public"],
    internal: ["داخلي", "Internal"],
    confidential: ["سري", "Confidential"],
    topsecret: ["سري للغاية", "Top secret"],
  };
  return labels[value]?.[lang === "en" ? 1 : 0] ?? value;
}

export interface SearchFacets {
  dept: string[];
  type: string[];
  status: string[];
  class: string[];
}

export const FACET_FIELDS = ["dept", "type", "status", "class"] as const;
export type FacetField = (typeof FACET_FIELDS)[number];

export function emptyFacets(): SearchFacets {
  return { dept: [], type: [], status: [], class: [] };
}

export function parseFacets(value: unknown): SearchFacets {
  const facets = emptyFacets();
  if (!value || typeof value !== "object") return facets;
  const record = value as Record<string, unknown>;
  for (const field of FACET_FIELDS) {
    const raw = record[field];
    if (!Array.isArray(raw)) continue;
    facets[field] = raw.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  }
  return facets;
}

export function hasFacets(facets: SearchFacets): boolean {
  return FACET_FIELDS.some((field) => facets[field].length > 0);
}

export function facetCount(facets: SearchFacets): number {
  return FACET_FIELDS.reduce((total, field) => total + facets[field].length, 0);
}

function facetValue(doc: Document, field: FacetField): string {
  switch (field) {
    case "dept":
      return doc.deptId;
    case "type":
      return doc.fileType;
    case "status":
      return doc.status;
    case "class":
      return doc.classification;
  }
}

export function applyFacets(docs: Document[], facets: SearchFacets): Document[] {
  if (!hasFacets(facets)) return docs;
  return docs.filter((doc) => FACET_FIELDS.every((field) => facets[field].length === 0 || facets[field].includes(facetValue(doc, field))));
}

export interface SearchQuery {
  term?: string;
  conditions?: SearchCondition[];
  facets?: SearchFacets;
}

export function filterDocuments(docs: Document[], query: SearchQuery, lang: Lang): Document[] {
  let next = docs;
  const term = query.term?.trim() ?? "";
  if (term) next = next.filter((doc) => matchesQueryText(doc, term));
  if (query.conditions && query.conditions.length > 0) next = evaluateConditions(next, query.conditions, lang);
  if (query.facets) next = applyFacets(next, query.facets);
  return next;
}

export function summarizeFacets(facets: SearchFacets, lang: Lang): string {
  return FACET_FIELDS.filter((field) => facets[field].length > 0)
    .map(
      (field) =>
        `${fieldLabel(field, lang)}: ${facets[field].map((value) => optionLabel(field, value, lang)).join(lang === "en" ? ", " : "، ")}`,
    )
    .join(" · ");
}

export function parseConditions(value: unknown): SearchCondition[] {
  if (!Array.isArray(value)) return [];
  const conditions: SearchCondition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isSearchField(record.field) || !isSearchOperator(record.op)) continue;
    const rawValue = typeof record.value === "string" ? record.value : "";
    const connector: SearchConnector = record.connector === "OR" ? "OR" : "AND";
    conditions.push({ field: record.field, op: record.op, value: rawValue, connector });
  }
  return conditions;
}
