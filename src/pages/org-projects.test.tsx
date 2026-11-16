import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Projects } from "./org-projects";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "مشروع أتمتة",
    nameEn: "Automation project",
    code: "PRJ-001",
    manager: "ريم الزهراني",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    departments: ["legal"],
    members: 4,
    docs: 2,
    ...overrides,
  };
}

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    projects: {
      items: [
        project(),
        project({
          id: "p-2",
          name: "مشروع الأرشيف",
          nameEn: "Archive project",
          code: "PRJ-002",
          manager: "",
          status: "planned",
          departments: ["it"],
          members: 2,
          docs: 0,
        }),
      ],
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    departments: {
      items: [
        { id: "legal", name: "الشؤون القانونية", nameEn: "Legal", code: "LEG" },
        { id: "it", name: "تقنية المعلومات", nameEn: "IT", code: "IT" },
      ],
    },
    employees: { items: [] },
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

function renderPage(url = "/org/projects", state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: url, state }]}>
      <Routes>
        <Route path="/org/projects" element={<Projects />} />
        <Route path="/org/projects/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("org projects", () => {
  it("renders project cards with stats", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.projects")).length).toBeGreaterThan(0);
    expect(screen.getByText("مشروع أتمتة")).toBeInTheDocument();
    expect(screen.getByText("PRJ-001")).toBeInTheDocument();
    expect(screen.getByText("ريم الزهراني")).toBeInTheDocument();
    expect(screen.getByText("2 من 2")).toBeInTheDocument();
    expect(screen.getAllByText("أعضاء").length).toBe(2);
  });

  it("filters projects by search and status", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في المشاريع" }), { target: { value: "الأرشيف" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();
    expect(screen.queryByText("PRJ-001")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    fireEvent.change(screen.getByRole("combobox", { name: t("g.status") }), { target: { value: "active" } });
    expect(screen.getByText("1 من 2")).toBeInTheDocument();
  });

  it("navigates to a project from its card and view button", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("مشروع الأرشيف"));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/projects/p-2");
  });

  it("navigates to a project from the view action", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.view") })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/org/projects/p-1");
  });

  it("shows the empty state when filters match nothing", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "بحث في المشاريع" }), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد مشاريع مطابقة")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("g.create") }).length).toBeGreaterThan(0);
  });

  it("creates a project offline for a system administrator", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مشروع" });
    fireEvent.change(screen.getByPlaceholderText("مشروع جديد"), { target: { value: "مشروع الجودة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.projects.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "مشروع الجودة",
        nameEn: "مشروع الجودة",
        code: "PRJ-003",
        manager: "—",
        status: "planned",
        departments: [],
        members: 0,
        docs: 0,
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء المشروع", message: "مشروع الجودة" });
  });

  it("scopes project creation to the manager department", () => {
    const store = mockStore();
    mockApp("dept_manager");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مشروع" });
    fireEvent.change(screen.getByPlaceholderText("مشروع جديد"), { target: { value: "مشروع القسم" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    expect(store.projects.add).toHaveBeenCalledWith(expect.objectContaining({ name: "مشروع القسم", departments: ["legal"] }));
  });

  it("edits a project offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.edit") })[0]);
    const dialog = screen.getByRole("dialog", { name: "تعديل — مشروع أتمتة" });
    fireEvent.change(within(dialog).getByDisplayValue("ريم الزهراني"), { target: { value: "سارة القحطاني" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.save") }));

    expect(store.projects.update).toHaveBeenCalledWith(
      "p-1",
      expect.objectContaining({ name: "مشروع أتمتة", code: "PRJ-001", manager: "سارة القحطاني", status: "active" }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "مشروع أتمتة" });
  });

  it("opens the edit dialog requested through router state", () => {
    mockStore();
    mockApp();
    renderPage("/org/projects", { editProjectId: "p-2" });

    expect(screen.getByRole("dialog", { name: "تعديل — مشروع الأرشيف" })).toBeInTheDocument();
  });

  it("blocks deleting a project with linked documents", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف المشروع" })).getByRole("button", { name: t("g.delete") }));

    expect(store.projects.remove).not.toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith({ type: "warning", title: "لا يمكن الحذف", message: "2 وثيقة مرتبطة بهذا المشروع" });
  });

  it("deletes a project without documents offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[1]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف المشروع" })).getByRole("button", { name: t("g.delete") }));

    expect(store.projects.remove).toHaveBeenCalledWith("p-2");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف المشروع", message: "مشروع الأرشيف" });
  });

  it("hides write actions for an employee", () => {
    mockStore();
    mockApp("employee");
    renderPage();

    expect(screen.queryByRole("button", { name: t("g.create") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("g.edit") })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("g.view") }).length).toBe(2);
  });

  it("creates, updates and deletes projects through the API", async () => {
    mocks.config.useApi = true;
    const store = mockStore();
    mocks.api.createProject.mockResolvedValue({});
    mocks.api.updateProject.mockResolvedValue({});
    mocks.api.deleteProject.mockResolvedValue({});
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.create") }));
    const createDialog = screen.getByRole("dialog", { name: "إنشاء مشروع" });
    fireEvent.change(screen.getByPlaceholderText("مشروع جديد"), { target: { value: "مشروع الجودة" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: t("g.create") }));

    await waitFor(() =>
      expect(mocks.api.createProject).toHaveBeenCalledWith({
        code: "PRJ-003",
        name: "مشروع الجودة",
        nameEn: "مشروع الجودة",
        status: "planned",
        startDate: undefined,
        endDate: undefined,
        departmentId: null,
      }),
    );
    await waitFor(() => expect(store.refreshOrgDirectory).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: t("g.edit") })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "تعديل — مشروع أتمتة" })).getByRole("button", { name: t("g.save") }));
    await waitFor(() =>
      expect(mocks.api.updateProject).toHaveBeenCalledWith("p-1", {
        name: "مشروع أتمتة",
        code: "PRJ-001",
        nameEn: "Automation project",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2027-01-01",
        departmentId: "legal",
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[1]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف المشروع" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteProject).toHaveBeenCalledWith("p-2"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف المشروع", message: "مشروع الأرشيف" }));
  });

  it("reports API delete failures with the server reason", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.deleteProject.mockRejectedValue(
      new ApiError(409, "CONFLICT", "project has documents", undefined, null, "المشروع مرتبط بوثائق"),
    );
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[1]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف المشروع" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "تعذر حذف المشروع", message: "المشروع مرتبط بوثائق" }),
    );
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("system_admin", "en");
    renderPage();

    expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
    expect(screen.getByText("Project docs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
