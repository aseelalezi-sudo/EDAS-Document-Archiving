import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    savedSearches: vi.fn(),
    createSavedSearch: vi.fn(),
    updateSavedSearch: vi.fn(),
    deleteSavedSearch: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { SavedSearches } from "./search-saved";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function doc(overrides: Record<string, unknown>) {
  return {
    id: "d",
    title: "",
    titleEn: "",
    docNo: "",
    owner: "",
    ownerEn: "",
    category: "",
    categoryEn: "",
    content: "",
    description: "",
    tags: [],
    deptId: "",
    status: "draft",
    classification: "internal",
    fileType: "pdf",
    version: "1",
    ...overrides,
  };
}

const DOCS = [
  doc({ id: "d1", title: "عقد التوريد", titleEn: "Supply contract", status: "approved", deptId: "legal", tags: ["عقود"] }),
  doc({
    id: "d2",
    title: "تقرير مالي",
    titleEn: "Financial report",
    status: "pending",
    deptId: "finance",
    fileType: "docx",
    classification: "confidential",
  }),
  doc({ id: "d3", title: "محضر اجتماع", titleEn: "Meeting minutes", status: "hold", deptId: "legal" }),
];

const EDIT_STATE = {
  editId: "s1",
  editName: "العقود النشطة هذا العام",
  prefillQuery: "عقد",
  prefillConditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
  prefillFacets: { dept: [], type: [], status: ["approved"], class: [] },
};

const API_DTO = {
  id: "sr-1",
  name: "بحث API",
  query: {
    q: "عقد",
    conditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
    facets: { dept: [], type: [], status: ["approved"], class: [] },
  },
  createdAt: "2026-02-01T10:00:00.000Z",
};

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    toast: vi.fn(),
    user: { name: "أمل السبيعي" },
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  mocks.docs.mockReturnValue({
    scopedDocs: DOCS,
    docsMeta: { loaded: 0, total: 5 },
    ...overrides,
  });
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}|{JSON.stringify(location.state ?? null)}
    </div>
  );
}

function renderPage(state?: Record<string, unknown>) {
  const entries = state ? [{ pathname: "/saved-searches", state }] : ["/saved-searches"];
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route
          path="/saved-searches"
          element={
            <>
              <SavedSearches />
              <LocationProbe />
            </>
          }
        />
        <Route path="/search" element={<LocationProbe />} />
        <Route path="/search/advanced" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function statValue(label: string) {
  return screen.getByText(label, { selector: "p" }).previousElementSibling?.textContent;
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "حفظ بحث جديد" }));
  return screen.getByRole("dialog", { name: "حفظ بحث" });
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
  mockStore();
});

describe("saved searches offline", () => {
  it("renders seeded searches with stats and summaries", () => {
    mockApp();
    renderPage();

    expect(screen.getAllByText("عمليات البحث المحفوظة").length).toBeGreaterThan(0);
    expect(screen.getByText("العقود النشطة هذا العام")).toBeInTheDocument();
    expect(screen.getByText("تقارير مالية معلقة")).toBeInTheDocument();
    expect(screen.getByText("وثائق تحت الحجز القانوني")).toBeInTheDocument();

    expect(statValue("إجمالي المحفوظة")).toBe("3");
    expect(statValue("بشروط متقدمة")).toBe("3");
    expect(statValue("بفلاتر نتائج")).toBe("0");
    expect(statValue("إجمالي النتائج")).toBe("3");

    expect(screen.getAllByText("1 نتيجة")).toHaveLength(3);
    expect(screen.getByText("خاص")).toBeInTheDocument();
    expect(screen.getAllByText("مشترك")).toHaveLength(2);
    expect(screen.getAllByText("الحالة يساوي معتمدة").length).toBeGreaterThan(0);
    expect(screen.getByText("الحالة يساوي تحت الحجز")).toBeInTheDocument();
    expect(screen.getAllByText(/2026-01-2/).length).toBeGreaterThan(0);
  });

  it("runs a saved search and navigates to the results page", () => {
    mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "تشغيل" })[0]);
    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("/search|");
    expect(location).toHaveTextContent("advancedQuery");
    expect(location).toHaveTextContent("عقد");
  });

  it("navigates to the advanced builder with the row prefilled", () => {
    mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "تعديل" })[0]);
    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("/search/advanced|");
    expect(location).toHaveTextContent("editId");
    expect(location).toHaveTextContent("العقود النشطة هذا العام");
  });

  it("creates a saved search with a live preview", () => {
    const app = mockApp();
    renderPage();

    const dialog = openCreate();
    expect(within(dialog).getByRole("button", { name: "حفظ" })).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("العقود النشطة"), { target: { value: "بحث اختبار" } });
    fireEvent.change(within(dialog).getByPlaceholderText("مثال: عقود، معلقة"), { target: { value: "محضر" } });
    expect(within(dialog).getByText(/وثيقة تطابق هذا الاستعلام/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ البحث", message: "بحث اختبار" });
    expect(screen.getByText("بحث اختبار")).toBeInTheDocument();
    expect(statValue("إجمالي المحفوظة")).toBe("4");
  });

  it("opens the editor prefilled from the advanced search and updates the row", () => {
    const app = mockApp();
    renderPage(EDIT_STATE);

    const dialog = screen.getByRole("dialog", { name: "تعديل البحث المحفوظ" });
    expect(within(dialog).getByText("الحفظ يستبدل هذا البحث المحفوظ ولا يُنشئ بحثاً جديداً.")).toBeInTheDocument();
    expect(within(dialog).getByText(t("search.advancedActive"))).toBeInTheDocument();
    expect(within(dialog).getByText("الحالة: معتمدة")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByDisplayValue("العقود النشطة هذا العام"), { target: { value: "العقود المعتمدة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تحديث البحث", message: "العقود المعتمدة" });
    expect(screen.getByText("العقود المعتمدة")).toBeInTheDocument();
    expect(screen.queryByText("العقود النشطة هذا العام")).not.toBeInTheDocument();
    expect(statValue("بفلاتر نتائج")).toBe("1");
  });

  it("prefills a new search from the query parameter state", () => {
    mockApp();
    renderPage({ prefillQuery: "محضر" });

    const dialog = screen.getByRole("dialog", { name: "حفظ بحث" });
    expect(within(dialog).getByDisplayValue("محضر")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "حفظ" })).toBeDisabled();
    expect(within(dialog).getByText(/وثيقة تطابق هذا الاستعلام/)).toBeInTheDocument();
  });

  it("duplicates, shares and unshares a saved search", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "مشاركة" })[0]);
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تمت المشاركة مع القسم", message: "العقود النشطة هذا العام" });
    expect(screen.getAllByText("مشترك")).toHaveLength(3);

    fireEvent.click(screen.getAllByRole("button", { name: "إلغاء المشاركة" })[0]);
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم إلغاء المشاركة", message: "العقود النشطة هذا العام" });
    expect(screen.getAllByText("مشترك")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "نسخ" })[0]);
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم النسخ", message: "العقود النشطة هذا العام" });
    expect(screen.getByText("العقود النشطة هذا العام (نسخة)")).toBeInTheDocument();
    expect(statValue("إجمالي المحفوظة")).toBe("4");
  });

  it("deletes a saved search after confirmation", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "حذف" })[1]);
    const dialog = screen.getByRole("dialog", { name: "حذف البحث المحفوظ؟" });
    expect(within(dialog).getByText(/تقارير مالية معلقة/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف" }));

    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم الحذف", message: "تقارير مالية معلقة" });
    expect(screen.queryByText("تقارير مالية معلقة")).not.toBeInTheDocument();
    expect(statValue("إجمالي المحفوظة")).toBe("2");
  });

  it("renders English labels", () => {
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Saved Searches").length).toBeGreaterThan(0);
    expect(screen.getByText("Active contracts this year")).toBeInTheDocument();
    expect(statValue("Total saved")).toBe("3");
    expect(statValue("Total results")).toBe("3");
    expect(screen.getAllByText("1 results")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "New saved search" })).toBeInTheDocument();
  });
});

describe("saved searches against the API", () => {
  beforeEach(() => {
    mocks.config.useApi = true;
    mocks.api.savedSearches.mockResolvedValue({ items: [API_DTO] });
    mocks.api.createSavedSearch.mockResolvedValue({});
    mocks.api.updateSavedSearch.mockResolvedValue({});
    mocks.api.deleteSavedSearch.mockResolvedValue({});
    mockStore({ docsMeta: { loaded: 2, total: 5 } });
  });

  it("loads saved searches, counts results and shows the partial-data hint", async () => {
    mockApp();
    renderPage();

    expect(await screen.findByText("بحث API")).toBeInTheDocument();
    expect(screen.getByText("أعداد النتائج محسوبة على 2 من أصل 5 وثيقة محمّلة في هذه الجلسة.")).toBeInTheDocument();
    expect(screen.getAllByText("1 نتيجة")).toHaveLength(1);
    expect(screen.getByText(/أُنشئ في 2026-02-01/)).toBeInTheDocument();
    expect(screen.getByText(/بواسطة أمل السبيعي/)).toBeInTheDocument();
  });

  it("creates a saved search through the API and reloads", async () => {
    const app = mockApp();
    renderPage();
    await screen.findByText("بحث API");

    const dialog = openCreate();
    fireEvent.change(within(dialog).getByPlaceholderText("العقود النشطة"), { target: { value: "بحث جديد" } });
    fireEvent.change(within(dialog).getByPlaceholderText("مثال: عقود، معلقة"), { target: { value: "محضر" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(mocks.api.createSavedSearch).toHaveBeenCalledWith({ name: "بحث جديد", query: { q: "محضر" } }));
    await waitFor(() => expect(mocks.api.savedSearches).toHaveBeenCalledTimes(2));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ البحث", message: "بحث جديد" });
  });

  it("updates an existing saved search through the API", async () => {
    const app = mockApp();
    renderPage(EDIT_STATE);

    await waitFor(() => expect(mocks.api.savedSearches).toHaveBeenCalled());
    const dialog = screen.getByRole("dialog", { name: "تعديل البحث المحفوظ" });
    fireEvent.change(within(dialog).getByDisplayValue("العقود النشطة هذا العام"), { target: { value: "العقود المعتمدة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    await waitFor(() =>
      expect(mocks.api.updateSavedSearch).toHaveBeenCalledWith("s1", {
        name: "العقود المعتمدة",
        query: {
          q: "عقد",
          conditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
          facets: { dept: [], type: [], status: ["approved"], class: [] },
        },
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تحديث البحث", message: "العقود المعتمدة" });
  });

  it("duplicates and deletes saved searches through the API", async () => {
    const app = mockApp();
    renderPage();
    await screen.findByText("بحث API");

    fireEvent.click(screen.getByRole("button", { name: "نسخ" }));
    await waitFor(() =>
      expect(mocks.api.createSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ name: "بحث API (نسخة)", query: expect.objectContaining({ q: "عقد" }) }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    const dialog = screen.getByRole("dialog", { name: "حذف البحث المحفوظ؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف" }));
    await waitFor(() => expect(mocks.api.deleteSavedSearch).toHaveBeenCalledWith("sr-1"));
    await waitFor(() => expect(mocks.api.savedSearches).toHaveBeenCalledTimes(3));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم الحذف", message: "بحث API" });
  });

  it("reports load and delete failures from the API", async () => {
    mocks.api.savedSearches.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ items: [] });
    const app = mockApp();
    renderPage();

    expect(await screen.findByText("لا توجد عمليات بحث محفوظة")).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") });

    fireEvent.click(screen.getByRole("button", { name: "الانتقال للبحث المتقدم" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/search/advanced|");
  });

  it("reports a failed delete and keeps the row", async () => {
    mocks.api.deleteSavedSearch.mockRejectedValue(new Error("in use"));
    const app = mockApp();
    renderPage();
    await screen.findByText("بحث API");

    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف البحث المحفوظ؟" })).getByRole("button", { name: "حذف" }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByText("بحث API")).toBeInTheDocument();
  });

  it("reports a failed duplicate", async () => {
    mocks.api.createSavedSearch.mockRejectedValue(new Error("nope"));
    const app = mockApp();
    renderPage();
    await screen.findByText("بحث API");

    fireEvent.click(screen.getByRole("button", { name: "نسخ" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
  });
});
