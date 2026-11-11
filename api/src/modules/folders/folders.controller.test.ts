import { describe, expect, it, vi } from "vitest";
import type { FoldersService } from "./folders.service";
import { FoldersController } from "./folders.controller";

const PRINCIPAL = { sub: "user-1", role: "ARCHIVIST" };

function build() {
  const folders = {
    tree: vi.fn().mockResolvedValue([]),
    listAcls: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: "folder-1" }),
    create: vi.fn().mockResolvedValue({ id: "folder-1" }),
    update: vi.fn().mockResolvedValue({ id: "folder-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
    getAcl: vi.fn().mockResolvedValue({ entries: [] }),
    putAcl: vi.fn().mockResolvedValue({ entries: [] }),
  };
  return { controller: new FoldersController(folders as unknown as FoldersService), folders };
}

describe("FoldersController delegation", () => {
  it("forwards the tree, ACL overview and single folder reads", async () => {
    const { controller, folders } = build();

    await controller.tree(PRINCIPAL as never);
    await controller.listAcls(PRINCIPAL as never);
    await controller.get(PRINCIPAL as never, "folder-1");

    expect(folders.tree).toHaveBeenCalledWith(PRINCIPAL);
    expect(folders.listAcls).toHaveBeenCalledWith(PRINCIPAL);
    expect(folders.get).toHaveBeenCalledWith(PRINCIPAL, "folder-1");
  });

  it("forwards folder writes", async () => {
    const { controller, folders } = build();
    const create = { name: "عقود", parentId: null } as never;
    const update = { name: "عقود 2026" } as never;

    await controller.create(PRINCIPAL as never, create);
    await controller.update(PRINCIPAL as never, "folder-1", update);
    await controller.remove(PRINCIPAL as never, "folder-1");

    expect(folders.create).toHaveBeenCalledWith(PRINCIPAL, create);
    expect(folders.update).toHaveBeenCalledWith(PRINCIPAL, "folder-1", update);
    expect(folders.remove).toHaveBeenCalledWith(PRINCIPAL, "folder-1");
  });

  it("forwards the ACL read and write with the same id", async () => {
    const { controller, folders } = build();
    const dto = { entries: [{ subjectId: "dept-1", level: "READ" }] } as never;

    await controller.getAcl(PRINCIPAL as never, "folder-1");
    await controller.putAcl(PRINCIPAL as never, "folder-1", dto);

    expect(folders.getAcl).toHaveBeenCalledWith(PRINCIPAL, "folder-1");
    expect(folders.putAcl).toHaveBeenCalledWith(PRINCIPAL, "folder-1", dto);
  });
});
