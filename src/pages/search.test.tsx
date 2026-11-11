import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { SearchResults } from "./search-results";
import { AdvancedSearch } from "./search-advanced";
import { SavedSearches } from "./search-saved";
import { applyFacets, hasFacets, parseFacets, summarizeFacets } from "../lib/search-query";
import type { Document } from "../types";

type Entry = string | { pathname: string; state?: unknown };

function wrap(children: ReactNode, entries: Entry[] = ["/search"]) {
  return (
    <MemoryRouter initialEntries={entries}>
      <AppProvider>
        <DocsProvider>{children}</DocsProvider>
      </AppProvider>
    </MemoryRouter>
  );
}

const wrapper = ({ children }: { children: ReactNode }) => wrap(children);

beforeEach(() => {
  localStorage.clear();
});

describe("search results", () => {
  it("starts with an empty query and lists accessible documents", () => {
    render(<SearchResults />, { wrapper });
    const input = screen.getByLabelText(translations.ar["nav.search"]);
    expect(input).toHaveValue("");
    expect(screen.queryByText(translations.ar["search.emptyRepo.title"])).toBeNull();
    expect(screen.queryByText(translations.ar["search.emptyRepo.desc"])).toBeNull();
  });

  it("shows the no-match state for an unmatched term and recovers after clearing", async () => {
    const user = userEvent.setup();
    render(<SearchResults />, { wrapper });
    const input = screen.getByLabelText(translations.ar["nav.search"]);

    await user.type(input, "zzzz-not-a-document");
    expect(await screen.findByText("لا توجد نتائج مطابقة")).toBeInTheDocument();

    await user.clear(input);
    expect(screen.queryByText("لا توجد نتائج مطابقة")).toBeNull();
  });

  it("does not offer the unreachable restricted classification facet", () => {
    render(<SearchResults />, { wrapper });
    expect(screen.queryByRole("button", { name: /مقيد/ })).toBeNull();
  });

  it("enables saving the current search once a term is entered", async () => {
    const user = userEvent.setup();
    render(<SearchResults />, { wrapper });

    const saveButton = screen.getByRole("button", { name: "حفظ هذا البحث" });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText(translations.ar["nav.search"]), "عقد");
    expect(await screen.findByRole("button", { name: "حفظ هذا البحث" })).toBeEnabled();
  });
});

describe("saved search facets", () => {
  it("round-trips facet selections through the saved payload and filters with AND across groups", () => {
    const docs = [
      { id: "a", deptId: "IT", fileType: "pdf", status: "approved", classification: "internal" },
      { id: "b", deptId: "FIN", fileType: "pdf", status: "draft", classification: "internal" },
      { id: "c", deptId: "IT", fileType: "image", status: "approved", classification: "internal" },
    ] as unknown as Document[];

    const facets = parseFacets({ dept: ["IT", "FIN"], status: ["approved"], class: [] });
    expect(applyFacets(docs, facets).map((doc) => doc.id)).toEqual(["a", "c"]);
    expect(applyFacets(docs, parseFacets({ dept: ["IT"], type: ["image"] })).map((doc) => doc.id)).toEqual(["c"]);
    expect(hasFacets(facets)).toBe(true);
    expect(hasFacets(parseFacets({ dept: [""], nope: "x" }))).toBe(false);
    expect(summarizeFacets(parseFacets({ status: ["approved"] }), "ar")).toContain("معتمدة");
  });
});

describe("advanced search", () => {
  it("switches the operator to equals when a select field is chosen", async () => {
    const user = userEvent.setup();
    render(<AdvancedSearch />, { wrapper });

    expect(screen.getByLabelText("المعامل")).toHaveValue("contains");
    await user.selectOptions(screen.getByLabelText("الحقل"), "status");

    expect(screen.getByLabelText("المعامل")).toHaveValue("eq");
    expect(screen.getByLabelText("القيمة")).toBeInTheDocument();
  });

  it("applies the free-text term across text fields and keeps it out of the condition list", async () => {
    const user = userEvent.setup();
    render(<AdvancedSearch />, { wrapper });

    const count = () => {
      const badge = screen.getAllByText(/مطابقة$/).find((el) => /^\d+ مطابقة$/.test(el.textContent ?? ""));
      return Number((badge?.textContent ?? "").split(" ")[0]);
    };

    const input = screen.getByLabelText("نص حر");
    expect(input).toHaveValue("");
    const initial = count();
    expect(initial).toBeGreaterThan(0);

    await user.type(input, "النزاعات");
    expect(count()).toBe(initial);

    await user.clear(input);
    await user.type(input, "zzzz-not-a-document");
    expect(count()).toBe(0);
  });

  it("prefills free text, conditions, facets and the edit target from route state", () => {
    const entries = [
      {
        pathname: "/search/advanced",
        state: {
          prefillQuery: "HVAC",
          prefillConditions: [{ field: "status", op: "eq", value: "pending", connector: "AND" }],
          prefillFacets: { type: ["office"] },
          editId: "s1",
          editName: "بحث",
        },
      },
    ];
    render(<AdvancedSearch />, { wrapper: ({ children }) => wrap(children, entries) });

    expect(screen.getByLabelText("نص حر")).toHaveValue("HVAC");
    expect(screen.getByLabelText("القيمة")).toHaveValue("pending");
    expect(screen.getByText("فلاتر نتائج محفوظة:")).toBeInTheDocument();
    expect(screen.getByText(/^\d+ مطابقة$/)).toBeInTheDocument();
  });
});

describe("saved searches", () => {
  it("updates an existing saved search in place instead of creating a copy", () => {
    const entries = [{ pathname: "/search/saved", state: { editId: "s1", editName: "العقود النشطة هذا العام" } }];
    render(<SavedSearches />, { wrapper: ({ children }) => wrap(children, entries) });

    const dialog = screen.getByRole("dialog", { name: "تعديل البحث المحفوظ" });
    const nameInput = within(dialog).getByDisplayValue("العقود النشطة هذا العام");
    fireEvent.change(nameInput, { target: { value: "اسم محدَّث" } });
    fireEvent.click(within(dialog).getByRole("button", { name: translations.ar["g.save"] }));

    const rowMatches = screen.getAllByText("اسم محدَّث").filter((el) => !el.closest('[role="status"]'));
    expect(rowMatches).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "تعديل البحث المحفوظ" })).toBeNull();
    expect(screen.queryByText("العقود النشطة هذا العام")).toBeNull();
  });
});
