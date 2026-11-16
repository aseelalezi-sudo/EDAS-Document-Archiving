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

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/workflow/my-tasks"]}>
      <Routes>
        <Route path="/workflow/my-tasks" element={<MyTasks />} />
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
});
