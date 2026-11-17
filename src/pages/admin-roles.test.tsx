import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: { rolePolicies: vi.fn() },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Roles } from "./admin-roles";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const USERS = {
  items: [
    { id: "u-1", name: "أمل السبيعي", role: "dept_manager" },
    { id: "u-2", name: "سعد المطيري", role: "employee" },
    { id: "u-3", name: "نورة القحطاني", role: "role_qa" },
  ],
};

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Roles />
    </MemoryRouter>,
  );
}

function statValue(label: string) {
  return screen.getByText(label, { selector: "p" }).previousElementSibling?.textContent;
}

function roleCard(label: string) {
  const card = screen.getByText(label).closest('[role="button"]');
  if (!card) throw new Error(`role card not found: ${label}`);
  return card as HTMLElement;
}

function openMatrix() {
  fireEvent.click(screen.getByRole("button", { name: "مصفوفة الصلاحيات" }));
  return screen.getByRole("dialog", { name: "مصفوفة الصلاحيات" });
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.config.useApi = false;
  mocks.api.rolePolicies.mockReset();
  mocks.docs.mockReturnValue({ users: USERS });
});

describe("roles & permissions", () => {
  it("renders role cards, stats and module chips", () => {
    mockApp();
    renderPage();

    expect(screen.getAllByText("الأدوار والصلاحيات").length).toBeGreaterThan(0);
    expect(statValue("الأدوار")).toBe("8");
    expect(statValue("المستخدمون")).toBe("3");
    expect(statValue("الوحدات")).toBe("10");
    expect(statValue("إجمالي الصلاحيات")).toBe("165");

    expect(screen.getByText("8 من 8")).toBeInTheDocument();
    expect(screen.getAllByText("نشط")).toHaveLength(8);
    expect(screen.getByText("مدقق جودة")).toBeInTheDocument();
    expect(screen.getByText("مدير نظام")).toBeInTheDocument();
    expect(screen.getAllByText("التدقيق").length).toBeGreaterThan(0);
  });

  it("filters roles by name and by assigned user", () => {
    mockApp();
    renderPage();
    const search = screen.getByRole("textbox", { name: "ابحث في الأدوار" });

    fireEvent.change(search, { target: { value: "مدير" } });
    expect(screen.getByText("3 من 8")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "سعد" } });
    expect(screen.getByText("1 من 8")).toBeInTheDocument();
    expect(screen.getByText("موظف إدارة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByText("8 من 8")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد أدوار مطابقة")).toBeInTheDocument();
  });

  it("edits module-level permissions in the role editor", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByText("موظف إدارة"));
    const dialog = screen.getByRole("dialog", { name: "محرر الدور — موظف إدارة" });
    expect(within(dialog).getByDisplayValue("موظف إدارة")).toBeDisabled();
    expect(within(dialog).getByText("شجرة الصلاحيات — 12 صلاحية")).toBeInTheDocument();

    const moduleCheckbox = within(dialog).getAllByRole("checkbox")[0];
    expect(moduleCheckbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(moduleCheckbox);
    expect(moduleCheckbox).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByText("شجرة الصلاحيات — 14 صلاحية")).toBeInTheDocument();
    expect(within(dialog).getByText("كامل")).toBeInTheDocument();

    fireEvent.click(moduleCheckbox);
    expect(within(dialog).getByText("شجرة الصلاحيات — 8 صلاحية")).toBeInTheDocument();

    fireEvent.click(moduleCheckbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "تم حفظ الصلاحيات", message: "14 صلاحية" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("موظف إدارة"));
    const reopened = screen.getByRole("dialog", { name: "محرر الدور — موظف إدارة" });
    expect(within(reopened).getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
  });

  it("discards unsaved permission edits when the editor closes", () => {
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("موظف إدارة"));
    const dialog = screen.getByRole("dialog", { name: "محرر الدور — موظف إدارة" });
    fireEvent.click(within(dialog).getAllByRole("checkbox")[1]);
    expect(within(dialog).getByText("شجرة الصلاحيات — 11 صلاحية")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(roleCard("موظف إدارة")).toHaveTextContent("12");
  });

  it("toggles the permission matrix, warns on unsaved changes and saves", () => {
    const app = mockApp();
    renderPage();

    const dialog = openMatrix();
    expect(within(dialog).getByText("الوحدة / الدور")).toBeInTheDocument();
    expect(within(dialog).getAllByText("مدقق جودة").length).toBeGreaterThan(0);
    const cells = dialog.querySelectorAll("tbody button");
    expect(cells[0]).toHaveAttribute("title", "4/6");

    fireEvent.click(cells[0]);
    expect(cells[0]).toHaveAttribute("title", "6/6");
    expect(within(dialog).getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: t("g.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const reopened = openMatrix();
    expect(reopened.querySelectorAll("tbody button")[0]).toHaveAttribute("title", "4/6");
    expect(within(reopened).queryByText("لديك تغييرات غير محفوظة")).not.toBeInTheDocument();

    fireEvent.click(reopened.querySelectorAll("tbody button")[0]);
    fireEvent.click(within(reopened).getByRole("button", { name: "حفظ" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "تم حفظ المصفوفة" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(roleCard("موظف إدارة")).toHaveTextContent("14");
  });

  it("creates a custom role with permissions and opens its editor", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "إنشاء" }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء دور جديد" });
    expect(within(dialog).getByRole("button", { name: "إنشاء" })).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("مثال: مسؤول جودة"), { target: { value: "مسؤول جودة" } });
    fireEvent.change(within(dialog).getByPlaceholderText("QA Officer"), { target: { value: "Quality Officer" } });
    fireEvent.change(within(dialog).getByPlaceholderText("مراجعة الجودة والامتثال"), { target: { value: "مراجعة الجودة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "عام" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "لون teal" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إنشاء" }));

    expect(app.toast).toHaveBeenCalledWith({
      type: "success",
      title: "تم إنشاء الدور",
      message: "مسؤول جودة — اضبط الصلاحيات من المحرر",
    });
    const editor = screen.getByRole("dialog", { name: "محرر الدور — مسؤول جودة" });
    expect(within(editor).getByDisplayValue("مسؤول جودة")).toBeEnabled();
    expect(within(editor).getByRole("combobox")).toHaveValue("عام");
    expect(within(editor).getByText("شجرة الصلاحيات — 10 صلاحية")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("9 من 9")).toBeInTheDocument();
    expect(screen.getByText("مسؤول جودة")).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem("edas.v1.customRoles") ?? "[]") as { id: string; nameEn: string }[];
    expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ id: "role_quality_officer", nameEn: "Quality Officer" })]));
  });

  it("blocks deleting a role assigned to users and deletes a free one", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(within(roleCard("مدقق جودة")).getByRole("button", { name: t("g.delete") }));
    let dialog = screen.getByRole("dialog", { name: "حذف الدور" });
    expect(within(dialog).getByText(/مدقق جودة/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف" }));
    expect(app.toast).toHaveBeenCalledWith({
      type: "warning",
      title: "لا يمكن الحذف",
      message: "مستخدمون مرتبطون بهذا الدور",
    });
    expect(screen.getByText("8 من 8")).toBeInTheDocument();
    expect(screen.getByText("مدقق جودة")).toBeInTheDocument();

    fireEvent.click(within(roleCard("مدير مشروع")).getByRole("button", { name: t("g.delete") }));
    dialog = screen.getByRole("dialog", { name: "حذف الدور" });
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف الدور", message: "مدير مشروع" });
    expect(screen.queryByText("مدير مشروع")).not.toBeInTheDocument();
    expect(screen.getByText("7 من 7")).toBeInTheDocument();
  });

  it("duplicates a custom role and edits its name and scope", () => {
    const app = mockApp();
    renderPage();

    fireEvent.click(within(roleCard("مدقق جودة")).getByRole("button", { name: "نسخ" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم نسخ الدور", message: "مدقق جودة (نسخة)" });

    const dialog = screen.getByRole("dialog", { name: "محرر الدور — مدقق جودة (نسخة)" });
    fireEvent.change(within(dialog).getByDisplayValue("مدقق جودة (نسخة)"), { target: { value: "مدقق جودة ثانٍ" } });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "مشروع" } });
    expect(within(dialog).getByRole("combobox")).toHaveValue("مشروع");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("مدقق جودة ثانٍ")).toBeInTheDocument();
    expect(screen.getByText("9 من 9")).toBeInTheDocument();
  });

  it("opens the editor from the edit action and lists built-in names as read-only", () => {
    mockApp();
    renderPage();

    fireEvent.click(within(roleCard("مشرف قسم")).getByRole("button", { name: t("g.edit") }));
    const dialog = screen.getByRole("dialog", { name: "محرر الدور — مشرف قسم" });
    expect(within(dialog).getByText("أسماء الأدوار الأساسية ثابتة")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("مشرف قسم")).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("renders English labels, stats and matrix headers", () => {
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Roles & Permissions").length).toBeGreaterThan(0);
    expect(statValue("Roles")).toBe("8");
    expect(statValue("Total perms")).toBe("165");
    expect(screen.getByText("QA Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Project Manager")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Employee"));
    const editor = screen.getByRole("dialog", { name: "Role editor — Employee" });
    expect(within(editor).getByText("Built-in role names are fixed")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Permission matrix" }));
    const matrix = screen.getByRole("dialog", { name: "Permission matrix" });
    expect(within(matrix).getByText("Module / Role")).toBeInTheDocument();
    expect(within(matrix).getByText("Documents")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search roles…")).toBeInTheDocument();
  });

  it("defers to the API policy panel when the API is enabled", async () => {
    mocks.config.useApi = true;
    mocks.api.rolePolicies.mockResolvedValue({
      items: [{ role: "AUDITOR", actions: ["VIEW"], customized: false, userCount: 2 }],
    });
    mockApp();
    renderPage();

    expect(await screen.findByText("مدقق")).toBeInTheDocument();
    expect(screen.getByText("2 مستخدم")).toBeInTheDocument();
    expect(screen.queryByText("8 من 8")).not.toBeInTheDocument();
  });
});
