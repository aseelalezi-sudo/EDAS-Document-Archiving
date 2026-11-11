import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { NotFound } from "./not-found";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>{children}</DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

describe("not-found page", () => {
  it("renders the 404 message", () => {
    render(<NotFound />, { wrapper });
    expect(screen.getByText(translations.ar["nf.title"])).toBeInTheDocument();
  });

  it("offers a link back to the dashboard", () => {
    render(<NotFound />, { wrapper });
    expect(screen.getByRole("button", { name: translations.ar["nf.home"] })).toBeInTheDocument();
  });
});
