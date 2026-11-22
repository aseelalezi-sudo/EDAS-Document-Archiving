import { describe, expect, it, vi } from "vitest";
import { DocumentsController } from "./documents.controller";
import type { DocumentsService } from "./documents.service";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };

function build() {
  const documents = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    trashIds: vi.fn().mockResolvedValue(["doc-1"]),
    purgeTrash: vi.fn().mockResolvedValue({ failed: 0, storageErrors: 0 }),
    trash: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn().mockResolvedValue({ id: "doc-1" }),
    permissions: vi.fn().mockResolvedValue({ canEdit: true }),
    create: vi.fn().mockResolvedValue({ id: "doc-1" }),
    update: vi.fn().mockResolvedValue({ id: "doc-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue({ id: "doc-1" }),
    purge: vi.fn().mockResolvedValue(undefined),
    addVersion: vi.fn().mockResolvedValue({ id: "ver-1" }),
    restoreVersion: vi.fn().mockResolvedValue({ id: "doc-1" }),
    checkout: vi.fn().mockResolvedValue({ id: "doc-1" }),
    checkin: vi.fn().mockResolvedValue({ id: "doc-1" }),
    requestSignature: vi.fn().mockResolvedValue({ id: "sig-1" }),
    sign: vi.fn().mockResolvedValue({ id: "doc-1" }),
    declareRecord: vi.fn().mockResolvedValue({ id: "doc-1" }),
  };
  return { controller: new DocumentsController(documents as unknown as DocumentsService), documents };
}

describe("DocumentsController delegation", () => {
  it("forwards the list and trash queries", async () => {
    const { controller, documents } = build();
    const query = { page: 2 } as never;

    await expect(controller.list(PRINCIPAL as never, query)).resolves.toEqual({ items: [] });
    await expect(controller.trash(PRINCIPAL as never, query)).resolves.toEqual({ items: [] });
    expect(documents.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(documents.trash).toHaveBeenCalledWith(PRINCIPAL, query);
    await expect(controller.trashIds(PRINCIPAL as never)).resolves.toEqual(["doc-1"]);
    await controller.purgeTrash(PRINCIPAL as never, { ids: ["doc-1"] });
    expect(documents.purgeTrash).toHaveBeenCalledWith(PRINCIPAL, ["doc-1"]);
  });

  it("forwards the document id for reads, permissions and updates", async () => {
    const { controller, documents } = build();
    const dto = { title: "عقد" } as never;

    await controller.get(PRINCIPAL as never, "doc-1");
    await controller.permissions(PRINCIPAL as never, "doc-1");
    await controller.create(PRINCIPAL as never, dto);
    await controller.update(PRINCIPAL as never, "doc-1", dto);

    expect(documents.get).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.permissions).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.create).toHaveBeenCalledWith(PRINCIPAL, dto);
    expect(documents.update).toHaveBeenCalledWith(PRINCIPAL, "doc-1", dto);
  });

  it("forwards the lifecycle actions", async () => {
    const { controller, documents } = build();

    await controller.remove(PRINCIPAL as never, "doc-1");
    await controller.restore(PRINCIPAL as never, "doc-1");
    await controller.purge(PRINCIPAL as never, "doc-1");
    await controller.checkout(PRINCIPAL as never, "doc-1");
    await controller.checkin(PRINCIPAL as never, "doc-1");

    expect(documents.remove).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.restore).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.purge).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.checkout).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.checkin).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
  });

  it("forwards version and signature actions with both ids", async () => {
    const { controller, documents } = build();
    const dto = { storageKey: "documents/2026/a.pdf" } as never;

    await controller.addVersion(PRINCIPAL as never, "doc-1", dto);
    await controller.restoreVersion(PRINCIPAL as never, "doc-1", "ver-2");
    await controller.requestSignature(PRINCIPAL as never, "doc-1");
    await controller.sign(PRINCIPAL as never, "doc-1");
    await controller.declareRecord(PRINCIPAL as never, "doc-1");

    expect(documents.addVersion).toHaveBeenCalledWith(PRINCIPAL, "doc-1", dto);
    expect(documents.restoreVersion).toHaveBeenCalledWith(PRINCIPAL, "doc-1", "ver-2");
    expect(documents.requestSignature).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.sign).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
    expect(documents.declareRecord).toHaveBeenCalledWith(PRINCIPAL, "doc-1");
  });
});
