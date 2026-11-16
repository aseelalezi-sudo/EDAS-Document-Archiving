import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  config: { oidc: { issuer: "" } },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../config", () => ({ config: mocks.config }));

import { PasswordReset } from "./auth-password-reset";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function mockApp(apiMode = false) {
  const app = { t, apiMode };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<PasswordReset />} />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function goToStepTwo() {
  fireEvent.change(screen.getByPlaceholderText("name@edas.gov"), { target: { value: "amal@edas.gov" } });
  fireEvent.click(screen.getByRole("button", { name: t("auth.reset.send") }));
  act(() => {
    vi.advanceTimersByTime(700);
  });
}

function passwordInputs() {
  return screen.getAllByPlaceholderText("••••••••••••") as HTMLInputElement[];
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.config.oidc.issuer = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.location.hash = "";
});

describe("password reset", () => {
  it("walks through the demo reset flow to the success screen", () => {
    mockApp();
    renderPage();

    expect(screen.getByText(t("auth.reset.title"))).toBeInTheDocument();
    expect(screen.getByText(t("auth.reset.demoNotice"))).toBeInTheDocument();

    goToStepTwo();
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    const [pw, confirm] = passwordInputs();
    fireEvent.change(pw, { target: { value: "StrongPass12!" } });
    fireEvent.change(confirm, { target: { value: "StrongPass12!" } });

    expect(screen.getByText(t("auth.reset.strength.excellent"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(screen.getByText(t("auth.reset.success"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("auth.login") }));
    expect(window.location.hash).toBe("#/login");
  });

  it("returns to the first step from the verification form", () => {
    mockApp();
    renderPage();
    goToStepTwo();

    fireEvent.click(screen.getByRole("button", { name: t("g.back") }));

    expect(screen.getByPlaceholderText("name@edas.gov")).toBeInTheDocument();
  });

  it("rejects verification codes that are not six digits", () => {
    mockApp();
    renderPage();
    goToStepTwo();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "12345" } });
    const [pw, confirm] = passwordInputs();
    fireEvent.change(pw, { target: { value: "StrongPass12!" } });
    fireEvent.change(confirm, { target: { value: "StrongPass12!" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(screen.getByText(t("auth.reset.invalidCode"))).toBeInTheDocument();
    expect(screen.queryByText(t("auth.reset.success"))).not.toBeInTheDocument();
  });

  it("enforces every password policy requirement", () => {
    mockApp();
    renderPage();
    goToStepTwo();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    const [pw, confirm] = passwordInputs();
    fireEvent.change(pw, { target: { value: "short" } });
    fireEvent.change(confirm, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(screen.getByText(t("auth.reset.requirements"))).toBeInTheDocument();
  });

  it("rejects mismatched confirmation passwords", () => {
    mockApp();
    renderPage();
    goToStepTwo();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    const [pw, confirm] = passwordInputs();
    fireEvent.change(pw, { target: { value: "StrongPass12!" } });
    fireEvent.change(confirm, { target: { value: "StrongPass12?" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.save") }));

    expect(screen.getByText(t("auth.reset.mismatch"))).toBeInTheDocument();
  });

  it("toggles password visibility and reports strength progress", () => {
    mockApp();
    renderPage();
    goToStepTwo();

    const [pw] = passwordInputs();
    expect(pw.type).toBe("password");
    fireEvent.change(pw, { target: { value: "StrongPass12!" } });
    expect(screen.getByText(t("auth.reset.strength.excellent"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("auth.show") }));
    expect(pw.type).toBe("text");
    expect(screen.getByRole("button", { name: t("auth.hide") })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains the identity-provider flow in API mode", () => {
    mockApp(true);
    mocks.config.oidc.issuer = "https://id.example/realms/edas";
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPage();

    expect(screen.getByText(t("auth.reset.apiBody"))).toBeInTheDocument();
    expect(screen.getByText(t("auth.reset.apiStep1"))).toBeInTheDocument();
    expect(screen.getByText(t("auth.reset.apiStep2"))).toBeInTheDocument();
    expect(screen.getByText(t("auth.reset.apiStep3"))).toBeInTheDocument();
    expect(screen.getByText(t("auth.secure"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("auth.reset.openAccount") }));
    expect(open).toHaveBeenCalledWith("https://id.example/realms/edas/account", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("hides the account link when no issuer is configured", () => {
    mockApp(true);
    renderPage();

    expect(screen.queryByRole("button", { name: t("auth.reset.openAccount") })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("name@edas.gov")).not.toBeInTheDocument();
  });

  it("navigates back to the login screen from the shell", () => {
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("auth.back") }));

    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });
});
