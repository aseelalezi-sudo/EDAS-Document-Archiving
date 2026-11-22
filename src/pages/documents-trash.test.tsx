import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { ToastHost } from "../components/system";
import { translations } from "../i18n";
import { Trash } from "./documents-trash";

const AR = translations.ar;

function Probe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      <DocsProvider>
        {children}
        <Probe />
        <ToastHost />
      </DocsProvider>
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

describe("trash page", () => {
  it("lists the deleted documents with their purge dates", () => {
    render(<Trash />, { wrapper });

    expect(screen.getAllByText(AR["nav.trash"]).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /إفراغ السلة/ })).toBeEnabled();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("restores the selected documents and confirms the count", async () => {
    render(<Trash />, { wrapper });
    const boxes = screen.getAllByRole("checkbox");

    fireEvent.click(boxes[1]);

    const bar = screen.getByText(new RegExp(`1 ${AR["common.selected"]}`)).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name: AR["common.restore"] }));

    expect(await screen.findByText("تمت الاستعادة")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked());
  });

  it("asks before permanently deleting a selected document", async () => {
    render(<Trash />, { wrapper });

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = screen.getByText(new RegExp(`1 ${AR["common.selected"]}`)).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name: AR["common.permanentDelete"] }));

    expect(screen.getByText(/هل تريد حذف 1 عنصر نهائياً/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["common.permanentDelete"] }));

    expect(await screen.findByText(AR["common.permanentDelete"])).toBeInTheDocument();
  });

  it("empties the whole trash after confirmation", async () => {
    render(<Trash />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /إفراغ السلة/ }));
    expect(await screen.findByText(/سيتم طلب حذف/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إفراغ نهائي" }));

    expect(await screen.findByText("تم إفراغ السلة")).toBeInTheDocument();
    expect(screen.getByText("السلة فارغة")).toBeInTheDocument();
  });

  it("offers a restore action on each row", async () => {
    render(<Trash />, { wrapper });
    const firstRow = screen.getAllByRole("row")[1];

    fireEvent.click(within(firstRow).getByRole("button", { name: AR["g.rowOptions"] }));

    expect(screen.getByRole("menuitem", { name: AR["common.restore"] })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: AR["common.restore"] }));

    expect(await screen.findByText("تمت الاستعادة")).toBeInTheDocument();
  });

  it("clears the selection without changing anything", async () => {
    render(<Trash />, { wrapper });

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = screen.getByText(new RegExp(`1 ${AR["common.selected"]}`)).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getAllByRole("button")[2]);

    expect(screen.queryByText(new RegExp(`1 ${AR["common.selected"]}`))).toBeNull();
  });

  it("speaks English and leads back to the library once the trash is empty", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<Trash />, { wrapper });

    expect(screen.getByRole("button", { name: "Empty trash" })).toBeEnabled();
    expect(screen.getByRole("columnheader", { name: "Deleted by" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Purge date" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Empty trash" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Empty permanently" }));

    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/library");
  });

  it("shows a dash for a row missing its deleter and origin", () => {
    localStorage.setItem(
      "edas.v1.trash",
      JSON.stringify([
        {
          doc: {
            id: "doc-blank",
            docNo: "EDAS-2026900",
            title: "وثيقة بلا مصدر",
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
            fileType: "pdf",
            folderId: "f-1",
            tags: [],
            description: "",
            versions: [],
            activity: [],
            retentionDays: 30,
          },
          deletedBy: "",
          deletedAt: "2026-02-01",
          purgeAt: "2026-03-01",
          original: "",
        },
      ]),
    );

    render(<Trash />, { wrapper });

    expect(screen.getByText("وثيقة بلا مصدر")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(2);
  });

  it("asks before permanently deleting from the row menu", () => {
    render(<Trash />, { wrapper });
    const firstRow = screen.getAllByRole("row")[1];

    fireEvent.click(within(firstRow).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(screen.getByRole("menuitem", { name: AR["common.permanentDelete"] }));

    expect(screen.getByText(/هل تريد حذف 1 عنصر نهائياً/)).toBeInTheDocument();
  });

  it("confirms a restore in English", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<Trash />, { wrapper });

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = screen.getByText(new RegExp(`1 ${translations.en["common.selected"]}`)).closest("div") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name: translations.en["common.restore"] }));

    expect(await screen.findByText("Restored")).toBeInTheDocument();
    expect(screen.getByText("1 item(s)")).toBeInTheDocument();
  });

  it("disables emptying when there is nothing to delete", () => {
    localStorage.setItem("edas.v1.trash", JSON.stringify([]));

    render(<Trash />, { wrapper });

    expect(screen.getByRole("button", { name: /إفراغ السلة/ })).toBeDisabled();
    expect(screen.getByText("السلة فارغة")).toBeInTheDocument();
  });
});
