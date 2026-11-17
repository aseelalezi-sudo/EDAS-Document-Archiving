import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, TaskItem } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  api: vi.fn(),
  config: { useApi: false },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({
  domainApi: {
    taskComments: (...args: unknown[]) => mocks.api("taskComments", ...args),
    addTaskComment: (...args: unknown[]) => mocks.api("addTaskComment", ...args),
  },
}));

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

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = { t: (key: string) => dict[key] ?? key, lang, toast: vi.fn(), user: { name: "أمل السبيعي" } };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/workflow/task-1"]}>
      <Routes>
        <Route path="/workflow/:id" element={<WorkflowDetails />} />
        <Route path="/workflow/my-tasks" element={<div data-testid="tasks-route" />} />
        <Route path="/workflow/chains" element={<div data-testid="chains-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.api.mockReset();
  mocks.config.useApi = false;
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

  it("closes the reject dialog from its cancel button and from Escape", () => {
    mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "رفض" })).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog", { name: "رفض" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "رفض" })).toBeNull();
  });

  it("explains when the task is no longer available", () => {
    mockStore({ tasks: [] });
    mockApp();

    renderPage();

    expect(screen.getByText("المهمة غير موجودة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى مهامي" }));
    expect(screen.getByTestId("tasks-route")).toBeInTheDocument();
  });
});

describe("workflow details badges and navigation", () => {
  it("keeps the task open when approval or rejection fails", async () => {
    const store = mockStore({ removeTask: vi.fn().mockResolvedValue(false), rejectTask: vi.fn().mockResolvedValue(false) });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "موافقة" }));
    await waitFor(() => expect(store.removeTask).toHaveBeenCalledTimes(1));
    expect(app.toast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    fireEvent.change(screen.getByPlaceholderText("اذكر سبب رفض المهمة"), { target: { value: "ناقص" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "رفض" })).getByRole("button", { name: "رفض" }));

    await waitFor(() => expect(store.rejectTask).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "رفض" })).toBeInTheDocument();
    expect(app.toast).not.toHaveBeenCalled();
  });

  it("labels the breached and on-track SLA rows and the low and medium priorities", () => {
    mockStore({ tasks: [task({ slaStatus: "breached", priority: "low", age: "9 أيام" })] });
    mockApp();
    const view = renderPage();

    expect(screen.getByText(/SLA: مخالفة \(9 أيام\)/)).toBeInTheDocument();
    expect(screen.getByText("منخفضة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: t("wf.slaEvents") }));
    expect(screen.getAllByText("مخالفة").length).toBeGreaterThan(0);

    view.unmount();
    mockStore({ tasks: [task({ slaStatus: "ontrack", priority: "medium" })] });
    renderPage();

    expect(screen.getByText(/SLA: ضمن الوقت/)).toBeInTheDocument();
    expect(screen.getByText("متوسطة")).toBeInTheDocument();
  });

  it("navigates back to the task list and to the approval chains", () => {
    mockStore();
    mockApp();

    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: t("g.back") }));
    expect(screen.getByTestId("tasks-route")).toBeInTheDocument();
    view.unmount();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("wf.approvers") }));
    fireEvent.click(screen.getByRole("button", { name: t("nav.approvalChains") }));
    expect(screen.getByTestId("chains-route")).toBeInTheDocument();
  });

  it("shows the failed audit result with its warning badge", () => {
    mockStore({ auditLog: [auditEntry({ id: "audit-9", action: "رفض المهمة", result: "failure" })] });
    mockApp();

    renderPage();
    expect(screen.getAllByText("رفض المهمة").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: t("wf.auditLog") }));
    expect(screen.getByText(t("wf.slaWarn"))).toBeInTheDocument();
    expect(screen.getByText("مدير النظام · 2026-01-05 10:00")).toBeInTheDocument();
  });
});

describe("workflow comments", () => {
  const commentDto = (overrides: Record<string, unknown> = {}) => ({
    id: "c1",
    authorName: "سارة القحطاني",
    body: "ملاحظة على البند 2",
    createdAt: "2026-01-05T10:00:00.000Z",
    ...overrides,
  });

  function api(overrides: Record<string, unknown> = {}) {
    const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
      taskComments: () => Promise.resolve({ items: [] }),
      addTaskComment: () => Promise.resolve(commentDto({ id: "c2", body: "تعليق جديد" })),
      ...overrides,
    };
    mocks.api.mockImplementation((method: string, ...args: unknown[]) => handlers[method]?.(...args));
  }

  it("explains the browser-only empty state in demo mode", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: t("doc.workflow") }));
    expect(screen.getByText(/في وضع العرض تُحفظ التعليقات في هذا المتصفح فقط/)).toBeInTheDocument();
  });

  it("loads the comments from the API and adds a new one", async () => {
    mocks.config.useApi = true;
    api({ taskComments: () => Promise.resolve({ items: [commentDto()] }) });
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("doc.workflow") }));
    expect(screen.getByText(t("g.loading"))).toBeInTheDocument();

    expect(await screen.findByText("ملاحظة على البند 2")).toBeInTheDocument();
    expect(screen.getByText("سارة القحطاني · 2026-01-05 10:00")).toBeInTheDocument();
    expect(screen.queryByText(/لا توجد تعليقات بعد/)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("أضف تعليقاً…"), { target: { value: "تعليق جديد" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("addTaskComment", "task-1", "تعليق جديد"));
    expect(await screen.findByText("تعليق جديد")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("أضف تعليقاً…")).toHaveValue("");
    expect(store.logAction).toHaveBeenCalledWith("إضافة تعليق: «تعليق جديد»", "مهمة", "task-1", "سير العمل");
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم إرسال التعليق" });
  });

  it("falls back to the empty state when the API has no comments or fails", async () => {
    mocks.config.useApi = true;
    api();
    mockStore();
    mockApp();

    const view = renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("doc.workflow") }));
    expect(await screen.findByText(/تُحفظ التعليقات مع المهمة وتُسجَّل في سجل التدقيق/)).toBeInTheDocument();
    view.unmount();

    api({ taskComments: () => Promise.reject(new Error("offline")) });
    const store = mockStore();
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("doc.workflow") }));
    expect(await screen.findByText(/تُحفظ التعليقات مع المهمة وتُسجَّل في سجل التدقيق/)).toBeInTheDocument();
    expect(store.logAction).not.toHaveBeenCalled();
  });

  it("keeps the written comment when the API refuses it", async () => {
    mocks.config.useApi = true;
    api({ addTaskComment: () => Promise.reject(new Error("conflict")) });
    mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: t("doc.workflow") }));
    await screen.findByText(/لا توجد تعليقات بعد/);

    fireEvent.change(screen.getByPlaceholderText("أضف تعليقاً…"), { target: { value: "تعليق محفوظ" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByPlaceholderText("أضف تعليقاً…")).toHaveValue("تعليق محفوظ");
    expect(screen.queryByText("تعليق محفوظ", { selector: "p" })).toBeNull();
  });
});

describe("workflow details in English", () => {
  it("renders the tabs, summaries and comment tools in English", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Approvers" })).toBeInTheDocument();
    expect(screen.getByText("Process summary")).toBeInTheDocument();
    expect(screen.getByText("No approval decisions have been recorded for this task yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Approvers" }));
    expect(screen.getByText("Further steps are defined by the approval chain assigned to this workflow.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Workflow" }));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
    expect(screen.getByText(/In demo mode comments stay in this browser/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByPlaceholderText("Explain why this task is rejected")).toBeInTheDocument();
  });
});
