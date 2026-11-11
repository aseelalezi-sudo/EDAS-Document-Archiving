import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { FolderTreePanel } from "./folder-tree-panel";
import type { FolderNode } from "../types";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>{children}</AppProvider>
  </MemoryRouter>
);

const folder: FolderNode = {
  id: "f1",
  name: "ملف التدقيق",
  nameEn: "Audit file",
  parentId: null,
  type: "dept",
  docs: 3,
  subfolders: 1,
  accessScope: "قسمي",
};

beforeEach(() => {
  localStorage.clear();
});

describe("folder tree actions", () => {
  it("offers a visible actions button that opens the folder menu", async () => {
    const user = userEvent.setup();
    const onContext = vi.fn();
    render(<FolderTreePanel selected="root" onSelect={() => {}} folders={[folder]} onContext={onContext} />, { wrapper });

    await user.click(screen.getByRole("button", { name: "خيارات المجلد — ملف التدقيق" }));

    expect(onContext).toHaveBeenCalledTimes(1);
    expect(onContext.mock.calls[0][1]).toMatchObject({ id: "f1" });
  });

  it("hides the actions button when no menu handler is given", () => {
    render(<FolderTreePanel selected="root" onSelect={() => {}} folders={[folder]} />, { wrapper });

    expect(screen.queryByRole("button", { name: /خيارات المجلد/ })).toBeNull();
  });
});
