import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document, RetentionItem, TaskItem } from "../types";
import { config } from "../config";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { DepartmentDashboard } from "./dashboard-department";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
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
  };
}

const breachedTask: TaskItem = {
  id: "t-1",
  docTitle: "عقد متأخر",
  docNo: "EDAS-2026009",
  workflow: "اعتماد العقود",
  step: "مراجعة قانونية",
  from: "الشؤون القانونية",
  deptId: "legal",
  priority: "high",
  due: "2026-01-10",
  slaStatus: "breached",
  age: "6 أيام",
  status: "assigned",
};

const onTrackTask: TaskItem = {
  ...breachedTask,
  id: "t-2",
  docTitle: "عقد سليم",
  slaStatus: "ontrack",
};

const retentionItem: RetentionItem = {
  id: "ret-1",
  docTitle: "وثيقة منتهية",
  docNo: "EDAS-2026010",
  policy: "احتفاظ 5 سنوات",
  retentionEnd: "2025-12-31",
  deptId: "legal",
  owner: "أمل السبيعي",
  onHold: false,
  proposedAction: "مراجعة",
  proposedActionEn: "Review",
  daysLeft: -12,
  reviewStatus: "pending",
};

const summary = {
  documents: {
    total: 10,
    byStatus: { ARCHIVED: 4, DRAFT: 2 },
    byClassification: { PUBLIC: 6, CONFIDENTIAL: 3, SECRET: 1 },
  },
  approvals: { pending: 2 },
  retention: { overdue: 3 },
  legalHolds: { active: 1 },
  users: { total: 12 },
  tasks: { open: 4 },
  trend: [],
};

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    summary: null,
    departments: { items: [{ id: "legal", name: "الشؤون القانونية", nameEn: "Legal Affairs", code: "LEG", docs: 980 }] },
    tasks: [breachedTask, onTrackTask],
    scopedDocs: [doc(), doc({ id: "doc-2", owner: "خالد العتيبي" }), doc({ id: "doc-3", owner: "أمل السبيعي" })],
    retention: [retentionItem, { ...retentionItem, id: "ret-2", daysLeft: 3 }],
    docsReady: true,
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role: "archivist" | "employee" = "archivist") {
  const app = { t, lang: "ar", role, user: { id: "u-1", name: "أمل السبيعي", department: "legal" }, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/department"]}>
      <Routes>
        <Route path="/dashboard/department" element={<DepartmentDashboard />} />
        <Route path="/workflow/:id" element={<div>صفحة المهمة</div>} />
        <Route path="/policies/retention-queue" element={<div>طابور الاحتفاظ</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  config.useApi = false;
});

afterEach(() => {
  config.useApi = false;
});

describe("department dashboard", () => {
  it("shows a skeleton until the documents load", () => {
    mockStore({ docsReady: false });
    mockApp();

    const { container } = renderPage();

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText(t("nav.dashboardDept"))).not.toBeInTheDocument();
  });

  it("computes the KPI cards and summary numbers from the store", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getByText(t("dash.deptArchived"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.kpiApprovals"))).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("prefers the server summary for archived, approvals and retention figures", () => {
    mockStore({ summary });
    mockApp();

    renderPage();

    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
  });

  it("lists the most active users and the breached task bottlenecks", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByText(t("dash.topUsers"))).toBeInTheDocument();
    expect(screen.getAllByText("أمل السبيعي").length).toBeGreaterThan(0);
    expect(screen.getByText("خالد العتيبي")).toBeInTheDocument();
    expect(screen.getByText("عقد متأخر")).toBeInTheDocument();
    expect(screen.queryByText("عقد سليم")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("dash.followTask") }));
    expect(screen.getByText("صفحة المهمة")).toBeInTheDocument();
  });

  it("opens the retention queue for a role that can review it", () => {
    mockStore();
    mockApp("archivist");

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "فتح طابور الاحتفاظ" }));

    expect(screen.getByText("طابور الاحتفاظ")).toBeInTheDocument();
  });

  it("hides the retention queue shortcut from a role without access", () => {
    mockStore();
    mockApp("employee");

    renderPage();

    expect(screen.queryByRole("button", { name: t("dash.retentionRisk") })).not.toBeInTheDocument();
  });

  it("shows empty-state text when no chart data is available", () => {
    mockStore({ summary: null, scopedDocs: [], tasks: [], retention: [] });
    mockApp();

    renderPage();

    expect(screen.getByText(t("dash.noChartData"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noData"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noBottlenecks"))).toBeInTheDocument();
  });

  it("renders the classification donut when the API summary is available", () => {
    config.useApi = true;
    mockStore({ summary });
    mockApp();

    renderPage();

    expect(screen.queryByText(t("dash.noChartData"))).not.toBeInTheDocument();
    expect(screen.getByText(t("dash.chartByCat"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.chartByDept"))).toBeInTheDocument();
  });

  it("exports the department summary as CSV", () => {
    mockStore();
    mockApp();
    const createObjectURL = vi.fn(() => "blob:summary");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: t("g.export") }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
