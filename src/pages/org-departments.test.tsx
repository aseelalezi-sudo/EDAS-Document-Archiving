import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Department } from "../types";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Departments } from "./org-departments";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function department(overrides: Partial<Department> = {}): Department {
  return {
    id: "legal",
    name: "الشؤون القانونية",
    nameEn: "Legal",
    code: "LEG",
    parentId: null,
    manager: "سعد العتيبي",
    employees: 1,
    docs: 3,
    status: "active",
    ...overrides,
  };
}

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    departments: {
      items: [
        department(),
        department({ id: "it", name: "تقنية المعلومات", nameEn: "IT", code: "IT", manager: "خالد العمري", employees: 0, docs: 1 }),
        department({
          id: "legal-child",
          name: "الشؤون الفرعية",
          nameEn: "Legal subsidiary",
          code: "LEG-2",
          parentId: "legal",
          manager: "نورة الحربي",
          employees: 0,
          docs: 0,
        }),
      ],
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    sections: {
      items: [
        {
          id: "fin-ap",
          name: "الحسابات",
          nameEn: "Accounts",
          code: "FIN-AP",
          deptId: "legal",
          head: "أمل",
          employees: 0,
          status: "active",
        },
      ],
    },
    employees: {
      items: [
        {
          id: "emp-1",
          empNo: "EMP-1001",
          name: "أمل السبيعي",
          nameEn: "Amal",
          jobTitle: "مديرة",
          jobTitleEn: "Manager",
          deptId: "legal",
          sectionId: "",
          manager: "—",
          email: "amal@edas.gov",
          phone: "+966 500000001",
          status: "active",
          initials: "أم",
          color: "bg-navy-600",
        },
      ],
    },
    scopedDocs: [{ id: "doc-1" }],
    refreshOrgDirectory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = storeState(overrides);
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role: "system_admin" | "dept_manager" | "employee" = "system_admin", lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    role,
    user: { name: "سعد العتيبي", department: "legal" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/org/departments"]}>
      <Routes>
        <Route path="/org/departments" element={<Departments />} />
        <Route path="/org/employees" element={<LocationProbe />} />
        <Route path="/org/sections" element={<LocationProbe />} />
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

describe("org departments", () => {
  it("renders the tree with stats and expands sub-departments", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.departments")).length).toBeGreaterThan(0);
    expect(screen.getByText("الشؤون القانونية")).toBeInTheDocument();
    expect(screen.getByText("LEG")).toBeInTheDocument();
    expect(screen.queryByText("الشؤون الفرعية")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "توسيع" }));
    expect(screen.getByText("الشؤون الفرعية")).toBeInTheDocument();
    expect(screen.getByText("فرعي")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "طي" })).toHaveAttribute("aria-expanded", "true");
  });

  it("expands and collapses the whole tree", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "توسيع الكل" }));
    expect(screen.getByRole("button", { name: "طي الكل" })).toBeInTheDocument();
    expect(screen.getByText("الشؤون الفرعية")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "طي الكل" }));
    expect(screen.queryByText("الشؤون الفرعية")).not.toBeInTheDocument();
  });

  it("searches departments including sub-departments", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الإدارات" }), { target: { value: "LEG-2" } });
    expect(screen.getByText("الشؤون الفرعية")).toBeInTheDocument();
    expect(screen.queryByText("تقنية المعلومات")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByText("تقنية المعلومات")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الإدارات" }), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد إدارات مطابقة")).toBeInTheDocument();
  });

  it("navigates to employees, sections and documents of a department", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "الموظفون" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/employees?dept=legal");
  });

  it("navigates from the department menu to add a section", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "إضافة قسم" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/sections?dept=legal");
  });

  it("opens the documents of a department", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "الوثائق" })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents?dept=legal");
  });

  it("switches to cards and navigates to documents", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "بطاقات" }));
    expect(screen.getAllByText("موظفون").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "الوثائق" })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents?dept=legal");
  });

  it("creates a department offline with a generated code", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء إدارة" });
    fireEvent.change(screen.getByPlaceholderText("إدارة جديدة"), { target: { value: "إدارة الجودة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.departments.add).toHaveBeenCalledWith({
      name: "إدارة الجودة",
      nameEn: "إدارة الجودة",
      code: "DEPT-001",
      parentId: null,
      manager: "—",
      employees: 0,
      docs: 0,
      status: "active",
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء الإدارة", message: "إدارة الجودة" });
  });

  it("creates a sub-department under a chosen parent", () => {
    const store = mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء إدارة" });
    fireEvent.change(screen.getByPlaceholderText("إدارة جديدة"), { target: { value: "إدارة فرعية" } });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "legal" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.departments.add).toHaveBeenCalledWith(expect.objectContaining({ name: "إدارة فرعية", parentId: "legal" }));
  });

  it("edits a department offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.edit") })[0]);
    const dialog = screen.getByRole("dialog", { name: "تعديل — الشؤون القانونية" });
    fireEvent.change(within(dialog).getByDisplayValue("سعد العتيبي"), { target: { value: "سارة القحطاني" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.save") }));

    expect(store.departments.update).toHaveBeenCalledWith("legal", {
      name: "الشؤون القانونية",
      code: "LEG",
      manager: "سارة القحطاني",
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "الشؤون القانونية" });
  });

  it("moves a department inside the tree", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "نقل داخل الهيكل" }));
    const dialog = screen.getByRole("dialog", { name: "نقل داخل الهيكل — تقنية المعلومات" });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "legal" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "نقل" }));

    expect(store.departments.update).toHaveBeenCalledWith("it", { parentId: "legal" });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم نقل الإدارة", message: "تقنية المعلومات" });
  });

  it("blocks deleting a department with linked records", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الإدارة" })).getByRole("button", { name: t("g.delete") }));

    expect(store.departments.remove).not.toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith({
      type: "warning",
      title: "لا يمكن الحذف",
      message: "1 إدارة فرعية، 1 قسم و1 موظف مرتبط",
    });
  });

  it("deletes an empty department offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الإدارة" })).getByRole("button", { name: t("g.delete") }));

    expect(store.departments.remove).toHaveBeenCalledWith("it");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف الإدارة", message: "تقنية المعلومات" });
  });

  it("hides write actions for an employee", () => {
    mockStore();
    mockApp("employee");
    renderPage();

    expect(screen.queryByRole("button", { name: t("g.create") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("g.edit") })).not.toBeInTheDocument();

    openRowMenu(0);
    expect(screen.getByRole("menuitem", { name: "الموظفون" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "إضافة قسم" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: t("g.delete") })).not.toBeInTheDocument();
  });

  it("limits a manager to their own departments", () => {
    mockStore();
    mockApp("dept_manager");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء إدارة" });
    const parent = within(dialog).getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(parent.options).map((option) => option.value)).toEqual(["legal", "legal-child"]);
  });

  it("creates, moves and deletes departments through the API", async () => {
    mocks.config.useApi = true;
    const store = mockStore();
    mocks.api.createDepartment.mockResolvedValue({});
    mocks.api.updateDepartment.mockResolvedValue({});
    mocks.api.deleteDepartment.mockResolvedValue({});
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const createDialog = screen.getByRole("dialog", { name: "إنشاء إدارة" });
    fireEvent.change(screen.getByPlaceholderText("إدارة جديدة"), { target: { value: "إدارة الجودة" } });
    fireEvent.change(within(createDialog).getByPlaceholderText("NEW"), { target: { value: "qa" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: t("g.create") }));

    await waitFor(() =>
      expect(mocks.api.createDepartment).toHaveBeenCalledWith({
        code: "QA",
        name: "إدارة الجودة",
        nameEn: "إدارة الجودة",
        manager: undefined,
        parentId: undefined,
      }),
    );
    await waitFor(() => expect(store.refreshOrgDirectory).toHaveBeenCalled());

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "نقل داخل الهيكل" }));
    const moveDialog = screen.getByRole("dialog", { name: "نقل داخل الهيكل — تقنية المعلومات" });
    fireEvent.change(within(moveDialog).getByRole("combobox"), { target: { value: "legal" } });
    fireEvent.click(within(moveDialog).getByRole("button", { name: "نقل" }));
    await waitFor(() => expect(mocks.api.updateDepartment).toHaveBeenCalledWith("it", { parentId: "legal" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم نقل الإدارة", message: "تقنية المعلومات" }));

    openRowMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الإدارة" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteDepartment).toHaveBeenCalledWith("it"));
  });

  it("reports API failures with the server reason", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.deleteDepartment.mockRejectedValue(new ApiError(409, "CONFLICT", "in use", undefined, null, "الإدارة قيد الاستخدام"));
    const app = mockApp();
    renderPage();

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الإدارة" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "تعذر حذف الإدارة", message: "الإدارة قيد الاستخدام" }),
    );
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("system_admin", "en");
    renderPage();

    expect(screen.getAllByText("Departments").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(screen.getAllByRole("button", { name: "Docs" }).length).toBeGreaterThan(0);
  });
});
