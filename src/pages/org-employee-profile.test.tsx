import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, Department, DocUser, Employee, Project, Section } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { EmployeeProfile } from "./org-employee-profile";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const dept: Department = {
  id: "legal",
  name: "الشؤون القانونية",
  nameEn: "Legal Affairs",
  code: "LEG",
  parentId: null,
  manager: "أ. سارة المطيري",
  employees: 19,
  docs: 980,
  status: "active",
};

const section: Section = {
  id: "fin-ap",
  name: "الحسابات الدائنة",
  nameEn: "Accounts Payable",
  code: "FIN-AP",
  deptId: "fin",
  head: "أ. لمى القرني",
  employees: 14,
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
  sectionId: "fin-ap",
  manager: "أ. سارة المطيري",
  email: "amal@edas.gov",
  phone: "+966 501234567",
  userId: "u-1",
  status: "active",
  initials: "أم",
  color: "bg-navy-600",
};

const user: DocUser = {
  id: "u-1",
  name: "أمل السبيعي",
  nameEn: "Amal Al-Subaie",
  username: "amal.subaie",
  email: "amal@edas.gov",
  empNo: "EMP-1024",
  jobTitle: "مسؤولة أرشفة",
  jobTitleEn: "Archiving Officer",
  deptId: "legal",
  role: "archivist",
  status: "active",
  lastLogin: "2026-01-11 09:21",
  failedAttempts: 0,
  activeSessions: 2,
  initials: "أم",
  color: "bg-navy-600",
};

const project: Project = {
  id: "p-alpha",
  name: "مشروع ألفا",
  nameEn: "Project Alpha",
  code: "PRJ-A",
  manager: "أمل السبيعي",
  status: "active",
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  departments: ["legal"],
  members: 24,
  docs: 412,
};

const audit: AuditEntry = {
  id: "aud-1",
  datetime: "2026-01-28 10:15",
  user: "أمل السبيعي",
  module: "الوثائق",
  action: "رفع وثيقة",
  entityType: "وثيقة",
  entityId: "EDAS-2026001",
  deptId: "legal",
  ip: "10.0.1.4",
  result: "success",
  correlation: "COR-90001",
  detail: "تم رفع الوثيقة.",
};

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    employees: { items: [employee] },
    users: { items: [user] },
    departments: { items: [dept] },
    sections: { items: [section] },
    projects: { items: [project] },
    auditLog: [audit],
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role: "system_admin" | "employee" = "system_admin") {
  const app = {
    t,
    lang: "ar",
    role,
    user: { id: "u-1", name: "أمل السبيعي", department: "legal" },
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe({ prefix }: { prefix: string }) {
  const location = useLocation();
  const state = location.state as Record<string, unknown> | null;
  return <div>{`${prefix}:${location.pathname}:${String(state?.editEmployeeId ?? state?.editProjectId ?? "")}`}</div>;
}

function renderPage(url = "/org/employees/emp-1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/org/employees/:id" element={<EmployeeProfile />} />
        <Route path="/org/employees" element={<LocationProbe prefix="employees" />} />
        <Route path="/org/projects/:id" element={<LocationProbe prefix="project" />} />
        <Route path="/admin/users" element={<LocationProbe prefix="users" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("employee profile", () => {
  it("explains when the employee record does not exist", () => {
    mockStore({ employees: { items: [] } });
    mockApp();

    renderPage();

    expect(screen.getByText("لم يتم العثور على الموظف")).toBeInTheDocument();
  });

  it("renders the overview with the employee number, title and status", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByText("EMP-1024")).toBeInTheDocument();
    expect(screen.getAllByText("مسؤولة أرشفة").length).toBeGreaterThan(0);
    expect(screen.getAllByText(t("g.active")).length).toBeGreaterThan(0);
    expect(screen.getByText("الشؤون القانونية")).toBeInTheDocument();
  });

  it("opens the edit action only for a role allowed to manage the employee's department", () => {
    mockStore();
    mockApp("system_admin");
    const { unmount } = renderPage();

    expect(screen.getByRole("button", { name: t("g.edit") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("g.edit") }));
    expect(screen.getByText(/^employees:\/org\/employees:emp-1$/)).toBeInTheDocument();
    unmount();

    mockApp("employee");
    renderPage();
    expect(screen.queryByRole("button", { name: t("g.edit") })).not.toBeInTheDocument();
  });

  it("switches between the organization, contact and activity tabs", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الهيكل التنظيمي" }));
    expect(screen.getAllByText("الشؤون القانونية").length).toBeGreaterThan(0);
    expect(screen.getByText("الحسابات الدائنة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "بيانات الاتصال" }));
    expect(screen.getByText("amal@edas.gov")).toBeInTheDocument();
    expect(screen.getByText("+966 501234567")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: t("doc.activityLog") }));
    expect(screen.getByText("رفع وثيقة")).toBeInTheDocument();
    expect(screen.getByText("الوثائق · وثيقة")).toBeInTheDocument();
  });

  it("links the employee's projects and opens the selected project", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("nav.projects") }));
    fireEvent.click(screen.getByRole("button", { name: /مشروع ألفا/ }));

    expect(screen.getByText(/^project:\/org\/projects\/p-alpha:/)).toBeInTheDocument();
  });

  it("shows the linked account and lets an administrator jump to user management", () => {
    mockStore();
    mockApp("system_admin");

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "حساب المستخدم" }));

    expect(screen.getAllByText(/amal\.subaie/).length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إدارة المستخدمين" }));

    expect(screen.getByText(/^users:\/admin\/users:/)).toBeInTheDocument();
  });

  it("renders the empty states for projects, account and activity", () => {
    mockStore({ projects: { items: [] }, users: { items: [] }, auditLog: [] });
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("nav.projects") }));
    expect(screen.getByText("لا مشاريع مرتبطة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "حساب المستخدم" }));
    expect(screen.getByText("لا حساب مستخدم مرتبط")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: t("doc.activityLog") }));
    expect(screen.getByText("لا نشاط مسجّل")).toBeInTheDocument();
  });

  it("falls back to the department and section identifiers when the cache has no names", () => {
    mockStore({ departments: { items: [] }, sections: { items: [] } });
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الهيكل التنظيمي" }));

    expect(screen.getByText("legal")).toBeInTheDocument();
    expect(screen.getByText("fin-ap")).toBeInTheDocument();
  });
});
