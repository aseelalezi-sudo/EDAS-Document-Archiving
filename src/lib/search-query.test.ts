import { describe, expect, it } from "vitest";
import type { Document } from "../types";
import {
  activeConditions,
  evaluateConditions,
  filterDocuments,
  groupConditions,
  matchesCondition,
  parseConditions,
  parseFacets,
  queryFromConditions,
  summarizeConditions,
  type SearchCondition,
} from "./search-query";

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d1",
    docNo: "DOC-2026-0001",
    title: "عقد صيانة",
    titleEn: "Maintenance contract",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "contract",
    deptId: "dept-1",
    sectionId: "sec-1",
    owner: "أحمد",
    ownerEn: "Ahmed",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1 KB",
    fileType: "pdf",
    folderId: "folder-1",
    tags: ["contract", "maintenance"],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  };
}

const condition = (overrides: Partial<SearchCondition> = {}): SearchCondition => ({
  field: "title",
  op: "contains",
  value: "",
  connector: "AND",
  ...overrides,
});

describe("search-query", () => {
  it("matches text fields without depending on the query language", () => {
    expect(matchesCondition(doc(), condition({ value: "صيانة" }), "ar")).toBe(true);
    expect(matchesCondition(doc(), condition({ value: "maintenance" }), "en")).toBe(true);
    expect(matchesCondition(doc({ title: "تقرير", titleEn: "Report" }), condition({ value: "عقد" }), "ar")).toBe(false);
  });

  it("compares select fields against raw keys, not translated labels", () => {
    expect(matchesCondition(doc(), condition({ field: "status", op: "eq", value: "approved" }), "ar")).toBe(true);
    expect(matchesCondition(doc(), condition({ field: "status", op: "eq", value: "معتمدة" }), "ar")).toBe(false);
    expect(matchesCondition(doc(), condition({ field: "class", op: "eq", value: "internal" }), "en")).toBe(true);
    expect(matchesCondition(doc(), condition({ field: "dept", op: "eq", value: "dept-1" }), "ar")).toBe(true);
    expect(matchesCondition(doc(), condition({ field: "type", op: "eq", value: "pdf" }), "en")).toBe(true);
  });

  it("supports every operator and treats empty as a presence check", () => {
    expect(matchesCondition(doc(), condition({ field: "docNo", op: "starts", value: "DOC-2026" }), "en")).toBe(true);
    expect(matchesCondition(doc(), condition({ op: "neq", value: "draft" }), "en")).toBe(true);
    expect(matchesCondition(doc({ description: "" }), condition({ field: "tags", op: "empty" }), "en")).toBe(false);
    expect(matchesCondition(doc({ tags: [] }), condition({ field: "tags", op: "empty" }), "en")).toBe(true);
  });

  it("ignores inactive conditions when building AND/OR groups", () => {
    const conditions = [
      condition({ field: "title", value: "" }),
      condition({ field: "status", value: "", op: "eq" }),
      condition({ field: "owner", value: "أحمد" }),
    ];
    expect(activeConditions(conditions)).toHaveLength(1);
    expect(groupConditions(conditions)).toEqual([[conditions[2]]]);
  });

  it("binds AND tighter than OR across active conditions", () => {
    const conditions = [
      condition({ field: "status", op: "eq", value: "approved", connector: "AND" }),
      condition({ field: "class", op: "eq", value: "public", connector: "AND" }),
      condition({ field: "title", op: "contains", value: "عقد", connector: "OR" }),
    ];

    const groups = groupConditions(conditions);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);

    const approvedInternal = doc();
    const publicDraft = doc({ id: "d2", status: "draft", classification: "public", title: "محضر", titleEn: "Minutes" });
    const matchingTitleDraft = doc({ id: "d3", status: "draft", title: "عقد إيجار", titleEn: "Lease contract" });
    const unrelated = doc({ id: "d4", status: "draft", title: "مذكرة", titleEn: "Memo", classification: "public" });

    const result = evaluateConditions([approvedInternal, publicDraft, matchingTitleDraft, unrelated], conditions, "ar");
    expect(result.map((item) => item.id)).toEqual(["d1", "d3"]);
  });

  it("keeps the OR grouping correct when inactive conditions sit between active ones", () => {
    const conditions = [
      condition({ field: "status", op: "eq", value: "approved", connector: "AND" }),
      condition({ field: "title", value: "", connector: "OR" }),
      condition({ field: "class", op: "eq", value: "confidential", connector: "OR" }),
    ];

    const result = evaluateConditions([doc(), doc({ id: "d2", classification: "confidential" })], conditions, "en");
    expect(result.map((item) => item.id)).toEqual(["d1", "d2"]);
  });

  it("builds a text query and a readable summary for handoff", () => {
    const conditions = [
      condition({ field: "title", value: " عقد " }),
      condition({ field: "status", op: "eq", value: "approved", connector: "AND" }),
      condition({ field: "docNo", value: "", connector: "OR" }),
    ];

    expect(queryFromConditions(conditions)).toBe("عقد");
    expect(summarizeConditions(conditions, "en")).toBe("Title contains عقد AND Status equals Approved");
  });

  it("combines free text, structural conditions and result facets", () => {
    const descriptionMatch = doc({ id: "d2", title: "محضر", titleEn: "Minutes", description: "عقد إيجار", status: "draft" });
    const report = doc({ id: "d3", title: "تقرير", titleEn: "Report", content: "" });
    const docs = [doc(), descriptionMatch, report];

    expect(filterDocuments(docs, { term: "إيجار" }, "ar").map((item) => item.id)).toEqual(["d2"]);
    expect(
      filterDocuments(
        docs,
        {
          term: "عقد",
          conditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
          facets: parseFacets({ type: ["pdf"] }),
        },
        "ar",
      ).map((item) => item.id),
    ).toEqual(["d1"]);
    expect(filterDocuments(docs, { conditions: parseConditions([{ field: "status", op: "eq", value: "draft" }]) }, "ar")).toHaveLength(1);
    expect(filterDocuments(docs, { term: "  ", conditions: [], facets: parseFacets({}) }, "ar")).toHaveLength(3);
  });

  it("parses persisted conditions defensively", () => {
    expect(parseConditions(undefined)).toEqual([]);
    expect(parseConditions("title")).toEqual([]);
    expect(
      parseConditions([
        { field: "status", op: "eq", value: "approved", connector: "OR" },
        { field: "unknown", op: "eq", value: "x", connector: "AND" },
        { field: "title", op: "equals", value: "x", connector: "AND" },
        null,
      ]),
    ).toEqual([{ field: "status", op: "eq", value: "approved", connector: "OR" }]);
  });
});
