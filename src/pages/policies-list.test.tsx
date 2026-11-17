import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    retentionPolicies: vi.fn(),
    createRetentionPolicy: vi.fn(),
    updateRetentionPolicy: vi.fn(),
    deleteRetentionPolicy: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Policies } from "./policies-list";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: "p-1",
    name: "سياسة المالية",
    nameEn: "Finance policy",
    scopeType: "التصنيف",
    scopeTypeEn: "Category",
    target: "finreport",
    category: "finreport",
    retention: "5 سنوات",
    retentionMonths: 60,
    requiresApproval: false,
    disposal: "حذف آمن",
    disposalEn: "Secure delete",
    priority: "medium",
    status: "active",
    updated: "2026-01-10",
    affectedDocs: 620,
    ...overrides,
  };
}

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    policies: {
      items: [
        policy(),
        policy({
          id: "p-2",
          name: "سياسة الموارد البشرية",
          nameEn: "HR policy",
          scopeType: "عام",
          scopeTypeEn: "Global",
          target: "الكل",
          category: "",
          retention: "3 سنوات",
          retentionMonths: 36,
          disposal: "أرشفة",
          disposalEn: "Archive",
          status: "draft",
          updated: "2026-01-01",
          affectedDocs: 12,
        }),
        policy({
          id: "p-3",
          name: "سياسة قديمة",
          nameEn: "Old policy",
          scopeType: "إدارة",
          scopeTypeEn: "Department",
          target: "الشؤون القانونية",
          category: "",
          departmentId: "legal",
          retention: "7 سنوات",
          retentionMonths: 84,
          disposal: "مراجعة",
          disposalEn: "Manual review",
          status: "inactive",
          updated: "2025-12-01",
          affectedDocs: 0,
        }),
      ],
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = storeState(overrides);
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = { t: (key: string) => dict[key] ?? key, lang, role: "system_admin", user: { name: "أمل" }, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/policies"]}>
      <Routes>
        <Route path="/policies" element={<Policies />} />
        <Route path="/policies/:id" element={<LocationProbe />} />
        <Route path="/documents" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openRowMenu(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[index]);
}

function selectWithValue(scope: HTMLElement, value: string) {
  const select = Array.from(scope.querySelectorAll("select")).find((element) =>
    Array.from(element.options).some((option) => option.value === value),
  );
  if (!select) throw new Error(`No select with an option valued "${value}"`);
  return select;
}

const API_DTO = {
  id: "api-1",
  name: "سياسة API",
  description: "وصف",
  legalBasis: "نظام",
  category: "contract",
  retentionMonths: 24,
  action: "ARCHIVE",
  isActive: true,
  updatedAt: "2026-02-01T10:00:00.000Z",
  _count: { items: 4 },
};

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("policies list", () => {
  it("renders policies with stats and category targets", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.policies")).length).toBeGreaterThan(0);
    expect(screen.getByText("سياسة المالية")).toBeInTheDocument();
    expect(screen.getByText("تقرير مالي · آخر تحديث 2026-01-10")).toBeInTheDocument();
    expect(screen.getByText("3 من 3")).toBeInTheDocument();
    expect(screen.getByText("632")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(1);
  });

  it("filters by search text and status", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("ابحث في السياسات…"), { target: { value: "الموارد" } });
    expect(screen.getByText("1 من 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "draft" } });
    expect(screen.getByText("1 من 3")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "inactive" } });
    expect(screen.getByText("1 من 3")).toBeInTheDocument();
    expect(screen.getByText("سياسة قديمة")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("ابحث في السياسات…"), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد سياسات مطابقة")).toBeInTheDocument();
  });

  it("opens a policy from its name and from the edit action", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "سياسة المالية" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/policies/p-1");
  });

  it("navigates to a policy from the row menu", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    expect(screen.getByTestId("location")).toHaveTextContent("/policies/p-1");
  });

  it("opens affected documents filtered by category", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "الوثائق المتأثرة" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents?category=finreport");
  });

  it("opens affected documents filtered by department", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "الوثائق المتأثرة" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents?dept=legal");
  });

  it("duplicates a policy offline as a draft", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.duplicate") }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: undefined, name: "سياسة المالية (نسخة)", status: "draft" }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم النسخ", message: "سياسة المالية" });
  });

  it("toggles a policy status offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "إيقاف" }));
    expect(store.policies.update).toHaveBeenCalledWith("p-1", { status: "inactive" });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم الإيقاف", message: "سياسة المالية" });

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "تفعيل" }));
    expect(store.policies.update).toHaveBeenCalledWith("p-2", { status: "active" });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم التفعيل", message: "سياسة الموارد البشرية" });
  });

  it("creates a policy offline with a category and retention", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء سياسة" });
    fireEvent.change(within(dialog).getByPlaceholderText("سياسة جديدة"), { target: { value: "سياسة العقود" } });
    fireEvent.change(dialog.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: "7" } });
    fireEvent.change(selectWithValue(dialog, "contract"), { target: { value: "contract" } });
    fireEvent.change(selectWithValue(dialog, "نقل للتخزين البارد"), { target: { value: "نقل للتخزين البارد" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "سياسة العقود",
        nameEn: "سياسة العقود",
        scopeType: "تصنيف وثيقة",
        target: "عقد",
        category: "contract",
        retention: "7 سنوات",
        retentionMonths: 84,
        disposal: "نقل للتخزين البارد",
        status: "draft",
        affectedDocs: 0,
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء السياسة", message: "سياسة العقود" });
  });

  it("creates a global policy with defaults", () => {
    const store = mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء سياسة" });
    fireEvent.change(within(dialog).getByPlaceholderText("سياسة جديدة"), { target: { value: "سياسة عامة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: "عام", target: "الكل", retention: "5 سنوات", retentionMonths: 60 }),
    );
  });

  it("deletes a single policy after confirmation", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف السياسة" })).getByRole("button", { name: t("g.delete") }));

    expect(store.policies.remove).toHaveBeenCalledWith("p-1");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف السياسة", message: "سياسة المالية" });
  });

  it("bulk deletes the selected policies", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("3 سياسة محددة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(screen.queryByText("3 سياسة محددة")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText("1 سياسة محددة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف المحدد" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف السياسة" })).getByRole("button", { name: t("g.delete") }));

    expect(store.policies.remove).toHaveBeenCalledWith("p-1");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف السياسة", message: "سياسة المالية" });
  });

  it("loads API policies and reports load failures", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.retentionPolicies.mockResolvedValueOnce({ items: [API_DTO] }).mockRejectedValueOnce(new Error("offline"));
    const app = mockApp();
    const { unmount } = renderPage();

    expect(await screen.findByText("سياسة API")).toBeInTheDocument();
    expect(screen.getByText("1 من 1")).toBeInTheDocument();
    unmount();

    renderPage();
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
  });

  it("creates, duplicates, toggles and deletes policies through the API", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.retentionPolicies.mockResolvedValue({ items: [API_DTO] });
    mocks.api.createRetentionPolicy.mockResolvedValue({});
    mocks.api.updateRetentionPolicy.mockResolvedValue({});
    mocks.api.deleteRetentionPolicy.mockResolvedValue({});
    const app = mockApp();
    renderPage();
    await screen.findByText("سياسة API");

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء سياسة" });
    fireEvent.change(within(dialog).getByPlaceholderText("سياسة جديدة"), { target: { value: "سياسة جديدة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    await waitFor(() =>
      expect(mocks.api.createRetentionPolicy).toHaveBeenCalledWith({
        name: "سياسة جديدة",
        description: undefined,
        category: undefined,
        retentionMonths: 60,
        action: "DESTROY",
      }),
    );
    await waitFor(() => expect(mocks.api.retentionPolicies).toHaveBeenCalledTimes(2));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.duplicate") }));
    await waitFor(() =>
      expect(mocks.api.createRetentionPolicy).toHaveBeenCalledWith({
        name: "سياسة API (نسخة)",
        description: "وصف",
        legalBasis: "نظام",
        category: "contract",
        departmentId: undefined,
        retentionMonths: 24,
        action: "ARCHIVE",
        isActive: false,
      }),
    );

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "إيقاف" }));
    await waitFor(() => expect(mocks.api.updateRetentionPolicy).toHaveBeenCalledWith("api-1", { isActive: false }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف السياسة" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteRetentionPolicy).toHaveBeenCalledWith("api-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف السياسة", message: "سياسة API" }));
  });

  it("reports API failures for create and delete", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.retentionPolicies.mockResolvedValue({ items: [API_DTO] });
    mocks.api.createRetentionPolicy.mockRejectedValue(new Error("nope"));
    mocks.api.deleteRetentionPolicy.mockRejectedValue(new Error("nope"));
    const app = mockApp();
    renderPage();
    await screen.findByText("سياسة API");

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء سياسة" });
    fireEvent.change(within(dialog).getByPlaceholderText("سياسة جديدة"), { target: { value: "سياسة جديدة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف السياسة" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteRetentionPolicy).toHaveBeenCalledWith("api-1"));
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Archive Policies").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByText("Finance policy")).toBeInTheDocument();
  });
});
