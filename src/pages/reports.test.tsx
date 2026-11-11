import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { translations } from "../i18n";
import { AuditTrail, Errors, ReportBuilder, ReportsHome, ScheduledReports } from "./reports";

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

describe("reports pages", () => {
  it("renders the reports home catalog", () => {
    render(<ReportsHome />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.reportsHome"]).length).toBeGreaterThan(0);
  });

  it("renders the audit trail", () => {
    render(<AuditTrail />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.auditTrail"]).length).toBeGreaterThan(0);
  });

  it("renders scheduled reports", () => {
    render(<ScheduledReports />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.scheduled"]).length).toBeGreaterThan(0);
  });

  it("renders the report builder", () => {
    render(<ReportBuilder />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.reportBuilder"]).length).toBeGreaterThan(0);
  });

  it("renders the error log", () => {
    render(<Errors />, { wrapper });

    expect(screen.getAllByText(translations.ar["nav.errors"]).length).toBeGreaterThan(0);
  });

  it("keeps the column order the user chose in the report builder", () => {
    render(<ReportBuilder />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /الحقول$/ }));

    const panel = screen.getByText("ترتيب الأعمدة").parentElement as HTMLElement;
    expect(panel.textContent.indexOf("رقم الوثيقة")).toBeLessThan(panel.textContent.indexOf("العنوان"));

    fireEvent.click(screen.getAllByLabelText("نقل لأسفل")[0]);

    expect(panel.textContent.indexOf("العنوان")).toBeLessThan(panel.textContent.indexOf("رقم الوثيقة"));
  });

  it("does not offer a demo-mode export that produces no file", () => {
    render(<ReportsHome />, { wrapper });

    const exportButton = screen.getAllByLabelText(translations.ar["g.export"])[0];
    expect(exportButton).toBeDisabled();
    expect(exportButton.getAttribute("title")).toContain("وضع العرض لا يولّد ملفات");
  });
});
