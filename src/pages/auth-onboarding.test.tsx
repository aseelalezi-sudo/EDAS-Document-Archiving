import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { ToastHost } from "../components/system";
import { DEMO_USERS } from "../data";
import { translations } from "../i18n";
import { Onboarding } from "./auth-onboarding";

const USER = DEMO_USERS[1].user;
const AR = translations.ar;
const EN = translations.en;

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

function next(label = AR["g.next"]) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("edas.v1.user", JSON.stringify(USER));
  localStorage.setItem("edas.v1.role", JSON.stringify("dept_manager"));
});

describe("onboarding wizard", () => {
  it("walks the five steps and finishes on the dashboard", () => {
    render(<Onboarding />, { wrapper });

    expect(screen.getByText(AR["auth.onboarding.welcomeSub"])).toBeInTheDocument();
    expect(screen.getByText(USER.name)).toBeInTheDocument();

    next();
    expect(screen.getByDisplayValue(USER.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(USER.username)).toBeInTheDocument();
    expect(screen.getByDisplayValue(USER.email)).toBeInTheDocument();

    next();
    expect(screen.getByRole("button", { name: AR["auth.onboarding.langAr"] })).toHaveAttribute("aria-pressed", "true");

    next();
    expect(screen.getByRole("button", { name: AR["auth.onboarding.themeLight"] })).toHaveAttribute("aria-pressed", "true");

    next();
    expect(screen.getByText(AR["auth.onboarding.doneSub"])).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: AR["auth.onboarding.finish"] }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(JSON.parse(localStorage.getItem("edas.v1.onboardingSeen") as string)).toContain(USER.id);
  });

  it("changes the language and the theme from the wizard", () => {
    render(<Onboarding />, { wrapper });
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: EN["auth.onboarding.langEn"] }));
    expect(JSON.parse(localStorage.getItem("edas.v1.lang") as string)).toBe("en");

    next(EN["g.next"]);
    fireEvent.click(screen.getByRole("button", { name: EN["auth.onboarding.themeDark"] }));

    expect(JSON.parse(localStorage.getItem("edas.v1.theme") as string)).toBe("dark");
    expect(screen.getByRole("button", { name: EN["auth.onboarding.themeDark"] })).toHaveAttribute("aria-pressed", "true");
  });

  it("goes back one step from a later screen", () => {
    render(<Onboarding />, { wrapper });
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: AR["g.previous"] }));

    expect(screen.getByDisplayValue(USER.username)).toBeInTheDocument();
  });

  it("skips from the first screen without confirmation", () => {
    render(<Onboarding />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: AR["auth.onboarding.skip"] }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(screen.queryByText(AR["auth.onboarding.doneSub"])).toBeNull();
    expect(JSON.parse(localStorage.getItem("edas.v1.onboardingSeen") as string)).toContain(USER.id);
  });

  it("shows the English profile fields in English mode", () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<Onboarding />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: EN["g.next"] }));

    expect(screen.getByDisplayValue(USER.nameEn)).toBeInTheDocument();
    expect(screen.getByDisplayValue(USER.jobTitleEn)).toBeInTheDocument();
  });

  it("finishes for a visitor who has no profile to mark", () => {
    localStorage.removeItem("edas.v1.user");
    render(<Onboarding />, { wrapper });
    next();
    next();
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: AR["auth.onboarding.finish"] }));

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(localStorage.getItem("edas.v1.onboardingSeen")).toBeNull();
  });

  it("works for a visitor who has no profile yet", () => {
    localStorage.removeItem("edas.v1.user");
    render(<Onboarding />, { wrapper });

    expect(screen.getByText(AR["auth.onboarding.welcomeSub"])).toBeInTheDocument();
    next();
    expect(screen.getAllByDisplayValue("").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: AR["g.previous"] }));
    fireEvent.click(screen.getByRole("button", { name: AR["auth.onboarding.skip"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(localStorage.getItem("edas.v1.onboardingSeen")).toBeNull();
  });
});
