import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  list: vi.fn(),
  config: { useApi: false },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/docs-api", () => ({ docsApi: { listDocuments: (...args: unknown[]) => mocks.list(...args) } }));

import { SearchResults } from "./search-results";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

type Entry = string | { pathname: string; state?: unknown };

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
    return text;
  };
}

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d1",
    docNo: "EDAS-1",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    category: "عقد",
    categoryEn: "Contract",
    categoryId: "contract",
    deptId: "legal",
    sectionId: "sec-1",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1 MB",
    sizeBytes: 1024 * 1024,
    fileType: "pdf",
    folderId: "f-1",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    content: "شروط الدفع والنزاعات",
    signatureStatus: "signed",
    signedBy: "أمل السبيعي",
    ...overrides,
  };
}

const DOCS = [
  doc(),
  doc({
    id: "d2",
    docNo: "EDAS-2",
    title: "تقرير مالي",
    titleEn: "Financial report",
    categoryId: "finreport",
    fileType: "office",
    status: "pending",
    version: "2.0",
    size: "2 MB",
    owner: "سارة القحطاني",
    ownerEn: "Sara",
    modifiedAt: "2026-03-01",
    signatureStatus: "none",
    signedBy: undefined,
  }),
  doc({
    id: "d3",
    docNo: "EDAS-3",
    title: "مخطط هندسي",
    titleEn: "Engineering drawing",
    categoryId: "drawing",
    deptId: "fin",
    fileType: "cad",
    status: "draft",
    classification: "confidential",
    version: "1.2",
    size: "4 MB",
    owner: "ليلى",
    ownerEn: "Layla",
    modifiedAt: "2026-02-01",
    signatureStatus: "none",
    signedBy: undefined,
  }),
];

const DEPARTMENTS = [
  { id: "legal", name: "الشؤون القانونية", nameEn: "Legal" },
  { id: "fin", name: "الإدارة المالية", nameEn: "Finance" },
];

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    scopedDocs: DOCS,
    docsMeta: { loaded: DOCS.length, total: DOCS.length },
    docsReady: true,
    downloadDocument: vi.fn(),
    departments: { items: DEPARTMENTS },
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const app = { t: translator(lang), lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="loc">{location.pathname}</div>
      <div data-testid="state">{JSON.stringify(location.state)}</div>
    </>
  );
}

function renderPage(entries: Entry[] = ["/search"]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/search" element={<SearchResults />} />
        <Route path="/search/saved" element={<LocationProbe />} />
        <Route path="/search/advanced" element={<LocationProbe />} />
        <Route path="/documents/new" element={<LocationProbe />} />
        <Route path="/documents/:id" element={<LocationProbe />} />
        <Route path="/documents/:id/preview" element={<LocationProbe />} />
        <Route path="/documents/:id/edit" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function input(lang: "ar" | "en" = "ar") {
  return screen.getByLabelText((lang === "ar" ? AR : EN)["nav.search"]);
}

function scopeText(key: string, vars: Record<string, string | number> = {}) {
  let text = AR[key];
  for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
  return text;
}

function titleButtons(names: RegExp) {
  return screen.getAllByRole("button", { name: names }).map((button) => button.textContent);
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.list.mockReset();
  mocks.config.useApi = false;
});

describe("search results list", () => {
  it("renders the accessible rows with their metadata and badges", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(input()).toHaveValue("");
    expect(screen.getByText(scopeText("search.scope.all", { count: 3 }))).toBeInTheDocument();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("تقرير مالي")).toBeInTheDocument();
    expect(screen.getByText("مخطط هندسي")).toBeInTheDocument();
    expect(screen.getByText("EDAS-1")).toBeInTheDocument();
    expect(screen.getAllByText(/أمل السبيعي/).length).toBeGreaterThan(0);
    expect(screen.getByText("v2.0")).toBeInTheDocument();
    expect(screen.getByText("4 MB")).toBeInTheDocument();
    expect(screen.getByText(/✍︎ أمل السبيعي/)).toBeInTheDocument();
    expect(screen.getByText("نتيجة")).toBeInTheDocument();
  });

  it("opens the document, its preview and its editor from a row", () => {
    mockStore();
    mockApp();

    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/documents/d1");
    view.unmount();

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: AR["g.preview"] })[0]);
    expect(screen.getByTestId("loc")).toHaveTextContent("/documents/d1/preview");
  });

  it("downloads a row and opens the editor from its actions", () => {
    const store = mockStore();
    mockApp();

    const view = renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: AR["g.download"] })[1]);
    expect(store.downloadDocument).toHaveBeenCalledWith("d2");
    view.unmount();

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: AR["g.edit"] })[0]);
    expect(screen.getByTestId("loc")).toHaveTextContent("/documents/d1/edit");
  });

  it("switches to the grid and opens a card", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "عرض شبكة" }));
    expect(screen.getByRole("button", { name: "عرض شبكة" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("PDF").length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: AR["g.preview"] })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /مخطط هندسي/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/documents/d3");
  });

  it("sorts the results by the most recent update", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "ترتيب النتائج" }), { target: { value: "recent" } });

    expect(titleButtons(/^(عقد التوريد|تقرير مالي|مخطط هندسي)$/)).toEqual(["تقرير مالي", "مخطط هندسي", "عقد التوريد"]);
  });

  it("filters by department, type and status and clears them", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /الشؤون القانونية/ }));
    expect(screen.getByText("1 فلتر")).toBeInTheDocument();
    expect(screen.getByText("من أصل 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(screen.getByText("من أصل 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /معلقة للموافقة/ }));
    expect(screen.getByText("3 فلتر")).toBeInTheDocument();

    fireEvent.click(within(screen.getByText("نوع الملف").closest("div")!.parentElement!).getByRole("button", { name: "مسح" }));
    expect(screen.getByText("2 فلتر")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح كل الفلاتر" }));
    expect(screen.queryByText(/^\d+ فلتر$/)).toBeNull();
    expect(screen.getByText("نتيجة")).toBeInTheDocument();
  });

  it("searchs from the suggestions and clears the box with the shortcut focus", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "عقود" }));
    expect(input()).toHaveValue("عقود");
    expect(screen.getByRole("button", { name: "حفظ هذا البحث" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(input()).toHaveValue("");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(input());
  });

  it("explains the empty match state and requests access", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.change(input(), { target: { value: "zzzz-not-a-document" } });
    expect(screen.getByText("لا توجد نتائج مطابقة")).toBeInTheDocument();
    expect(screen.getByText("لا نتائج")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "طلب صلاحية وصول" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "info", title: "طلب صلاحية وصول" }));

    fireEvent.click(screen.getByRole("button", { name: "مسح الكل" }));
    expect(input()).toHaveValue("");
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
  });

  it("offers to add the first document when the repository is empty", () => {
    mockStore({ scopedDocs: [], docsMeta: { loaded: 0, total: 0 } });
    mockApp();
    renderPage();

    expect(screen.getByText(AR["search.emptyRepo.title"])).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: AR["search.emptyRepo.action"] }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/documents/new");
  });
});

describe("search results with prefilled state", () => {
  const entry = {
    pathname: "/search",
    state: {
      advancedQuery: "عقد",
      advancedConditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
      advancedFacets: { dept: ["legal"] },
    },
  };

  it("shows the applied conditions and saves the whole search", () => {
    mockStore();
    mockApp();
    renderPage([entry]);

    expect(input()).toHaveValue("عقد");
    expect(screen.getByText(AR["search.advancedActive"])).toBeInTheDocument();
    expect(screen.getAllByText(/معتمدة/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "حفظ هذا البحث" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/search/saved");
    const state = JSON.parse(screen.getByTestId("state").textContent ?? "{}");
    expect(state.prefillQuery).toBe("عقد");
    expect(state.prefillConditions).toHaveLength(1);
    expect(state.prefillFacets).toEqual({ dept: ["legal"], type: [], status: [], class: [] });
  });

  it("clears the advanced conditions and forwards them to the advanced screen", () => {
    mockStore();
    mockApp();

    const view = renderPage([entry]);
    fireEvent.click(screen.getByRole("button", { name: AR["search.clearAdvanced"] }));
    expect(screen.queryByText(AR["search.advancedActive"])).toBeNull();
    view.unmount();

    renderPage([entry]);
    fireEvent.click(screen.getByRole("button", { name: AR["nav.advancedSearch"] }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/search/advanced");
    const state = JSON.parse(screen.getByTestId("state").textContent ?? "{}");
    expect(state.prefillQuery).toBe("عقد");
    expect(state.prefillConditions).toHaveLength(1);
  });
});

describe("search results over the API", () => {
  function dto() {
    return {
      id: "srv-1",
      docNo: "EDAS-9001",
      title: "عقد موردين",
      titleEn: null,
      category: null,
      departmentId: "legal",
      sectionId: null,
      projectId: null,
      ownerName: "أمل",
      ownerNameEn: null,
      currentVersion: 1,
      classification: "INTERNAL",
      status: "APPROVED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      retentionEnd: "2031-01-01T00:00:00.000Z",
      sizeBytes: 1024,
      fileType: "application/pdf",
      folderId: null,
      tags: [],
      description: "النزاعات التعاقدية",
      checkedOutByName: null,
      signatureStatus: "NONE",
      signedByName: null,
      signedAt: null,
      isRecord: false,
    };
  }

  it("searches the server and reports the truncated result set", async () => {
    mocks.config.useApi = true;
    mockStore({ docsMeta: { loaded: 2, total: 5 } });
    mockApp();
    mocks.list.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({ items: [{ ...dto(), id: `srv-${page}` }], meta: { total: 42 } }),
    );

    renderPage();
    expect(screen.getByText(scopeText("search.scope.partial", { loaded: 2, total: 5 }))).toBeInTheDocument();

    fireEvent.change(input(), { target: { value: "عقد" } });
    expect(screen.getByText(scopeText("search.scope.server", { term: "عقد" }))).toBeInTheDocument();
    expect(screen.getAllByText(AR["search.searching"]).length).toBeGreaterThan(0);

    expect((await screen.findAllByText("موردين")).length).toBeGreaterThan(0);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ q: "عقد" }));
    expect(screen.getByText(scopeText("search.truncated", { shown: 5, total: 42 }))).toBeInTheDocument();
  });

  it("reports a server failure and retries the search", async () => {
    mocks.config.useApi = true;
    mockStore();
    mockApp();
    mocks.list.mockRejectedValueOnce(new Error("offline"));

    renderPage();
    fireEvent.change(input(), { target: { value: "عقد" } });

    expect(await screen.findByText(AR["search.error"])).toBeInTheDocument();

    mocks.list.mockResolvedValue({ items: [dto()], meta: { total: 1 } });
    fireEvent.click(screen.getByRole("button", { name: AR["err.retry"] }));

    expect(await screen.findByText("موردين")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(AR["search.error"])).toBeNull());
  });

  it("shows the scope loading state before the repository is ready", () => {
    mocks.config.useApi = true;
    mockStore({ docsReady: false });
    mockApp();
    renderPage();

    expect(screen.getByText(AR["search.loadingScope"])).toBeInTheDocument();
    expect(screen.getAllByText(AR["search.searching"]).length).toBeGreaterThan(0);
  });
});

describe("search results in English", () => {
  it("renders the toolbar, filters and empty state in English", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(input("en")).toHaveAttribute("placeholder", "Search titles, numbers, owners, and content…");
    expect(input("en")).toHaveAttribute("id", "search-results-query");
    expect(screen.getByRole("button", { name: "Save this search" })).toBeInTheDocument();
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("File type")).toBeInTheDocument();
    expect(screen.getByText("Classification")).toBeInTheDocument();
    expect(screen.getByText("Supply contract")).toBeInTheDocument();
  });

  it("renders the English no-match state and clears it", () => {
    mockStore();
    mockApp("en");
    renderPage();

    fireEvent.change(input("en"), { target: { value: "zzzz" } });
    expect(screen.getByText("No matching documents")).toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear everything" }));
    expect(input("en")).toHaveValue("");
    expect(screen.getByText("Supply contract")).toBeInTheDocument();
  });
});
