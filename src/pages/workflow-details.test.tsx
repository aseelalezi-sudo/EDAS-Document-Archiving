import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, TaskItem } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { WorkflowDetails } from "./workflow-details";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-1",
    docId: "doc-1",
    docTitle: "عقد التوريد",
    docNo: "EDAS-2026001",
    workflow: "اعتماد العقود",
    step: "مراجعة قانونية",
    from: "أمل السبيعي",
    deptId: "legal",
    priority: "high",
    due: "2026-02-01",
    slaStatus: "warning",
    age: "3 أيام",
    status: "assigned",
    ...overrides,
  };
}

function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "audit-1",
    datetime: "2026-01-05 10:00",
    user: "مدير النظام",
    module: "workflow",
    action: "موافقة على المهمة",
    entityType: "task",
    entityId: "task-1",
    deptId: "legal",
    ip: "127.0.0.1",
    result: "success",
    correlation: "corr-1",
    detail: "",
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    tasks: [task()],
    removeTask: vi.fn().mockResolvedValue(true),
    rejectTask: vi.fn().mockResolvedValue(true),
    logAction: vi.fn(),
    auditLog: [] as AuditEntry[],
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn(), user: { name: "أمل السبيعي" } };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/workflow/task-1"]}>
      <Routes>
        <Route path="/workflow/:id" element={<WorkflowDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("workflow process details", () => {
  it("renders the process summary, the fallback timeline and the approvers", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByRole("heading", { name: "اعتماد العقود" })).toBeInTheDocument();
    expect(screen.getByText("عقد التوريد · EDAS-2026001")).toBeInTheDocument();
    expect(screen.getByText(t("wf.sentForApproval"))).toBeInTheDocument();
    expect(screen.getByText("لم تُسجَّل قرارات اعتماد على هذه المهمة بعد.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "المعتمدون" }));
    expect(screen.getAllByText("أمل السبيعي").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مراجعة قانونية").length).toBeGreaterThan(0);
  });

  it("shows the SLA row and the empty audit state", () => {
    mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: t("wf.slaEvents") }));
    expect(screen.getAllByText("3 أيام").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-02-01").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: t("wf.auditLog") }));
    expect(screen.getByText("لا توجد أحداث تدقيق لهذه المهمة")).toBeInTheDocument();
  });

  it("lists the audit events and the approval decisions when the server recorded them", () => {
    mockStore({ auditLog: [auditEntry(), auditEntry({ id: "audit-2", action: "عرض", entityId: "other" })] });
    mockApp();

    renderPage();

    expect(screen.getAllByText("موافقة على المهمة").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: t("wf.auditLog") }));
    expect(screen.getAllByText("موافقة على المهمة")).toHaveLength(2);
    expect(screen.queryByText("عرض")).not.toBeInTheDocument();
  });

  it("adds a demo comment with an explicit browser-only warning", () => {
    mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /سير العمل/ }));
    fireEvent.change(screen.getByPlaceholderText("أضف تعليقاً…"), { target: { value: "يرجى مراجعة البند 3" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));

    expect(screen.getByText("يرجى مراجعة البند 3")).toBeInTheDocument();
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت إضافة التعليق" }));
  });

  it("approves the task from the header", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "موافقة" }));

    await waitFor(() => expect(store.removeTask).toHaveBeenCalledWith("task-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الموافقة" })));
  });

  it("requires a reason before rejecting and sends it", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    const dialog = screen.getByRole("dialog", { name: "رفض" });
    const confirm = within(dialog).getByRole("button", { name: "رفض" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("اذكر سبب رفض المهمة"), { target: { value: "ناقص" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(store.rejectTask).toHaveBeenCalledWith("task-1", "ناقص"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "رفض" })));
  });

  it("explains when the task is no longer available", () => {
    mockStore({ tasks: [] });
    mockApp();

    renderPage();

    expect(screen.getByText("المهمة غير موجودة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "العودة إلى مهامي" })).toBeInTheDocument();
  });
});
