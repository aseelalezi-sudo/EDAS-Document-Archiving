import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocUser } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false },
  api: {
    groups: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Groups } from "./admin-groups";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

interface SeedGroup {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  type: string;
  scope: string;
  members: string[];
  memberRoles: string[];
  created: string;
}

function group(overrides: Partial<SeedGroup> = {}): SeedGroup {
  return {
    id: "g1",
    name: "مسؤولو الأرشفة",
    nameEn: "Archiving Officers",
    desc: "إدارة سياسات الاحتفاظ",
    type: "functional",
    scope: "عام",
    members: ["u-1", "u-2"],
    memberRoles: ["مسؤول الأرشفة"],
    created: "2025-09-14",
    ...overrides,
  };
}

function user(overrides: Partial<DocUser> = {}): DocUser {
  return {
    id: "u-1",
    name: "أمل السبيعي",
    nameEn: "Amal",
    username: "amal",
    email: "amal@edas.gov",
    empNo: "EMP-1001",
    jobTitle: "مديرة القسم",
    jobTitleEn: "Manager",
    deptId: "legal",
    role: "dept_manager",
    status: "active",
    lastLogin: "2026-06-01",
    failedAttempts: 0,
    activeSessions: 1,
    initials: "أم",
    color: "bg-navy-600",
    ...overrides,
  };
}

function seed(groups: SeedGroup[]) {
  localStorage.setItem("edas.v1.groups", JSON.stringify(groups));
}

function mockStore() {
  const store = {
    users: {
      items: [
        user(),
        user({ id: "u-2", name: "خالد العمري", username: "khaled", role: "employee" }),
        user({ id: "u-3", name: "سارة القحطاني", username: "sara", role: "archivist" }),
      ],
    },
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = { t: (key: string) => dict[key] ?? key, lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/groups"]}>
      <Routes>
        <Route path="/admin/groups" element={<Groups />} />
        <Route path="/admin/roles" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function storedGroups(): SeedGroup[] {
  return JSON.parse(localStorage.getItem("edas.v1.groups") ?? "[]") as SeedGroup[];
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.useApi = false;
});

describe("admin groups", () => {
  it("renders stats and group cards", () => {
    seed([
      group(),
      group({
        id: "g2",
        name: "فريق مشروع ألفا",
        desc: "وثائق المشروع",
        type: "project",
        members: [],
        memberRoles: [],
        scope: "مشروع ألفا",
      }),
    ]);
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.groups")).length).toBeGreaterThan(0);
    expect(screen.getByText("إجمالي الأعضاء")).toBeInTheDocument();
    expect(screen.getByText("مسؤولو الأرشفة")).toBeInTheDocument();
    expect(screen.getByText("إدارة سياسات الاحتفاظ")).toBeInTheDocument();
    expect(screen.getByText("2 عضو")).toBeInTheDocument();
    expect(screen.getByText("2 من 2")).toBeInTheDocument();
  });

  it("filters groups by search and type", () => {
    seed([group(), group({ id: "g2", name: "فريق مشروع ألفا", type: "project", members: [] })]);
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "ابحث في المجموعات" }), { target: { value: "ألفا" } });
    expect(screen.queryByText("مسؤولو الأرشفة")).not.toBeInTheDocument();
    expect(screen.getByText("فريق مشروع ألفا")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب النوع" }), { target: { value: "functional" } });
    expect(screen.getByText("مسؤولو الأرشفة")).toBeInTheDocument();
    expect(screen.queryByText("فريق مشروع ألفا")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    seed([group()]);
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "ابحث في المجموعات" }), { target: { value: "غير موجود" } });

    expect(screen.getByText("لا توجد مجموعات مطابقة")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    expect(screen.getByRole("dialog", { name: "إنشاء مجموعة" })).toBeInTheDocument();
  });

  it("opens the group detail with its members and roles", () => {
    seed([group()]);
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("مسؤولو الأرشفة"));

    const detail = screen.getByRole("dialog", { name: "مسؤولو الأرشفة" });
    expect(within(detail).getByText("معلومات المجموعة")).toBeInTheDocument();
    expect(within(detail).getByText("مسؤول الأرشفة")).toBeInTheDocument();
    expect(within(detail).getByText("أمل السبيعي")).toBeInTheDocument();
    expect(within(detail).getByText("خالد العمري")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "الأدوار" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/roles");
  });

  it("shows an empty members message in the detail", () => {
    seed([group({ members: [], memberRoles: [] })]);
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("مسؤولو الأرشفة"));

    expect(screen.getByText("لا يوجد أعضاء في هذه المجموعة")).toBeInTheDocument();
  });

  it("creates a group with members and persists it", () => {
    seed([]);
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    const dialog = screen.getByRole("dialog", { name: "إنشاء مجموعة" });
    const create = within(dialog).getByRole("button", { name: t("g.create") });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("فريق الجودة"), { target: { value: "فريق الجودة" } });
    fireEvent.change(screen.getByPlaceholderText("QA Team"), { target: { value: "QA Team" } });
    fireEvent.change(screen.getByPlaceholderText("وظيفة المجموعة"), { target: { value: "ضبط الجودة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "مشروع" }));
    fireEvent.change(screen.getByPlaceholderText("عام / اسم الإدارة / المشروع"), { target: { value: "مشروع بيتا" } });
    fireEvent.click(within(dialog).getAllByRole("checkbox")[0]);
    fireEvent.click(create);

    const saved = storedGroups();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: "فريق الجودة",
      nameEn: "QA Team",
      desc: "ضبط الجودة",
      type: "project",
      scope: "مشروع بيتا",
      members: ["u-1"],
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء المجموعة", message: "فريق الجودة" });
  });

  it("edits a group from the card and persists the change", () => {
    seed([group()]);
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.edit") })[0]);
    const editor = screen.getByRole("dialog", { name: "محرر المجموعة — مسؤولو الأرشفة" });
    fireEvent.change(within(editor).getByDisplayValue("مسؤولو الأرشفة"), { target: { value: "مسؤولو الأرشفة والاحتفاظ" } });
    fireEvent.change(within(editor).getByRole("combobox"), { target: { value: "dept" } });
    fireEvent.click(within(editor).getByRole("button", { name: t("g.save") }));

    expect(storedGroups()[0]).toMatchObject({ name: "مسؤولو الأرشفة والاحتفاظ", type: "dept" });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "مسؤولو الأرشفة والاحتفاظ" });
  });

  it("edits a group from the detail modal", () => {
    seed([group()]);
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByText("مسؤولو الأرشفة"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "مسؤولو الأرشفة" })).getByRole("button", { name: t("g.edit") }));

    expect(screen.getByRole("dialog", { name: "محرر المجموعة — مسؤولو الأرشفة" })).toBeInTheDocument();
  });

  it("deletes a group after confirmation", () => {
    seed([group(), group({ id: "g2", name: "فريق مشروع ألفا", type: "project", members: [] })]);
    mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[0]);
    const confirm = screen.getByRole("dialog", { name: "حذف المجموعة" });
    expect(confirm).toHaveTextContent("مسؤولو الأرشفة");
    fireEvent.click(within(confirm).getByRole("button", { name: t("g.delete") }));

    expect(storedGroups().map((g) => g.id)).toEqual(["g2"]);
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف المجموعة", message: "مسؤولو الأرشفة" });
  });

  it("loads groups from the API in API mode", async () => {
    mocks.config.useApi = true;
    mockStore();
    mockApp();
    mocks.api.groups.mockResolvedValue({
      items: [
        {
          id: "srv-1",
          name: "مجموعة الخادم",
          nameEn: "Server group",
          desc: "من الخادم",
          scope: "عام",
          type: "functional",
          memberIds: ["u-1"],
          createdAt: "2026-05-01T09:00:00.000Z",
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("مجموعة الخادم")).toBeInTheDocument());
    expect(mocks.api.groups).toHaveBeenCalled();
    expect(screen.getByText("1 من 1")).toBeInTheDocument();
  });

  it("creates groups through the API", async () => {
    mocks.config.useApi = true;
    localStorage.setItem("edas.v1.groups", JSON.stringify([]));
    mockStore();
    mockApp();
    mocks.api.groups.mockResolvedValue({ items: [] });
    mocks.api.createGroup.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(mocks.api.groups).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: t("g.create") })[0]);
    const dialog = screen.getByRole("dialog", { name: "إنشاء مجموعة" });
    fireEvent.change(screen.getByPlaceholderText("فريق الجودة"), { target: { value: "فريق الجودة" } });
    fireEvent.change(screen.getByPlaceholderText("وظيفة المجموعة"), { target: { value: "ضبط الجودة" } });
    fireEvent.click(within(dialog).getAllByRole("checkbox")[1]);
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.create") }));

    await waitFor(() =>
      expect(mocks.api.createGroup).toHaveBeenCalledWith({
        name: "فريق الجودة",
        nameEn: undefined,
        desc: "ضبط الجودة",
        scope: "",
        type: "functional",
        memberIds: ["u-2"],
      }),
    );
  });

  it("surfaces API failures when loading or deleting groups", async () => {
    mocks.config.useApi = true;
    mockStore();
    const app = mockApp();
    mocks.api.groups.mockRejectedValue(new Error("boom"));
    mocks.api.deleteGroup.mockRejectedValue(new Error("boom"));

    renderPage();
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));

    fireEvent.click(screen.getAllByRole("button", { name: t("g.delete") })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف المجموعة" })).getByRole("button", { name: t("g.delete") }));

    await waitFor(() => expect(mocks.api.deleteGroup).toHaveBeenCalled());
    await waitFor(() => expect(app.toast).toHaveBeenCalledTimes(2));
  });

  it("uses English labels and group type names", () => {
    seed([group({ name: "Archiving Officers", nameEn: "Archiving Officers" })]);
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getByText("Archiving Officers")).toBeInTheDocument();
    expect(screen.getAllByText("Functional").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Create" }).length).toBeGreaterThan(0);
  });
});
