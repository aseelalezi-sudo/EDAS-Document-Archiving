import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { users } from "../data";
import { Groups, Maintenance, NotificationTemplates, Permissions, Roles, Security, System, Users } from "./admin";

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

describe("admin pages", () => {
  it("renders the users directory with seeded accounts", () => {
    render(<Users />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.users"]).length).toBeGreaterThan(0);
    expect(screen.getAllByText(users[0].name).length).toBeGreaterThan(0);
  });

  it("renders the groups page", () => {
    render(<Groups />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.groups"]).length).toBeGreaterThan(0);
  });

  it("renders the roles page", () => {
    render(<Roles />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.roles"]).length).toBeGreaterThan(0);
  });

  it("renders the security settings page", () => {
    render(<Security />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.security"]).length).toBeGreaterThan(0);
  });

  it("renders the folder permissions page", () => {
    render(<Permissions />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.permissions"]).length).toBeGreaterThan(0);
  });

  it("renders the system settings page", () => {
    render(<System />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.system"]).length).toBeGreaterThan(0);
  });

  it("renders the maintenance page", () => {
    render(<Maintenance />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.maintenance"]).length).toBeGreaterThan(0);
  });

  it("renders the notification templates page", () => {
    render(<NotificationTemplates />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.notifications"]).length).toBeGreaterThan(0);
  });
});
