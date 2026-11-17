import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportTemplate } from "../types";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    reportRuns: vi.fn(),
    reportSchedules: vi.fn(),
    setReportTemplateFavorite: vi.fn(),
    createReportRun: vi.fn(),
    downloadReportRun: vi.fn(),
  },
  openDownload: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));
vi.mock("../lib/download", () => ({ openDownload: mocks.openDownload }));

import { ReportsHome } from "./reports-home";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function template(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    id: "rpt-1",
    name: "تقرير الوثائق",
    nameEn: "Documents report",
    category: "الوثائق",
    categoryEn: "Documents",
    desc: "حالة الوثائق وأعمارها",
    descEn: "Documents status and age",
    favorite: false,
    lastRun: "2026-02-01",
    schedule: "—",
    icon: "bar",
    ...overrides,
  };
}

const TEMPLATES = [
  template({ favorite: true, schedule: "يومي" }),
  template({
    id: "rpt-2",
    name: "تقرير العمليات",
    nameEn: "Operations report",
    category: "العمليات",
    categoryEn: "Operations",
    lastRun: "2026-02-02",
    icon: "gauge",
  }),
  template({
    id: "rpt-3",
    name: "تقرير الامتثال",
    nameEn: "Compliance report",
    category: "الامتثال",
    categoryEn: "Compliance",
    favorite: true,
    lastRun: "2026-02-03",
    icon: "shield",
  }),
  template({ id: "rpt-7", name: "تقرير الأخطاء", nameEn: "Errors report", category: "العمليات", categoryEn: "Operations" }),
];

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = { templates: TEMPLATES, ...overrides };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    user: { name: "أمل السبيعي" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/reports"]}>
      <Routes>
        <Route
          path="/reports"
          element={
            <>
              <ReportsHome />
              <LocationProbe />
            </>
          }
        />
        <Route path="/reports/:id" element={<LocationProbe />} />
        <Route path="/reports/scheduled" element={<LocationProbe />} />
        <Route path="/reports/builder" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const RUN_OK = {
  id: "run-1",
  reportType: "rpt-1",
  format: "xlsx",
  status: "completed",
  createdAt: "2026-02-01T08:00:00.000Z",
  completedAt: "2026-02-01T08:00:10.000Z",
};

const RUN_FAILED = {
  id: "run-2",
  reportType: "rpt-2",
  format: "pdf",
  status: "failed",
  createdAt: "2026-02-02T08:00:00.000Z",
  completedAt: null,
};

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.openDownload.mockReset();
  mocks.config.useApi = false;
});

describe("reports catalog (offline)", () => {
  it("renders the stats, favourites, catalog and recent reports", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.reportsHome")).length).toBeGreaterThan(0);
    expect(screen.getByText("إجمالي التقارير")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getAllByText("المفضلة").length).toBeGreaterThan(0);
    expect(screen.getByText("المجدولة")).toBeInTheDocument();
    expect(screen.getByText("الفئات")).toBeInTheDocument();
    expect(screen.getByText("المفضلة (2)")).toBeInTheDocument();
    expect(screen.getByText("جميع التقارير (4)")).toBeInTheDocument();
    expect(screen.getAllByText("تقرير الوثائق").length).toBeGreaterThan(1);
    expect(screen.getAllByText(/آخر تشغيل/).length).toBe(4);
  });

  it("filters by search and category and clears the filters", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("ابحث في التقارير…"), { target: { value: "تقرير العمليات" } });
    expect(screen.getByText("جميع التقارير (1)")).toBeInTheDocument();
    expect(screen.queryByText("المفضلة (2)")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("ابحث في التقارير…"), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد تقارير مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    expect(screen.getByText("جميع التقارير (4)")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الفئة" }), { target: { value: "الامتثال" } });
    expect(screen.getByText("جميع التقارير (1)")).toBeInTheDocument();
    expect(screen.getAllByText("تقرير الامتثال").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("ابحث في التقارير…"), { target: { value: "العمليات" } });
    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByText("جميع التقارير (1)")).toBeInTheDocument();
  });

  it("toggles a favourite and clears them all", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "تفضيل" })[0]);
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "أُزيل من المفضلة", message: "تقرير الوثائق" });
    expect(screen.getByText("المفضلة (1)")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "تفضيل" })[1]);
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "أُضيف إلى المفضلة", message: "تقرير الوثائق" });
    expect(screen.getByText("المفضلة (2)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح المفضلة" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "أُزيلت المفضلة" });
    expect(screen.queryByText(/المفضلة \(/)).toBeNull();
  });

  it("navigates from cards, the run button and the recent list", () => {
    mockStore();
    mockApp();
    const view = renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /تقرير الوثائق/ })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/rpt-1");

    view.unmount();
    const second = renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "تشغيل" })[3]);
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/rpt-2");

    second.unmount();
    renderPage();
    fireEvent.click(screen.getAllByText(/آخر تشغيل/)[2].closest("button") as HTMLElement);
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/rpt-3");
  });

  it("disables card exports in demo mode and links the header actions", () => {
    mockStore();
    mockApp();
    const view = renderPage();

    for (const button of screen.getAllByRole("button", { name: t("g.export") })) expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "المجدولة" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/scheduled");

    view.unmount();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: t("nav.reportBuilder") }));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/builder");
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getByText("Total reports")).toBeInTheDocument();
    expect(screen.getByText("Favorites (2)")).toBeInTheDocument();
    expect(screen.getByText("All reports (4)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search reports…")).toBeInTheDocument();
    expect(screen.getAllByText("Recently run").length).toBeGreaterThan(0);
  });
});

describe("reports catalog (API)", () => {
  it("shows the server schedules count and run history with downloads", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [RUN_OK, RUN_FAILED] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [{ id: "rs-1" }, { id: "rs-2" }] });
    mocks.api.downloadReportRun.mockResolvedValue({ url: "https://files.example/run-1.xlsx" });
    mockApp();
    renderPage();

    expect(await screen.findByText("تقرير الوثائق · XLSX")).toBeInTheDocument();
    expect(screen.getAllByText("مكتمل").length).toBe(1);
    expect(screen.getByText("فشل")).toBeInTheDocument();

    const failedRun = screen.getByText("تقرير العمليات · PDF").closest("button") as HTMLButtonElement;
    expect(failedRun).toBeDisabled();

    fireEvent.click(screen.getByText("تقرير الوثائق · XLSX").closest("button") as HTMLElement);
    await waitFor(() => expect(mocks.api.downloadReportRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(mocks.openDownload).toHaveBeenCalledWith("https://files.example/run-1.xlsx"));
  });

  it("shows a run load error and retries", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns
      .mockRejectedValueOnce(new ApiError(500, "DOWN", "down", undefined, null, "تعذّر تحميل التقارير"))
      .mockResolvedValueOnce({ items: [] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mockApp();
    renderPage();

    expect(await screen.findByText("تعذّر تحميل التقارير من الخادم")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("لا توجد تقارير منشأة على الخادم بعد")).toBeInTheDocument();
  });

  it("saves favourites through the API and reports failures", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mocks.api.setReportTemplateFavorite.mockRejectedValueOnce(new ApiError(409, "BUSY", "busy", undefined, null, "المفضلة مشغولة"));
    const app = mockApp();
    renderPage();
    await waitFor(() => expect(mocks.api.reportRuns).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: "تفضيل" })[3]);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "المفضلة مشغولة" }));

    mocks.api.setReportTemplateFavorite.mockResolvedValueOnce({});
    fireEvent.click(screen.getAllByRole("button", { name: "تفضيل" })[3]);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "أُضيف إلى المفضلة", message: "تقرير العمليات" }));
    expect(mocks.api.setReportTemplateFavorite).toHaveBeenLastCalledWith("rpt-2", true);
  });

  it("generates a report from a card and downloads it", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mocks.api.createReportRun.mockResolvedValue({ id: "run-9", status: "completed" });
    mocks.api.downloadReportRun.mockResolvedValue({ url: "https://files.example/run-9.xlsx" });
    const app = mockApp();
    renderPage();
    await waitFor(() => expect(mocks.api.reportRuns).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: t("g.export") })[0]);
    await waitFor(() => expect(mocks.api.createReportRun).toHaveBeenCalledWith({ reportType: "rpt-1", format: "xlsx" }));
    await waitFor(() => expect(mocks.openDownload).toHaveBeenCalledWith("https://files.example/run-9.xlsx"));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء التقرير", message: "تقرير الوثائق" });
  });

  it("keeps browser-local reports non-runnable and reports export failures", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mocks.api.createReportRun.mockRejectedValue(new ApiError(422, "BAD", "bad", undefined, null, "الصيغة غير مدعومة"));
    const app = mockApp();
    renderPage();
    await waitFor(() => expect(mocks.api.reportRuns).toHaveBeenCalled());

    const exports = screen.getAllByRole("button", { name: t("g.export") });
    expect(exports[exports.length - 1]).toBeDisabled();
    expect(exports[exports.length - 1]).toHaveAttribute(
      "title",
      "هذا التقرير يُبنى من سجل الأخطاء المحلي في المتصفح ولا يمكن توليده على الخادم",
    );

    fireEvent.click(exports[0]);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "الصيغة غير مدعومة" }));
  });

  it("treats a non-completed run as an error", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mocks.api.createReportRun.mockResolvedValue({ id: "run-3", status: "queued" });
    const app = mockApp();
    renderPage();
    await waitFor(() => expect(mocks.api.reportRuns).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: t("g.export") })[0]);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: undefined }));
    expect(mocks.openDownload).not.toHaveBeenCalled();
  });

  it("shows a download failure from the run history", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportRuns.mockResolvedValue({ items: [RUN_OK] });
    mocks.api.reportSchedules.mockResolvedValue({ items: [] });
    mocks.api.downloadReportRun.mockRejectedValue(new ApiError(422, "GONE", "gone", undefined, null, "انتهت صلاحية الملف"));
    const app = mockApp();
    renderPage();

    fireEvent.click((await screen.findByText("تقرير الوثائق · XLSX")).closest("button") as HTMLElement);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "انتهت صلاحية الملف" }));
  });
});
