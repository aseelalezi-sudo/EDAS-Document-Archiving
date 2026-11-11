import { describe, expect, it, vi } from "vitest";
import { ApprovalChainsController } from "./approval-chains.controller";
import type { ApprovalsService } from "./approvals.service";

const PRINCIPAL = { sub: "user-1", role: "DEPT_MANAGER" };

function build() {
  const approvals = {
    listChains: vi.fn().mockResolvedValue([{ id: "chain-1", name: "اعتماد الوثائق" }]),
    createChain: vi.fn().mockResolvedValue({ id: "chain-1" }),
    updateChain: vi.fn().mockResolvedValue({ id: "chain-1" }),
  };
  return { controller: new ApprovalChainsController(approvals as unknown as ApprovalsService), approvals };
}

describe("ApprovalChainsController delegation", () => {
  it("serves the chain catalog without a principal", async () => {
    const { controller, approvals } = build();

    await expect(controller.list()).resolves.toEqual([{ id: "chain-1", name: "اعتماد الوثائق" }]);
    expect(approvals.listChains).toHaveBeenCalledWith();
  });

  it("forwards creation with its body", async () => {
    const { controller, approvals } = build();
    const dto = { name: "اعتماد الوثائق", steps: [{ role: "DEPT_MANAGER", order: 1 }] } as never;

    await controller.create(PRINCIPAL as never, dto);

    expect(approvals.createChain).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("forwards the update body with the chain id", async () => {
    const { controller, approvals } = build();
    const dto = { steps: [{ role: "ARCHIVIST", order: 1 }] } as never;

    await controller.update(PRINCIPAL as never, "chain-1", dto);

    expect(approvals.updateChain).toHaveBeenCalledWith(PRINCIPAL, "chain-1", dto);
  });
});
