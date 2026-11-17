import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../store";
import { DocsProvider } from "../store-docs";
import { ApiError } from "../lib/api-client";
import { auditEntries } from "../data";
import type { AuditChainBreakDto, AuditChainForkDto, AuditChainReportDto, AuditEventDto } from "@edas/shared";
import { AuditTrail } from "./reports-audit";

const auditEvents = vi.fn();
const verifyAuditChain = vi.fn();
const recordAuditChainBaseline = vi.fn();
const config = vi.hoisted(() => ({ apiBaseUrl: "http://localhost:4210/api/v1", oidc: {}, useApi: true }));

vi.mock("../config", () => ({ config }));
vi.mock("../lib/domain-api", () => {
  const stub = () => Promise.resolve({ items: [], meta: { total: 0 } });
  const api: Record<string, unknown> = {
    auditEvents: (params: unknown) => auditEvents(params),
    verifyAuditChain: () => verifyAuditChain(),
    recordAuditChainBaseline: () => recordAuditChainBaseline(),
  };
  return { domainApi: new Proxy(api, { get: (target, key: string) => target[key] ?? stub }) };
});

function event(overrides: Partial<AuditEventDto> = {}): AuditEventDto {
  return {
    id: "evt-1",
    ts: "2026-11-05T08:15:00.000Z",
    actorId: "user-1",
    actorName: "سارة القحطاني",
    action: "document.update",
    entityType: "Document",
    entityId: "doc-1",
    departmentId: "legal",
    ip: "10.0.0.7",
    result: "success",
    correlationId: "COR-1",
    detail: null,
    prevHash: null,
    hash: null,
    ...overrides,
  };
}

function report(overrides: Partial<AuditChainReportDto> = {}): AuditChainReportDto {
  return {
    events: 633,
    maxSeq: 633,
    sequenceGaps: 0,
    valid: true,
    breakCount: 0,
    breaks: [],
    truncated: false,
    forkCount: 0,
    forks: [],
    genesisCount: 1,
    firstBrokenSeq: null,
    verifiedAt: "2026-11-05T08:00:00.000Z",
    detailSignedEvents: 21,
    detailSignedFromSeq: 612,
    baseline: null,
    knownBreakCount: 0,
    knownForkCount: 0,
    newBreakCount: 0,
    newForkCount: 0,
    alarm: false,
    ...overrides,
  };
}

const broken: AuditChainBreakDto = {
  seq: 12,
  id: "evt-12",
  ts: "2026-11-01T08:00:00.000Z",
  action: "document.update",
  entityType: "Document",
  kind: "hash_mismatch",
  expected: "b".repeat(64),
  found: "c".repeat(64),
  known: false,
};

const forked: AuditChainForkDto = { prevHash: "a".repeat(64), children: 2, seqs: [13, 14], known: false };

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>{children}</DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

function ToastProbe() {
  const { toasts } = useApp();
  return <div data-testid="toasts">{toasts.map((tt) => tt.title).join("|")}</div>;
}

const wrapperWithToasts = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>
        {children}
        <ToastProbe />
      </DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  config.useApi = true;
  auditEvents.mockResolvedValue({ items: [], meta: { total: 0, success: 0, failure: 0, entityTypes: [] } });
});

describe("AuditTrail chain verification", () => {
  it("reports an intact chain without any break table", async () => {
    verifyAuditChain.mockResolvedValue(report());
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/السلسلة سليمة من أول حدث/)).toBeInTheDocument();
    expect(screen.getAllByText("633").length).toBeGreaterThan(0);
    expect(screen.queryByText(/أحداث لا تطابق تجزئتها/)).toBeNull();
    expect(verifyAuditChain).toHaveBeenCalledTimes(1);
  });

  it("lists broken events, forks and the truncation notice", async () => {
    verifyAuditChain.mockResolvedValue(
      report({
        valid: false,
        alarm: true,
        breakCount: 51,
        newBreakCount: 51,
        truncated: true,
        firstBrokenSeq: 12,
        forkCount: 1,
        newForkCount: 1,
        forks: [forked],
        breaks: [broken],
      }),
    );
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));

    expect(await screen.findByText(/كسر غير معتمد في سلسلة التدقيق/)).toBeInTheDocument();
    expect(screen.getByText("document.update · Document")).toBeInTheDocument();
    expect(screen.getByText("تجزئة غير مطابقة")).toBeInTheDocument();
    expect(screen.getAllByText("غير معتمد")).toHaveLength(1);
    expect(screen.getByText(/أحداث 13, 14 · غير معتمد/)).toBeInTheDocument();
    expect(screen.getByText(/c{12} \/ b{12}/)).toBeInTheDocument();
    expect(screen.getByText(/يُعرض أول 50 كسراً فقط/)).toBeInTheDocument();
    expect(screen.getByText(/أحداث 13, 14/)).toBeInTheDocument();
    expect(screen.getByText(/لم يُعتمد أي سجل تلف بعد/)).toBeInTheDocument();
  });

  it("separates acknowledged historical damage from a new break", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("system_admin"));
    verifyAuditChain.mockResolvedValue(
      report({
        valid: false,
        alarm: false,
        breakCount: 8,
        knownBreakCount: 8,
        firstBrokenSeq: 12,
        breaks: [{ ...broken, known: true }],
        baseline: {
          seq: 706,
          id: "baseline-1",
          recordedAt: "2026-11-05T09:00:00.000Z",
          events: 705,
          maxSeq: 705,
          breakCount: 8,
          forkCount: 10,
        },
      }),
    );
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));

    expect(await screen.findByText(/التلف المحصور في سجل التلف المعتمد/)).toBeInTheDocument();
    expect(screen.getByText("معتمد سابقاً")).toBeInTheDocument();
    expect(screen.getByText(/سابقة على قفل السلسلة/)).toBeInTheDocument();
    expect(screen.getByText(/تُشمل تفاصيل الحدث في التجزئة منذ التسلسل 612/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /اعتماد التلف الحالي/ })).toBeInTheDocument();
  });

  it("records the damage register when the administrator acknowledges it", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("system_admin"));
    verifyAuditChain.mockResolvedValue(report({ valid: false, breakCount: 1, newBreakCount: 1, alarm: true, breaks: [broken] }));
    recordAuditChainBaseline.mockResolvedValue(
      report({ valid: false, breakCount: 1, knownBreakCount: 1, alarm: false, breaks: [{ ...broken, known: true }] }),
    );
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));
    await screen.findByText(/كسر غير معتمد في سلسلة التدقيق/);
    fireEvent.click(screen.getByRole("button", { name: /اعتماد التلف الحالي/ }));
    fireEvent.click(await screen.findByRole("button", { name: /تأكيد الاعتماد/ }));

    await waitFor(() => expect(recordAuditChainBaseline).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/التلف المحصور في سجل التلف المعتمد/)).toBeInTheDocument();
  });

  it("hides the acknowledgement action from a non-administrator", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("employee"));
    verifyAuditChain.mockResolvedValue(report({ valid: false, alarm: true, breakCount: 1, newBreakCount: 1, breaks: [broken] }));
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));

    await screen.findByText(/كسر غير معتمد في سلسلة التدقيق/);
    expect(screen.queryByRole("button", { name: /اعتماد التلف الحالي/ })).toBeNull();
  });

  it("shows the server reason when the verifier is denied", async () => {
    verifyAuditChain.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Missing capability: audit.verify"));
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));

    expect(await screen.findByText(/Missing capability: audit.verify/)).toBeInTheDocument();
    expect(screen.getByText(/تعذّر فحص السلسلة/)).toBeInTheDocument();
    expect(screen.queryByText("عدد الأحداث")).toBeNull();
  });

  it("hides the verification report on request", async () => {
    verifyAuditChain.mockResolvedValue(report());
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: /إخفاء النتيجة/ }));

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});

describe("AuditTrail chain acknowledgement edge cases", () => {
  it("keeps the acknowledgement armed when the baseline write is refused", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("system_admin"));
    verifyAuditChain.mockResolvedValue(report({ valid: false, alarm: true, breakCount: 1, newBreakCount: 1, breaks: [broken] }));
    recordAuditChainBaseline.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Missing capability: audit.baseline"));
    render(<AuditTrail />, { wrapper: wrapperWithToasts });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));
    await screen.findByText(/كسر غير معتمد في سلسلة التدقيق/);
    fireEvent.click(screen.getByRole("button", { name: /اعتماد التلف الحالي/ }));
    fireEvent.click(await screen.findByRole("button", { name: /تأكيد الاعتماد/ }));

    await waitFor(() => expect(screen.getByTestId("toasts")).toHaveTextContent("تعذّر تنفيذ العملية على الخادم"));
    expect(screen.getByRole("button", { name: /تأكيد الاعتماد/ })).toBeInTheDocument();
    expect(recordAuditChainBaseline).toHaveBeenCalledTimes(1);
  });

  it("cancels the armed acknowledgement without writing a baseline", async () => {
    localStorage.setItem("edas.v1.role", JSON.stringify("system_admin"));
    verifyAuditChain.mockResolvedValue(report({ valid: false, alarm: true, breakCount: 1, newBreakCount: 1, breaks: [broken] }));
    render(<AuditTrail />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /تحقق السلسلة/ }));
    await screen.findByText(/كسر غير معتمد في سلسلة التدقيق/);
    fireEvent.click(screen.getByRole("button", { name: /اعتماد التلف الحالي/ }));
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));

    expect(screen.queryByRole("button", { name: /تأكيد الاعتماد/ })).toBeNull();
    expect(screen.getByRole("button", { name: /اعتماد التلف الحالي/ })).toBeInTheDocument();
    expect(recordAuditChainBaseline).not.toHaveBeenCalled();
  });
});

describe("AuditTrail server rows", () => {
  it("renders the server rows, their meta counters and the entry detail", async () => {
    auditEvents.mockResolvedValue({
      items: [
        event(),
        event({ id: "evt-2", action: "user.login", entityType: "User", entityId: null, result: "failure", correlationId: null }),
      ],
      meta: { total: 90, success: 1, failure: 1, entityTypes: ["Document", "User"] },
    });
    render(<AuditTrail />, { wrapper });

    expect(await screen.findByText("document.update")).toBeInTheDocument();
    expect(screen.getAllByText("سارة القحطاني")).toHaveLength(2);
    expect(screen.getByText("2 من 90")).toBeInTheDocument();
    expect(screen.queryByText(/وضع العرض المحلي/)).toBeNull();

    fireEvent.click(screen.getByText("document.update"));
    const dialog = screen.getByRole("dialog", { name: "تفاصيل سجل التدقيق" });
    expect(within(dialog).getByText("Document")).toBeInTheDocument();
    expect(within(dialog).getByText("2026-11-05 08:15")).toBeInTheDocument();
    expect(within(dialog).getByText(/لم يسجّل الخادم تفاصيل إضافية/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("dialog", { name: "تفاصيل سجل التدقيق" })).toBeNull();
  });

  it("copies the correlation id and reports the outcome", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    auditEvents.mockResolvedValue({
      items: [event({ detail: '{"field":"title"}' })],
      meta: { total: 1, success: 1, failure: 0, entityTypes: ["Document"] },
    });
    render(<AuditTrail />, { wrapper: wrapperWithToasts });

    await screen.findByText("document.update");
    fireEvent.click(screen.getByText("document.update"));
    const dialog = screen.getByRole("dialog", { name: "تفاصيل سجل التدقيق" });
    expect(within(dialog).getByText('{"field":"title"}')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /نسخ الترابط/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("COR-1"));
    expect(await screen.findByText("تم نسخ رقم الترابط")).toBeInTheDocument();
  });

  it("sends the search, filters and pagination to the server", async () => {
    auditEvents.mockImplementation((params: { page: number }) =>
      Promise.resolve({
        items: [event({ id: `p-${params.page}`, action: `page-${params.page}-action` })],
        meta: { total: 120, success: 100, failure: 20, entityTypes: ["Document", "User"] },
      }),
    );
    render(<AuditTrail />, { wrapper });

    expect(await screen.findByText("page-1-action")).toBeInTheDocument();
    expect(screen.getByText("صفحة 1 من 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(await screen.findByText("page-2-action")).toBeInTheDocument();
    expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 50 }));

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    expect(await screen.findByText("page-1-action")).toBeInTheDocument();

    const userSelect = screen.getByLabelText("تصفية حسب المستخدم");
    const userOption = Array.from(userSelect.querySelectorAll("option")).find((option) => option.value !== "all")!;
    fireEvent.change(userSelect, { target: { value: userOption.value } });
    await waitFor(() => expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ actorId: userOption.value, page: 1 })));

    fireEvent.change(screen.getByLabelText("تصفية حسب الوحدة"), { target: { value: "User" } });
    await waitFor(() => expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ entityType: "User" })));

    fireEvent.change(screen.getByLabelText("تصفية حسب النتيجة"), { target: { value: "failure" } });
    await waitFor(() => expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ result: "failure" })));

    fireEvent.change(screen.getByLabelText("ابحث في سجل التدقيق"), { target: { value: "عقد" } });
    await waitFor(() => expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ q: "عقد" })), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByLabelText("ابحث في سجل التدقيق")).toHaveValue("");
  });

  it("falls back to the empty state when the server refuses the listing", async () => {
    auditEvents.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Missing capability: audit.read"));
    render(<AuditTrail />, { wrapper });

    expect(await screen.findByText("لا توجد سجلات مطابقة")).toBeInTheDocument();
    expect(screen.getByText("0 من 0")).toBeInTheDocument();
  });

  it("sorts every server column and closes the detail with Escape", async () => {
    auditEvents.mockResolvedValue({
      items: [event(), event({ id: "evt-2", action: "user.login", entityType: "User", ip: "10.0.0.9", result: "failure" })],
      meta: { total: 2, success: 1, failure: 1, entityTypes: ["Document", "User"] },
    });
    render(<AuditTrail />, { wrapper });

    await screen.findByText("document.update");
    for (const header of ["الوقت", "المستخدم", "الوحدة", "العملية", "IP", "النتيجة"]) {
      fireEvent.click(screen.getByText(header));
    }
    expect(screen.getByText("user.login")).toBeInTheDocument();

    fireEvent.click(screen.getByText("user.login"));
    expect(screen.getByRole("dialog", { name: "تفاصيل سجل التدقيق" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "تفاصيل سجل التدقيق" })).toBeNull();
  });

  it("reports a rejected clipboard write", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    auditEvents.mockResolvedValue({ items: [event()], meta: { total: 1, success: 1, failure: 0, entityTypes: ["Document"] } });
    render(<AuditTrail />, { wrapper: wrapperWithToasts });

    await screen.findByText("document.update");
    fireEvent.click(screen.getByText("document.update"));
    fireEvent.click(screen.getByRole("button", { name: /نسخ الترابط/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("COR-1"));
    expect(await screen.findByText("تعذر النسخ")).toBeInTheDocument();
  });

  it("exports every filtered row by walking the server pages", async () => {
    URL.createObjectURL = vi.fn(() => "blob:audit");
    URL.revokeObjectURL = vi.fn();
    auditEvents.mockImplementation((params: { page: number }) =>
      Promise.resolve({
        items: [event({ id: `p-${params.page}`, action: `page-${params.page}-action` })],
        meta: { total: 2, success: 2, failure: 0, entityTypes: ["Document"] },
      }),
    );
    render(<AuditTrail />, { wrapper: wrapperWithToasts });

    await screen.findByText("page-1-action");
    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => expect(screen.getByTestId("toasts")).toHaveTextContent("تم تنزيل CSV"));
    expect(auditEvents).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });
});

describe("AuditTrail offline mode", () => {
  beforeEach(() => {
    config.useApi = false;
  });

  it("filters the sample trail locally and resets the filters", async () => {
    render(<AuditTrail />, { wrapper });

    expect(screen.getByText(/وضع العرض المحلي/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تحقق السلسلة/ })).toBeNull();

    const userSelect = screen.getByLabelText("تصفية حسب المستخدم");
    expect(userSelect.querySelectorAll("option").length).toBeGreaterThan(1);
    const otherUser = auditEntries.find((entry) => entry.user !== auditEntries[0].user)!.user;
    fireEvent.change(userSelect, { target: { value: otherUser } });
    expect(screen.queryByText(auditEntries[0].user, { selector: "span.truncate" })).toBeNull();

    fireEvent.change(screen.getByLabelText("تصفية حسب النتيجة"), { target: { value: "failure" } });
    expect(screen.queryAllByText("نجاح", { selector: "span" })).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("ابحث في سجل التدقيق"), { target: { value: "zzzz-not-an-event" } });
    expect(await screen.findByText("لا توجد سجلات مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    expect(screen.queryByText("لا توجد سجلات مطابقة")).toBeNull();
    expect(screen.getByLabelText("ابحث في سجل التدقيق")).toHaveValue("");
    expect(screen.getByLabelText("تصفية حسب النتيجة")).toHaveValue("all");
  });

  it("exports the locally filtered rows", async () => {
    URL.createObjectURL = vi.fn(() => "blob:audit");
    URL.revokeObjectURL = vi.fn();
    render(<AuditTrail />, { wrapper: wrapperWithToasts });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => expect(screen.getByTestId("toasts")).toHaveTextContent("تم تنزيل CSV"));
    expect(auditEvents).not.toHaveBeenCalled();
  });
});
