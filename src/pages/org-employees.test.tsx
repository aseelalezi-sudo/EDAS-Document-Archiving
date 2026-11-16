import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "../types";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    deleteEmployee: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Employees } from "./org-employees";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
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
    sectionId: "fin-ap",
    manager: "سعد العتيبي",
    email: "amal@edas.gov",
    phone: "+966 500000001",
    userId: "u-1",
    status: "active",
    initials: "أم",
    color: "bg-navy-600",
    ...overrides,
  };
}

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    employees: {
      items: [
        employee(),
        employee({
          id: "emp-2",
          empNo: "EMP-1002",
          name: "خالد العمري",
          userId: undefined,
          deptId: "it",
          sectionId: "it-inf",
          status: "leave",
          email: "khaled@edas.gov",
          phone: "+966 500000002",
        }),
      ],
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    users: { items: [] },
    departments: {
      items: [
        { id: "legal", name: "الشؤون القانونية", nameEn: "Legal", code: "LEG" },
        { id: "it", name: "تقنية المعلومات", nameEn: "IT", code: "IT" },
      ],
    },
    sections: {
      items: [
        { id: "fin-ap", name: "الحسابات", nameEn: "Accounts", code: "FIN-AP", deptId: "legal" },
        { id: "it-inf", name: "البنية التحتية", nameEn: "Infrastructure", code: "IT-INF", deptId: "it" },
      ],
    },
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
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage(url = "/org/employees") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/org/employees" element={<Employees />} />
        <Route path="/org/employees/:id" element={<LocationProbe />} />
        <Route path="/org/employees/:id/edit" element={<LocationProbe />} />
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

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("org employees", () => {
  it("renders the directory with stats and account links", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.employees")).length).toBeGreaterThan(0);
    expect(screen.getByText("دليل الموظفين — 2 موظف")).toBeInTheDocument();
    expect(screen.getByText("أمل السبيعي")).toBeInTheDocument();
    expect(screen.getByText("EMP-1001")).toBeInTheDocument();
    expect(screen.getByText("amal@edas.gov")).toBeInTheDocument();
    expect(screen.getByText("مرتبط")).toBeInTheDocument();
    expect(screen.getByText("2 من 2")).toBeInTheDocument();
  });

  it("filters employees by search, department and status", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الموظفين" }), { target: { value: "خالد" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الإدارة" }), { target: { value: "it" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الإدارة" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("combobox", { name: t("g.status") }), { target: { value: "leave" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();
  });

  it("switches to cards and navigates to the employee page", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "بطاقات" }));
    expect(screen.getByText("+966 500000001")).toBeInTheDocument();

    fireEvent.click(screen.getByText("خالد العمري"));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/employees/emp-2");
  });

  it("opens the employee page from a table row", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("EMP-1001"));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/employees/emp-1");
  });

  it("hides write actions for an employee", () => {
    mockStore();
    mockApp("employee");
    renderPage();

    expect(screen.queryByRole("button", { name: t("g.add") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("g.import") })).not.toBeInTheDocument();

    openRowMenu();
    expect(screen.getByRole("menuitem", { name: t("g.view") })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t("g.edit") })).not.toBeInTheDocument();
  });

  it("adds a managed employee offline with a section", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.add") }));
    const dialog = screen.getByRole("dialog", { name: "إضافة موظف" });
    fireEvent.change(screen.getByPlaceholderText("اسم الموظف"), { target: { value: "سارة القحطاني" } });
    fireEvent.change(screen.getByPlaceholderText("EMP-4001"), { target: { value: "EMP-4009" } });
    fireEvent.change(selectWithValue(dialog, "fin-ap"), { target: { value: "fin-ap" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.add") }));

    expect(store.employees.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "سارة القحطاني",
        empNo: "EMP-4009",
        deptId: "legal",
        sectionId: "fin-ap",
        jobTitle: "موظف",
        status: "active",
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إضافة الموظف", message: "سارة القحطاني" });
  });

  it("imports employees from a CSV file and reports failures", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.import") }));
    const importDialog = screen.getByRole("dialog", { name: "استيراد موظفين" });
    const fileInput = importDialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["name,dept,section\nأحمد,LEG,fin-ap\nباطل,UNKNOWN,\n"], "employees.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(store.employees.add).toHaveBeenCalledTimes(1));
    expect(store.employees.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "أحمد", deptId: "legal", sectionId: "fin-ap", status: "active" }),
    );
    await waitFor(() => expect(screen.getByText("نجح: 1 · فشل: 1 · الإجمالي: 2")).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم استيراد 1 موظف", message: "1 صف فشل" });
  });

  it("rejects an empty import file", async () => {
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.import") }));
    const importDialog = screen.getByRole("dialog", { name: "استيراد موظفين" });
    fireEvent.change(importDialog.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["\n\n"], "empty.csv", { type: "text/csv" })] },
    });

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "الملف فارغ" }));
  });

  it("edits an employee offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    const dialog = screen.getByRole("dialog", { name: "تعديل — أمل السبيعي" });
    fireEvent.change(within(dialog).getByDisplayValue("مديرة القسم"), { target: { value: "مستشارة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.save") }));

    expect(store.employees.update).toHaveBeenCalledWith("emp-1", {
      name: "أمل السبيعي",
      jobTitle: "مستشارة",
      deptId: "legal",
      sectionId: "fin-ap",
      email: "amal@edas.gov",
      phone: "+966 500000001",
      status: "active",
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "أمل السبيعي" });
  });

  it("blocks deleting an employee that is linked to an account", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الموظف" })).getByRole("button", { name: t("g.delete") }));

    expect(store.employees.remove).not.toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith({
      type: "warning",
      title: "لا يمكن الحذف",
      message: "مرتبط بحساب مستخدم — ألغِ الربط أولاً",
    });
  });

  it("deletes an unlinked employee offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الموظف" })).getByRole("button", { name: t("g.delete") }));

    expect(store.employees.remove).toHaveBeenCalledWith("emp-2");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف الموظف", message: "خالد العمري" });
  });

  it("opens the edit dialog requested through router state", () => {
    mockStore();
    mockApp();

    render(
      <MemoryRouter initialEntries={[{ pathname: "/org/employees", state: { editEmployeeId: "emp-2" } }]}>
        <Routes>
          <Route path="/org/employees" element={<Employees />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: "تعديل — خالد العمري" })).toBeInTheDocument();
  });

  it("saves employee changes through the API", async () => {
    mocks.config.useApi = true;
    const store = mockStore();
    mocks.api.updateEmployee.mockResolvedValue(undefined);
    const app = mockApp();
    renderPage();

    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    const dialog = screen.getByRole("dialog", { name: "تعديل — أمل السبيعي" });
    fireEvent.change(within(dialog).getByDisplayValue("مديرة القسم"), { target: { value: "مستشارة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.save") }));

    await waitFor(() =>
      expect(mocks.api.updateEmployee).toHaveBeenCalledWith("emp-1", {
        name: "أمل السبيعي",
        nameEn: "Amal Alsubaie",
        jobTitle: "مستشارة",
        email: "amal@edas.gov",
        phone: "+966 500000001",
        status: "ACTIVE",
        departmentId: "legal",
        sectionId: "fin-ap",
      }),
    );
    await waitFor(() => expect(store.refreshOrgDirectory).toHaveBeenCalled());
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "أمل السبيعي" }));
  });

  it("shows the server reason when an API save fails", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.updateEmployee.mockRejectedValue(new ApiError(403, "FORBIDDEN", "not in your tree"));
    const app = mockApp();
    renderPage();

    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.edit") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "تعديل — أمل السبيعي" })).getByRole("button", { name: t("g.save") }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "not in your tree" }));
  });

  it("creates and deletes employees through the API", async () => {
    mocks.config.useApi = true;
    const store = mockStore();
    mocks.api.createEmployee.mockResolvedValue(undefined);
    mocks.api.deleteEmployee.mockResolvedValue(undefined);
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.add") }));
    const dialog = screen.getByRole("dialog", { name: "إضافة موظف" });
    fireEvent.change(screen.getByPlaceholderText("اسم الموظف"), { target: { value: "سارة القحطاني" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.add") }));

    await waitFor(() =>
      expect(mocks.api.createEmployee).toHaveBeenCalledWith({
        empNo: expect.stringMatching(/^EMP-\d+$/),
        name: "سارة القحطاني",
        nameEn: "سارة القحطاني",
        jobTitle: "موظف",
        jobTitleEn: "Employee",
        email: undefined,
        phone: undefined,
        status: "ACTIVE",
        departmentId: "legal",
        sectionId: undefined,
      }),
    );
    await waitFor(() => expect(store.refreshOrgDirectory).toHaveBeenCalled());

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الموظف" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() => expect(mocks.api.deleteEmployee).toHaveBeenCalledWith("emp-2"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف الموظف", message: "خالد العمري" }));
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("system_admin", "en");
    renderPage();

    expect(screen.getAllByText("Employees").length).toBeGreaterThan(0);
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
