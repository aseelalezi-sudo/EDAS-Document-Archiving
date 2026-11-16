import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Department, Employee, FolderNode } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  getDefaults: vi.fn(),
  putDefaults: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({
  domainApi: { departmentDefaults: mocks.getDefaults, putDepartmentDefaults: mocks.putDefaults },
}));

import { DepartmentDefaults } from "./settings-department-defaults";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const legal: Department = {
  id: "legal",
  name: "الشؤون القانونية",
  nameEn: "Legal Affairs",
  code: "LEG",
  parentId: null,
  manager: "",
  employees: 19,
  docs: 980,
  status: "active",
};

const employee: Employee = {
  id: "emp-1",
  empNo: "EMP-1024",
  name: "أمل السبيعي",
  nameEn: "Amal Al-Subaie",
  jobTitle: "مسؤولة أرشفة",
  jobTitleEn: "Archiving Officer",
  deptId: "legal",
  sectionId: "",
  manager: "",
  email: "amal@edas.gov",
  phone: "",
  userId: "u-1",
  status: "active",
  initials: "أم",
  color: "bg-navy-600",
};

function folder(overrides: Partial<FolderNode> = {}): FolderNode {
  return {
    id: "f-legal",
    name: "مجلد الشؤون القانونية",
    nameEn: "Legal folder",
    parentId: null,
    type: "dept",
    docs: 3,
    subfolders: 0,
    accessScope: "قسم",
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    employees: { items: [employee] },
    departments: { items: [legal] },
    folders: [
      folder(),
      folder({ id: "f-proj", name: "مجلد المشروع", nameEn: "Project folder", type: "project" }),
      folder({ id: "f-shared", name: "مجلد مشترك", nameEn: "Shared folder", type: "shared" }),
    ],
    systemSettings: {},
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(overrides: Record<string, unknown> = {}) {
  const app = {
    t,
    lang: "ar",
    toast: vi.fn(),
    apiMode: false,
    user: { id: "u-1", email: "amal@edas.gov", department: "legal" },
    ...overrides,
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DepartmentDefaults />
    </MemoryRouter>,
  );
}

function selectWithOptionValue(value: string): HTMLSelectElement {
  const select = screen
    .getAllByRole("combobox")
    .find((element) => Array.from((element as HTMLSelectElement).options).some((option) => option.value === value));
  if (!select) throw new Error(`No select with an option valued "${value}"`);
  return select as HTMLSelectElement;
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.getDefaults.mockReset();
  mocks.putDefaults.mockReset();
});

describe("department defaults", () => {
  it("explains when the account is not linked to a department", () => {
    mockStore({ employees: { items: [] } });
    mockApp({ user: { id: "u-9", department: "" } });

    renderPage();

    expect(screen.getByText("لا إدارة مرتبطة بحسابك")).toBeInTheDocument();
  });

  it("reads the saved defaults for the department from local storage", () => {
    mockStore();
    mockApp();
    localStorage.setItem(
      "edas.v1.departmentDefaults.legal",
      JSON.stringify({ classification: "SECRET", retentionYears: "7", folderId: "f-legal" }),
    );

    renderPage();

    expect(selectWithOptionValue("SECRET").value).toBe("SECRET");
    expect(selectWithOptionValue("7").value).toBe("7");
    expect(selectWithOptionValue("f-legal").value).toBe("f-legal");
    expect(screen.getByText("مقيد")).toBeInTheDocument();
  });

  it("saves the edited defaults locally without leaving the page", () => {
    mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(selectWithOptionValue(""), { target: { value: "f-proj" } });
    fireEvent.change(selectWithOptionValue("INTERNAL"), { target: { value: "CONFIDENTIAL" } });
    fireEvent.change(selectWithOptionValue("5"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(JSON.parse(localStorage.getItem("edas.v1.departmentDefaults.legal") ?? "{}")).toEqual({
      classification: "CONFIDENTIAL",
      retentionYears: "7",
      folderId: "f-proj",
    });
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حفظ القيم الافتراضية" }));
  });

  it("offers only department and project folders as default locations", () => {
    mockStore();
    mockApp();

    renderPage();

    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("مجلد الشؤون القانونية");
    expect(options).toContain("مجلد المشروع");
    expect(options).not.toContain("مجلد مشترك");
  });

  it("lists the configured allowed file types from system settings", () => {
    mockStore({ systemSettings: { allowedTypes: "PDF, DWG" } });
    mockApp();

    renderPage();

    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DWG")).toBeInTheDocument();
  });

  it("loads the defaults from the API and saves them back", async () => {
    mockStore();
    const app = mockApp({ apiMode: true });
    mocks.getDefaults.mockResolvedValue({
      departmentId: "legal",
      value: { classification: "CONFIDENTIAL", retentionYears: "7", folderId: "f-proj" },
    });
    mocks.putDefaults.mockResolvedValue({
      departmentId: "legal",
      value: { classification: "CONFIDENTIAL", retentionYears: "7", folderId: "f-proj" },
    });

    renderPage();

    await waitFor(() => expect(selectWithOptionValue("CONFIDENTIAL").value).toBe("CONFIDENTIAL"));
    expect(mocks.getDefaults).toHaveBeenCalledWith("legal");

    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    await waitFor(() =>
      expect(mocks.putDefaults).toHaveBeenCalledWith("legal", {
        classification: "CONFIDENTIAL",
        retentionYears: "7",
        folderId: "f-proj",
      }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حفظ القيم الافتراضية" }));
  });

  it("reports load and save failures against the API", async () => {
    mockStore();
    const app = mockApp({ apiMode: true });
    mocks.getDefaults.mockRejectedValue(new Error("offline"));
    mocks.putDefaults.mockRejectedValue(new Error("offline"));

    renderPage();

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));

    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));
    await waitFor(() => expect(mocks.putDefaults).toHaveBeenCalledTimes(1));
    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") });
  });

  it("ignores unreadable stored defaults and keeps the fallbacks", () => {
    mockStore();
    mockApp();
    localStorage.setItem("edas.v1.departmentDefaults.legal", "{not json");

    renderPage();

    expect(selectWithOptionValue("INTERNAL").value).toBe("INTERNAL");
    expect(selectWithOptionValue("5").value).toBe("5");
  });
});
