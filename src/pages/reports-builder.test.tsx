import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, Document, ErrorItem, RetentionItem, TaskItem } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../components/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/shared")>();
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

import { ReportBuilder } from "./reports-builder";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function t(lang: "ar" | "en" = "ar") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string) => dict[key] ?? key;
}

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    docNo: "EDAS-2026001",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "po",
    deptId: "legal",
    sectionId: "",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "archived",
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

const secondDoc = doc({
  id: "doc-2",
  docNo: "EDAS-2026002",
  title: "محضر اجتماع",
  titleEn: "Minutes",
  category: "محاضر",
  categoryEn: "Minutes",
  deptId: "hr",
  owner: "خالد العتيبي",
  ownerEn: "Khalid",
  classification: "public",
  status: "draft",
});

const audit: AuditEntry = {
  id: "a1",
  datetime: "2026-03-01 10:00",
  user: "أمل السبيعي",
  module: "الوثائق",
  action: "رفع وثيقة",
  entityType: "Document",
  entityId: "doc-1",
  deptId: "legal",
  ip: "10.0.0.1",
  result: "success",
  correlation: "c-1",
  detail: "",
};

const errorItem: ErrorItem = {
  id: "e1",
  datetime: "2026-03-02 11:00",
  severity: "high",
  code: "E_UPLOAD",
  module: "الوثائق",
  path: "/documents",
  message: "فشل الرفع",
  affectedUser: "أمل السبيعي",
  correlation: "c-2",
  status: "new",
  owner: "الفريق التقني",
};

const retentionItem: RetentionItem = {
  id: "ret-1",
  docTitle: "وثيقة منتهية",
  docNo: "EDAS-2025001",
  policy: "احتفاظ 5 سنوات",
  retentionEnd: "2025-12-31",
  deptId: "legal",
  owner: "أمل السبيعي",
  onHold: false,
  proposedAction: "مراجعة",
  proposedActionEn: "Review",
  daysLeft: -3,
  reviewStatus: "pending",
};

const task: TaskItem = {
  id: "t1",
  docTitle: "عقد التوريد",
  docNo: "EDAS-2026001",
  workflow: "اعتماد العقود",
  step: "مراجعة قانونية",
  from: "أمل السبيعي",
  deptId: "legal",
  priority: "high",
  due: "2026-01-10",
  slaStatus: "breached",
  age: "6 أيام",
  status: "assigned",
};

function mockApp(lang: "ar" | "en" = "ar") {
  const toast = vi.fn();
  mocks.app.mockReturnValue({
    t: t(lang),
    lang,
    toast,
    user: { id: "u-1", name: "أمل السبيعي" },
  });
  return toast;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    scopedDocs: [doc(), secondDoc],
    tasks: [task],
    auditLog: [audit],
    retention: [retentionItem],
    errors: { items: [errorItem] },
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportBuilder />
    </MemoryRouter>,
  );
}

function goToStep(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^\\d*\\s*${name}$`) }));
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: AR["g.next"] }));
}

function filterValues() {
  return screen.getAllByPlaceholderText("القيمة…");
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.downloadCsv.mockReset();
});

describe("data sources", () => {
  it("starts on documents and summarises the live figures", () => {
    mockApp();
    mockStore();
    renderPage();

    expect(screen.getAllByText("الوثائق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 سجل").length).toBeGreaterThan(0);
    expect(screen.getByText("2 نتيجة")).toBeInTheDocument();
    expect(screen.getByText("4 حقل")).toBeInTheDocument();
    expect(screen.getByText("البيانات تتحدث فورياً مع كل تغيير")).toBeInTheDocument();
  });

  it("switches to every other source and resets the fields and filters", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep(AR["g.filter"]);
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));
    expect(screen.getByText("1 فلتر")).toBeInTheDocument();

    goToStep("مصدر البيانات");
    fireEvent.click(screen.getByRole("button", { name: /سجلات النشاط/ }));

    expect(screen.getAllByText("سجلات النشاط").length).toBeGreaterThan(0);
    expect(screen.queryByText("1 فلتر")).toBeNull();
    expect(screen.getByText("4 حقل")).toBeInTheDocument();
    expect(screen.getAllByText("1 سجل").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /سجلات الأخطاء/ }));
    expect(screen.getAllByText("سجلات الأخطاء").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /مسارات العمل/ }));
    expect(screen.getAllByText("مسارات العمل").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /عناصر الاحتفاظ/ }));
    expect(screen.getAllByText("عناصر الاحتفاظ").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^الوثائق/ }));
    expect(screen.getAllByText("2 سجل").length).toBeGreaterThan(0);
  });

  it("feeds every source through the field map and the table", () => {
    mockApp();
    mockStore();
    renderPage();

    const sources: [string, string][] = [
      ["سجلات النشاط", "الوقت"],
      ["سجلات الأخطاء", "الخطورة"],
      ["مسارات العمل", "الوثيقة"],
      ["عناصر الاحتفاظ", "السياسة"],
    ];

    for (const [source, header] of sources) {
      goToStep("مصدر البيانات");
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${source}`) }));

      goToStep("الحقول");
      const available = screen.getByText("الحقول المتاحة").parentElement as HTMLElement;
      for (const button of within(available).getAllByRole("button")) {
        if (button.getAttribute("aria-pressed") === "false") fireEvent.click(button);
      }

      goToStep("نوع العرض");
      fireEvent.click(screen.getByRole("button", { name: "جدول" }));
      goToStep("المعاينة");

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByText(header).length).toBeGreaterThan(0);
    }
  });
});

describe("the stepper", () => {
  it("walks forwards and backwards between the six steps", () => {
    mockApp();
    mockStore();
    renderPage();

    expect(screen.getByRole("button", { name: AR["g.previous"] })).toBeDisabled();
    next();
    expect(screen.getByText("الحقول المتاحة")).toBeInTheDocument();

    next();
    expect(screen.getByText("لا فلاتر — يتم عرض كل السجلات")).toBeInTheDocument();

    next();
    expect(screen.getByText("معاينة التجميع")).toBeInTheDocument();

    next();
    expect(screen.getByText("جدول")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["g.next"] })).toBeInTheDocument();

    next();
    expect(screen.getByText("اسم التقرير")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: AR["g.next"] })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: AR["g.previous"] }));
    expect(screen.getByRole("button", { name: AR["g.next"] })).toBeInTheDocument();
  });

  it("jumps straight to a step from its chip", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep("نوع العرض");
    expect(screen.getByText("دائري")).toBeInTheDocument();

    goToStep(AR["g.filter"]);
    expect(screen.getByText("لا فلاتر — يتم عرض كل السجلات")).toBeInTheDocument();
  });
});

describe("fields", () => {
  it("toggles fields, numbers them and blocks the next step without any", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep("الحقول");

    const available = screen.getByText("الحقول المتاحة").parentElement as HTMLElement;
    const title = within(available).getByRole("button", { name: /العنوان/ });
    expect(title).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(title);
    expect(title).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 حقل")).toBeInTheDocument();

    fireEvent.click(title);
    expect(screen.getByText("4 حقل")).toBeInTheDocument();

    for (const label of ["رقم الوثيقة", "العنوان", "الإدارة", "الحالة"]) {
      fireEvent.click(within(available).getByRole("button", { name: new RegExp(`^${label}`) }));
    }

    expect(screen.getByText("اختر حقلاً واحداً على الأقل")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["g.next"] })).toBeDisabled();
  });

  it("reorders the columns and stops at both ends", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep("الحقول");

    const up = screen.getAllByLabelText("نقل لأعلى");
    const down = screen.getAllByLabelText("نقل لأسفل");
    expect(up[0]).toBeDisabled();
    expect(down[down.length - 1]).toBeDisabled();

    const order = () => (screen.getByText("ترتيب الأعمدة").parentElement as HTMLElement).textContent ?? "";
    expect(order().indexOf("رقم الوثيقة")).toBeLessThan(order().indexOf("العنوان"));

    fireEvent.click(down[0]);
    expect(order().indexOf("العنوان")).toBeLessThan(order().indexOf("رقم الوثيقة"));

    fireEvent.click(screen.getAllByLabelText("نقل لأعلى")[1]);
    expect(order().indexOf("رقم الوثيقة")).toBeLessThan(order().indexOf("العنوان"));
  });

  it("speaks English in the field list", () => {
    mockApp("en");
    mockStore();
    renderPage();

    goToStep("Fields");

    expect(screen.getByText("Available fields")).toBeInTheDocument();
    expect(screen.getByText("Column order")).toBeInTheDocument();
    expect(screen.getAllByText("Document No.").length).toBe(2);
  });
});

describe("filters", () => {
  it("adds, edits and removes a rule with a live match count", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep(AR["g.filter"]);
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));

    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByText("1 فلتر")).toBeInTheDocument();

    fireEvent.change(filterValues()[0], { target: { value: "EDAS-2026001" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "neq" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "title" } });
    expect(filterValues()[0]).toHaveValue("");

    fireEvent.change(filterValues()[0], { target: { value: "عقد" } });
    expect(screen.getByText("2 نتيجة")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "starts" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(filterValues()[0], { target: { value: "ق" } });
    expect(screen.getByText("0 نتيجة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "حذف الفلتر" }));
    expect(screen.getByText("لا فلاتر — يتم عرض كل السجلات")).toBeInTheDocument();
  });

  it("matches a value with equals and contains", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep(AR["g.filter"]);
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "title" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "eq" } });
    fireEvent.change(filterValues()[0], { target: { value: "عقد التوريد" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(filterValues()[0], { target: { value: "محضر اجتماع" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "contains" } });
    fireEvent.change(filterValues()[0], { target: { value: "محضر" } });
    expect(screen.getByText("1 نتيجة")).toBeInTheDocument();

    fireEvent.change(filterValues()[0], { target: { value: "غير موجود" } });
    expect(screen.getByText("0 نتيجة")).toBeInTheDocument();
  });

  it("clears every rule at once", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep(AR["g.filter"]);
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));
    expect(screen.getAllByRole("combobox")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: AR["g.clear"] }));
    expect(screen.getByText("لا فلاتر — يتم عرض كل السجلات")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: AR["g.clear"] })).toBeNull();
  });

  it("offers the operators and fields in English", () => {
    mockApp("en");
    mockStore();
    renderPage();

    goToStep("Filter");
    fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));

    expect(screen.getByRole("option", { name: "equals" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "starts with" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Value…")).toBeInTheDocument();
    expect(screen.getByText("1 filters")).toBeInTheDocument();
  });
});

describe("grouping and charts", () => {
  it("recounts the buckets by the chosen field and sorts them", () => {
    mockApp();
    mockStore({ scopedDocs: [doc(), secondDoc, doc({ id: "doc-3", docNo: "EDAS-2026003", deptId: "legal" })] });
    renderPage();

    goToStep("التجميع");

    const preview = screen.getByText("معاينة التجميع").parentElement as HTMLElement;
    expect(within(preview).getByText("الشؤون القانونية")).toBeInTheDocument();
    expect(within(preview).getByText("2")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "status" } });
    expect(within(preview).getByText("مؤرشفة")).toBeInTheDocument();
    expect(within(preview).getByText("مسودة")).toBeInTheDocument();
  });

  it("shows no data when the source is empty", () => {
    mockApp();
    mockStore({ tasks: [] });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /مسارات العمل/ }));
    goToStep("التجميع");

    expect(screen.getByText("لا بيانات")).toBeInTheDocument();
  });

  it("previews every chart type and keeps the table readable", () => {
    mockApp();
    const docs = Array.from({ length: 10 }, (_, index) =>
      doc({ id: `doc-${index}`, docNo: `EDAS-20260${10 + index}`, title: `وثيقة ${index}`, deptId: index % 2 ? "hr" : "legal" }),
    );
    mockStore({ scopedDocs: docs });
    renderPage();

    goToStep("نوع العرض");
    for (const label of ["أعمدة", "خطي", "دائري"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      goToStep("المعاينة");
      expect(screen.getByText(/الرسم البياني/)).toBeInTheDocument();
      goToStep("نوع العرض");
    }

    fireEvent.click(screen.getByRole("button", { name: "جدول" }));
    goToStep("المعاينة");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("عرض أول 8 من 10 سجل")).toBeInTheDocument();
  });

  it("explains an empty result set", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep(AR["g.filter"]);
    fireEvent.click(screen.getByRole("button", { name: /إضافة فلتر/ }));
    fireEvent.change(filterValues()[0], { target: { value: "لا يطابق" } });

    goToStep("المعاينة");

    expect(screen.getByText("لا نتائج")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/الرسم البياني/)).toBeNull();
  });
});

describe("saving and exporting", () => {
  it("saves a named report into the browser and clears the name", () => {
    const toast = mockApp();
    mockStore();
    renderPage();

    goToStep("المعاينة");
    const name = screen.getByPlaceholderText("مثال: وثائق المالية المعتمدة");
    expect(screen.getByRole("button", { name: "حفظ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "حفظ التقرير" })).toBeDisabled();

    fireEvent.change(name, { target: { value: "تقرير العقود" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التقرير", message: "تقرير العقود" });
    expect(name).toHaveValue("");
    expect(screen.getByText("التقارير المحفوظة")).toBeInTheDocument();
    expect(screen.getByText("تقرير العقود")).toBeInTheDocument();
    expect(screen.getAllByText(/2 سجل/).length).toBeGreaterThan(1);

    const saved = JSON.parse(localStorage.getItem("edas.v1.reportBuilderSaved") ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "تقرير العقود", count: 2, source: "documents" });
  });

  it("saves from the footer button as well", () => {
    mockApp();
    mockStore();
    renderPage();

    goToStep("المعاينة");
    fireEvent.change(screen.getByPlaceholderText("مثال: وثائق المالية المعتمدة"), { target: { value: "تقرير ثانٍ" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التقرير" }));

    expect(screen.getByText("تقرير ثانٍ")).toBeInTheDocument();
  });

  it("exports the live rows, named or by source", () => {
    const toast = mockApp();
    mockStore();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }));
    expect(mocks.downloadCsv).toHaveBeenCalledWith("documents.csv", expect.any(Array));
    expect(mocks.downloadCsv.mock.calls[0][1]).toHaveLength(2);
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم تنزيل CSV", message: "2 صف" });

    goToStep("المعاينة");
    fireEvent.change(screen.getByPlaceholderText("مثال: وثائق المالية المعتمدة"), { target: { value: "تقريري" } });
    fireEvent.click(screen.getAllByRole("button", { name: "تصدير CSV" })[0]);

    expect(mocks.downloadCsv).toHaveBeenLastCalledWith("تقريري.csv", expect.any(Array));
  });

  it("exports and removes a saved report, ignoring an empty one", () => {
    const toast = mockApp();
    localStorage.setItem(
      "edas.v1.reportBuilderSaved",
      JSON.stringify([
        { id: "rb-1", name: "تقرير قديم", by: "أمل", at: "2026-03-01", source: "documents", count: 1, rows: [{ "رقم الوثيقة": "EDAS-1" }] },
        { id: "rb-2", name: "تقرير فارغ", by: "أمل", at: "2026-03-02", source: "documents", count: 0, rows: [] },
      ]),
    );
    mockStore();
    renderPage();

    const rows = screen.getAllByRole("button", { name: "تصدير" });

    fireEvent.click(rows[1]);
    expect(mocks.downloadCsv).not.toHaveBeenCalled();

    fireEvent.click(rows[0]);
    expect(mocks.downloadCsv).toHaveBeenCalledWith("تقرير قديم.csv", [{ "رقم الوثيقة": "EDAS-1" }]);
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم تنزيل CSV", message: "1 صف" });

    fireEvent.click(screen.getAllByRole("button", { name: "حذف التقرير المحفوظ" })[0]);
    expect(screen.queryByText("تقرير قديم")).toBeNull();
    expect(screen.getByText("تقرير فارغ")).toBeInTheDocument();
  });

  it("speaks English on the preview and in the toast", () => {
    const toast = mockApp("en");
    mockStore();
    renderPage();

    goToStep("Preview");
    expect(screen.getByText("Report name")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Export CSV" })[0]).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Approved Finance docs"), { target: { value: "Contracts" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(toast).toHaveBeenCalledWith({ type: "success", title: "Report saved", message: "Contracts" });
    expect(screen.getByText("Saved reports")).toBeInTheDocument();
    expect(screen.getByText("These reports are stored in this browser and are not saved on the server.")).toBeInTheDocument();
  });

  it("keeps the saved reports across a remount", async () => {
    mockApp();
    mockStore();
    const view = renderPage();

    goToStep("المعاينة");
    fireEvent.change(screen.getByPlaceholderText("مثال: وثائق المالية المعتمدة"), { target: { value: "دائم" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(localStorage.getItem("edas.v1.reportBuilderSaved")).toContain("دائم"));

    view.unmount();
    renderPage();

    expect(screen.getByText("دائم")).toBeInTheDocument();
  });
});
