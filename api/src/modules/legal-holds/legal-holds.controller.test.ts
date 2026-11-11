import { describe, expect, it, vi } from "vitest";
import type { LegalHoldsService } from "./legal-holds.service";
import { LegalHoldsController } from "./legal-holds.controller";

const PRINCIPAL = { sub: "user-1", role: "ARCHIVIST" };

function build() {
  const holds = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    get: vi.fn().mockResolvedValue({ id: "hold-1" }),
    create: vi.fn().mockResolvedValue({ id: "hold-1" }),
    addDocument: vi.fn().mockResolvedValue({ id: "hold-1" }),
    removeDocument: vi.fn().mockResolvedValue({ id: "hold-1" }),
    release: vi.fn().mockResolvedValue({ id: "hold-1" }),
  };
  return { controller: new LegalHoldsController(holds as unknown as LegalHoldsService), holds };
}

describe("LegalHoldsController delegation", () => {
  it("forwards the list query and the single hold read", async () => {
    const { controller, holds } = build();
    const query = { status: "active", page: 1 } as never;

    await controller.list(PRINCIPAL as never, query);
    await controller.get(PRINCIPAL as never, "hold-1");

    expect(holds.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(holds.get).toHaveBeenCalledWith(PRINCIPAL, "hold-1");
  });

  it("forwards hold creation", async () => {
    const { controller, holds } = build();
    const dto = { reason: "نزاع قضائي", documentIds: ["doc-1"] } as never;

    await controller.create(PRINCIPAL as never, dto);

    expect(holds.create).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("unwraps the document id on add and forwards remove and release", async () => {
    const { controller, holds } = build();

    await controller.addDocument(PRINCIPAL as never, "hold-1", { documentId: "doc-1" } as never);
    await controller.removeDocument(PRINCIPAL as never, "hold-1", "doc-1");
    await controller.release(PRINCIPAL as never, "hold-1");

    expect(holds.addDocument).toHaveBeenCalledWith(PRINCIPAL, "hold-1", "doc-1");
    expect(holds.removeDocument).toHaveBeenCalledWith(PRINCIPAL, "hold-1", "doc-1");
    expect(holds.release).toHaveBeenCalledWith(PRINCIPAL, "hold-1");
  });
});
