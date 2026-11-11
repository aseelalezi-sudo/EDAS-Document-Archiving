import { describe, expect, it, vi } from "vitest";
import { RetentionController } from "./retention.controller";
import type { RetentionService } from "./retention.service";

const PRINCIPAL = { sub: "user-1", role: "ARCHIVIST" };

function build() {
  const retention = {
    listPolicies: vi.fn().mockResolvedValue([]),
    createPolicy: vi.fn().mockResolvedValue({ id: "pol-1" }),
    updatePolicy: vi.fn().mockResolvedValue({ id: "pol-1" }),
    deletePolicy: vi.fn().mockResolvedValue(undefined),
    listItems: vi.fn().mockResolvedValue({ items: [] }),
    schedule: vi.fn().mockResolvedValue({ id: "item-1" }),
    execute: vi.fn().mockResolvedValue({ id: "item-1" }),
    certificate: vi.fn().mockResolvedValue({ certificateNo: "C-1" }),
    updateItem: vi.fn().mockResolvedValue({ id: "item-1" }),
  };
  return { controller: new RetentionController(retention as unknown as RetentionService), retention };
}

describe("RetentionController delegation", () => {
  it("forwards the policy reads and writes", async () => {
    const { controller, retention } = build();
    const dto = { name: "خمس سنوات", retentionYears: 5 } as never;

    await controller.listPolicies(PRINCIPAL as never);
    await controller.createPolicy(PRINCIPAL as never, dto);
    await controller.updatePolicy(PRINCIPAL as never, "pol-1", dto);
    await controller.deletePolicy(PRINCIPAL as never, "pol-1");

    expect(retention.listPolicies).toHaveBeenCalledWith(PRINCIPAL);
    expect(retention.createPolicy).toHaveBeenCalledWith(PRINCIPAL, dto);
    expect(retention.updatePolicy).toHaveBeenCalledWith(PRINCIPAL, "pol-1", dto);
    expect(retention.deletePolicy).toHaveBeenCalledWith(PRINCIPAL, "pol-1");
  });

  it("forwards the item list and schedule", async () => {
    const { controller, retention } = build();
    const query = { status: "scheduled" } as never;
    const dto = { documentId: "doc-1", policyId: "pol-1", dueAt: "2027-01-01" } as never;

    await controller.listItems(PRINCIPAL as never, query);
    await controller.schedule(PRINCIPAL as never, dto);

    expect(retention.listItems).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(retention.schedule).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("forwards execute, certificate and item updates", async () => {
    const { controller, retention } = build();
    const execute = { action: "DESTROY", reason: "انتهاء المدة" } as never;
    const update = { status: "on_hold" } as never;

    await controller.execute(PRINCIPAL as never, "item-1", execute);
    await controller.certificate(PRINCIPAL as never, "item-1");
    await controller.updateItem(PRINCIPAL as never, "item-1", update);

    expect(retention.execute).toHaveBeenCalledWith(PRINCIPAL, "item-1", execute);
    expect(retention.certificate).toHaveBeenCalledWith(PRINCIPAL, "item-1");
    expect(retention.updateItem).toHaveBeenCalledWith(PRINCIPAL, "item-1", update);
  });
});
