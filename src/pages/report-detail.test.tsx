import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry, Document, ErrorItem, LegalHold, RetentionItem } from "../types";
import { translations } from "../i18n";
import { reportTemplates } from "../data";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  api: {
    setReportTemplateFavorite: vi.fn(),
    createReportRun: vi.fn(),
    downloadReportRun: vi.fn(),
  },
  openDownload: vi.fn(),
  config: { useApi: false },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));
vi.mock("../lib/download", () => ({ openDownload: mocks.openDownload }));
vi.mock("../config", () => ({ config: mocks.config }));

import { ReportDetail } from "./report-detail";

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
    category: "أوامر الشراء",
    categoryEn: "Purchase orders",
    categoryId: "po",
    deptId: "legal",
    sectionId: "sec-1",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "archived",
    createdAt: "2026-06-01",
    modifiedAt: "2026-06-02",
    retentionEnd: "2031-06-01",
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

const audit: AuditEntry[] = [
  {
    id: "a-1",
    datetime: "2026-06-10T09:00:00.000Z",
    user: "أمل السبيعي",
    module: "documents",
    action: "رفع وثيقة",
    entityType: "document",
    entityId: "doc-1",
    deptId: "legal",
    ip: "10.0.0.1",
    result: "success",
    correlation: "c-1",
    detail: "",
  },
  {
    id: "a-2",
    datetime: "2026-06-11T10:00:00.000Z",
    user: "أمل السبيعي",
    module: "documents",
    action: "تعديل وثيقة",
    entityType: "document",
    entityId: "doc-1",
    deptId: "legal",
    ip: "10.0.0.1",
    result: "failure",
    correlation: "c-2",
    detail: "",
  },
  {
    id: "a-3",
    datetime: "2026-06-12T11:00:00.000Z",
    user: "خالد العمري",
    module: "workflow",
    action: "اعتماد",
    entityType: "approval",
    entityId: "ap-1",
    deptId: "it",
    ip: "10.0.0.2",
    result: "success",
    correlation: "c-3",
    detail: "",
  },
];

const retentionItem: RetentionItem = {
  id: "ret-1",
  docTitle: "عقد التوريد",
  docNo: "EDAS-2026001",
  policy: "سياسة العقود",
  retentionEnd: "2026-05-01",
  deptId: "legal",
  owner: "أمل السبيعي",
  onHold: true,
  proposedAction: "إتلاف",
  proposedActionEn: "Destroy",
  daysLeft: -12,
  reviewStatus: "pending",
};

const hold: LegalHold = {
  id: "hold-1",
  ref: "LH-1",
  reason: "نزاع قضائي",
  placedBy: "أمل السبيعي",
  placedAt: "2026-03-01",
  caseRef: "CASE-77",
  items: 3,
  status: "active",
};

const errorItem: ErrorItem = {
  id: "err-1",
  datetime: "2026-06-10T09:00:00.000Z",
  severity: "critical",
  code: "E_UPLOAD",
  module: "files",
  path: "/files",
  message: "فشل الرفع",
  affectedUser: "أمل السبيعي",
  correlation: "c-1",
  status: "new",
  owner: "خالد العمري",
};

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    templates: reportTemplates,
    scopedDocs: [doc(), doc({ id: "doc-2", docNo: "EDAS-2026002", deptId: "it", status: "draft", size: "512 KB" })],
    departments: {
      items: [
        { id: "legal", name: "الشؤون القانونية", nameEn: "Legal", code: "LEG" },
        { id: "it", name: "تقنية المعلومات", nameEn: "IT", code: "IT" },
      ],
    },
    auditLog: audit,
    retention: [retentionItem],
    holds: { items: [hold] },
    errors: { items: [errorItem] },
    pendingApprovals: [
      {
        id: "ap-1",
        documentId: "doc-1",
        document: { id: "doc-1", docNo: "EDAS-2026001", title: "عقد التوريد", departmentId: "legal", status: "PENDING" },
        chainId: "ch-1",
        chainName: "سلسلة العقود",
        status: "PENDING",
        startedById: "u-1",
        startedAt: "2026-06-01T09:00:00.000Z",
        completedAt: null,
        steps: [],
        currentStep: { order: 1, role: "DEPT_MANAGER" },
        decisions: [],
      },
    ],
    docsReady: true,
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = storeState(overrides);
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const app = { t, lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(id = "rpt-1") {
  return render(
    <MemoryRouter initialEntries={[`/reports/${id}`]}>
      <Routes>
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/reports" element={<div>قائمة التقارير</div>} />
        <Route path="/reports/scheduled" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.api.setReportTemplateFavorite.mockReset();
  mocks.api.createReportRun.mockReset();
  mocks.api.downloadReportRun.mockReset();
  mocks.openDownload.mockReset();
  mocks.config.useApi = false;
});

describe("report detail", () => {
  it("renders the loading shell while templates are not ready", () => {
    mockStore({ templates: [], docsReady: false });
    mockApp();

    renderPage();

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("shows a not-found state and returns to the report list", () => {
    mockStore({ templates: [] });
    mockApp();

    renderPage("rpt-99");

    expect(screen.getByText("التقرير غير موجود")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى التقارير" }));
    expect(screen.getByText("قائمة التقارير")).toBeInTheDocument();
  });

  it("previews the documents-by-department template", () => {
    mockStore();
    mockApp();

    renderPage("rpt-1");

    expect(screen.getByText("إجمالي الوثائق")).toBeInTheDocument();
    expect(screen.getByText("الوثائق المؤرشفة")).toBeInTheDocument();
    expect(screen.getByText("1.5 MB")).toBeInTheDocument();
    expect(screen.getByText("التفاصيل حسب الإدارة")).toBeInTheDocument();
    expect(screen.getByText("LEG")).toBeInTheDocument();
    expect(screen.getByText("الوثائق حسب الإدارة")).toBeInTheDocument();
  });

  it("previews the six-month storage usage template", () => {
    mockStore();
    mockApp();

    renderPage("rpt-2");

    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 7);
    expect(screen.getAllByText("استخدام التخزين").length).toBeGreaterThan(0);
    expect(screen.getByText("الاستهلاك خلال الأشهر الستة الأخيرة")).toBeInTheDocument();
    expect(screen.getAllByText(currentMonth).length).toBeGreaterThan(0);
  });

  it("groups activity by user and shows the preview note", () => {
    mockStore();
    mockApp();

    renderPage("rpt-3");

    expect(screen.getAllByText("نشاط المستخدمين").length).toBeGreaterThan(0);
    expect(screen.getByText("النشاط حسب المستخدم")).toBeInTheDocument();
    expect(screen.getAllByText("أمل السبيعي").length).toBeGreaterThan(0);
    expect(screen.getByText(/تعرض المعاينة الأحداث المحمّلة/)).toBeInTheDocument();
  });

  it("previews pending approvals with the current step", () => {
    mockStore();
    mockApp();

    renderPage("rpt-4");

    expect(screen.getAllByText("زمن إنجاز الموافقات").length).toBeGreaterThan(0);
    expect(screen.getByText("الموافقات المعلّقة حالياً")).toBeInTheDocument();
    expect(screen.getByText("EDAS-2026001")).toBeInTheDocument();
    expect(screen.getByText("سلسلة العقود")).toBeInTheDocument();
    expect(screen.getByText("1 · DEPT_MANAGER")).toBeInTheDocument();
  });

  it("previews the retention forecast with its proposed actions", () => {
    mockStore();
    mockApp();

    renderPage("rpt-5");

    expect(screen.getAllByText("توقعات الاحتفاظ والإتلاف").length).toBeGreaterThan(0);
    expect(screen.getByText("التفاصيل حسب الوثيقة")).toBeInTheDocument();
    expect(screen.getByText("سياسة العقود")).toBeInTheDocument();
    expect(screen.getByText("إتلاف")).toBeInTheDocument();
    expect(screen.getByText("التوزيع حسب الإجراء المقترح")).toBeInTheDocument();
  });

  it("previews audit compliance results", () => {
    mockStore();
    mockApp();

    renderPage("rpt-6");

    expect(screen.getAllByText("الامتثال وسجل التدقيق").length).toBeGreaterThan(0);
    expect(screen.getByText("أحدث أحداث سجل التدقيق")).toBeInTheDocument();
    expect(screen.getAllByText("فاشلة").length).toBeGreaterThan(0);
    expect(screen.getByText("رفع وثيقة")).toBeInTheDocument();
  });

  it("disables report generation without the server", () => {
    mockStore();
    mockApp();

    renderPage();

    const run = screen.getByRole("button", { name: "تشغيل" });
    expect(run).toBeDisabled();
    expect(run.getAttribute("title")).toBe("يتطلب توليد التقارير اتصالاً بالخادم");
    expect(screen.getByText("محلي فقط")).toBeInTheDocument();
  });

  it("marks the local error report as unavailable on the server", () => {
    mocks.config.useApi = true;
    mockStore();
    mockApp();

    renderPage("rpt-7");

    expect(screen.getByText("محلي فقط")).toBeInTheDocument();
    expect(screen.getByText("E_UPLOAD")).toBeInTheDocument();
    const run = screen.getByRole("button", { name: "تشغيل" });
    expect(run).toBeDisabled();
    expect(run.getAttribute("title")).toMatch(/سجل الأخطاء المحلي/);
  });

  it("previews the legal hold register", () => {
    mockStore();
    mockApp();

    renderPage("rpt-8");

    expect(screen.getAllByText("سجل الحجوزات القانونية").length).toBeGreaterThan(0);
    expect(screen.getByText("CASE-77")).toBeInTheDocument();
    expect(screen.getByText("نزاع قضائي")).toBeInTheDocument();
  });

  it("keeps report generation disabled in offline mode", () => {
    mockStore();
    mockApp();

    renderPage("rpt-1");

    const run = screen.getByRole("button", { name: "تشغيل" });
    expect(run).toBeDisabled();
    expect(run.getAttribute("title")).toMatch(/يتطلب توليد التقارير اتصالاً بالخادم/);
  });

  it("toggles favorites offline", () => {
    mockStore();
    const app = mockApp();

    renderPage("rpt-3");

    fireEvent.click(screen.getByRole("button", { name: "تفضيل" }));

    expect(screen.getByRole("button", { name: "في المفضلة" })).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "أُضيف إلى المفضلة", message: "نشاط المستخدمين" });
  });

  it("persists favorites through the API", async () => {
    mocks.config.useApi = true;
    mocks.api.setReportTemplateFavorite.mockResolvedValue(undefined);
    mockStore();
    const app = mockApp();

    renderPage("rpt-3");

    fireEvent.click(screen.getByRole("button", { name: "تفضيل" }));

    await waitFor(() => expect(mocks.api.setReportTemplateFavorite).toHaveBeenCalledWith("rpt-3", true));
    await waitFor(() => expect(screen.getByRole("button", { name: "في المفضلة" })).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "أُضيف إلى المفضلة", message: "نشاط المستخدمين" });
  });

  it("reports API failures when favoriting", async () => {
    mocks.config.useApi = true;
    mocks.api.setReportTemplateFavorite.mockRejectedValue(new Error("offline"));
    mockStore();
    const app = mockApp();

    renderPage("rpt-3");

    fireEvent.click(screen.getByRole("button", { name: "تفضيل" }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByRole("button", { name: "تفضيل" })).toBeInTheDocument();
  });

  it("generates the report through the API and downloads it", async () => {
    mocks.config.useApi = true;
    mocks.api.createReportRun.mockResolvedValue({ id: "run-1", status: "completed" });
    mocks.api.downloadReportRun.mockResolvedValue({ url: "https://files.example/report.pdf" });
    mockStore();
    const app = mockApp();

    renderPage("rpt-1");

    fireEvent.click(screen.getByRole("button", { name: "تشغيل" }));

    await waitFor(() => expect(mocks.api.createReportRun).toHaveBeenCalledWith({ reportType: "rpt-1", format: "pdf" }));
    await waitFor(() => expect(mocks.api.downloadReportRun).toHaveBeenCalledWith("run-1"));
    expect(mocks.openDownload).toHaveBeenCalledWith("https://files.example/report.pdf");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء التقرير", message: "حجم الوثائق حسب الإدارة" });
  });

  it("does not download reports whose run did not complete", async () => {
    mocks.config.useApi = true;
    mocks.api.createReportRun.mockResolvedValue({ id: "run-2", status: "failed" });
    mockStore();
    const app = mockApp();

    renderPage("rpt-2");

    fireEvent.click(screen.getByRole("button", { name: "تشغيل" }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(mocks.api.downloadReportRun).not.toHaveBeenCalled();
    expect(mocks.openDownload).not.toHaveBeenCalled();
  });

  it("schedules the current report", () => {
    mockStore();
    mockApp();

    renderPage("rpt-1");

    fireEvent.click(screen.getByRole("button", { name: "جدولة" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/reports/scheduled?report=rpt-1");
  });

  it("uses the English template metadata when the language is English", () => {
    mockStore();
    mockApp("en");

    renderPage("rpt-1");

    expect(screen.getAllByText("Documents by Department").length).toBeGreaterThan(0);
    expect(screen.getByText("Details by department")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorited" })).toBeInTheDocument();
  });
});
