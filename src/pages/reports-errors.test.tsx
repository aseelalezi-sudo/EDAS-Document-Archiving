import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorItem } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { Errors } from "./reports-errors";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function errorItem(overrides: Partial<ErrorItem> = {}): ErrorItem {
  return {
    id: "e-1",
    datetime: "2026-03-02 11:00",
    severity: "critical",
    code: "E_UPLOAD",
    module: "الوثائق",
    path: "/documents",
    message: "فشل رفع الوثيقة",
    affectedUser: "أمل السبيعي",
    correlation: "c-2",
    status: "new",
    owner: "الفريق التقني",
    ...overrides,
  };
}

const ERRORS = [
  errorItem({ notes: [{ by: "سابق", text: "ملاحظة قديمة", at: "09:00" }] }),
  errorItem({
    id: "e-2",
    code: "E_AUTH",
    module: "المصادقة",
    path: "/auth/login",
    message: "رفض تسجيل الدخول",
    severity: "high",
    status: "investigating",
    owner: "—",
    affectedUser: "خالد العتيبي",
  }),
  errorItem({
    id: "e-3",
    code: "E_REPORT",
    module: "الوثائق",
    path: "/reports",
    message: "تعذر إنشاء التقرير",
    severity: "medium",
    status: "resolved",
    owner: "خالد العتيبي",
  }),
  errorItem({
    id: "e-4",
    code: "E_SYNC",
    module: "التقارير",
    path: "/reports/runs",
    message: "فشل المزامنة",
    severity: "low",
    status: "ignored",
    owner: "—",
    affectedUser: "سارة",
  }),
];

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    user: { name: "أمل السبيعي" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    errors: { items: ERRORS },
    users: { items: [{ name: "أمل السبيعي" }, { name: "خالد العتيبي" }, { name: "أمل السبيعي" }] },
    setErrorStatus: vi.fn(),
    assignError: vi.fn(),
    addErrorNote: vi.fn(),
    clearErrors: vi.fn(),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Errors />
    </MemoryRouter>,
  );
}

function openRowMenu(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[index]);
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("error center", () => {
  it("renders the stats, notice and error table", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.errors")).length).toBeGreaterThan(0);
    expect(screen.getByText("4 من 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /جديدة/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /حرجة/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /قيد التحقيق/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /محلولة/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /أكثر وحدة/ })).toHaveTextContent("الوثائق");
    expect(screen.getByText("E_UPLOAD")).toBeInTheDocument();
    expect(screen.getByText("فشل رفع الوثيقة")).toBeInTheDocument();
    expect(screen.getAllByText("حرج").length).toBeGreaterThan(1);
    expect(screen.getAllByText("جديد").length).toBeGreaterThan(1);
  });

  it("filters by search text and clears it", () => {
    mockStore();
    mockApp();
    renderPage();

    const search = screen.getByPlaceholderText("ابحث في الأخطاء…");
    fireEvent.change(search, { target: { value: "E_AUTH" } });
    expect(screen.getByText("1 من 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "خالد" } });
    expect(screen.getByText("2 من 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد أخطاء مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByText("4 من 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "لا يوجد" } });
    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    expect(screen.getByText("4 من 4")).toBeInTheDocument();
  });

  it("filters from the clickable stat cards", () => {
    mockStore();
    mockApp();
    renderPage();

    const fresh = screen.getByRole("button", { name: /جديدة/ });
    fireEvent.click(fresh);
    expect(fresh).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 من 4")).toBeInTheDocument();
    fireEvent.click(fresh);
    expect(screen.getByText("4 من 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /قيد التحقيق/ }));
    expect(screen.getByText("1 من 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /حرجة/ }));
    expect(screen.getByText("1 من 4")).toBeInTheDocument();
  });

  it("filters by severity and status selects", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الخطورة" }), { target: { value: "high" } });
    expect(screen.getByText("1 من 4")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الحالة" }), { target: { value: "resolved" } });
    expect(screen.getByText("0 من 4")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الخطورة" }), { target: { value: "all" } });
    expect(screen.getByText("1 من 4")).toBeInTheDocument();
    expect(screen.getByText("E_REPORT")).toBeInTheDocument();
  });

  it("opens the details dialog with data, assignment and notes", () => {
    const store = mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("E_UPLOAD"));
    const dialog = screen.getByRole("dialog", { name: "تفاصيل الخطأ" });

    expect(within(dialog).getByText("بيانات الخطأ")).toBeInTheDocument();
    expect(within(dialog).getByText("/documents")).toBeInTheDocument();
    expect(within(dialog).getByText("c-2")).toBeInTheDocument();
    expect(within(dialog).getByText("ملاحظات داخلية (1)")).toBeInTheDocument();
    expect(within(dialog).getByText("ملاحظة قديمة")).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole("button", { name: /خالد العتيبي/ })[0]);
    expect(store.assignError).toHaveBeenCalledWith("e-1", "خالد العتيبي");
    expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith({ type: "info", title: "تم التعيين", message: "خالد العتيبي" });

    const note = within(dialog).getByPlaceholderText("أضف ملاحظة…");
    fireEvent.change(note, { target: { value: "  تمت المراجعة  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة" }));
    expect(store.addErrorNote).toHaveBeenCalledWith("e-1", expect.objectContaining({ by: "أمل السبيعي", text: "تمت المراجعة" }));
    expect(within(dialog).getByText("ملاحظات داخلية (2)")).toBeInTheDocument();
    expect(within(dialog).getByText("تمت المراجعة")).toBeInTheDocument();
    expect(note).toHaveValue("");

    fireEvent.change(note, { target: { value: "سطر ثالث" } });
    fireEvent.keyDown(note, { key: "Enter" });
    expect(store.addErrorNote).toHaveBeenCalledTimes(2);
  });

  it("updates the status from the dialog and resolves it", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByText("E_UPLOAD"));
    const dialog = screen.getByRole("dialog", { name: "تفاصيل الخطأ" });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "investigating" } });
    expect(store.setErrorStatus).toHaveBeenCalledWith("e-1", "investigating");
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم تحديث الحالة", message: "قيد التحقيق" });

    fireEvent.click(within(dialog).getByRole("button", { name: "حل" }));
    expect(store.setErrorStatus).toHaveBeenCalledWith("e-1", "resolved");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تحديث الحالة", message: "محلول" });
    expect(screen.queryByRole("dialog", { name: "تفاصيل الخطأ" })).toBeNull();
  });

  it("changes status and assigns from the row menu", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    expect(screen.queryByRole("menuitem", { name: "بدء التحقيق" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "تحديد كمحلول" }));
    expect(store.setErrorStatus).toHaveBeenCalledWith("e-1", "resolved");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تحديث الحالة", message: "محلول" });

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "تجاهل" }));
    expect(store.setErrorStatus).toHaveBeenCalledWith("e-2", "ignored");
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم تحديث الحالة", message: "متجاهل" });

    openRowMenu(2);
    expect(screen.queryByRole("menuitem", { name: "تحديد كمحلول" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "تعيين لي" }));
    expect(store.assignError).toHaveBeenCalledWith("e-3", "أمل السبيعي");
  });

  it("clears the whole log after confirmation", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "مسح السجل" }));
    const dialog = screen.getByRole("dialog", { name: "مسح سجل الأخطاء" });
    expect(within(dialog).getByText("سيتم حذف 4 خطأ مسجّلاً في هذا المتصفح نهائياً.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "مسح" }));

    expect(store.clearErrors).toHaveBeenCalledTimes(1);
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم مسح السجل" });
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Error Center").length).toBeGreaterThan(0);
    expect(screen.getByText("Top module")).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: /New/ })).toBeInTheDocument();
    expect(screen.getByText("Clear log")).toBeInTheDocument();
  });
});
