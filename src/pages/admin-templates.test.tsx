import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationTemplateDto } from "@edas/shared";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  config: { useApi: false },
  api: {
    notificationTemplates: vi.fn(),
    createNotificationTemplate: vi.fn(),
    updateNotificationTemplate: vi.fn(),
    resetNotificationTemplate: vi.fn(),
    deleteNotificationTemplate: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { NotificationTemplates } from "./admin-templates";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function template(overrides: Partial<NotificationTemplateDto> = {}): NotificationTemplateDto {
  return {
    id: "nt-1",
    name: "طلب موافقة",
    nameEn: "Approval request",
    channel: "IN_APP",
    subject: "لديك طلب موافقة جديد",
    subjectEn: "You have a new approval request",
    body: "الوثيقة {DOC_TITLE} بانتظار اعتمادك.",
    bodyEn: "Document {DOC_TITLE} awaits your approval.",
    isDefault: true,
    updatedAt: "2026-06-01T09:00:00.000Z",
    ...overrides,
  };
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = { t: (key: string) => dict[key] ?? key, lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationTemplates />
    </MemoryRouter>,
  );
}

function stored(): NotificationTemplateDto[] {
  return JSON.parse(localStorage.getItem("edas.v1.notificationTemplates") ?? "[]") as NotificationTemplateDto[];
}

function fillForm(
  dialog: HTMLElement,
  values: { name: string; nameEn: string; subject: string; subjectEn: string; body: string; bodyEn: string },
) {
  const inputs = Array.from(dialog.querySelectorAll("input"));
  const areas = Array.from(dialog.querySelectorAll("textarea"));
  fireEvent.change(inputs[0], { target: { value: values.name } });
  fireEvent.change(inputs[1], { target: { value: values.nameEn } });
  fireEvent.change(inputs[2], { target: { value: values.subject } });
  fireEvent.change(inputs[3], { target: { value: values.subjectEn } });
  fireEvent.change(areas[0], { target: { value: values.body } });
  fireEvent.change(areas[1], { target: { value: values.bodyEn } });
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("notification templates", () => {
  it("renders the seeded template cards with channels", () => {
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.notifications")).length).toBeGreaterThan(0);
    expect(screen.getByText("طلب موافقة")).toBeInTheDocument();
    expect(screen.getAllByText("إعادة تعيين كلمة المرور").length).toBeGreaterThan(0);
    expect(screen.getAllByText("داخل التطبيق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("بريد إلكتروني").length).toBeGreaterThan(0);
    expect(screen.getByText(/لا يوجد إرسال بريد فعلي/)).toBeInTheDocument();
  });

  it("shows an empty state when no templates are stored", () => {
    localStorage.setItem("edas.v1.notificationTemplates", JSON.stringify([]));
    mockApp();
    renderPage();

    expect(screen.getByText("لا توجد قوالب")).toBeInTheDocument();
  });

  it("requires every field before saving", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    const editor = screen.getByRole("dialog", { name: "قالب إشعار جديد" });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "أكمل جميع الحقول" });
    expect(screen.getByRole("dialog", { name: "قالب إشعار جديد" })).toBeInTheDocument();
  });

  it("creates a custom template offline", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    const editor = screen.getByRole("dialog", { name: "قالب إشعار جديد" });
    fillForm(editor, {
      name: "تنبيه توقيع",
      nameEn: "Signature reminder",
      subject: "توقيع مطلوب",
      subjectEn: "Signature required",
      body: "الوثيقة {DOC_NO} بانتظار التوقيع.",
      bodyEn: "Document {DOC_NO} awaits signature.",
    });
    fireEvent.change(within(editor).getByRole("combobox"), { target: { value: "EMAIL" } });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    const saved = stored();
    expect(saved).toHaveLength(7);
    expect(saved[6]).toMatchObject({ name: "تنبيه توقيع", channel: "EMAIL", subject: "توقيع مطلوب" });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: t("g.save") });
    expect(screen.getByText("تنبيه توقيع")).toBeInTheDocument();
  });

  it("edits a seeded template offline", () => {
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("طلب موافقة"));
    const editor = screen.getByRole("dialog", { name: "تحرير القالب" });
    const inputs = Array.from(editor.querySelectorAll("input"));
    fireEvent.change(inputs[2], { target: { value: "موضوع محدّث" } });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    expect(stored()[0].subject).toBe("موضوع محدّث");
    expect(screen.getByText("موضوع محدّث")).toBeInTheDocument();
  });

  it("restores a seeded template to its default after confirmation", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByText("طلب موافقة"));
    const editor = screen.getByRole("dialog", { name: "تحرير القالب" });
    const inputs = Array.from(editor.querySelectorAll("input"));
    fireEvent.change(inputs[2], { target: { value: "موضوع مؤقت" } });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));
    expect(stored()[0].subject).toBe("موضوع مؤقت");

    fireEvent.click(screen.getAllByRole("button", { name: "افتراضي" })[0]);
    const confirm = screen.getByRole("dialog", { name: "استعادة الافتراضي" });
    expect(confirm).toHaveTextContent("طلب موافقة");
    fireEvent.click(within(confirm).getByRole("button", { name: "استعادة" }));

    expect(stored()[0].subject).toBe("لديك طلب موافقة جديد");
    expect(app.toast).toHaveBeenCalledWith({ type: "info", title: "تمت استعادة الافتراضي" });
  });

  it("deletes a custom template after confirmation", () => {
    localStorage.setItem(
      "edas.v1.notificationTemplates",
      JSON.stringify([template({ id: "custom-1", name: "قالب مخصص", nameEn: "Custom", isDefault: false })]),
    );
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("g.delete") }));
    const confirm = screen.getByRole("dialog", { name: "حذف القالب" });
    expect(confirm).toHaveTextContent("قالب مخصص");
    fireEvent.click(within(confirm).getByRole("button", { name: t("g.delete") }));

    expect(stored()).toHaveLength(0);
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: t("g.delete") });
  });

  it("shows a loading card while the API request is pending", () => {
    mocks.config.useApi = true;
    mockApp();
    mocks.api.notificationTemplates.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("loads templates from the API and updates them", async () => {
    mocks.config.useApi = true;
    mockApp();
    mocks.api.notificationTemplates.mockResolvedValue({ items: [template({ id: "custom-7", name: "قالب API", isDefault: false })] });
    mocks.api.updateNotificationTemplate.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByText("قالب API")).toBeInTheDocument());
    fireEvent.click(screen.getByText("قالب API"));
    const editor = screen.getByRole("dialog", { name: "تحرير القالب" });
    const inputs = Array.from(editor.querySelectorAll("input"));
    fireEvent.change(inputs[0], { target: { value: "قالب API المحدّث" } });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    await waitFor(() =>
      expect(mocks.api.updateNotificationTemplate).toHaveBeenCalledWith(
        "custom-7",
        expect.objectContaining({ name: "قالب API المحدّث", channel: "IN_APP" }),
      ),
    );
    await waitFor(() => expect(mocks.api.notificationTemplates).toHaveBeenCalledTimes(2));
  });

  it("creates templates through the API", async () => {
    mocks.config.useApi = true;
    mockApp();
    mocks.api.notificationTemplates.mockResolvedValue({ items: [] });
    mocks.api.createNotificationTemplate.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByText("لا توجد قوالب")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    const editor = screen.getByRole("dialog", { name: "قالب إشعار جديد" });
    fillForm(editor, {
      name: "قالب جديد",
      nameEn: "New template",
      subject: "موضوع",
      subjectEn: "Subject",
      body: "نص",
      bodyEn: "Body",
    });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    await waitFor(() =>
      expect(mocks.api.createNotificationTemplate).toHaveBeenCalledWith({
        name: "قالب جديد",
        nameEn: "New template",
        channel: "IN_APP",
        subject: "موضوع",
        subjectEn: "Subject",
        body: "نص",
        bodyEn: "Body",
      }),
    );
  });

  it("resets a template through the API", async () => {
    mocks.config.useApi = true;
    mockApp();
    mocks.api.notificationTemplates.mockResolvedValue({ items: [template()] });
    mocks.api.resetNotificationTemplate.mockResolvedValue(template({ subject: "موضوع افتراضي" }));
    renderPage();

    await waitFor(() => expect(screen.getByText("طلب موافقة")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "افتراضي" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "استعادة الافتراضي" })).getByRole("button", { name: "استعادة" }));

    await waitFor(() => expect(mocks.api.resetNotificationTemplate).toHaveBeenCalledWith("nt-1"));
    await waitFor(() => expect(screen.getByText("موضوع افتراضي")).toBeInTheDocument());
  });

  it("surfaces API failures when loading or deleting", async () => {
    mocks.config.useApi = true;
    localStorage.setItem(
      "edas.v1.notificationTemplates",
      JSON.stringify([template({ id: "custom-1", name: "قالب مخصص", nameEn: "Custom", isDefault: false })]),
    );
    const app = mockApp();
    mocks.api.notificationTemplates.mockRejectedValue(new Error("boom"));
    mocks.api.deleteNotificationTemplate.mockRejectedValue(new Error("boom"));
    renderPage();

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByText("قالب مخصص")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف القالب" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledTimes(2));
  });

  it("renders English template metadata", () => {
    mocks.app.mockReturnValue({
      t: (key: string) => (translations.en as Record<string, string>)[key] ?? key,
      lang: "en",
      toast: vi.fn(),
    });
    renderPage();

    expect(screen.getByText("Approval request")).toBeInTheDocument();
    expect(screen.getAllByText("In-app").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Create" }).length).toBeGreaterThan(0);
  });
});
