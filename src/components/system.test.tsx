import { act } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({ app: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));

import { ToastHost, SessionWatcher, KeyboardShortcuts } from "./system";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShortcuts() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <KeyboardShortcuts />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mockApp(overrides: Record<string, unknown> = {}) {
  const app = {
    t,
    lang: "ar",
    theme: "light",
    toggleTheme: vi.fn(),
    setLang: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
  mocks.app.mockReturnValue(app);
  return app;
}

beforeEach(() => {
  mocks.app.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast host", () => {
  it("renders toasts and dismisses them", () => {
    const dismissToast = vi.fn();
    mockApp({
      toasts: [
        { id: "1", type: "success", title: "تم الحفظ", message: "حُفظت الوثيقة" },
        { id: "2", type: "error", title: "فشل الحفظ" },
        { id: "3", type: "warning", title: "تحذير" },
        { id: "4", type: "info", title: "معلومة" },
      ],
      dismissToast,
    });
    render(<ToastHost />);

    const status = screen.getByRole("status");
    expect(within(status).getByText("تم الحفظ")).toBeInTheDocument();
    expect(within(status).getByText("حُفظت الوثيقة")).toBeInTheDocument();
    expect(within(status).getByText("فشل الحفظ")).toBeInTheDocument();
    expect(within(status).getByText("تحذير")).toBeInTheDocument();
    expect(within(status).getByText("معلومة")).toBeInTheDocument();

    const buttons = within(status).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons[1]).toHaveAttribute("aria-label", "إغلاق");
    fireEvent.click(buttons[1]);
    expect(dismissToast).toHaveBeenCalledWith("2");
  });

  it("renders an empty live region without toasts", () => {
    mockApp({ toasts: [], dismissToast: vi.fn() });
    render(<ToastHost />);

    expect(within(screen.getByRole("status")).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("session watcher", () => {
  it("warns after inactivity, counts down and extends", () => {
    mockApp();
    vi.useFakeTimers();
    render(<SessionWatcher />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(305_000);
    });
    const dialog = screen.getByRole("dialog", { name: t("session.warning") });
    expect(within(dialog).getByText("120")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(within(dialog).getByText("118")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: t("session.extend") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("signs out from the warning dialog", () => {
    const app = mockApp();
    vi.useFakeTimers();
    render(<SessionWatcher />);

    act(() => {
      vi.advanceTimersByTime(305_000);
    });
    fireEvent.click(screen.getByRole("button", { name: t("auth.logout") }));

    expect(app.logout).toHaveBeenCalled();
    expect(sessionStorage.getItem("edas_session_expired")).toBe("1");
  });

  it("expires the session when the countdown reaches zero", () => {
    const app = mockApp();
    vi.useFakeTimers();
    render(<SessionWatcher />);

    act(() => {
      vi.advanceTimersByTime(305_000);
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(app.logout).toHaveBeenCalled();
    expect(sessionStorage.getItem("edas_session_expired")).toBe("1");
  });
});

describe("keyboard shortcuts", () => {
  it("opens the help dialog with ? and closes it with Escape", () => {
    mockApp();
    renderShortcuts();

    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "اختصارات لوحة المفاتيح" });
    expect(within(dialog).getByText("لوحة المعلومات")).toBeInTheDocument();
    expect(within(dialog).getByText("التبديل للنمط الداكن")).toBeInTheDocument();
    expect(within(dialog).getByText("التبديل للإنجليزية")).toBeInTheDocument();
    expect(within(dialog).getByText("عرض هذه القائمة")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens help with shift+h and closes it from the footer", () => {
    mockApp();
    renderShortcuts();

    fireEvent.keyDown(window, { key: "h", shiftKey: true });
    const dialog = screen.getByRole("dialog", { name: "اختصارات لوحة المفاتيح" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.close") }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles the theme and language but ignores typing and modifiers", () => {
    const app = mockApp();
    render(
      <MemoryRouter>
        <input aria-label="ملاحظة" />
        <KeyboardShortcuts />
      </MemoryRouter>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "ملاحظة" }), { key: "t" });
    expect(app.toggleTheme).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "t", ctrlKey: true });
    expect(app.toggleTheme).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "t" });
    expect(app.toggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "/" });
    expect(app.setLang).toHaveBeenCalledWith("en");
  });

  it("navigates with chords and resets unknown ones", () => {
    mockApp();
    renderShortcuts();

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    fireEvent.keyDown(window, { key: "G" });
    fireEvent.keyDown(window, { key: "L" });
    expect(screen.getByTestId("location")).toHaveTextContent("/library");

    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "z" });
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");

    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");
  });

  it("drops a pending chord after the timeout", () => {
    mockApp();
    vi.useFakeTimers();
    renderShortcuts();

    fireEvent.keyDown(window, { key: "g" });
    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("renders English labels", () => {
    mockApp({ lang: "en", theme: "dark" });
    renderShortcuts();

    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Navigation")).toBeInTheDocument();
    expect(within(dialog).getByText("Quick actions")).toBeInTheDocument();
    expect(within(dialog).getByText("Toggle light mode")).toBeInTheDocument();
    expect(within(dialog).getByText("Switch to Arabic")).toBeInTheDocument();
    expect(within(dialog).getByText("Show this help")).toBeInTheDocument();
  });
});
