import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({ restore: vi.fn() }));

vi.mock("../lib/session", () => ({ restoreSession: mocks.restore }));

import { AuthCallback } from "./auth-callback";

function renderCallback(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter>
      <AppProvider>
        <AuthCallback />
      </AppProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.restore.mockReset();
  window.location.hash = "";
  window.history.replaceState(null, "", "/");
});

describe("auth callback", () => {
  it("checks the session and keeps the loader while it navigates a signed-in user on", async () => {
    mocks.restore.mockResolvedValue({ role: "EMPLOYEE" });

    renderCallback("#/auth/callback");

    await waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
    expect(screen.queryByText(translations.ar["auth.callback.failed"])).toBeNull();
    expect(screen.getByText(translations.ar["auth.callback.loading"])).toBeInTheDocument();
  });

  it("shows the loading state while the session check runs", () => {
    mocks.restore.mockReturnValue(new Promise(() => undefined));

    renderCallback("#/auth/callback");

    expect(screen.getByText(translations.ar["auth.callback.loading"])).toBeInTheDocument();
  });

  it("offers a way back to the login page when no session survived", async () => {
    mocks.restore.mockResolvedValue(null);

    renderCallback("#/auth/callback");

    expect(await screen.findByText(translations.ar["auth.callback.failed"])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: translations.ar["auth.back"] })).toHaveAttribute("href", "/login");
  });

  it("shows the identity-provider reason when the callback carried an error", async () => {
    renderCallback("#/auth/callback?error=access_denied&error_description=User%20cancelled");

    expect(await screen.findByText(translations.ar["auth.callback.failed"])).toBeInTheDocument();
    expect(screen.getByText(/User cancelled/)).toBeInTheDocument();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("falls back to the bare error code when no description is present", async () => {
    renderCallback("#/auth/callback?error=invalid_request");

    expect(await screen.findByText(/invalid_request/)).toBeInTheDocument();
  });

  it("reads the parameters from the query string when the hash has none", async () => {
    window.history.replaceState(null, "", "/auth/callback?error=state_mismatch");
    render(
      <MemoryRouter>
        <AppProvider>
          <AuthCallback />
        </AppProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/state_mismatch/)).toBeInTheDocument();
  });

  it("runs the session check once even when the framework mounts the effect twice", () => {
    window.location.hash = "#/auth/callback";
    mocks.restore.mockReturnValue(new Promise(() => undefined));

    render(
      <StrictMode>
        <MemoryRouter>
          <AppProvider>
            <AuthCallback />
          </AppProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(mocks.restore).toHaveBeenCalledOnce();
  });
});
