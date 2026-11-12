import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { Layout } from "./Layout";

function renderLayout(children: ReactNode = <p>محتوى الصفحة</p>) {
  return render(
    <MemoryRouter>
      <AppProvider>
        <DocsProvider>
          <Layout>{children}</Layout>
        </DocsProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("Layout", () => {
  it("frames the page with the sidebar, the topbar and the print header", () => {
    renderLayout();

    expect(screen.getByText("محتوى الصفحة")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByText(/EDAS — /)).toBeInTheDocument();
  });

  it("opens the mobile drawer from the topbar menu button", () => {
    const { container } = renderLayout();
    const backdrop = () => container.querySelector('[aria-hidden="true"].fixed.inset-0');

    expect(backdrop()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    const open = backdrop();
    expect(open).toBeInTheDocument();

    fireEvent.click(open as Element);
    expect(backdrop()).toBeNull();
  });

  it("closes the mobile drawer when the route changes", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    expect(container.querySelector('[aria-hidden="true"].fixed.inset-0')).toBeInTheDocument();

    fireEvent.click(container.querySelector('a[href="/documents"]') as Element);

    expect(container.querySelector('[aria-hidden="true"].fixed.inset-0')).toBeNull();
  });
});
