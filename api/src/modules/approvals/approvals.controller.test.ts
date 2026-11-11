import { describe, expect, it, vi } from "vitest";
import { ApprovalsController } from "./approvals.controller";
import type { ApprovalsService } from "./approvals.service";

const PRINCIPAL = { sub: "user-1", role: "DEPT_MANAGER" };

function build() {
  const approvals = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    pending: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: "ap-1" }),
    submit: vi.fn().mockResolvedValue({ id: "ap-1" }),
    decide: vi.fn().mockResolvedValue({ id: "ap-1" }),
  };
  return { controller: new ApprovalsController(approvals as unknown as ApprovalsService), approvals };
}

describe("ApprovalsController delegation", () => {
  it("forwards the list query, the pending inbox and the single read", async () => {
    const { controller, approvals } = build();
    const query = { status: "pending", page: 2 } as never;

    await controller.list(PRINCIPAL as never, query);
    await controller.pending(PRINCIPAL as never);
    await controller.get(PRINCIPAL as never, "ap-1");

    expect(approvals.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(approvals.pending).toHaveBeenCalledWith(PRINCIPAL);
    expect(approvals.get).toHaveBeenCalledWith(PRINCIPAL, "ap-1");
  });

  it("forwards submission and the decision with its comment", async () => {
    const { controller, approvals } = build();
    const submit = { documentId: "doc-1", chainId: "chain-1" } as never;
    const decide = { decision: "APPROVED", comment: "موافق" } as never;

    await controller.submit(PRINCIPAL as never, submit);
    await controller.decide(PRINCIPAL as never, "ap-1", decide);

    expect(approvals.submit).toHaveBeenCalledWith(PRINCIPAL, submit);
    expect(approvals.decide).toHaveBeenCalledWith(PRINCIPAL, "ap-1", decide);
  });
});
