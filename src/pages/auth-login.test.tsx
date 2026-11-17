import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_USERS } from "../data";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  apiRequest: vi.fn(),
  config: { useApi: false, apiBaseUrl: "https://api.edas.local" },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../lib/api-client", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../config", () => ({ config: mocks.config }));

import { Login } from "./auth-login";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function mockApp(overrides: Record<string, unknown> = {}) {
  const app = {
    t,
    lang: "ar",
    apiMode: false,
    theme: "light",
    setLang: vi.fn(),
    toggleTheme: vi.fn(),
    login: vi.fn(),
    loginWithKeycloak: vi.fn().mockResolvedValue(undefined),
    toast: vi.fn(),
    ...overrides,
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Login />
              <LocationProbe />
            </>
          }
        />
        <Route path="/password/reset" element={<LocationProbe />} />
        <Route path="/dashboard" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitForm() {
  fireEvent.submit(screen.getByRole("button", { name: "تسجيل الدخول" }).closest("form") as HTMLFormElement);
}

function fillCredentials(username: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("ahmad.al-balawi"), { target: { value: username } });
  fireEvent.change(screen.getByPlaceholderText("••••••••••••"), { target: { value: password } });
}

function advanceLogin() {
  act(() => {
    vi.advanceTimersByTime(700);
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.app.mockReset();
  mocks.apiRequest.mockReset();
  mocks.config.useApi = false;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login offline", () => {
  it("signs in with typed credentials and remembers the username", () => {
    const app = mockApp();
    renderLogin();

    fillCredentials("my.user", "secret-pass");
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    advanceLogin();

    const demo = DEMO_USERS[0];
    expect(app.login).toHaveBeenCalledWith(expect.objectContaining({ username: "my.user", name: demo.user.name, role: demo.role }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تسجيل الدخول", message: demo.user.name });
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(localStorage.getItem("edas.v1.lastUsername")).toBe("my.user");
  });

  it("shows an error and stays put when credentials are missing", () => {
    const app = mockApp();
    renderLogin();

    submitForm();
    advanceLogin();

    expect(app.login).not.toHaveBeenCalled();
    expect(screen.getByText(t("auth.failed"))).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("locks the account for the locked username", () => {
    const app = mockApp();
    renderLogin();

    fillCredentials("locked", "whatever");
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    advanceLogin();

    expect(app.login).not.toHaveBeenCalled();
    expect(screen.getByText(t("auth.locked"))).toBeInTheDocument();
  });

  it("clears the remembered username when remember me is unchecked", () => {
    const app = mockApp();
    renderLogin();

    fireEvent.click(screen.getByRole("checkbox", { name: t("auth.remember") }));
    fillCredentials("off.user", "secret");
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    advanceLogin();

    expect(app.login).toHaveBeenCalled();
    expect(localStorage.getItem("edas.v1.remember")).toBe("off");
    expect(localStorage.getItem("edas.v1.lastUsername")).toBeNull();
  });

  it("prefills the remembered username and consumes the expiry flag", () => {
    localStorage.setItem("edas.v1.lastUsername", "sara");
    sessionStorage.setItem("edas_session_expired", "1");
    mockApp();
    renderLogin();

    expect(screen.getByPlaceholderText("ahmad.al-balawi")).toHaveValue("sara");
    expect(screen.getByText(t("auth.expired"))).toBeInTheDocument();
    expect(sessionStorage.getItem("edas_session_expired")).toBeNull();
  });

  it("toggles password visibility", () => {
    mockApp();
    renderLogin();
    const toggle = screen.getByRole("button", { name: t("auth.show") });
    expect(screen.getByPlaceholderText("••••••••••••")).toHaveAttribute("type", "password");

    fireEvent.click(toggle);
    expect(screen.getByPlaceholderText("••••••••••••")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: t("auth.hide") })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches language and theme from the header", () => {
    const app = mockApp();
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: t("topbar.lang") }));
    expect(app.setLang).toHaveBeenCalledWith("en");

    const themeButton = screen.getByRole("button", { name: t("topbar.theme") });
    expect(themeButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(themeButton);
    expect(app.toggleTheme).toHaveBeenCalled();
  });

  it("opens the password reset page", () => {
    mockApp();
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: t("auth.forgot") }));
    expect(screen.getByTestId("location")).toHaveTextContent("/password/reset");
  });

  it("signs in from the Active Directory button as system admin", () => {
    const app = mockApp();
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: t("auth.ad") }));
    advanceLogin();

    expect(app.login).toHaveBeenCalledWith(expect.objectContaining({ role: "system_admin" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: `مرحباً ${DEMO_USERS[3].user.name}` }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("lists the demo accounts and renders English labels", () => {
    const app = mockApp({ lang: "en", t: (key: string) => (translations.en as Record<string, string>)[key] ?? key });
    renderLogin();

    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(0);
    expect(screen.getByText("Demo accounts")).toBeInTheDocument();
    expect(screen.getByText("Sign in with Active Directory")).toBeInTheDocument();
    expect(screen.getByText("This system runs inside a secure encrypted LAN")).toBeInTheDocument();
    for (const demo of DEMO_USERS) {
      expect(screen.getByText(demo.user.name)).toBeInTheDocument();
    }
    expect(app.login).not.toHaveBeenCalled();
  });
});

describe("login against the API", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.config.useApi = true;
  });

  it("checks the API and starts the Keycloak flow", async () => {
    const app = mockApp({ apiMode: true });
    mocks.apiRequest.mockResolvedValue({});
    renderLogin();

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith("/auth/config", expect.objectContaining({ signal: expect.anything() })),
    );
    expect(screen.queryByPlaceholderText("ahmad.al-balawi")).not.toBeInTheDocument();
    expect(screen.getByText(t("auth.keycloakHint"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("auth.keycloak") }));
    await waitFor(() => expect(app.loginWithKeycloak).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the API down notice and retries the check", async () => {
    mockApp({ apiMode: true });
    mocks.apiRequest.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({});
    renderLogin();

    expect(await screen.findByText(t("auth.apiUnavailable"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("err.retry") }));

    await waitFor(() => expect(screen.queryByText(t("auth.apiUnavailable"))).not.toBeInTheDocument());
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
  });

  it("reports a failed Keycloak redirect", async () => {
    const app = mockApp({ apiMode: true, loginWithKeycloak: vi.fn().mockRejectedValue(new Error("no idp")) });
    mocks.apiRequest.mockResolvedValue({});
    renderLogin();

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: t("auth.keycloak") }));

    expect(await screen.findByText(t("auth.apiUnavailable"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("auth.keycloak") })).toBeEnabled();
    expect(app.login).not.toHaveBeenCalled();
  });
});
