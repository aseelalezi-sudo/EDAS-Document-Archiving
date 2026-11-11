import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../store";
import { DEMO_USERS } from "../data";
import { Login } from "./auth";

function Harness() {
  const { user } = useApp();
  const { pathname } = useLocation();
  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
        <Route path="/reports/audit-trail" element={<div>audit-trail</div>} />
      </Routes>
      <span data-testid="role">{user?.role ?? "none"}</span>
      <span data-testid="where">{pathname}</span>
    </>
  );
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppProvider>
        <Harness />
      </AppProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login flow", () => {
  it("signs in as system_admin and navigates to the dashboard", () => {
    renderLogin();

    fireEvent.click(screen.getByText(DEMO_USERS[3].user.name));
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByTestId("role").textContent).toBe("system_admin");
    expect(screen.getByTestId("where").textContent).toBe("/dashboard");
  });

  it("routes the auditor to the audit trail instead of the dashboard", () => {
    renderLogin();

    fireEvent.click(screen.getByText(DEMO_USERS[4].user.name));
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByTestId("role").textContent).toBe("auditor");
    expect(screen.getByTestId("where").textContent).toBe("/reports/audit-trail");
  });

  it("shows a validation error when submitting empty credentials", () => {
    renderLogin();

    const submit = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).type === "submit")!;
    fireEvent.click(submit);
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByTestId("role").textContent).toBe("none");
  });
});
