import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, Document, FolderNode, Notification, TaskItem } from "../types";
import { config } from "../config";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { UserDashboard } from "./dashboard-user";

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
    modifiedAt: "2026-01-03",
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

const pendingTask: TaskItem = {
  id: "t-1",
  docTitle: "عقد بانتظار الموافقة",
  docNo: "EDAS-2026002",
  workflow: "اعتماد العقود",
  step: "مراجعة قانونية",
  from: "الشؤون القانونية",
  deptId: "legal",
  priority: "high",
  due: "2026-02-01",
  slaStatus: "breached",
  age: "6 أيام",
  status: "assigned",
};

const completedTask: TaskItem = {
  ...pendingTask,
  id: "t-2",
  docTitle: "عقد مكتمل",
  status: "completed",
};

const notification: Notification = {
  id: "n-1",
  type: "approval",
  title: "طلب موافقة",
  body: "بانتظار قرارك",
  time: "2026-01-30 09:00",
  read: false,
};

const audit: AuditEntry = {
  id: "aud-1",
  datetime: "2026-01-30 09:10",
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

const folder: FolderNode = {
  id: "f-1",
  name: "مجلد العقود",
  nameEn: "Contracts folder",
  parentId: null,
  type: "dept",
  docs: 12,
  subfolders: 2,
  accessScope: "قسم",
};

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    scopedDocs: [doc(), doc({ id: "doc-2", title: "محضر اجتماع", size: "512 KB", modifiedAt: "2026-01-04" })],
    tasks: [pendingTask, completedTask],
    notifications: [notification, { ...notification, id: "n-2", read: true }],
    summary: null,
    auditLog: [audit],
    departments: { items: [{ id: "legal", name: "الشؤون القانونية", nameEn: "Legal Affairs" }] },
    visibleFolders: [folder],
    docsMeta: { total: 2, loaded: 2 },
    docsReady: true,
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = {
    t,
    lang: "ar",
    role: "system_admin",
    user: {
      id: "u-1",
      name: "أمل السبيعي",
      nameEn: "Amal Al-Subaie",
      jobTitle: "مسؤولة أرشفة",
      jobTitleEn: "Archiving Officer",
      department: "legal",
    },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/documents/new" element={<div>شاشة رفع وثيقة</div>} />
        <Route path="/documents/:id" element={<div>صفحة الوثيقة</div>} />
        <Route path="/workflow/:id" element={<div>صفحة المهمة</div>} />
        <Route path="/library/folders/:id" element={<div>صفحة المجلد</div>} />
        <Route path="/reports" element={<div>مركز التقارير</div>} />
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

describe("user dashboard", () => {
  it("shows a skeleton until the documents load", () => {
    mockStore({ docsReady: false });
    mockApp();

    const { container } = renderPage();

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText(t("dash.recentDocs"))).not.toBeInTheDocument();
  });

  it("renders the greeting, hero figures and KPI cards", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByText(/مساء الخير/)).toBeInTheDocument();
    expect(screen.getAllByText(/أمل السبيعي/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t("dash.kpiDocs")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t("dash.kpiUploads")).length).toBeGreaterThan(0);
    expect(screen.getByText(t("dash.kpiDrafts"))).toBeInTheDocument();
    expect(screen.getAllByText(t("dash.kpiNotifs")).length).toBeGreaterThan(0);
  });

  it("opens the upload screen from a quick action", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: t("doc.upload") })[0]);

    expect(screen.getByText("شاشة رفع وثيقة")).toBeInTheDocument();
  });

  it("opens a recent document and stays on the dashboard for non-navigable rows", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByText("محضر اجتماع"));

    expect(screen.getByText("صفحة الوثيقة")).toBeInTheDocument();
  });

  it("switches the upload trend range", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "٣ أشهر" }));
    fireEvent.click(screen.getByRole("button", { name: "٦ أشهر" }));
    fireEvent.click(screen.getByRole("button", { name: "الكل" }));

    expect(screen.getByText(t("dash.chartUploads"))).toBeInTheDocument();
  });

  it("opens a pending task and hides completed tasks", () => {
    mockStore();
    mockApp();

    renderPage();
    expect(screen.queryByText("عقد مكتمل")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("dash.followTask") }));

    expect(screen.getByText("صفحة المهمة")).toBeInTheDocument();
  });

  it("opens a favorite folder", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /مجلد العقود/ }));

    expect(screen.getByText("صفحة المجلد")).toBeInTheDocument();
  });

  it("computes the storage usage from document sizes and shows the department split", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getAllByText("1.5 MB").length).toBeGreaterThan(0);
    expect(screen.getByText(t("dash.storageByDept"))).toBeInTheDocument();
    expect(screen.getAllByText("الشؤون القانونية").length).toBeGreaterThan(0);
  });

  it("renders the activity timeline", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getAllByText("رفع وثيقة").length).toBeGreaterThan(0);
    expect(screen.getByText("وثيقة · أمل السبيعي")).toBeInTheDocument();
  });

  it("renders the empty states when the store has no data", () => {
    mockStore({ scopedDocs: [], tasks: [], notifications: [], auditLog: [], visibleFolders: [], docsMeta: { total: 0, loaded: 0 } });
    mockApp();

    renderPage();

    expect(screen.getByText(t("dash.noDocs"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noPendingTasks"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noActivity"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noFolders"))).toBeInTheDocument();
    expect(screen.getByText(t("dash.noData"))).toBeInTheDocument();
  });

  it("uses the server summary and warns when only part of the documents are loaded", () => {
    config.useApi = true;
    mockStore({
      summary: {
        documents: { total: 9, byStatus: { DRAFT: 2, ARCHIVED: 5 }, byClassification: { PUBLIC: 9 } },
        approvals: { pending: 3 },
        retention: { overdue: 4 },
        legalHolds: { active: 0 },
        users: { total: 5 },
        tasks: { open: 1 },
        trend: [
          { month: "2026-01", uploaded: 2, archived: 1 },
          { month: "2026-02", uploaded: 4, archived: 3 },
        ],
      },
      docsMeta: { total: 9, loaded: 2 },
    });
    mockApp();

    renderPage();

    expect(screen.getByText(t("dash.topFolders"))).toBeInTheDocument();
    expect(screen.getByText("تُحتسب من 2 من 9 وثيقة محمّلة.")).toBeInTheDocument();
  });
});
