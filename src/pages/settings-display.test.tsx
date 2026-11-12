import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { ToastHost } from "../components/system";
import { translations } from "../i18n";
import { Display } from "./settings-display";

function Probe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
      <Probe />
      <ToastHost />
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

describe("display settings", () => {
  it("marks the current language, theme and density as active", () => {
    render(<Display />, { wrapper });

    expect(screen.getByRole("button", { name: /العربية/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /English/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /فاتح/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /مريحة/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a preference that is clicked while already active", () => {
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /العربية/ }));
    fireEvent.click(screen.getByRole("button", { name: /فاتح/ }));
    fireEvent.click(screen.getByRole("button", { name: /مريحة/ }));

    expect(screen.getByRole("button", { name: /العربية/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /فاتح/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /مريحة/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the interface to English and LTR", async () => {
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /English/ }));

    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    expect(document.documentElement.lang).toBe("en");
    expect(JSON.parse(localStorage.getItem("edas.v1.lang") as string)).toBe("en");
  });

  it("applies the dark theme and the compact density", async () => {
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /داكن/ }));
    fireEvent.click(screen.getByRole("button", { name: /مضغوطة/ }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(JSON.parse(localStorage.getItem("edas.v1.density") as string)).toBe("compact");
    expect(screen.getByRole("button", { name: /داكن/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("resets every preference and confirms it", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    localStorage.setItem("edas.v1.theme", JSON.stringify("dark"));
    localStorage.setItem("edas.v1.density", JSON.stringify("compact"));
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/ }));

    expect(await screen.findByText("Preferences reset")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: /العربية/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /مريحة/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("links to the system settings that own the row limit and date format", () => {
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: translations.ar["nav.system"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/system");
  });

  it("offers an English LTR preview that lands on the dashboard", async () => {
    render(<Display />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /عرض شاشة إنجليزية LTR/ }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
  });
});
