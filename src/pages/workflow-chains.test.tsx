import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  config: { useApi: false },
  domain: {
    approvalChains: vi.fn(),
    createApprovalChain: vi.fn(),
    updateApprovalChain: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({ domainApi: mocks.domain }));

import { ApprovalChains } from "./workflow-chains";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ApprovalChains />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.config.useApi = false;
  mocks.domain.approvalChains.mockReset().mockResolvedValue({ items: [] });
  mocks.domain.createApprovalChain.mockReset().mockResolvedValue({});
  mocks.domain.updateApprovalChain.mockReset().mockResolvedValue({});
});

describe("approval chains page", () => {
  it("renders the seeded chains with their steps and status", () => {
    mockApp();

    renderPage();

    expect(screen.getByText("اعتماد العقود")).toBeInTheDocument();
    expect(screen.getByText("سارة المطيري")).toBeInTheDocument();
    expect(screen.getAllByText("نشط").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "تعديل" }).length).toBeGreaterThan(0);
  });

  it("creates a chain with the added steps and reports how many were saved", () => {
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "إنشاء" }));
    const dialog = screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" });
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "سلسلة الشراء" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة خطوة" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("سلسلة الشراء")).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", message: "2 خطوات" }));
  });

  it("duplicates a chain without touching the original", () => {
    const app = mockApp();

    renderPage();

    const duplicates = screen.getAllByRole("button", { name: "نسخ" });
    fireEvent.click(duplicates[0]);

    expect(screen.getByText("اعتماد العقود (نسخة)")).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "نسخ", message: "اعتماد العقود" }));
  });

  it("removes a step and reorders the rest with a save reminder", () => {
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "تعديل" })[0]);
    const dialog = screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "حذف" })[0]);

    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "حُذفت الخطوة — احفظ السلسلة لتثبيت التغيير" }));

    const rows = dialog.querySelectorAll("[draggable='true']");
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[1]);
    fireEvent.drop(rows[1]);
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تعديل الترتيب — احفظ السلسلة لتثبيت التغيير" }));
  });

  it("toggles a chain to inactive and saves it locally", () => {
    mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "تعديل" })[0]);
    const dialog = screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" });
    fireEvent.click(within(dialog).getByRole("switch"));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    expect(screen.getAllByText("متوقف").length).toBeGreaterThan(0);
  });

  it("saves through the API in API mode and warns about the local-only step fields", async () => {
    mocks.config.useApi = true;
    const app = mockApp();

    renderPage();

    await waitFor(() => expect(mocks.domain.approvalChains).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "إنشاء" }));
    const dialog = screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" });
    expect(within(dialog).getByText(/يحفظ الخادم لكل خطوة الدور والترتيب والاسم فقط/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "سلسلة خادمية" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(mocks.domain.createApprovalChain).toHaveBeenCalled());
    expect(mocks.domain.createApprovalChain.mock.calls[0][0]).toMatchObject({
      name: "سلسلة خادمية",
      steps: [expect.objectContaining({ order: 1, role: "DEPT_MANAGER" })],
    });
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces a server refusal in API mode without claiming success", async () => {
    mocks.config.useApi = true;
    mocks.domain.createApprovalChain.mockRejectedValue({ status: 409, message: "chain exists" });
    const app = mockApp();

    renderPage();
    await waitFor(() => expect(mocks.domain.approvalChains).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "إنشاء" }));
    const dialog = screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));

    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "تعذّر تنفيذ العملية على الخادم. حاول مرة أخرى." }),
      ),
    );
    expect(screen.getByRole("dialog", { name: "محرر سلسلة الموافقة" })).toBeInTheDocument();
  });
});
