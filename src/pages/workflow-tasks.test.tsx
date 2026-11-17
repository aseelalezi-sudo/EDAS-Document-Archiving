import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalInstanceDto } from "@edas/shared";
import { translations } from "../i18n";
import type { TaskItem } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { MyTasks } from "./workflow-tasks";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

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

function approval(overrides: Partial<ApprovalInstanceDto> = {}): ApprovalInstanceDto {
  return {
    id: "ap-1",
    documentId: "doc-9",
    document: { id: "doc-9", docNo: "EDAS-2026009", title: "قرار إداري", departmentId: "legal", status: "IN_REVIEW" },
    chainId: "chain-1",
    chainName: "سلسلة الاعتماد",
    status: "PENDING",
    startedById: "user-1",
    startedAt: "2026-01-05T10:00:00.000Z",
    completedAt: null,
    steps: [{ order: 1, name: "اعتماد", role: "DEPT_MANAGER", decided: false }],
    currentStep: { order: 1, role: "DEPT_MANAGER" },
    decisions: [],
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    tasks: [] as TaskItem[],
    removeTask: vi.fn().mockResolvedValue(true),
    rejectTask: vi.fn().mockResolvedValue(true),
    reassignTask: vi.fn().mockResolvedValue(true),
    requestChanges: vi.fn().mockResolvedValue(true),
    users: { items: [] },
    pendingApprovals: [] as ApprovalInstanceDto[],
    approvalsReady: true,
    decideApproval: vi.fn().mockResolvedValue(true),
    refetchApprovals: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = lang === "en" ? EN : AR;
  const app = { t: (key: string) => dict[key] ?? key, lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/workflow/my-tasks"]}>
      <Routes>
        <Route path="/workflow/my-tasks" element={<MyTasks />} />
        <Route path="/documents/:id" element={<div data-testid="document-route" />} />
        <Route path="/documents/:id/preview" element={<div data-testid="preview-route" />} />
        <Route path="/workflow/:id" element={<div data-testid="process-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("my tasks page", () => {
  it("refreshes approvals on mount and renders the assigned tasks", () => {
    const store = mockStore({ tasks: [task(), task({ id: "task-2", docTitle: "محضر اجتماع", status: "completed" })] });
    mockApp();

    renderPage();

    expect(store.refetchApprovals).toHaveBeenCalled();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("مراجعة قانونية")).toBeInTheDocument();
    expect(screen.queryByText("محضر اجتماع")).not.toBeInTheDocument();
  });

  it("filters the task list by tab and explains an empty view", () => {
    mockStore({
      tasks: [
        task(),
        task({ id: "task-2", docTitle: "محضر اجتماع", status: "completed" }),
        task({ id: "task-3", docTitle: "تقرير سنوي", status: "sent" }),
      ],
    });
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /المكتملة/ }));
    expect(screen.getByText("محضر اجتماع")).toBeInTheDocument();
    expect(screen.queryByText("عقد التوريد")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /المعاد تعيينها/ }));
    expect(screen.getByText("لا توجد مهام في هذا العرض")).toBeInTheDocument();
  });

  it("approves a pending approval instance from the card", async () => {
    const store = mockStore({ pendingApprovals: [approval()] });
    const app = mockApp();

    renderPage();

    expect(screen.getByText("قرار إداري")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "موافقة" }));

    await waitFor(() => expect(store.decideApproval).toHaveBeenCalledWith("ap-1", "APPROVED"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الموافقة", message: "قرار إداري" })));
  });

  it("requires a written reason before rejecting a pending approval", async () => {
    const store = mockStore({ pendingApprovals: [approval()] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    const dialog = screen.getByRole("dialog", { name: "رفض" });
    const confirm = within(dialog).getByRole("button", { name: "رفض" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("اشرح سبب الرفض بوضوح"), { target: { value: "بيانات ناقصة" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(store.decideApproval).toHaveBeenCalledWith("ap-1", "REJECTED", "بيانات ناقصة"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "رفض" })));
  });

  it("approves all assigned tasks and reports the real count", async () => {
    const store = mockStore({ tasks: [task(), task({ id: "task-2" })] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "موافقة على الكل" }));
    const dialog = screen.getByRole("dialog", { name: "الموافقة على جميع المهام المسندة؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "موافقة على الكل" }));

    await waitFor(() => expect(store.removeTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الموافقة على 2 من 2" })));
  });

  it("opens the review panel and approves the task from it", async () => {
    const store = mockStore({ tasks: [task()] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    const dialog = screen.getByRole("dialog", { name: "مراجعة واعتماد" });
    expect(within(dialog).getAllByText("EDAS-2026001").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "موافقة" }));

    await waitFor(() => expect(store.removeTask).toHaveBeenCalledWith("task-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الموافقة" })));
  });

  it("sends a change request with the written note", async () => {
    const store = mockStore({ tasks: [task()] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    const review = screen.getByRole("dialog", { name: "مراجعة واعتماد" });
    fireEvent.click(within(review).getByRole("button", { name: "طلب تعديلات" }));

    const dialog = screen.getByRole("dialog", { name: "طلب تعديلات" });
    fireEvent.change(within(dialog).getByPlaceholderText(/يرجى تحديث أرقام الميزانية/), { target: { value: "حدّث الميزانية" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إرسال الطلب" }));

    await waitFor(() => expect(store.requestChanges).toHaveBeenCalledWith("task-1", "حدّث الميزانية"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "طلب تعديلات" })));
  });

  it("filters overdue and reassigned tasks and badges the reassignment", () => {
    mockStore({
      tasks: [
        task(),
        task({ id: "task-2", docTitle: "تقرير متأخر", slaStatus: "breached" }),
        task({ id: "task-3", docTitle: "محضر معاد", status: "reassigned", slaStatus: "ontrack" }),
      ],
    });
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /المتأخرة/ }));
    expect(screen.getByText("تقرير متأخر")).toBeInTheDocument();
    expect(screen.queryByText("عقد التوريد")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /المعاد تعيينها/ }));
    expect(screen.getByText("محضر معاد")).toBeInTheDocument();
    expect(screen.getByText("معاد تعيينها")).toBeInTheDocument();
  });

  it("reassigns a task to an active user only", async () => {
    const store = mockStore({
      tasks: [task()],
      users: {
        items: [
          { id: "u1", name: "سارة القحطاني", status: "active", role: "dept_manager" },
          { id: "u2", name: "معطل", status: "inactive", role: "employee" },
        ],
      },
    });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: t("doc.reassign") }));
    const dialog = screen.getByRole("dialog", { name: t("doc.reassign") });
    expect(within(dialog).getByText("سارة القحطاني")).toBeInTheDocument();
    expect(within(dialog).queryByText("معطل")).toBeNull();

    const confirm = within(dialog).getByRole("button", { name: t("doc.reassign") });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /سارة القحطاني/ }));
    fireEvent.click(confirm);

    await waitFor(() => expect(store.reassignTask).toHaveBeenCalledWith("task-1", "سارة القحطاني"));
    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({
        type: "info",
        title: t("doc.reassign"),
        message: "عقد التوريد → سارة القحطاني",
      }),
    );
    expect(screen.queryByRole("dialog", { name: t("doc.reassign") })).toBeNull();
  });

  it("explains when there is no active assignee", () => {
    mockStore({ tasks: [task()], users: { items: [{ id: "u2", name: "معطل", status: "inactive", role: "employee" }] } });
    mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: t("doc.reassign") }));
    expect(screen.getByText("لا يوجد مستخدمون نشطون للإسناد.")).toBeInTheDocument();
  });

  it("rejects a task from the quick action after a written reason", async () => {
    const store = mockStore({ tasks: [task()] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("doc.reject") }));
    const dialog = screen.getByRole("dialog", { name: t("doc.reject") });
    const confirm = within(dialog).getByRole("button", { name: t("doc.reject") });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText(t("wf.rejectPlaceholder")), { target: { value: "بيانات ناقصة" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(store.rejectTask).toHaveBeenCalledWith("task-1", "بيانات ناقصة"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "info", title: t("doc.reject"), message: "عقد التوريد" }));
  });

  it("navigates from the review panel to the document and the process", () => {
    mockStore({ tasks: [task()] });
    mockApp();

    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "مراجعة واعتماد" })).getByRole("button", { name: "فتح الوثيقة" }));
    expect(screen.getByTestId("preview-route")).toBeInTheDocument();

    view.unmount();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "مراجعة واعتماد" })).getByRole("button", { name: "تفاصيل العملية" }));
    expect(screen.getByTestId("process-route")).toBeInTheDocument();
  });

  it("disables opening a task that has no linked document", () => {
    mockStore({ tasks: [task({ docId: undefined })] });
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "عقد التوريد" }));
    const dialog = screen.getByRole("dialog", { name: "مراجعة واعتماد" });
    expect(within(dialog).getByRole("button", { name: "فتح الوثيقة" })).toBeDisabled();
  });

  it("reports partial failures when approving all tasks", async () => {
    let calls = 0;
    mockStore({
      tasks: [task(), task({ id: "task-2", docTitle: "محضر اجتماع" })],
      removeTask: vi.fn().mockImplementation(() => Promise.resolve(calls++ === 0)),
    });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "موافقة على الكل" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "الموافقة على جميع المهام المسندة؟" })).getByRole("button", { name: "موافقة على الكل" }),
    );

    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "تمت الموافقة على 1 من 2" })),
    );
  });

  it("shows the approvals loading and empty states", () => {
    mockStore({ approvalsReady: false });
    mockApp();
    const view = renderPage();
    expect(screen.getByText("جاري التحميل…")).toBeInTheDocument();

    view.unmount();
    mockStore({ approvalsReady: true, pendingApprovals: [] });
    renderPage();
    expect(screen.getByText("لا توجد طلبات اعتماد بانتظار دورك حالياً.")).toBeInTheDocument();
  });

  it("renders the English task labels", () => {
    mockStore({ tasks: [task()] });
    mockApp("en");

    renderPage();

    expect(screen.getByRole("heading", { name: "My Tasks & Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Assigned/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approval Chains" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });
});
