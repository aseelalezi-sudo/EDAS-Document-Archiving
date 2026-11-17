import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  config: { useApi: false, oidc: { issuer: "" } },
  api: {
    putSetting: vi.fn(),
    updateUser: vi.fn(),
    revokeUserSessions: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.api }));

import { Security } from "./admin-security";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const SETTINGS: Record<string, string> = {
  minPassword: "14",
  passwordExpiry: "90",
  failedAttempts: "5",
  lockDuration: "30",
  idleTimeout: "20",
  maxSession: "8",
  concurrentSessions: "3",
  pwPolicy: JSON.stringify({ upper: true, lower: true, digit: true, symbol: true, history: "5", tempValid: "24" }),
  lockManual: "true",
  blockedIPs: JSON.stringify(["10.0.0.9"]),
  lanRanges: "10.0.0.0/8",
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
  const store = {
    systemSettings: SETTINGS,
    applySystemSettings: vi.fn(),
    users: {
      items: [
        { id: "u-1", name: "أمل السبيعي", initials: "أس", color: "bg-navy-600", status: "active", failedAttempts: 0, activeSessions: 2 },
        { id: "u-2", name: "خالد العتيبي", initials: "خع", color: "bg-teal-600", status: "locked", failedAttempts: 5, activeSessions: 1 },
      ],
      update: vi.fn(),
    },
    refreshUsers: vi.fn(),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Security />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.config.oidc.issuer = "";
});

describe("security policies", () => {
  it("renders the stored values, score and locked accounts", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.security")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(14);
    expect(screen.getAllByRole("spinbutton")[6]).toHaveValue(20);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("الإعدادات محفوظة")).toBeInTheDocument();
    expect(screen.getByText("خالد العتيبي")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.9")).toBeInTheDocument();
    expect(screen.getByText("غير مهيأ")).toBeInTheDocument();
  });

  it("marks the form dirty, discards changes and saves offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "10" } });
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "فتح يدوي" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "تجاهل" }));
    expect(screen.getByText("الإعدادات محفوظة")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(14);

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "10" } });
    fireEvent.click(screen.getAllByRole("button", { name: t("g.save") })[0]);

    expect(store.applySystemSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        minPassword: "10",
        lockManual: "true",
        blockedIPs: JSON.stringify(["10.0.0.9"]),
        lanRanges: "10.0.0.0/8",
        pwPolicy: JSON.stringify({ upper: true, lower: true, digit: true, symbol: true, history: "5", tempValid: "24" }),
      }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "تم حفظ سياسات الأمان" }));
    expect(screen.getByText("الإعدادات محفوظة")).toBeInTheDocument();
  });

  it("toggles the password requirements and lockout switch", () => {
    mockStore();
    mockApp();
    renderPage();

    const symbol = screen.getByRole("button", { name: "رمز خاص" });
    expect(symbol).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(symbol);
    expect(symbol).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "فتح يدوي" }));
    expect(screen.getByRole("switch", { name: "فتح يدوي" })).not.toBeChecked();
  });

  it("runs the local guidance test and dismisses it", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "اختبار" }));
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
    expect(screen.getByText(/القيم متوافقة مع الممارسات المقترحة/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByText(/5\/5/)).toBeNull();

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "8" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[6], { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "اختبار" }));
    expect(screen.getByText(/3\/5/)).toBeInTheDocument();
    expect(screen.getByText(/تحتاج تحسينات/)).toBeInTheDocument();
  });

  it("adds and removes blocked IPs and edits LAN ranges", () => {
    mockStore();
    mockApp();
    renderPage();

    const ip = screen.getByPlaceholderText("10.0.9.99");
    fireEvent.change(ip, { target: { value: "10.1.1.1" } });
    fireEvent.click(screen.getByRole("button", { name: "حظر" }));
    expect(screen.getByText("10.1.1.1")).toBeInTheDocument();
    expect(ip).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "إزالة 10.0.0.9" }));
    expect(screen.queryByText("10.0.0.9")).toBeNull();

    fireEvent.change(ip, { target: { value: "10.2.2.2" } });
    fireEvent.keyDown(ip, { key: "Enter" });
    expect(screen.getByText("10.2.2.2")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("10.0.0.0/8"), { target: { value: "192.168.0.0/16" } });
    expect(screen.getByDisplayValue("192.168.0.0/16")).toBeInTheDocument();
    expect(screen.getByText("لديك تغييرات غير محفوظة")).toBeInTheDocument();
  });

  it("unlocks a locked account offline", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "فتح" }));
    expect(store.users.update).toHaveBeenCalledWith("u-2", { status: "active", failedAttempts: 0 });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح الحساب", message: "خالد العتيبي" });
  });

  it("revokes every session offline after confirmation", () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء جميع الجلسات" }));
    const dialog = screen.getByRole("dialog", { name: "إلغاء جميع الجلسات" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الجلسات" }));

    expect(store.users.update).toHaveBeenCalledWith("u-1", { activeSessions: 0 });
    expect(store.users.update).toHaveBeenCalledWith("u-2", { activeSessions: 0 });
    expect(app.toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء جميع الجلسات" });
  });

  it("renders English labels and the configured issuer", () => {
    mocks.config.oidc.issuer = "https://id.example/realms/edas";
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Security Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("Guidance score")).toBeInTheDocument();
    expect(screen.getByText("Password policy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke all sessions" })).toBeInTheDocument();
    expect(screen.getByText("https://id.example/realms/edas")).toBeInTheDocument();
  });
});

describe("security policies (API)", () => {
  it("saves only the changed settings", async () => {
    mocks.api.putSetting.mockResolvedValue({});
    const store = mockStore();
    const app = mockApp("ar", true);
    renderPage();

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "16" } });
    fireEvent.click(screen.getAllByRole("button", { name: t("g.save") })[0]);

    await waitFor(() => expect(mocks.api.putSetting).toHaveBeenCalledWith("minPassword", "16"));
    expect(mocks.api.putSetting).toHaveBeenCalledTimes(1);
    expect(store.applySystemSettings).toHaveBeenCalled();
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })));
  });

  it("reports save, unlock and revoke failures", async () => {
    const store = mockStore();
    const app = mockApp("ar", true);
    mocks.api.putSetting.mockRejectedValue(new Error("down"));
    mocks.api.updateUser.mockRejectedValue(new Error("down"));
    mocks.api.revokeUserSessions.mockRejectedValue(new Error("down"));
    renderPage();

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "16" } });
    fireEvent.click(screen.getAllByRole("button", { name: t("g.save") })[0]);
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));

    fireEvent.click(screen.getByRole("button", { name: "فتح" }));
    await waitFor(() => expect(mocks.api.updateUser).toHaveBeenCalledWith("u-2", { status: "ACTIVE" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "إلغاء جميع الجلسات" }));
    const dialog = screen.getByRole("dialog", { name: "إلغاء جميع الجلسات" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الجلسات" }));
    await waitFor(() => expect(mocks.api.revokeUserSessions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(app.toast).toHaveBeenCalledTimes(3));
    expect(store.refreshUsers).not.toHaveBeenCalled();
  });

  it("unlocks and revokes sessions through the API", async () => {
    const store = mockStore();
    const app = mockApp("ar", true);
    mocks.api.updateUser.mockResolvedValue({});
    mocks.api.revokeUserSessions.mockResolvedValue({});
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "فتح" }));
    await waitFor(() => expect(mocks.api.updateUser).toHaveBeenCalledWith("u-2", { status: "ACTIVE" }));
    await waitFor(() => expect(store.refreshUsers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم فتح الحساب", message: "خالد العتيبي" }));

    fireEvent.click(screen.getByRole("button", { name: "إلغاء جميع الجلسات" }));
    const dialog = screen.getByRole("dialog", { name: "إلغاء جميع الجلسات" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الجلسات" }));
    await waitFor(() => expect(mocks.api.revokeUserSessions).toHaveBeenCalledWith("u-1"));
    expect(mocks.api.revokeUserSessions).toHaveBeenCalledWith("u-2");
    await waitFor(() => expect(store.refreshUsers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "warning", title: "تم إلغاء جلسات جميع المستخدمين" }));
  });
});
