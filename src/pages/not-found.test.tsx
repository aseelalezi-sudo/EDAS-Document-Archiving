import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { NotFound } from "./not-found";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function wrapperAt(path = "/missing", entries?: string[], index?: number) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={entries ?? [path]} initialIndex={index}>
      <AppProvider>
        <DocsProvider>
          <Routes>
            <Route path={path} element={children} />
            <Route path="/dashboard" element={<LocationProbe />} />
            <Route path="/previous" element={<LocationProbe />} />
          </Routes>
        </DocsProvider>
      </AppProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("not-found page", () => {
  it("renders the 404 message and its explanation", () => {
    render(<NotFound />, { wrapper: wrapperAt() });

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(translations.ar["nf.title"])).toBeInTheDocument();
    expect(screen.getByText(translations.ar["nf.sub"])).toBeInTheDocument();
  });

  it("returns to the dashboard", () => {
    render(<NotFound />, { wrapper: wrapperAt() });

    fireEvent.click(screen.getByRole("button", { name: translations.ar["nf.home"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("goes back to the previous screen", () => {
    render(<NotFound />, { wrapper: wrapperAt("/missing", ["/previous", "/missing"], 1) });

    fireEvent.click(screen.getByRole("button", { name: translations.ar["nf.back"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/previous");
  });

  it("renders the English copy", () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<NotFound />, { wrapper: wrapperAt() });

    expect(screen.getByText(translations.en["nf.title"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: translations.en["nf.home"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: translations.en["nf.back"] })).toBeInTheDocument();
  });
});
