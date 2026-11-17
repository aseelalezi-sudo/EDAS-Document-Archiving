import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { AdvancedSearch } from "./search-advanced";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function doc(id: string, overrides: Partial<Document> = {}): Document {
  return {
    id,
    docNo: `EDAS-${id}`,
    title: `وثيقة ${id}`,
    titleEn: `Document ${id}`,
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "po",
    deptId: "legal",
    sectionId: "",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1 MB",
    fileType: "pdf",
    folderId: "f-1",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  } as Document;
}

const DOCS: Document[] = [
  doc("1", { title: "عقد التوريد", titleEn: "Supply contract", deptId: "legal", status: "approved", tags: ["عقد", "توريد"] }),
  doc("2", { title: "تقرير مالي", titleEn: "Financial report", deptId: "legal", status: "pending", fileType: "office", tags: ["تقرير"] }),
  doc("3", { title: "عقد الصيانة", titleEn: "Maintenance contract", deptId: "finance", status: "archived", fileType: "image" }),
  doc("4", { title: "عقد الإيجار", titleEn: "Lease contract", deptId: "exec", status: "approved" }),
  doc("5", { title: "عقد الاستشارة", titleEn: "Consultancy contract", deptId: "legal", status: "approved" }),
  doc("6", { title: "عقد النقل", titleEn: "Transport contract", deptId: "finance", status: "pending", fileType: "image" }),
  doc("7", { title: "عقد التجهيز", titleEn: "Equipment contract", deptId: "exec", status: "hold" }),
];

const DEPTS = [
  { id: "legal", name: "الشؤون القانونية", nameEn: "Legal Affairs" },
  { id: "finance", name: "الشؤون المالية", nameEn: "Finance" },
  { id: "exec", name: "الإدارة التنفيذية", nameEn: "Executive Management" },
];

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore() {
  const store = { scopedDocs: DOCS, departments: { items: DEPTS } };
  mocks.docs.mockReturnValue(store);
  return store;
}

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </div>
  );
}

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/search/advanced", state }]}>
      <Routes>
        <Route
          path="/search/advanced"
          element={
            <>
              <AdvancedSearch />
              <Probe />
            </>
          }
        />
        <Route path="/search" element={<Probe />} />
        <Route path="/search/saved" element={<Probe />} />
        <Route path="/documents/:id" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("advanced search", () => {
  it("renders every document until a condition narrows the result", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getByRole("heading", { name: t("nav.advancedSearch") })).toBeInTheDocument();
    expect(screen.getByText("شروط البحث")).toBeInTheDocument();
    expect(screen.getByText("7 مطابقة")).toBeInTheDocument();
    expect(screen.getByText("7 نتيجة")).toBeInTheDocument();
    expect(screen.getByText("الشروط النشطة:")).toBeInTheDocument();
    expect(screen.queryByText(/معاينة المطابقات/)).toBeNull();
    expect(screen.getByRole("button", { name: "حذف الشرط" })).toBeDisabled();
  });

  it("matches free text and hands the term to the results page", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "نص حر" }), { target: { value: "تقرير" } });
    expect(screen.getByText("1 مطابقة")).toBeInTheDocument();
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("g.search") }));
    expect(screen.getByTestId("location")).toHaveTextContent('/search|{"advancedQuery":"تقرير"}');
  });

  it("adds a condition, previews five matches and reports the overflow", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "إضافة شرط" }));
    const values = screen.getAllByPlaceholderText("القيمة…");
    expect(values).toHaveLength(2);
    fireEvent.change(values[1], { target: { value: "عقد" } });

    expect(screen.getByText("6 مطابقة")).toBeInTheDocument();
    expect(screen.getByText("معاينة المطابقات (5)")).toBeInTheDocument();
    expect(screen.getByText("+ 1 أخرى")).toBeInTheDocument();
    expect(screen.getByText("العنوان يحتوي عقد")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /EDAS-1·|EDAS-1/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/1|");
  });

  it("builds an OR group and removes individual conditions", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getAllByPlaceholderText("القيمة…")[0], { target: { value: "عقد" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة مجموعة OR" }));
    expect(screen.getAllByPlaceholderText("القيمة…")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "الرابط" })).toHaveValue("OR");

    fireEvent.change(screen.getAllByPlaceholderText("القيمة…")[1], { target: { value: "تقرير" } });
    expect(screen.getByText("7 مطابقة")).toBeInTheDocument();
    expect(screen.getByText(/OR العنوان يحتوي تقرير/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "حذف الشرط" })[1]);
    expect(screen.getAllByPlaceholderText("القيمة…")).toHaveLength(1);
    expect(screen.getByText("6 مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إضافة شرط" }));
    fireEvent.click(screen.getByRole("button", { name: t("g.clear") }));
    expect(screen.getByText("7 مطابقة")).toBeInTheDocument();
    expect(screen.queryByText(/العنوان يحتوي/)).toBeNull();
  });

  it("switches to a department select, then to equality and empty operators", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "الحقل" }), { target: { value: "dept" } });
    expect(screen.getByRole("combobox", { name: "المعامل" })).toHaveValue("eq");
    const value = screen.getByRole("combobox", { name: "القيمة" });
    expect(within(value).getByRole("option", { name: "الشؤون القانونية" })).toBeInTheDocument();
    fireEvent.change(value, { target: { value: "legal" } });
    expect(screen.getByText("3 مطابقة")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "المعامل" }), { target: { value: "neq" } });
    expect(screen.getByText(/لن تظهر الوثائق التي لا تحمل قيمة في هذا الحقل/)).toBeInTheDocument();
    expect(screen.getByText("4 مطابقة")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "المعامل" }), { target: { value: "empty" } });
    expect(screen.getByText("لا يحتاج قيمة")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "القيمة" })).toBeNull();
    expect(screen.getByText("0 مطابقة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("g.search") })).toBeDisabled();
  });

  it("offers translated status and file-type options", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "الحقل" }), { target: { value: "status" } });
    const value = screen.getByRole("combobox", { name: "القيمة" });
    expect(within(value).getByRole("option", { name: "معتمدة" })).toBeInTheDocument();
    expect(within(value).getByRole("option", { name: "تحت الحجز" })).toBeInTheDocument();
    fireEvent.change(value, { target: { value: "approved" } });
    expect(screen.getByText("3 مطابقة")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "الحقل" }), { target: { value: "type" } });
    const typeValue = screen.getByRole("combobox", { name: "القيمة" });
    expect(within(typeValue).getByRole("option", { name: "IMAGE" })).toBeInTheDocument();
    fireEvent.change(typeValue, { target: { value: "image" } });
    expect(screen.getByText("2 مطابقة")).toBeInTheDocument();
  });

  it("clears a search with no criteria straight to the results page", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.search") }));
    expect(screen.getByTestId("location")).toHaveTextContent("/search|null");
  });

  it("prefills saved conditions and keeps the edit reference when saving", () => {
    mockStore();
    const app = mockApp();
    renderPage({
      prefillQuery: "عقد",
      prefillConditions: [{ field: "status", op: "eq", value: "approved", connector: "AND" }],
      editId: "s-9",
      editName: "بحثي",
    });

    expect(screen.getByRole("combobox", { name: "الحقل" })).toHaveValue("status");
    expect(screen.getByRole("combobox", { name: "القيمة" })).toHaveValue("approved");
    expect(screen.getByText("3 مطابقة")).toBeInTheDocument();
    expect(screen.getByText("الحالة يساوي معتمدة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "حفظ البحث" }));
    const location = screen.getByTestId("location").textContent ?? "";
    expect(location).toContain("/search/saved|");
    expect(location).toContain('"prefillQuery":"عقد"');
    expect(location).toContain('"editId":"s-9"');
    expect(location).toContain('"editName":"بحثي"');
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "سمِّ بحثك" });
  });

  it("shows saved result facets and can clear them", () => {
    mockStore();
    const app = mockApp();
    renderPage({ prefillFacets: { type: ["image"] } });

    expect(screen.getByText("فلاتر نتائج محفوظة:")).toBeInTheDocument();
    expect(screen.getByText("نوع الملف: IMAGE")).toBeInTheDocument();
    expect(screen.getByText("2 مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("g.clear") }));
    expect(screen.queryByText("فلاتر نتائج محفوظة:")).toBeNull();
    expect(screen.getByText("7 مطابقة")).toBeInTheDocument();
    expect(app.toast).not.toHaveBeenCalled();
  });

  it("saves a plain free-text search from the footer", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "نص حر" }), { target: { value: "  عقد  " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ البحث" }));
    const location = screen.getByTestId("location").textContent ?? "";
    expect(location).toContain("/search/saved|");
    expect(location).toContain('"prefillQuery":"عقد"');
    expect(location).not.toContain("editId");
  });

  it("renders English labels and operators", () => {
    mockStore();
    mockApp("en");
    renderPage({ prefillQuery: "contract" });

    expect(screen.getByRole("heading", { name: "Advanced Search" })).toBeInTheDocument();
    expect(screen.getByText("Search conditions")).toBeInTheDocument();
    expect(screen.getByText("7 matches")).toBeInTheDocument();
    expect(screen.getByText("7 results")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Free text" })).toHaveValue("contract");
    expect(screen.getByRole("button", { name: "Add condition" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add OR group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save search" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Operator" })).toBeInTheDocument();
  });
});
