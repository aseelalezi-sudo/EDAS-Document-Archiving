import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { departments as seedDepartments } from "../data";
import { translations } from "../i18n";
import { Departments, Employees, Projects, Sections } from "./organization";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>{children}</DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

function signedInAs(role: "dept_manager" | "system_admin", department: string) {
  localStorage.setItem("edas.v1.role", JSON.stringify(role));
  localStorage.setItem(
    "edas.v1.user",
    JSON.stringify({
      id: "u-signin",
      name: "مدير",
      nameEn: "Manager",
      username: "manager",
      email: "manager@edas.gov",
      jobTitle: "",
      jobTitleEn: "",
      department,
      section: "",
      role,
      initials: "م",
      color: "bg-navy-600",
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("organization pages", () => {
  it("renders the departments page", () => {
    render(<Departments />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.departments"]).length).toBeGreaterThan(0);
  });

  it("renders the sections page", () => {
    render(<Sections />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.sections"]).length).toBeGreaterThan(0);
  });

  it("renders the employees directory", () => {
    render(<Employees />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.employees"]).length).toBeGreaterThan(0);
  });

  it("renders the projects page", () => {
    render(<Projects />, { wrapper });
    expect(screen.getAllByText(translations.ar["nav.projects"]).length).toBeGreaterThan(0);
  });

  it("hides department row actions outside the manager's own tree", () => {
    signedInAs("dept_manager", "exec");
    render(<Departments />, { wrapper });
    expect(screen.getAllByRole("button", { name: translations.ar["g.edit"] })).toHaveLength(1);
  });

  it("keeps every department row action for a system administrator", () => {
    signedInAs("system_admin", "exec");
    render(<Departments />, { wrapper });
    expect(screen.getAllByRole("button", { name: translations.ar["g.edit"] })).toHaveLength(
      seedDepartments.filter((d) => !d.parentId).length,
    );
  });
});
