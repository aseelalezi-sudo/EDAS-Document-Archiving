import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee, Section } from "../types";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    createSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Sections } from "./org-sections";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const DEPARTMENTS = [
  { id: "legal", name: "الشؤون القانونية", nameEn: "Legal", code: "LEG" },
  { id: "it", name: "تقنية المعلومات", nameEn: "IT", code: "IT" },
];

function section(overrides: Partial<Section> = {}): Section {
  return {
    id: "sec-1",
    name: "الحسابات",
    nameEn: "Accounts",
    code: "FIN-AP",
    deptId: "legal",
    head: "أمل السبيعي",
    employees: 0,
    status: "active",
    ...overrides,
  };
}

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    empNo: "EMP-1001",
    name: "أمل السبيعي",
    nameEn: "Amal Alsubaie",
    jobTitle: "مديرة القسم",
    jobTitleEn: "Department manager",
    deptId: "legal",
    sectionId: "sec-1",
    manager: "سعد العتيبي",
    email: "amal@edas.gov",
    phone: "+966 500000001",
    status: "active",
    initials: "أم",
    color: "bg-navy-600",
    ...overrides,
  };
}

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    sections: {
      items: [
        section(),
        section({ id: "sec-2", name: "البنية التحتية", nameEn: "Infrastructure", code: "IT-INF", deptId: "it", head: "خالد العمري" }),
      ],
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    departments: { items: DEPARTMENTS },
    employees: { items: [employee()] },
    refreshOrgDirectory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = storeState(overrides);
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role: "system_admin" | "employee" = "system_admin", lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    role,
    user: { name: "أمل السبيعي", department: "legal" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(url = "/org/sections") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/org/sections" element={<Sections />} />
        <Route path="/org/employees" element={<LocationProbe />} />
        <Route path="/documents" element={<LocationProbe />} />
      </Routes>
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
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("org sections", () => {
  it("renders the section table with stats", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.sections")).length).toBeGreaterThan(0);
    expect(screen.getByText("الحسابات")).toBeInTheDocument();
    expect(screen.getByText("FIN-AP")).toBeInTheDocument();
    expect(screen.getByText("IT-INF")).toBeInTheDocument();
    expect(screen.getAllByText("الشؤون القانونية").length).toBeGreaterThan(0);
    expect(screen.getByText("2 من 2")).toBeInTheDocument();
  });

  it("filters sections by search and department", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الأقسام" }), { target: { value: "الحسابات" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الإدارة" }), { target: { value: "it" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();
    expect(screen.queryByText("FIN-AP")).not.toBeInTheDocument();
  });

  it("navigates to the employees of a section", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "الموظفون" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/employees?dept=legal");
  });

  it("navigates to the documents of a section", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "الوثائق" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents?dept=it");
  });

  it("creates a section offline with a generated code", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء قسم" });
    fireEvent.change(screen.getByPlaceholderText("قسم جديد"), { target: { value: "قسم الجودة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.sections.add).toHaveBeenCalledWith({
      name: "قسم الجودة",
      nameEn: "قسم الجودة",
      code: "SEC-001",
      deptId: "legal",
      head: "—",
      employees: 0,
      status: "active",
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء القسم", message: "قسم الجودة" });
  });

  it("edits a section offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    const dialog = screen.getByRole("dialog", { name: "تعديل — الحسابات" });
    fireEvent.change(within(dialog).getByDisplayValue("أمل السبيعي"), { target: { value: "سارة القحطاني" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.save") }));

    expect(store.sections.update).toHaveBeenCalledWith("sec-1", {
      name: "الحسابات",
      code: "FIN-AP",
      deptId: "legal",
      head: "سارة القحطاني",
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "الحسابات" });
  });

  it("blocks deleting a section that still has employees", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف القسم" })).getByRole("button", { name: t("g.delete") }));

    expect(store.sections.remove).not.toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith({ type: "warning", title: "لا يمكن الحذف", message: "1 موظف مرتبط بهذا القسم" });
  });

  it("deletes an empty section offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف القسم" })).getByRole("button", { name: t("g.delete") }));

    expect(store.sections.remove).toHaveBeenCalledWith("sec-2");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف القسم", message: "البنية التحتية" });
  });

  it("hides write actions for an employee", () => {
    mockStore();
    mockApp("employee");
    renderPage();

    expect(screen.queryByRole("button", { name: t("g.create") })).not.toBeInTheDocument();

    openRowMenu(0);
    expect(screen.getByRole("menuitem", { name: "الموظفون" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t("g.edit") })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t("g.delete") })).not.toBeInTheDocument();
  });

  it("creates, updates and deletes sections through the API", async () => {
    mocks.config.useApi = true;
    const store = mockStore();
    mocks.api.createSection.mockResolvedValue({});
    mocks.api.updateSection.mockResolvedValue({});
    mocks.api.deleteSection.mockResolvedValue({});
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const createDialog = screen.getByRole("dialog", { name: "إنشاء قسم" });
    fireEvent.change(screen.getByPlaceholderText("قسم جديد"), { target: { value: "قسم الجودة" } });
    fireEvent.change(screen.getByPlaceholderText("SEC-N"), { target: { value: "qa" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: t("g.create") }));

    await waitFor(() =>
      expect(mocks.api.createSection).toHaveBeenCalledWith({
        code: "QA",
        name: "قسم الجودة",
        nameEn: "قسم الجودة",
        manager: undefined,
        departmentId: "legal",
      }),
    );
    await waitFor(() => expect(store.refreshOrgDirectory).toHaveBeenCalled());

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "تعديل — الحسابات" })).getByRole("button", { name: t("g.save") }));
    await waitFor(() =>
      expect(mocks.api.updateSection).toHaveBeenCalledWith("sec-1", {
        name: "الحسابات",
        code: "FIN-AP",
        departmentId: "legal",
        nameEn: "Accounts",
        manager: "أمل السبيعي",
      }),
    );

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف القسم" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteSection).toHaveBeenCalledWith("sec-2"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف القسم", message: "البنية التحتية" }));
  });

  it("reports API failures with the server reason", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.deleteSection.mockRejectedValue(
      new ApiError(409, "CONFLICT", "section has employees", undefined, null, "القسم مرتبط بموظفين"),
    );
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف القسم" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "تعذر حذف القسم", message: "القسم مرتبط بموظفين" }));
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("system_admin", "en");
    renderPage();

    expect(screen.getAllByText("Sections").length).toBeGreaterThan(0);
    expect(screen.getByText("Section head")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
