import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import { ApiError } from "../lib/api-client";
import type { Department, DocUser } from "../types";
import { config } from "../config";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  groups: vi.fn(),
  updateGroup: vi.fn(),
  updateUser: vi.fn(),
  resetUserPassword: vi.fn(),
  userSessions: vi.fn(),
  revokeUserSessions: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({
  domainApi: {
    groups: mocks.groups,
    updateGroup: mocks.updateGroup,
    updateUser: mocks.updateUser,
    resetUserPassword: mocks.resetUserPassword,
    userSessions: mocks.userSessions,
    revokeUserSessions: mocks.revokeUserSessions,
  },
}));
vi.mock("../config", () => ({ config: { useApi: false } }));

import { UserEditor } from "./admin-user-editor";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const legal: Department = {
  id: "legal",
  name: "الشؤون القانونية",
  nameEn: "Legal Affairs",
  code: "LEG",
  parentId: null,
  manager: "",
  employees: 19,
  docs: 980,
  status: "active",
};

const user: DocUser = {
  id: "u-1",
  name: "أمل السبيعي",
  nameEn: "Amal Al-Subaie",
  username: "amal",
  email: "amal@edas.gov",
  empNo: "EMP-1024",
  jobTitle: "مسؤولة أرشفة",
  jobTitleEn: "Archiving Officer",
  deptId: "legal",
  role: "archivist",
  status: "active",
  lastLogin: "2026-01-11 09:21",
  failedAttempts: 1,
  activeSessions: 2,
  initials: "أم",
  color: "bg-navy-600",
};

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    users: { items: [user], update: vi.fn(), refresh: vi.fn() },
    departments: { items: [legal] },
    refreshUsers: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(url = "/admin/users/u-1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/users/:id" element={<UserEditor />} />
        <Route path="/admin/users" element={<div>قائمة المستخدمين</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  config.useApi = false;
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.groups.mockReset().mockResolvedValue({ items: [] });
  mocks.updateGroup.mockReset().mockResolvedValue({});
  mocks.updateUser.mockReset().mockResolvedValue({});
  mocks.resetUserPassword.mockReset().mockResolvedValue({});
  mocks.userSessions.mockReset().mockResolvedValue({ count: 0, sessions: [] });
  mocks.revokeUserSessions.mockReset().mockResolvedValue({ id: "u-1", sessions: 0 });
});

afterEach(() => {
  config.useApi = false;
});

describe("system user editor", () => {
  it("explains when the user does not exist", () => {
    mockStore({ users: { items: [], update: vi.fn() } });
    mockApp();

    renderPage();

    expect(screen.getByText("لم يتم العثور على المستخدم")).toBeInTheDocument();
  });

  it("saves the edited profile and the selected role offline", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(screen.getByDisplayValue("أمل السبيعي"), { target: { value: "أمل السبيعي المحدثة" } });
    fireEvent.change(screen.getByDisplayValue("amal"), { target: { value: "amal.s" } });

    fireEvent.click(screen.getByRole("tab", { name: "الأدوار والنطاقات" }));
    fireEvent.click(screen.getByRole("radio", { name: /مدير نظام/ }));
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(store.users.update).toHaveBeenCalledWith("u-1", {
      name: "أمل السبيعي المحدثة",
      username: "amal.s",
      email: "amal@edas.gov",
      deptId: "legal",
      role: "system_admin",
    });
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("g.save") }));
    expect(screen.getByText("قائمة المستخدمين")).toBeInTheDocument();
  });

  it("rejects a short or mismatched password before saving", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الأمان" }));
    const [password, confirm] = screen.getAllByDisplayValue("");
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.change(confirm, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "كلمة المرور غير صالحة" }));
    expect(store.users.update).not.toHaveBeenCalled();
  });

  it("ends every offline session after confirmation", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الجلسات" }));

    expect(screen.getByText("الجلسات النشطة: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إنهاء كل الجلسات" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "إنهاء كل الجلسات" })).getByRole("button", { name: "إنهاء الجلسات" }));

    expect(store.users.update).toHaveBeenCalledWith("u-1", { activeSessions: 0 });
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "warning", title: "تم إنهاء الجلسات" }));
  });

  it("explains that group membership needs the server in offline mode", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("nav.groups") }));

    expect(screen.getByText("إدارة عضوية المجموعات متاحة في وضع الاتصال بالخادم فقط.")).toBeInTheDocument();
  });

  it("saves through the API and resets the password when provided", async () => {
    config.useApi = true;
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الأمان" }));
    const [password, confirm] = screen.getAllByDisplayValue("");
    fireEvent.change(password, { target: { value: "StrongPass1" } });
    fireEvent.change(confirm, { target: { value: "StrongPass1" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith("u-1", {
        name: "أمل السبيعي",
        username: "amal",
        email: "amal@edas.gov",
        role: "ARCHIVIST",
        departmentId: "legal",
        requirePasswordChange: false,
        requireTwoFactor: false,
      }),
    );
    await waitFor(() => expect(mocks.resetUserPassword).toHaveBeenCalledWith("u-1", "StrongPass1"));
    expect(store.refreshUsers).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("قائمة المستخدمين")).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("g.save") }));
  });

  it("keeps the editor open and reports a server refusal", async () => {
    config.useApi = true;
    mockStore();
    const app = mockApp();
    mocks.updateUser.mockRejectedValue(
      new ApiError(409, "USERNAME_TAKEN", "Username already exists", undefined, null, "اسم المستخدم مستخدم"),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: "اسم المستخدم مستخدم" })));
    expect(screen.queryByText("قائمة المستخدمين")).not.toBeInTheDocument();
  });

  it("loads the groups and toggles the user's membership", async () => {
    config.useApi = true;
    mockStore();
    const app = mockApp();
    mocks.groups.mockResolvedValue({
      items: [
        { id: "g-1", name: "فريق الأرشفة", nameEn: "Archiving team", memberIds: [] },
        { id: "g-2", name: "فريق الجودة", nameEn: "Quality team", memberIds: ["u-1"] },
      ],
    });

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("nav.groups") }));

    const quality = await screen.findByRole("checkbox", { name: /فريق الجودة/ });
    expect(quality).toHaveAttribute("aria-checked", "true");

    fireEvent.click(quality);
    await waitFor(() => expect(mocks.updateGroup).toHaveBeenCalledWith("g-2", { memberIds: [] }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت إزالة المستخدم" }));
  });

  it("lists the identity-provider sessions and revokes them", async () => {
    config.useApi = true;
    mockStore();
    const app = mockApp();
    mocks.userSessions.mockResolvedValue({
      count: 1,
      sessions: [{ id: "s-1", ipAddress: "10.1.1.9", clients: ["edas-web"], started: "2026-02-01T08:00:00Z" }],
    });

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الجلسات" }));

    expect(await screen.findByText("الجلسات النشطة: 1")).toBeInTheDocument();
    expect(screen.getByText("10.1.1.9")).toBeInTheDocument();
    expect(screen.getByText("edas-web")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إنهاء كل الجلسات" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "إنهاء كل الجلسات" })).getByRole("button", { name: "إنهاء الجلسات" }));

    await waitFor(() => expect(mocks.revokeUserSessions).toHaveBeenCalledWith("u-1"));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم إنهاء الجلسات" }));
  });

  it("offers a retry when the session lookup fails", async () => {
    config.useApi = true;
    mockStore();
    mockApp();
    mocks.userSessions.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Forbidden"));

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الجلسات" }));

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    await waitFor(() => expect(mocks.userSessions).toHaveBeenCalledTimes(2));
  });
});
