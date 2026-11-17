import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  api: { putSetting: vi.fn() },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { System } from "./admin-system";

const AR = translations.ar as Record<string, string>;

const SETTINGS: Record<string, string> = {
  orgName: "هيئة المؤسسات الحكومية",
  orgNameEn: "Government Entities Authority",
  orgCode: "GEA",
  orgWebsite: "gea.gov.sa",
  orgParent: "مجلس الوزراء",
  orgRegistration: "1010101010",
  numberingTemplate: "EDAS-{YEAR}{SEQ:4}",
  numberingPrefix: "D-",
  numberingReset: "yearly",
  maxFileSize: "50",
  draftDays: "30",
  allowedTypes: "PDF, DOCX",
  trashDays: "30",
  maxFilesPerUpload: "20",
  primaryPath: "/data/edas",
  coldPath: "/cold/edas",
  coldMoveDays: "365",
  backupPolicy: "daily",
  defaultLang: "ar",
  timezone: "Asia/Riyadh",
  calendar: "hijri",
  dateFormat: "YYYY-MM-DD",
  currency: "SAR",
  sizeUnit: "auto",
  maxSearchResults: "500",
  idleTimeout: "30",
  tableRowLimit: "50",
};

const SUMMARY = {
  documents: { total: 120, byStatus: {}, byClassification: {} },
  approvals: { pending: 3 },
  retention: { overdue: 0 },
  legalHolds: { active: 0 },
  users: { total: 44 },
  tasks: { open: 7 },
  trend: [],
};

function mockApp(lang: "ar" | "en" = "ar", apiMode = false) {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    toast: vi.fn(),
    apiMode,
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const applySystemSettings = vi.fn();
  mocks.docs.mockReturnValue({
    systemSettings: SETTINGS,
    applySystemSettings,
    summary: SUMMARY,
    ...overrides,
  });
  return { applySystemSettings };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <System />
    </MemoryRouter>,
  );
}

function openTab(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.api.putSetting.mockReset();
});

describe("system settings", () => {
  it("renders identity settings and the organization preview", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText("إعدادات النظام").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("GEA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gea.gov.sa")).toBeInTheDocument();
    expect(screen.getByText("هيئة المؤسسات الحكومية")).toBeInTheDocument();
    expect(screen.getByText("معاينة الهوية")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ" })).toBeDisabled();
    expect(screen.queryByText("لديك تغييرات غير محفوظة")).not.toBeInTheDocument();
  });

  it("edits, discards and saves identity settings offline", () => {
    const { applySystemSettings } = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.change(screen.getByDisplayValue("هيئة المؤسسات الحكومية"), { target: { value: "هيئة جديدة" } });
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "حفظ" })[0]).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "تجاهل" }));
    expect(screen.queryByText("لديك تغييرات غير محفوظة")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("هيئة المؤسسات الحكومية")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("هيئة المؤسسات الحكومية"), { target: { value: "هيئة جديدة" } });
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ" })[0]);

    expect(applySystemSettings).toHaveBeenCalledWith(expect.objectContaining({ orgName: "هيئة جديدة", allowedTypes: "PDF, DOCX" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "تم حفظ الإعدادات" }));
    expect(screen.queryByText("لديك تغييرات غير محفوظة")).not.toBeInTheDocument();
  });

  it("manages the approved file types", () => {
    mockStore();
    mockApp();
    renderPage();
    openTab("أنواع الملفات");

    const input = screen.getByPlaceholderText("أضف نوعاً (مثال: DWG)");
    expect(screen.getByRole("button", { name: "إضافة" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "dwg" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));
    expect(screen.getByText("DWG")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "PDF" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));
    expect(screen.getAllByText("PDF")).toHaveLength(1);
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "TXT" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("TXT")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إزالة DOCX" }));
    expect(screen.queryByText("DOCX")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();
  });

  it("previews the numbering template", () => {
    mockStore();
    mockApp();
    renderPage();
    openTab("الترقيم");

    const year = String(new Date().getFullYear());
    expect(screen.getByText(`D-EDAS-${year}0001`)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("EDAS-{YEAR}{SEQ:4}"), { target: { value: "Y-{YEAR}-{SEQ:2}" } });
    expect(screen.getByText(`D-Y-${year}-01`)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("D-"), { target: { value: "DOC-" } });
    expect(screen.getByText(`DOC-Y-${year}-01`)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "never" } });
    expect(screen.getByRole("combobox")).toHaveValue("never");
  });

  it("edits storage and localization settings", () => {
    mockStore();
    mockApp();
    renderPage();

    openTab("التخزين");
    fireEvent.change(screen.getByDisplayValue("/data/edas"), { target: { value: "/mnt/edas" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "weekly" } });
    expect(screen.getByRole("combobox")).toHaveValue("weekly");

    openTab("اللغة والمنطقة");
    expect(screen.getAllByRole("combobox")[1]).toHaveValue("Asia/Riyadh");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "en" } });
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("en");
    expect(screen.getByText("معاينة")).toBeInTheDocument();
  });

  it("shows live server indicators and placeholders", () => {
    mockStore();
    mockApp();
    renderPage();
    openTab("الحدود");

    expect(screen.getByText("مؤشرات حقيقية من الخادم")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("falls back to placeholders without a summary", () => {
    mockStore({ summary: null });
    mockApp();
    renderPage();
    openTab("الحدود");

    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("lists feature availability", () => {
    mockStore();
    mockApp();
    renderPage();
    openTab("الخصائص");

    expect(screen.getAllByText("مفعّل")).toHaveLength(6);
    expect(screen.getAllByText("معطّل")).toHaveLength(4);
    expect(screen.getByText("يُصدر الخادم رقم الوثيقة تلقائياً ولا يتأثر بقالب الترقيم في هذه الشاشة")).toBeInTheDocument();
    expect(
      screen.getByText("تفعيل الخصائص غير المتوفرة يتطلب تغييرات على الخادم والبنية التحتية، ولا يمكن تبديلها من الواجهة."),
    ).toBeInTheDocument();
  });

  it("saves only changed settings through the API", async () => {
    const app = mockApp("ar", true);
    mocks.api.putSetting.mockResolvedValue({});
    const { applySystemSettings } = mockStore();
    renderPage();

    fireEvent.change(screen.getByDisplayValue("GEA"), { target: { value: "GEA2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ" })[0]);

    await vi.waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حفظ الإعدادات" })));
    expect(mocks.api.putSetting).toHaveBeenCalledTimes(1);
    expect(mocks.api.putSetting).toHaveBeenCalledWith("orgCode", "GEA2");
    expect(applySystemSettings).toHaveBeenCalledWith(expect.objectContaining({ orgCode: "GEA2" }));
  });

  it("reports API failures and keeps the draft dirty", async () => {
    const app = mockApp("ar", true);
    mocks.api.putSetting.mockRejectedValue(new Error("boom"));
    const { applySystemSettings } = mockStore();
    renderPage();

    fireEvent.change(screen.getByDisplayValue("GEA"), { target: { value: "GEA2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ" })[0]);

    await vi.waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
    expect(applySystemSettings).not.toHaveBeenCalled();
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("System Settings").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Features" }));
    expect(screen.getByText("In-browser preview")).toBeInTheDocument();
    expect(screen.getAllByText("Enabled")).toHaveLength(6);
    expect(screen.getAllByText("Disabled")).toHaveLength(4);
    expect(screen.getAllByText("Not available")).toHaveLength(4);
  });
});
