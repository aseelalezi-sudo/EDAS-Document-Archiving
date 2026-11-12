import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { Trash } from "./documents-trash";

function row(id: string) {
  return {
    doc: {
      id,
      title: `وثيقة ${id}`,
      fileType: "pdf",
      docNo: "EDAS-2026001",
      category: "عقود",
      deptId: "legal",
      owner: "أمل",
      version: "1.0",
      classification: "internal",
      status: "archived",
      createdAt: "2026-01-01",
      modifiedAt: "2026-01-02",
      retentionEnd: "2030-01-01",
      size: "1 KB",
      folderId: "f-1",
      tags: [],
      description: "",
      versions: [],
      activity: [],
      retentionDays: 30,
    },
    deletedBy: "سارة",
    deletedAt: "2026-02-01",
    purgeAt: "2026-03-01",
    original: "/عقود",
  };
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.app.mockReturnValue({ t: (key: string) => key, lang: "ar", toast: vi.fn() });
  mocks.docs.mockReturnValue({
    trash: [row("doc-1"), row("doc-2")],
    docsReady: true,
    restoreDocs: vi.fn().mockResolvedValue(false),
    purgeDocs: vi.fn().mockResolvedValue(false),
    emptyTrash: vi.fn().mockResolvedValue(false),
  });
});

describe("trash page failures", () => {
  it("stays silent when a restore was refused", async () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = screen.getByText(/1 common.selected/).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name: "common.restore" }));

    await vi.waitFor(() => expect(mocks.docs.mock.results[0].value.restoreDocs).toHaveBeenCalled());
    expect(mocks.app.mock.results[0].value.toast).not.toHaveBeenCalled();
  });

  it("stays silent when a purge was refused", async () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = screen.getByText(/1 common.selected/).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name: "common.permanentDelete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.permanentDelete" }));

    await vi.waitFor(() => expect(mocks.docs.mock.results[0].value.purgeDocs).toHaveBeenCalled());
    expect(mocks.app.mock.results[0].value.toast).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays silent when emptying the trash was refused", async () => {
    render(
      <MemoryRouter>
        <Trash />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /إفراغ السلة/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إفراغ نهائي" }));

    await vi.waitFor(() => expect(mocks.docs.mock.results[0].value.emptyTrash).toHaveBeenCalled());
    expect(mocks.app.mock.results[0].value.toast).not.toHaveBeenCalled();
  });
});
