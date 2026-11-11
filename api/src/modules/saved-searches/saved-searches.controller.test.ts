import { describe, expect, it, vi } from "vitest";
import { SavedSearchesController } from "./saved-searches.controller";
import type { SavedSearchesService } from "./saved-searches.service";

const PRINCIPAL = { sub: "user-1", role: "ARCHIVIST" };

function build() {
  const searches = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "search-1" }),
    update: vi.fn().mockResolvedValue({ id: "search-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new SavedSearchesController(searches as unknown as SavedSearchesService), searches };
}

describe("SavedSearchesController delegation", () => {
  it("scopes the list to the caller", async () => {
    const { controller, searches } = build();

    await expect(controller.list(PRINCIPAL as never)).resolves.toEqual([]);
    expect(searches.list).toHaveBeenCalledWith(PRINCIPAL);
  });

  it("forwards creation with its body", async () => {
    const { controller, searches } = build();
    const dto = { name: "عقود 2026", query: "عقود" } as never;

    await controller.create(PRINCIPAL as never, dto);

    expect(searches.create).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("forwards the update body and the removal id", async () => {
    const { controller, searches } = build();
    const dto = { name: "عقود 2026 المعتمدة" } as never;

    await controller.update(PRINCIPAL as never, "search-1", dto);
    await controller.remove(PRINCIPAL as never, "search-1");

    expect(searches.update).toHaveBeenCalledWith(PRINCIPAL, "search-1", dto);
    expect(searches.remove).toHaveBeenCalledWith(PRINCIPAL, "search-1");
  });
});
