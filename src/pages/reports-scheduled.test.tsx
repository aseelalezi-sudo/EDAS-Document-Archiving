import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    reportSchedules: vi.fn(),
    reportRuns: vi.fn(),
    createReportSchedule: vi.fn(),
    runReportSchedule: vi.fn(),
    updateReportSchedule: vi.fn(),
    deleteReportSchedule: vi.fn(),
    downloadReportRun: vi.fn(),
  },
  openDownload: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));
vi.mock("../lib/download", () => ({ openDownload: mocks.openDownload }));

import { ScheduledReports } from "./reports-scheduled";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function template(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    id: "tpl-1",
    name: "تقرير الوثائق",
    nameEn: "Documents report",
    category: "الوثائق",
    categoryEn: "Documents",
    desc: "",
    descEn: "",
    favorite: false,
    lastRun: "2026-02-01",
    schedule: "يومي",
    icon: "file",
    ...overrides,
  };
}

const TEMPLATES = [
  template(),
  template({
    id: "tpl-2",
    name: "تقرير الموافقات",
    nameEn: "Approvals report",
    category: "الموافقات",
    categoryEn: "Approvals",
    schedule: "أسبوعي",
  }),
  template({
    id: "tpl-3",
    name: "تقرير الاحتفاظ",
    nameEn: "Retention report",
    category: "الاحتفاظ",
    categoryEn: "Retention",
    schedule: "شهري",
  }),
  template({ id: "tpl-4", name: "تقرير يدوي", nameEn: "Manual report", schedule: "—" }),
];

function storeState(overrides: Record<string, unknown> = {}) {
  return {
    templates: TEMPLATES,
    users: { items: [] },
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = storeState(overrides);
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar", email?: string) {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    role: "system_admin",
    user: { name: "أمل السبيعي", department: "legal", email },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(url = "/reports/scheduled") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/reports/scheduled"
          element={
            <>
              <ScheduledReports />
              <LocationProbe />
            </>
          }
        />
        <Route path="/reports/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openRowMenu(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[index]);
}

const API_SCHEDULE = {
  id: "rs-1",
  name: "تقرير API",
  reportType: "tpl-1",
  cadence: "WEEKLY",
  recipients: ["a@edas.gov"],
  filters: { time: "09:00", format: "Excel" },
  isActive: true,
  nextRunAt: "2026-03-01T09:00:00.000Z",
  _count: { runs: 1 },
};

const API_RUN = {
  id: "run-1",
  scheduleId: "rs-1",
  status: "completed",
  createdAt: "2026-02-01T08:00:00.000Z",
  completedAt: "2026-02-01T08:00:10.000Z",
  requestedById: "u-9",
  fileId: "f-1",
};

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.openDownload.mockReset();
  mocks.config.useApi = false;
});

describe("scheduled reports", () => {
  it("renders the schedules table with stats", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.scheduled")).length).toBeGreaterThan(0);
    expect(screen.getByText("تقرير الوثائق")).toBeInTheDocument();
    expect(screen.getByText("تقرير الموافقات")).toBeInTheDocument();
    expect(screen.queryByText("تقرير يدوي")).not.toBeInTheDocument();
    expect(screen.getByText("3 من 3")).toBeInTheDocument();
    expect(screen.getByText("105")).toBeInTheDocument();
    expect(screen.getAllByText("98%").length).toBeGreaterThan(1);
  });

  it("filters by search text and status", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "ابحث في الجداول" }), { target: { value: "Excel" } });
    expect(screen.getByText("1 من 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الحالة" }), { target: { value: "paused" } });
    expect(screen.getByText("1 من 3")).toBeInTheDocument();
    expect(screen.getByText("تقرير الموافقات")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "ابحث في الجداول" }), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد جداول")).toBeInTheDocument();
  });

  it("runs a schedule now and records the run in history", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "تشغيل الآن" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تشغيل التقرير", message: "تقرير الوثائق" });

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "سجل التشغيل" }));
    const dialog = screen.getByRole("dialog", { name: "سجل التشغيل — تقرير الوثائق" });
    expect(within(dialog).getByText("يدوي · —")).toBeInTheDocument();
    expect(within(dialog).getByText("ناجح")).toBeInTheDocument();
  });

  it("shows the empty history hint before any run", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "سجل التشغيل" }));
    const dialog = screen.getByRole("dialog", { name: "سجل التشغيل — تقرير الوثائق" });
    expect(within(dialog).getByText("اضغط «تشغيل الآن» لتسجيل تشغيلة جديدة")).toBeInTheDocument();
    expect(within(dialog).getByText("42 تشغيل")).toBeInTheDocument();
  });

  it("navigates to the report definition", () => {
    mockStore();
    mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "عرض التقرير" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/tpl-1");
  });

  it("pauses and activates a schedule offline", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "إيقاف" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تم الإيقاف", message: "تقرير الوثائق" });

    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "تفعيل" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم التفعيل", message: "تقرير الموافقات" });
  });

  it("deletes a schedule offline", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الجدولة" })).getByRole("button", { name: t("g.delete") }));

    expect(screen.queryByText("تقرير الوثائق")).not.toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف الجدولة", message: "تقرير الوثائق" });
  });

  it("creates a schedule offline", () => {
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "جدولة تقرير" }));
    const dialog = screen.getByRole("dialog", { name: "جدولة تقرير" });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "tpl-2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "أسبوعي" }));
    fireEvent.change(within(dialog).getByPlaceholderText("finance@edas.gov, it@edas.gov"), {
      target: { value: "ops@edas.gov,  it@edas.gov," },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "جدولة" }));

    expect(screen.getByText("4 من 4")).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تمت الجدولة", message: "تقرير الموافقات" });
  });

  it("falls back to the current user email when no recipients are typed", () => {
    mockStore();
    const app = mockApp("ar", "me@edas.gov");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "جدولة تقرير" }));
    const dialog = screen.getByRole("dialog", { name: "جدولة تقرير" });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "tpl-3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "جدولة" }));

    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تمت الجدولة", message: "تقرير الاحتفاظ" });
  });

  it("opens the schedule modal from the report query parameter", () => {
    mockStore();
    mockApp();
    renderPage("/reports/scheduled?report=tpl-2");

    const dialog = screen.getByRole("dialog", { name: "جدولة تقرير" });
    expect((within(dialog).getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("tpl-2");

    fireEvent.click(within(dialog).getByRole("button", { name: t("g.cancel") }));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/scheduled");
  });

  it("loads API schedules and runs, showing history with downloads", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportSchedules.mockResolvedValue({ items: [API_SCHEDULE] });
    mocks.api.reportRuns.mockResolvedValue({ items: [API_RUN] });
    mocks.api.downloadReportRun.mockResolvedValue({ url: "https://files.example/report.pdf" });
    mockApp();

    renderPage();
    expect(await screen.findByText("تقرير API")).toBeInTheDocument();
    expect(screen.getByText("1 من 1")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(1);

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "سجل التشغيل" }));
    const dialog = screen.getByRole("dialog", { name: "سجل التشغيل — تقرير API" });
    expect(within(dialog).getByText("مستخدم محذوف · 10ث")).toBeInTheDocument();
    expect(within(dialog).getByText("ناجح")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "تنزيل التقرير" }));
    await waitFor(() => expect(mocks.api.downloadReportRun).toHaveBeenCalledWith("run-1"));
    await waitFor(() => expect(mocks.openDownload).toHaveBeenCalledWith("https://files.example/report.pdf"));
  });

  it("creates, runs, toggles and deletes schedules through the API", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportSchedules.mockResolvedValue({ items: [API_SCHEDULE] });
    mocks.api.reportRuns.mockResolvedValue({ items: [API_RUN] });
    mocks.api.createReportSchedule.mockResolvedValue({});
    mocks.api.runReportSchedule.mockResolvedValue({ status: "completed" });
    mocks.api.updateReportSchedule.mockResolvedValue({});
    mocks.api.deleteReportSchedule.mockResolvedValue({});
    const app = mockApp();
    renderPage();
    await screen.findByText("تقرير API");

    fireEvent.click(screen.getByRole("button", { name: "جدولة تقرير" }));
    const dialog = screen.getByRole("dialog", { name: "جدولة تقرير" });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "tpl-2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ربع سنوي" }));
    fireEvent.change(within(dialog).getByPlaceholderText("finance@edas.gov, it@edas.gov"), { target: { value: "ops@edas.gov" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "جدولة" }));

    await waitFor(() =>
      expect(mocks.api.createReportSchedule).toHaveBeenCalledWith({
        name: "تقرير الموافقات",
        reportType: "tpl-2",
        cadence: "QUARTERLY",
        recipients: ["ops@edas.gov"],
        filters: { time: "08:00", format: "Excel" },
        isActive: true,
      }),
    );
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تمت الجدولة", message: "تقرير الموافقات" }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "تشغيل الآن" }));
    await waitFor(() => expect(mocks.api.runReportSchedule).toHaveBeenCalledWith("rs-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تشغيل التقرير", message: "تقرير API" }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "إيقاف" }));
    await waitFor(() => expect(mocks.api.updateReportSchedule).toHaveBeenCalledWith("rs-1", { isActive: false }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الجدولة" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(mocks.api.deleteReportSchedule).toHaveBeenCalledWith("rs-1"));
  });

  it("reports a failed API run", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportSchedules.mockResolvedValue({ items: [API_SCHEDULE] });
    mocks.api.reportRuns.mockResolvedValue({ items: [API_RUN] });
    mocks.api.runReportSchedule.mockResolvedValue({ status: "failed" });
    const app = mockApp();
    renderPage();
    await screen.findByText("تقرير API");

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: "تشغيل الآن" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "فشل تشغيل التقرير", message: "تقرير API" }));
  });

  it("reports API failures with the server reason", async () => {
    mocks.config.useApi = true;
    mockStore();
    mocks.api.reportSchedules.mockResolvedValue({ items: [API_SCHEDULE] });
    mocks.api.reportRuns.mockResolvedValue({ items: [API_RUN] });
    mocks.api.createReportSchedule.mockRejectedValue(new ApiError(422, "INVALID", "bad cadence", undefined, null, "تكرار غير صالح"));
    mocks.api.deleteReportSchedule.mockRejectedValue(new ApiError(409, "CONFLICT", "in use", undefined, null, "الجدولة قيد الاستخدام"));
    const app = mockApp();
    renderPage();
    await screen.findByText("تقرير API");

    fireEvent.click(screen.getByRole("button", { name: "جدولة تقرير" }));
    const dialog = screen.getByRole("dialog", { name: "جدولة تقرير" });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "tpl-2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "جدولة" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "تكرار غير صالح" }));

    openRowMenu(0);
    fireEvent.click(screen.getByRole("menuitem", { name: t("g.delete") }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف الجدولة" })).getByRole("button", { name: t("g.delete") }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api"), message: "الجدولة قيد الاستخدام" }));
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Scheduled Reports").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Schedule report" })).toBeInTheDocument();
    expect(screen.getByText("Total runs")).toBeInTheDocument();
  });
});
