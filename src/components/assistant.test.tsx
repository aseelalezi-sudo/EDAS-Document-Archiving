import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../store";
import { DocsProvider, useDocsStore } from "../store-docs";
import { downloadCsv } from "./shared";
import { AIAssistant } from "./assistant";

vi.mock("./shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared")>();
  return { ...actual, downloadCsv: vi.fn() };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>{children}</DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

function Harness() {
  const { toasts } = useApp();
  const { scopedDocs } = useDocsStore();
  return (
    <>
      <AIAssistant />
      <div data-testid="toast-titles">{toasts.map((toast) => toast.title).join(" | ")}</div>
      <div data-testid="doc-count">{scopedDocs.length}</div>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("AI assistant", () => {
  it("opens from the floating button and shows the welcome state", async () => {
    const user = userEvent.setup();
    render(<AIAssistant />, { wrapper });

    await user.click(screen.getByRole("button", { name: "المساعد الذكي" }));

    expect(screen.getAllByText("المساعد الذكي").length).toBeGreaterThan(0);
    expect(screen.getByText("تحليل الاتجاهات")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("اسأل أو أمِر…")).toBeInTheDocument();
  });

  it("restores the batch it just moved to the trash when asked to undo", async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper });

    const total = Number(screen.getByTestId("doc-count").textContent);
    expect(total).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "المساعد الذكي" }));
    const input = screen.getByPlaceholderText("اسأل أو أمِر…");

    await user.type(input, "احذف كل{Enter}");
    const execute = await screen.findByRole("button", { name: "تنفيذ" }, { timeout: 4000 });
    await user.click(execute);
    await waitFor(() => expect(screen.getByTestId("toast-titles")).toHaveTextContent(`تم نقل ${total} إلى السلة`));
    expect(screen.getByTestId("doc-count")).toHaveTextContent("0");
    expect(screen.getByText("تم التنفيذ بنجاح")).toBeInTheDocument();

    await user.type(input, "تراجع{Enter}");
    await waitFor(() => expect(screen.getByText("تم استرجاع الوثائق من السلة.")).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByTestId("doc-count")).toHaveTextContent(String(total));
  }, 20000);

  it("downloads the current result set as a real CSV instead of dead format buttons", async () => {
    const user = userEvent.setup();
    const csv = vi.mocked(downloadCsv);
    csv.mockClear();
    render(<Harness />, { wrapper });

    const total = Number(screen.getByTestId("doc-count").textContent);
    await user.click(screen.getByRole("button", { name: "المساعد الذكي" }));
    const input = screen.getByPlaceholderText("اسأل أو أمِر…");

    await user.type(input, "صدّر{Enter}");
    await waitFor(() => expect(screen.getByText(new RegExp(`جاهز لتصدير ${total} وثيقة`))).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByRole("button", { name: /PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excel/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /تنزيل CSV/ }, { timeout: 8000 }));
    expect(csv).toHaveBeenCalledTimes(1);
    const [filename, rows] = csv.mock.calls[0];
    expect(filename).toBe("edas-documents");
    expect(rows).toHaveLength(total);
    expect(Object.keys(rows[0])).toContain("docNo");
    expect(screen.getByTestId("toast-titles")).toHaveTextContent("تم تنزيل CSV");
  }, 20000);
});
