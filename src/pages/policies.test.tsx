import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { LegalHolds, Policies, RetentionQueue } from "./policies";

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

describe("policies pages", () => {
  it("renders the policies list", () => {
    render(<Policies />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.policies"]).length).toBeGreaterThan(0);
  });

  it("renders the retention queue", () => {
    render(<RetentionQueue />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.retentionQueue"]).length).toBeGreaterThan(0);
  });

  it("renders legal holds", () => {
    render(<LegalHolds />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.legalHolds"]).length).toBeGreaterThan(0);
  });

  it("moves a disposed item to the disposal log and opens its certificate", async () => {
    const user = userEvent.setup();
    render(<RetentionQueue />, { wrapper });

    await user.click((await screen.findAllByRole("button", { name: translations.ar["g.rowOptions"] }))[0]);
    await user.click(await screen.findByRole("menuitem", { name: "إتلاف" }));
    await user.click(await screen.findByRole("button", { name: "إتلاف نهائي" }));

    expect(await screen.findByText(/وضع العرض/)).toBeInTheDocument();
    expect(screen.getByText("شهادة إتلاف وثيقة")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: translations.ar["g.close"] }));

    expect(await screen.findByText(/سجل الإتلافات المنفّذة/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "شهادة الإتلاف" }));
    expect(await screen.findByText("شهادة إتلاف وثيقة")).toBeInTheDocument();
  });
});
