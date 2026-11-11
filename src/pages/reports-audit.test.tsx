import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { ApiError } from "../lib/api-client";
import type { AuditChainBreakDto, AuditChainForkDto, AuditChainReportDto } from "@edas/shared";
import { AuditTrail } from "./reports-audit";

const auditEvents = vi.fn();
const verifyAuditChain = vi.fn();
const recordAuditChainBaseline = vi.fn();

vi.mock("../config", () => ({ config: { apiBaseUrl: "http://localhost:4210/api/v1", oidc: {}, useApi: true } }));
vi.mock("../lib/domain-api", () => {
  const stub = () => Promise.resolve({ items: [], meta: { total: 0 } });
  const api: Record<string, unknown> = {
    auditEvents: (params: unknown) => auditEvents(params),
    verifyAuditChain: () => verifyAuditChain(),
    recordAuditChainBaseline: () => recordAuditChainBaseline(),
  };
  return { domainApi: new Proxy(api, { get: (target, key: string) => target[key] ?? stub }) };
});

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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
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
