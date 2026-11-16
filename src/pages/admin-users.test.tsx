import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import { config } from "../config";
import type { DocUser } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  api: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Users } from "./admin-users";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
    return text;
  };
}

function user(id: string, patch: Partial<DocUser>): DocUser {
  return {
    id,
    name: "مستخدم",
    nameEn: "User",
    username: "user",
    email: "user@edas.gov",
    empNo: "EMP-1000",
    jobTitle: "موظف",
    jobTitleEn: "Employee",
    deptId: "legal",
    role: "employee",
    status: "active",
    lastLogin: "2026-11-01",
    failedAttempts: 0,
    activeSessions: 0,
    initials: "مس",
    color: "bg-navy-600",
    ...patch,
  };
}

const users: DocUser[] = [
  user("u1", {
    name: "سارة القحطاني",
    nameEn: "Sara",
    username: "sara",
    email: "sara@edas.gov",
    role: "archivist",
    activeSessions: 2,
    initials: "سق",
  }),
  user("u2", {
    name: "أحمد المطيري",
    nameEn: "Ahmad",
    username: "ahmad",
    email: "ahmad@edas.gov",
    deptId: "fin",
    status: "locked",
    failedAttempts: 5,
    initials: "أم",
  }),
  user("u3", {
    name: "منى الشمري",
    nameEn: "Mona",
    username: "mona",
    email: "mona@edas.gov",
    deptId: "hr",
    role: "dept_manager",
    status: "inactive",
    failedAttempts: 2,
    activeSessions: 1,
    initials: "مش",
  }),
  user("u4", {
    name: "خالد الدوسري",
    nameEn: "Khalid",
    username: "khalid",
    email: "khalid@edas.gov",
    deptId: "eng",
    role: "supervisor",
    failedAttempts: 1,
    initials: "خد",
  }),
  user("u5", {
    name: "نورة السالم",
    nameEn: "Noura",
    username: "noura",
    email: "noura@edas.gov",
    deptId: "x-dept",
    role: "auditor",
    failedAttempts: 4,
    activeSessions: 3,
    initials: "نس",
  }),
  user("u6", {
    name: "عبدالله القحطاني",
    nameEn: "Abdullah",
    username: "abdullah",
    email: "abdullah@edas.gov",
    role: "system_admin",
    initials: "عق",
  }),
];

const departments = [
  { id: "legal", name: "الشؤون القانونية", nameEn: "Legal Affairs" },
  { id: "fin", name: "الإدارة المالية", nameEn: "Finance" },
  { id: "hr", name: "الموارد البشرية", nameEn: "HR" },
  { id: "eng", name: "الهندسة", nameEn: "Engineering" },
];

interface Opts {
  rows?: DocUser[];
  departments?: typeof departments;
  api?: boolean;
}

function setup(app: { lang?: "ar" | "en" } = {}, opts: Opts = {}) {
  const lang = app.lang ?? "ar";
  const toast = vi.fn();
  const usersStore = {
    items: opts.rows ?? users,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const refreshUsers = vi.fn().mockResolvedValue(undefined);

  mocks.app.mockReturnValue({ t: translator(lang), lang, toast });
  mocks.docs.mockReturnValue({
    users: usersStore,
    departments: { items: opts.departments ?? departments },
    refreshUsers,
  });

  for (const key of Object.keys(mocks.api)) delete mocks.api[key];
  Object.assign(mocks.api, {
    createUser: vi.fn().mockResolvedValue({}),
    updateUser: vi.fn().mockResolvedValue({}),
    deleteUser: vi.fn().mockResolvedValue({}),
    resetUserPassword: vi.fn().mockResolvedValue({}),
    revokeUserSessions: vi.fn().mockResolvedValue({}),
  });

  config.useApi = !!opts.api;

  const view = render(<Users />);
  return { ...view, toast, usersStore, refreshUsers, api: mocks.api };
}

function rowOf(name: string) {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

function openRowMenu(name: string, lang: "ar" | "en" = "ar") {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: lang === "en" ? EN["g.rowOptions"] : AR["g.rowOptions"] }));
}

function menuItem(label: string) {
  return within(screen.getByRole("menu")).getByRole("menuitem", { name: label });
}

function bodyRowCount() {
  return screen.getAllByRole("row").length - 1;
}

function passwordField(scope: HTMLElement) {
  return scope.querySelector('input[type="password"]') as HTMLInputElement;
}

function banner() {
  return screen.getByText("مستخدم محدد").parentElement as HTMLElement;
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  config.useApi = false;
});

afterEach(() => {
  config.useApi = false;
});

describe("overview", () => {
  it("summarises the accounts", () => {
    setup();

    const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent;
    expect(stat("إجمالي المستخدمين")).toBe("6");
    expect(stat("نشطون")).toBe("4");
    expect(stat("مقفلون")).toBe("1");
    expect(stat("جلسات نشطة")).toBe("6");
    expect(stat("أدوار")).toBe("6");
  });

  it("lists the users with their roles, departments and states", () => {
    setup();

    expect(bodyRowCount()).toBe(6);
    expect(screen.getByText("@sara")).toBeInTheDocument();
    expect(within(rowOf("سارة القحطاني")).getByText("مسؤول أرشفة")).toHaveClass("bg-teal-100");
    expect(within(rowOf("أحمد المطيري")).getByText("موظف إدارة")).toHaveClass("bg-ink-100");
    expect(within(rowOf("منى الشمري")).getByText("مدير إدارة")).toHaveClass("bg-navy-100");
    expect(within(rowOf("خالد الدوسري")).getByText("مشرف قسم")).toHaveClass("bg-ink-100");
    expect(within(rowOf("نورة السالم")).getByText("مدقق")).toHaveClass("bg-sky-100");
    expect(within(rowOf("عبدالله القحطاني")).getByText("مدير نظام")).toHaveClass("bg-purple-100");
    expect(within(rowOf("سارة القحطاني")).getByText("الشؤون القانونية")).toBeInTheDocument();
    expect(within(rowOf("نورة السالم")).getByText("x-dept")).toBeInTheDocument();
  });

  it("colours the failure counts by severity and marks the open sessions", () => {
    setup();

    expect(within(rowOf("أحمد المطيري")).getByText("5")).toHaveClass("text-rose-600");
    expect(within(rowOf("منى الشمري")).getByText("2")).toHaveClass("text-amber-600");
    expect(within(rowOf("سارة القحطاني")).getByText("0")).toHaveClass("text-ink-400");
    expect(within(rowOf("سارة القحطاني")).getByText("2")).toBeInTheDocument();
    expect(rowOf("سارة القحطاني").querySelector(".bg-emerald-500")).not.toBeNull();
    expect(rowOf("أحمد المطيري").querySelector(".animate-pulse")).toBeNull();
  });

  it("labels the status badges in both languages", () => {
    setup();

    expect(within(rowOf("سارة القحطاني")).getByText(AR["g.active"])).toBeInTheDocument();
    expect(within(rowOf("أحمد المطيري")).getByText("مقفل")).toBeInTheDocument();
    expect(within(rowOf("منى الشمري")).getByText(AR["g.inactive"])).toBeInTheDocument();
  });

  it("sorts by every column", () => {
    setup();
    const header = (name: RegExp) => screen.getByRole("columnheader", { name });

    fireEvent.click(header(/فاشلة/));
    expect(within(screen.getAllByRole("row")[1]).getByText("سارة القحطاني")).toBeInTheDocument();
    fireEvent.click(header(/فاشلة/));
    expect(within(screen.getAllByRole("row")[1]).getByText("أحمد المطيري")).toBeInTheDocument();

    for (const name of [/المستخدم/, /^الدور/, /^الإدارة/, /^الحالة/, /آخر دخول/, /الجلسات/]) {
      fireEvent.click(header(name));
      expect(bodyRowCount()).toBe(6);
    }
  });
});

describe("search and filters", () => {
  it("searches by Arabic name, English name, username and email", () => {
    setup();
    const search = screen.getByLabelText("ابحث في المستخدمين");

    fireEvent.change(search, { target: { value: "أحمد" } });
    expect(bodyRowCount()).toBe(1);

    fireEvent.change(search, { target: { value: "khalid" } });
    expect(bodyRowCount()).toBe(1);
    expect(screen.getByText("خالد الدوسري")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "NOURA" } });
    expect(bodyRowCount()).toBe(1);

    fireEvent.change(search, { target: { value: "mona@" } });
    expect(bodyRowCount()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(bodyRowCount()).toBe(6);
  });

  it("filters by role and by status", () => {
    setup();

    fireEvent.change(screen.getByLabelText("تصفية حسب الدور"), { target: { value: "auditor" } });
    expect(bodyRowCount()).toBe(1);
    expect(screen.getByText("نورة السالم")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("تصفية حسب الدور"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("تصفية حسب الحالة"), { target: { value: "locked" } });
    expect(bodyRowCount()).toBe(1);
    expect(screen.getByText("أحمد المطيري")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches and creates from it", () => {
    setup();

    fireEvent.change(screen.getByLabelText("تصفية حسب الدور"), { target: { value: "auditor" } });
    fireEvent.change(screen.getByLabelText("تصفية حسب الحالة"), { target: { value: "locked" } });

    expect(screen.getByText("لا يوجد مستخدمون مطابقون")).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByText("لا يوجد مستخدمون مطابقون").closest("div")!.parentElement as HTMLElement).getByRole("button", {
        name: AR["g.create"],
      }),
    );
    expect(screen.getByRole("dialog", { name: "إنشاء مستخدم" })).toBeInTheDocument();
  });
});

describe("creating a user", () => {
  it("validates the name, username and email before adding", () => {
    const { usersStore } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    const create = within(dialog).getByRole("button", { name: AR["g.create"] });
    expect(create).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "لي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "bad name" } });
    fireEvent.change(within(dialog).getByPlaceholderText("name@edas.gov"), { target: { value: "not-an-email" } });
    fireEvent.click(create);

    expect(within(dialog).getByText("يجب أن يكون 3 أحرف على الأقل")).toBeInTheDocument();
    expect(within(dialog).getByText("أحرف إنجليزية وأرقام ونقاط فقط")).toBeInTheDocument();
    expect(within(dialog).getByText("بريد إلكتروني غير صحيح")).toBeInTheDocument();
    expect(usersStore.add).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    expect(within(dialog).queryByText("يجب أن يكون 3 أحرف على الأقل")).toBeNull();
  });

  it("creates the user with the chosen department and role", () => {
    const { usersStore, toast } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "hr" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[1], { target: { value: "supervisor" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    expect(usersStore.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ليلى الحربي",
        nameEn: "ليلى الحربي",
        username: "layla",
        email: "layla@edas.gov",
        deptId: "hr",
        role: "supervisor",
        status: "active",
        jobTitle: "موظف",
        jobTitleEn: "Employee",
        initials: "لي",
        color: "bg-navy-600",
        lastLogin: "—",
        failedAttempts: 0,
        activeSessions: 0,
        empNo: expect.stringMatching(/^EMP-\d{4}$/),
      }),
    );
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء المستخدم", message: "ليلى الحربي" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the email when one is typed", () => {
    const { usersStore } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(within(dialog).getByPlaceholderText("name@edas.gov"), { target: { value: "layla@edas.gov" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    expect(usersStore.add).toHaveBeenCalledWith(expect.objectContaining({ email: "layla@edas.gov" }));
  });

  it("closes without creating", () => {
    const { usersStore } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.cancel"] }));

    expect(usersStore.add).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requires an eight character password through the API", () => {
    const { usersStore } = setup({}, { api: true });

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(passwordField(dialog), { target: { value: "short" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("8 أحرف على الأقل");
    expect(usersStore.add).not.toHaveBeenCalled();
  });

  it("creates the user through the API with the mapped role", async () => {
    const { api, refreshUsers, toast } = setup({}, { api: true });

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(passwordField(dialog), { target: { value: "password123" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "eng" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[1], { target: { value: "dept_manager" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() =>
      expect(api.createUser).toHaveBeenCalledWith({
        name: "ليلى الحربي",
        username: "layla",
        email: "layla@edas.gov",
        password: "password123",
        role: "DEPT_MANAGER",
        departmentId: "eng",
      }),
    );
    await waitFor(() => expect(refreshUsers).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم إنشاء المستخدم", message: "ليلى الحربي" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("falls back to no department when the API has no departments", async () => {
    const { api } = setup({}, { api: true, departments: [] });

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(passwordField(dialog), { target: { value: "password123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith(expect.objectContaining({ departmentId: undefined })));
  });

  it("reports an API failure and keeps the dialog open", async () => {
    const { api, toast } = setup({}, { api: true });
    api.createUser.mockRejectedValueOnce(new Error("nope"));

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء مستخدم" });
    fireEvent.change(within(dialog).getByPlaceholderText("اسم المستخدم"), { target: { value: "ليلى الحربي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("ahmad.al-balawi"), { target: { value: "layla" } });
    fireEvent.change(passwordField(dialog), { target: { value: "password123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
    expect(screen.getByRole("dialog", { name: "إنشاء مستخدم" })).toBeInTheDocument();
  });
});

describe("editing a user", () => {
  it("saves the changed fields", () => {
    const { usersStore, toast } = setup();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem(AR["g.edit"]));
    const dialog = screen.getByRole("dialog", { name: `تعديل — سارة القحطاني` });
    const fields = within(dialog).getAllByRole("textbox");

    fireEvent.change(fields[0], { target: { value: "سارة العتيبي" } });
    fireEvent.change(fields[1], { target: { value: "sara.ot" } });
    fireEvent.change(fields[2], { target: { value: "sara.ot@edas.gov" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[0], { target: { value: "fin" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[1], { target: { value: "auditor" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[2], { target: { value: "locked" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.save"] }));

    expect(usersStore.update).toHaveBeenCalledWith("u1", {
      name: "سارة العتيبي",
      username: "sara.ot",
      email: "sara.ot@edas.gov",
      deptId: "fin",
      role: "auditor",
      status: "locked",
    });
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "سارة العتيبي" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the account metadata", () => {
    setup();

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem(AR["g.edit"]));
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("EMP-1000");
    expect(dialog).toHaveTextContent("2026-11-01");
    expect(within(dialog).getByText("محاولات فاشلة").parentElement).toHaveTextContent("5");
  });

  it("disables saving without a name and cancels", () => {
    const { usersStore } = setup();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem(AR["g.edit"]));
    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "   " } });
    expect(within(dialog).getByRole("button", { name: AR["g.save"] })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.cancel"] }));
    expect(usersStore.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("updates the user through the API with the mapped status", async () => {
    const { api, refreshUsers, toast } = setup({}, { api: true });

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem(AR["g.edit"]));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "أحمد المطيري المعدل" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() =>
      expect(api.updateUser).toHaveBeenCalledWith("u2", {
        name: "أحمد المطيري المعدل",
        username: "ahmad",
        email: "ahmad@edas.gov",
        role: "EMPLOYEE",
        status: "LOCKED",
        departmentId: "fin",
      }),
    );
    await waitFor(() => expect(refreshUsers).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم حفظ التعديلات", message: "أحمد المطيري المعدل" });
  });

  it("leaves an unknown department out of the API payload", async () => {
    const { api } = setup({}, { api: true });

    openRowMenu("نورة السالم");
    fireEvent.click(menuItem(AR["g.edit"]));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u5", expect.objectContaining({ departmentId: undefined })));
  });

  it("reports an API failure while editing", async () => {
    const { api, toast } = setup({}, { api: true });
    api.updateUser.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem(AR["g.edit"]));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("row actions", () => {
  it("locks and unlocks an account", () => {
    const { usersStore, toast } = setup();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("قفل"));
    expect(usersStore.update).toHaveBeenCalledWith("u1", { status: "locked" });
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم قفل الحساب", message: "سارة القحطاني" });

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem("فتح القفل"));
    expect(usersStore.update).toHaveBeenCalledWith("u2", { status: "active" });
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح القفل", message: "أحمد المطيري" });
  });

  it("locks and unlocks through the API", async () => {
    const { api, refreshUsers, toast } = setup({}, { api: true });

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("قفل"));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u1", { status: "LOCKED" }));
    await waitFor(() => expect(refreshUsers).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم قفل الحساب", message: "سارة القحطاني" }));

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem("فتح القفل"));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u2", { status: "ACTIVE" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح القفل", message: "أحمد المطيري" }));
  });

  it("reports an API failure when locking", async () => {
    const { api, toast } = setup({}, { api: true });
    api.updateUser.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("قفل"));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
  });

  it("deactivates and reactivates an account", () => {
    const { usersStore, toast } = setup();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إيقاف"));
    expect(usersStore.update).toHaveBeenCalledWith("u1", { status: "inactive" });
    expect(toast).toHaveBeenCalledWith({ type: "info", title: "تم إيقاف الحساب", message: "سارة القحطاني" });

    openRowMenu("منى الشمري");
    fireEvent.click(menuItem("تفعيل"));
    expect(usersStore.update).toHaveBeenCalledWith("u3", { status: "active" });
    expect(toast).toHaveBeenCalledWith({ type: "info", title: "تم التفعيل", message: "منى الشمري" });
  });

  it("deactivates through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إيقاف"));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u1", { status: "INACTIVE" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "info", title: "تم إيقاف الحساب", message: "سارة القحطاني" }));

    openRowMenu("منى الشمري");
    fireEvent.click(menuItem("تفعيل"));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u3", { status: "ACTIVE" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "info", title: "تم التفعيل", message: "منى الشمري" }));
  });

  it("reports an API failure when deactivating", async () => {
    const { api, toast } = setup({}, { api: true });
    api.updateUser.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إيقاف"));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
  });

  it("revokes the sessions of one user", () => {
    const { usersStore, toast } = setup();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إلغاء الجلسات"));

    expect(usersStore.update).toHaveBeenCalledWith("u1", { activeSessions: 0 });
    expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء الجلسات", message: "سارة القحطاني" });
  });

  it("revokes the sessions through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إلغاء الجلسات"));

    await waitFor(() => expect(api.revokeUserSessions).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء الجلسات", message: "سارة القحطاني" }));
  });

  it("reports an API failure when revoking", async () => {
    const { api, toast } = setup({}, { api: true });
    api.revokeUserSessions.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إلغاء الجلسات"));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
  });

  it("sets a new password through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem("إعادة تعيين كلمة المرور"));
    const dialog = screen.getByRole("dialog", { name: "تعيين كلمة مرور — أحمد المطيري" });
    const save = within(dialog).getByRole("button", { name: AR["g.save"] });
    expect(save).toBeDisabled();

    fireEvent.change(passwordField(dialog), { target: { value: "newpassword1" } });
    fireEvent.click(save);

    await waitFor(() => expect(api.resetUserPassword).toHaveBeenCalledWith("u2", "newpassword1"));
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم تعيين كلمة المرور", message: "أحمد المطيري" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reports a password failure and cancels", async () => {
    const { api, toast } = setup({}, { api: true });
    api.resetUserPassword.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("أحمد المطيري");
    fireEvent.click(menuItem("إعادة تعيين كلمة المرور"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(passwordField(dialog), { target: { value: "newpassword1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));

    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.cancel"] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides the password action outside the API mode", () => {
    setup();

    openRowMenu("أحمد المطيري");

    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: "إعادة تعيين كلمة المرور" })).toBeNull();
  });

  it("deletes a user after the confirmation", () => {
    const { usersStore, toast } = setup();

    openRowMenu("نورة السالم");
    fireEvent.click(menuItem(AR["g.delete"]));
    const dialog = screen.getByRole("dialog", { name: "حذف المستخدم" });
    expect(dialog).toHaveTextContent("سيتم حذف حساب «نورة السالم» نهائياً");

    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.delete"] }));

    expect(usersStore.remove).toHaveBeenCalledWith("u5");
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف المستخدم", message: "نورة السالم" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the user when the deletion is cancelled", () => {
    const { usersStore } = setup();

    openRowMenu("نورة السالم");
    fireEvent.click(menuItem(AR["g.delete"]));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["confirm.no"] }));

    expect(usersStore.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes through the API", async () => {
    const { api, refreshUsers, toast } = setup({}, { api: true });

    openRowMenu("نورة السالم");
    fireEvent.click(menuItem(AR["g.delete"]));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith("u5"));
    await waitFor(() => expect(refreshUsers).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم حذف المستخدم", message: "نورة السالم" }));
  });

  it("reports an API failure when deleting", async () => {
    const { api, toast } = setup({}, { api: true });
    api.deleteUser.mockRejectedValueOnce(new Error("nope"));

    openRowMenu("نورة السالم");
    fireEvent.click(menuItem(AR["g.delete"]));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));
  });
});

describe("bulk actions", () => {
  function selectAll() {
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
  }

  it("selects and clears every account", () => {
    setup();

    selectAll();
    expect(banner().firstElementChild).toHaveTextContent("6");
    expect(screen.getByText("مستخدم محدد")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(screen.queryByText("مستخدم محدد")).toBeNull();
  });

  it("selects a single account from its row", () => {
    setup();

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    expect(banner().firstElementChild).toHaveTextContent("1");

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    expect(screen.queryByText("مستخدم محدد")).toBeNull();
  });

  it("locks, unlocks and revokes the selected accounts", () => {
    const { usersStore, toast } = setup();

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    fireEvent.click(within(rowOf("أحمد المطيري")).getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: "قفل" }));
    expect(usersStore.update).toHaveBeenCalledWith("u1", { status: "locked" });
    expect(usersStore.update).toHaveBeenCalledWith("u2", { status: "locked" });
    expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم قفل 2 حساب" });
    expect(screen.queryByText("مستخدم محدد")).toBeNull();
  });

  it("unlocks the selected accounts", () => {
    const { usersStore, toast } = setup();

    fireEvent.click(within(rowOf("أحمد المطيري")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "فتح القفل" }));

    expect(usersStore.update).toHaveBeenCalledWith("u2", { status: "active", failedAttempts: 0 });
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح 1 حساب" });
  });

  it("revokes the selected sessions", () => {
    const { usersStore, toast } = setup();

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الجلسات" }));

    expect(usersStore.update).toHaveBeenCalledWith("u1", { activeSessions: 0 });
    expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء الجلسات", message: "1 مستخدم" });
  });

  it("locks the selection through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "قفل" }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u1", { status: "LOCKED" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم قفل 1 حساب" }));
  });

  it("unlocks the selection through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    fireEvent.click(within(rowOf("أحمد المطيري")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "فتح القفل" }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u2", { status: "ACTIVE" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح 1 حساب" }));
  });

  it("revokes the selection through the API", async () => {
    const { api, toast } = setup({}, { api: true });

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الجلسات" }));

    await waitFor(() => expect(api.revokeUserSessions).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء الجلسات", message: "1 مستخدم" }));
  });

  it("reports API failures for every bulk action", async () => {
    const { api, toast } = setup({}, { api: true });

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    api.updateUser.mockRejectedValueOnce(new Error("lock"));
    fireEvent.click(screen.getByRole("button", { name: "قفل" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: "error", title: AR["err.api"] }));

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    api.updateUser.mockRejectedValueOnce(new Error("unlock"));
    fireEvent.click(screen.getByRole("button", { name: "فتح القفل" }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));

    fireEvent.click(within(rowOf("سارة القحطاني")).getByRole("checkbox"));
    api.revokeUserSessions.mockRejectedValueOnce(new Error("revoke"));
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الجلسات" }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(3));
    expect(toast).toHaveBeenLastCalledWith({ type: "error", title: AR["err.api"] });
  });
});

describe("modal chrome", () => {
  it("closes the create, edit and password dialogs from the backdrop", () => {
    setup({}, { api: true });

    const backdrop = () => {
      const dialog = screen.getByRole("dialog");
      return dialog.parentElement!.querySelector("div[aria-hidden='true']") as HTMLElement;
    };

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    fireEvent.click(backdrop());
    expect(screen.queryByRole("dialog")).toBeNull();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem(AR["g.edit"]));
    fireEvent.click(backdrop());
    expect(screen.queryByRole("dialog")).toBeNull();

    openRowMenu("سارة القحطاني");
    fireEvent.click(menuItem("إعادة تعيين كلمة المرور"));
    fireEvent.click(backdrop());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("export and language", () => {
  it("exports the filtered rows to CSV", () => {
    const { toast } = setup();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:users");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    fireEvent.change(screen.getByLabelText("تصفية حسب الدور"), { target: { value: "auditor" } });
    fireEvent.click(screen.getByRole("button", { name: AR["g.export"] }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ type: "success", title: "تم تنزيل CSV", message: "1 صف" });

    click.mockRestore();
    create.mockRestore();
    revoke.mockRestore();
  });

  it("prints the list", () => {
    setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole("button", { name: AR["g.export"] }));
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));

    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("leaves nothing to export when the filter matches nothing", () => {
    const { toast } = setup();

    fireEvent.change(screen.getByLabelText("تصفية حسب الدور"), { target: { value: "auditor" } });
    fireEvent.change(screen.getByLabelText("تصفية حسب الحالة"), { target: { value: "locked" } });
    fireEvent.click(screen.getByRole("button", { name: AR["g.export"] }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(toast).toHaveBeenCalledWith({
      type: "info",
      title: "لا توجد بيانات للتصدير",
      message: "لا توجد صفوف مطابقة للفلاتر الحالية.",
    });
  });

  it("speaks English across the page and the dialogs", () => {
    setup({ lang: "en" });

    expect(screen.getByText("Manage user accounts, roles, permissions and sessions")).toBeInTheDocument();
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(screen.getByLabelText("Search users")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by role")).toBeInTheDocument();
    expect(within(rowOf("نورة السالم")).getByText("Auditor")).toBeInTheDocument();

    openRowMenu("سارة القحطاني", "en");
    expect(menuItem("Edit")).toBeInTheDocument();
    expect(menuItem("Lock")).toBeInTheDocument();
    expect(menuItem("Deactivate")).toBeInTheDocument();
    expect(menuItem("Revoke sessions")).toBeInTheDocument();
    expect(menuItem("Delete")).toBeInTheDocument();
    fireEvent.click(menuItem("Edit"));

    const dialog = screen.getByRole("dialog", { name: "Edit — سارة القحطاني" });
    expect(within(dialog).getAllByRole("textbox")[0]).toHaveValue("سارة القحطاني");
    expect(within(dialog).getByText("Status")).toBeInTheDocument();
  });
});
