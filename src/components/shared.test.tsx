import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { ToastHost } from "./system";
import { Badge } from "./ui";
import {
  Breadcrumbs,
  DataTable,
  ExportMenu,
  FileIcon,
  FolderIcon,
  MetaGrid,
  PageHeader,
  Progress,
  RowMenu,
  SectionTitle,
  Segmented,
  StatCard,
  Timeline,
  Toolbar,
  UserChip,
  downloadCsv,
  type Column,
} from "./shared";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
      <ToastHost />
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

describe("Breadcrumbs and PageHeader", () => {
  it("links every crumb except the last one", () => {
    render(<Breadcrumbs items={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الوثائق", to: "/documents" }, { label: "عقود" }]} />, {
      wrapper,
    });

    expect(screen.getByRole("link", { name: "الرئيسية" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "الوثائق" })).toHaveAttribute("href", "/documents");
    expect(screen.queryByRole("link", { name: "عقود" })).toBeNull();
    expect(screen.getByText("عقود")).toBeInTheDocument();
  });

  it("treats a crumb with a target as text when it is the last one", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "الرئيسية", to: "/dashboard" },
          { label: "نهاية", to: "/end" },
        ]}
      />,
      { wrapper },
    );

    expect(screen.queryByRole("link", { name: "نهاية" })).toBeNull();
    expect(screen.getByRole("link", { name: "الرئيسية" })).toBeInTheDocument();
  });

  it("frames the page title, description, actions and breadcrumbs", () => {
    render(
      <PageHeader
        title="الوثائق"
        description="كل وثائق المنشأة"
        breadcrumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الوثائق" }]}
        actions={<button type="button">إنشاء</button>}
      />,
      { wrapper },
    );

    expect(screen.getByRole("heading", { name: "الوثائق", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("كل وثائق المنشأة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الرئيسية" })).toBeInTheDocument();
  });

  it("renders a header with no description, actions or breadcrumbs", () => {
    render(<PageHeader title="مباشر" />, { wrapper });

    expect(screen.getByRole("heading", { name: "مباشر" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("FileIcon and FolderIcon", () => {
  it("gives every known file type its own tint and size", () => {
    const { container } = render(
      <div>
        <FileIcon type="pdf" size="sm" />
        <FileIcon type="image" size="lg" />
        <FileIcon type="office" />
        <FileIcon type="cad" />
        <FileIcon type="text" />
      </div>,
      { wrapper },
    );

    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans).toHaveLength(5);
    expect(spans[0]).toHaveClass("h-9", "w-9", "bg-rose-50");
    expect(spans[1]).toHaveClass("h-16", "w-16", "bg-violet-50");
    expect(spans[2]).toHaveClass("h-11", "w-11", "bg-emerald-50");
    expect(spans[3]).toHaveClass("bg-sky-50");
    expect(spans[4]).toHaveClass("bg-ink-100");
  });

  it("falls back to the text tint for an unknown type", () => {
    const { container } = render(<FileIcon type={"zip" as never} />, { wrapper });

    expect(container.querySelector("span")).toHaveClass("bg-ink-100");
  });

  it("switches the folder glyph when the folder is open", () => {
    const { container } = render(
      <div>
        <FolderIcon />
        <FolderIcon open className="extra" />
      </div>,
      { wrapper },
    );

    const icons = Array.from(container.querySelectorAll("svg"));
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveClass("lucide-folder");
    expect(icons[1]).toHaveClass("lucide-folder-open", "extra");
  });
});

describe("StatCard", () => {
  it("shows the value, label, hint and the rising delta", () => {
    const { container } = render(
      <StatCard label="الوثائق" value={120} delta="+8%" trend="up" hint="هذا الشهر" icon={<span>icon</span>} accent="teal" />,
      { wrapper },
    );

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("الوثائق")).toBeInTheDocument();
    expect(screen.getByText("هذا الشهر")).toBeInTheDocument();
    expect(screen.getByText("+8%")).toHaveClass("text-emerald-600");
    expect(container.querySelector(".from-teal-500")).toBeInTheDocument();
  });

  it("uses the falling and flat delta colours", () => {
    const { container } = render(
      <div>
        <StatCard label="أ" value="1" delta="-2%" trend="down" icon={null} accent="rose" />
        <StatCard label="ب" value="2" delta="0" icon={null} />
      </div>,
      { wrapper },
    );

    expect(screen.getByText("-2%")).toHaveClass("text-rose-600");
    expect(screen.getByText("0")).toHaveClass("text-ink-500");
    expect(container.querySelectorAll(".lucide-arrow-down-right")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-minus")).toHaveLength(1);
  });
});

interface Row {
  id: string;
  name: string;
  size: number;
}

const rows: Row[] = [
  { id: "r1", name: "ب", size: 30 },
  { id: "r2", name: "أ", size: 10 },
  { id: "r3", name: "ج", size: 20 },
];

const columns: Column<Row>[] = [
  { key: "name", header: "الاسم", sortValue: (r) => r.name },
  { key: "size", header: "الحجم", sortValue: (r) => r.size },
  { key: "plain", header: "ثابت" },
];

function bodyNames() {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("DataTable", () => {
  it("renders the header and the rows", () => {
    render(<DataTable columns={columns} rows={rows} />, { wrapper });

    expect(screen.getByRole("columnheader", { name: /الاسم/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /ثابت/ })).toBeInTheDocument();
    expect(bodyNames()).toEqual(["ب", "أ", "ج"]);
  });

  it("sorts by a numeric column in both directions", () => {
    render(<DataTable columns={columns} rows={rows} />, { wrapper });

    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));
    expect(bodyNames()).toEqual(["أ", "ج", "ب"]);

    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));
    expect(bodyNames()).toEqual(["ب", "ج", "أ"]);
  });

  it("sorts text with the Arabic locale", () => {
    render(<DataTable columns={columns} rows={rows} />, { wrapper });

    fireEvent.click(screen.getByRole("columnheader", { name: /الاسم/ }));

    expect(bodyNames()).toEqual(["أ", "ب", "ج"]);
  });

  it("ignores headers that have no sort value or when sorting is off", () => {
    const view = render(<DataTable columns={columns} rows={rows} />, { wrapper });

    fireEvent.click(screen.getByRole("columnheader", { name: /ثابت/ }));
    expect(bodyNames()).toEqual(["ب", "أ", "ج"]);

    view.unmount();
    render(<DataTable columns={columns} rows={rows} sortable={false} />, { wrapper });
    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));

    expect(bodyNames()).toEqual(["ب", "أ", "ج"]);
  });

  it("pages the rows and marks the current page", () => {
    render(<DataTable columns={columns} rows={rows} pageSize={2} />, { wrapper });

    expect(screen.getByText("1 من 2 · 3 عنصر")).toBeInTheDocument();
    expect(bodyNames()).toEqual(["ب", "أ"]);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(bodyNames()).toEqual(["ج"]);
    expect(screen.getByText("2 من 2 · 3 عنصر")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "التالي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "»" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    expect(bodyNames()).toEqual(["ب", "أ"]);
    expect(screen.getByRole("button", { name: "السابق" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "»" }));
    expect(bodyNames()).toEqual(["ج"]);

    fireEvent.click(screen.getByRole("button", { name: "«" }));
    expect(bodyNames()).toEqual(["ب", "أ"]);
  });

  it("selects and clears a single row and the whole page", () => {
    const onSelectedChange = vi.fn();
    const view = render(<DataTable columns={columns} rows={rows} selectable selected={[]} onSelectedChange={onSelectedChange} />, {
      wrapper,
    });
    const [, one, two] = screen.getAllByRole("checkbox");

    fireEvent.click(one);
    expect(onSelectedChange).toHaveBeenLastCalledWith(["r1"]);

    view.unmount();
    onSelectedChange.mockReset();
    render(<DataTable columns={columns} rows={rows} selectable selected={["r1"]} onSelectedChange={onSelectedChange} />, { wrapper });

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]);
    expect(onSelectedChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(boxes[0]);
    expect(onSelectedChange).toHaveBeenLastCalledWith(["r1", "r2", "r3"]);
    expect(two).toBeDefined();
  });

  it("clears the whole selection when every row is already checked", () => {
    const onSelectedChange = vi.fn();
    render(<DataTable columns={columns} rows={rows} selectable selected={["r1", "r2", "r3"]} onSelectedChange={onSelectedChange} />, {
      wrapper,
    });

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(onSelectedChange).toHaveBeenLastCalledWith([]);
  });

  it("names the select-all and row checkboxes for assistive tech", () => {
    render(<DataTable columns={columns} rows={rows} selectable selected={[]} onSelectedChange={vi.fn()} />, { wrapper });

    expect(screen.getByRole("checkbox", { name: "تحديد الكل" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "تحديد الصف" })).toHaveLength(3);
  });

  it("reports clicks, double clicks and context menus on a row", () => {
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    const onRowContext = vi.fn();
    render(
      <DataTable columns={columns} rows={rows} onRowClick={onRowClick} onRowDoubleClick={onRowDoubleClick} onRowContext={onRowContext} />,
      { wrapper },
    );
    const row = screen.getAllByRole("rowgroup")[1].querySelectorAll("tr")[1];

    fireEvent.click(row);
    fireEvent.doubleClick(row);
    fireEvent.contextMenu(row);

    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    expect(onRowDoubleClick).toHaveBeenCalledWith(rows[1]);
    expect(onRowContext).toHaveBeenCalledWith(expect.objectContaining({ type: "contextmenu" }), rows[1]);
  });

  it("keeps the row action button out of the row click", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={onRowClick}
        rowActions={(row) => <button type="button">{`حذف ${row.id}`}</button>}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: "حذف r2" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("uses a custom cell renderer and hides the value it replaces", () => {
    render(<DataTable columns={[{ key: "name", header: "الاسم", render: (r) => <strong>{`اسم ${r.id}`}</strong> }]} rows={[rows[0]]} />, {
      wrapper,
    });

    expect(screen.getByText("اسم r1")).toBeInTheDocument();
  });

  it("shows the skeleton while loading and the empty slot when there are no rows", () => {
    const view = render(<DataTable columns={columns} rows={rows} pageSize={2} loading />, { wrapper });
    expect(view.container.querySelectorAll(".skeleton")).toHaveLength(6);
    expect(screen.queryByRole("table")).toBeNull();

    view.unmount();
    const empty = render(<DataTable columns={columns} rows={[]} empty={<p>لا توجد وثائق</p>} />, { wrapper });
    expect(screen.getByText("لا توجد وثائق")).toBeInTheDocument();
    expect(empty.container.querySelector("table")).toBeNull();

    empty.unmount();
    render(<DataTable columns={columns} rows={[]} />, { wrapper });
    expect(screen.getByRole("columnheader", { name: /الاسم/ })).toBeInTheDocument();
  });

  it("goes back to the first page when the row count changes", () => {
    const view = render(<DataTable columns={columns} rows={rows} pageSize={2} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(bodyNames()).toEqual(["ج"]);

    view.rerender(<DataTable columns={columns} rows={rows.slice(0, 2)} pageSize={2} compact stickyHead />);

    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();
    expect(bodyNames()).toEqual(["ب", "أ"]);
  });

  it("uses the density setting unless the caller forces a mode", () => {
    localStorage.setItem("edas.v1.density", JSON.stringify("compact"));
    const { container } = render(<DataTable columns={columns} rows={[rows[0]]} />, { wrapper });
    expect(container.querySelector("tbody td")).toHaveClass("py-2");

    container.remove();
    const padded = render(<DataTable columns={columns} rows={[rows[0]]} compact={false} />, { wrapper });
    expect(padded.container.querySelector("tbody td")).toHaveClass("py-3");
  });

  it("jumps straight to a page number", () => {
    render(<DataTable columns={columns} rows={rows} pageSize={1} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(bodyNames()).toEqual(["ج"]);
    expect(screen.getByText("3 من 3 · 3 عنصر")).toBeInTheDocument();
  });

  it("selects a row when no selection was supplied yet", () => {
    const onSelectedChange = vi.fn();
    render(<DataTable columns={columns} rows={rows} selectable onSelectedChange={onSelectedChange} />, { wrapper });

    fireEvent.click(screen.getAllByRole("checkbox")[2]);

    expect(onSelectedChange).toHaveBeenCalledWith(["r2"]);
  });

  it("cycles a column back to ascending on the third click", () => {
    render(<DataTable columns={columns} rows={rows} />, { wrapper });

    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));
    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));
    fireEvent.click(screen.getByRole("columnheader", { name: /الحجم/ }));

    expect(bodyNames()).toEqual(["أ", "ج", "ب"]);
  });

  it("falls back to the given order when the sorted column disappears", () => {
    const view = render(<DataTable columns={columns} rows={rows} />, { wrapper });
    fireEvent.click(screen.getByRole("columnheader", { name: /الاسم/ }));
    expect(bodyNames()).toEqual(["أ", "ب", "ج"]);

    view.rerender(<DataTable columns={[columns[1]]} rows={rows} />);

    expect(bodyNames()).toEqual(["30", "10", "20"]);
  });
});

describe("RowMenu", () => {
  it("runs the chosen action and closes itself", () => {
    const onClick = vi.fn();
    render(
      <RowMenu
        items={[
          { label: "تعديل", onClick },
          { label: "حذف", onClick, danger: true },
        ]}
      />,
      { wrapper },
    );

    const trigger = screen.getByRole("button", { name: "خيارات الصف" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("menu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "حذف" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on the backdrop and toggles twice", () => {
    const { container } = render(<RowMenu items={[]} />, { wrapper });
    const trigger = screen.getByRole("button", { name: "خيارات الصف" });

    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(container.querySelector('[aria-hidden="true"].fixed.inset-0') as Element);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Toolbar, SectionTitle and Segmented", () => {
  it("wraps toolbar controls", () => {
    render(
      <Toolbar>
        <span>بحث</span>
      </Toolbar>,
      { wrapper },
    );

    expect(screen.getByText("بحث")).toBeInTheDocument();
  });

  it("renders a titled section with an action and an icon", () => {
    const { container } = render(
      <SectionTitle title="آخر النشاطات" icon={<span data-testid="icon" />} action={<button type="button">الكل</button>} />,
      { wrapper },
    );

    expect(screen.getByRole("heading", { name: "آخر النشاطات", level: 3 })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "الكل" })).toBeInTheDocument();
    expect(container.querySelector(".mb-3")).toBeInTheDocument();
  });

  it("reports the chosen segment and marks the active one", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: "list", label: "قائمة" },
          { value: "grid", label: "شبكة" },
        ]}
        value="list"
        onChange={onChange}
      />,
      {
        wrapper,
      },
    );

    expect(screen.getByRole("button", { name: "قائمة" })).toHaveClass("bg-white");
    expect(screen.getByRole("button", { name: "شبكة" })).not.toHaveClass("bg-white");

    fireEvent.click(screen.getByRole("button", { name: "شبكة" }));
    expect(onChange).toHaveBeenCalledWith("grid");
  });
});

describe("Timeline", () => {
  it("marks done, current and pending steps", () => {
    const { container } = render(
      <Timeline
        items={[
          { id: "1", title: "أُنشئت", time: "09:00", done: true },
          { id: "2", title: "قيد المراجعة", time: "10:00", current: true },
          { id: "3", title: "معتمدة", time: "11:00", subtitle: "بانتظار التوقيع" },
        ]}
      />,
      { wrapper },
    );

    expect(screen.getByText("أُنشئت")).toBeInTheDocument();
    expect(screen.getByText("بانتظار التوقيع")).toBeInTheDocument();
    expect(container.querySelectorAll(".lucide-check")).toHaveLength(1);
    expect(container.querySelectorAll(".bg-navy-600")).toHaveLength(1);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("uses a supplied icon in place of the index", () => {
    render(<Timeline items={[{ id: "1", title: "خطوة", time: "الآن", icon: <span data-testid="step-icon" /> }]} />, { wrapper });

    expect(screen.getByTestId("step-icon")).toBeInTheDocument();
  });
});

describe("MetaGrid, UserChip and Progress", () => {
  it("renders label and value pairs and an em dash for a missing value", () => {
    render(
      <MetaGrid
        items={[
          { label: "المالك", value: "سارة" },
          { label: "القسم", value: null },
        ]}
      />,
      { wrapper },
    );

    expect(screen.getByText("المالك")).toBeInTheDocument();
    expect(screen.getByText("سارة")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the user initials next to the name", () => {
    render(<UserChip name="سارة المطيري" initials="سم" color="bg-navy-600" />, { wrapper });

    expect(screen.getByText("سارة المطيري")).toBeInTheDocument();
    expect(screen.getByText("سم")).toBeInTheDocument();
  });

  it("clamps the progress bar between zero and one hundred", () => {
    const { container } = render(
      <div>
        <Progress value={42} />
        <Progress value={-5} color="bg-rose-500" className="h-1" />
        <Progress value={140} />
      </div>,
      { wrapper },
    );
    const bars = Array.from(container.querySelectorAll(".h-full"));

    expect(bars[0]).toHaveStyle({ width: "42%" });
    expect(bars[1]).toHaveStyle({ width: "0%" });
    expect(bars[1]).toHaveClass("bg-rose-500");
    expect(bars[2]).toHaveStyle({ width: "100%" });
  });
});

describe("downloadCsv", () => {
  let created: Blob[];

  beforeEach(() => {
    created = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return "blob:csv";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("does nothing without rows", () => {
    downloadCsv("empty.csv", []);

    expect(created).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("writes a BOM, quotes what needs quoting and revokes the url", async () => {
    downloadCsv("docs.csv", [
      { title: 'عقد "ألفا"', note: "سطر, بفاصلة" },
      { title: "محضر\nاجتماع", note: null },
    ]);

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();

    const bytes = new Uint8Array(await created[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await created[0].text();
    expect(text).toContain('title,note\n"عقد ""ألفا""","سطر, بفاصلة"\n"محضر\nاجتماع",');
  });

  it("removes the temporary anchor again", () => {
    downloadCsv("docs.csv", [{ a: 1 }]);

    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("downloads the given rows as CSV", async () => {
    render(<ExportMenu label="تصدير" rows={[{ a: 1 }, { a: 2 }]} filename="docs" />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("تم تنزيل CSV")).toBeInTheDocument();
    expect(screen.getByText("2 صف")).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("loads the rows lazily before exporting", async () => {
    const loadRows = vi.fn().mockResolvedValue([{ a: 1 }]);
    render(<ExportMenu rows={undefined} loadRows={loadRows} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("1 صف")).toBeInTheDocument();
    expect(loadRows).toHaveBeenCalledOnce();
  });

  it("tells the user when there is nothing to export", async () => {
    render(<ExportMenu rows={[]} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("لا توجد بيانات للتصدير")).toBeInTheDocument();
    expect(screen.getByText("لا توجد صفوف مطابقة للفلاتر الحالية.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports a failed load instead of exporting", async () => {
    const loadRows = vi.fn().mockRejectedValue(new Error("boom"));
    render(<ExportMenu loadRows={loadRows} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("تعذّر التصدير")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("prints from the menu and closes it", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<ExportMenu rows={[{ a: 1 }]} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));

    expect(print).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "طباعة" })).toBeNull();
  });

  it("closes when the backdrop is clicked", () => {
    const { container } = render(<ExportMenu rows={[{ a: 1 }]} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "تصدير" }));
    fireEvent.click(container.querySelector('[aria-hidden="true"].fixed.inset-0') as Element);

    expect(screen.queryByRole("button", { name: "CSV" })).toBeNull();
  });

  it("speaks English in the English interface", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<ExportMenu rows={[{ a: 1 }]} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("CSV downloaded")).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();
  });

  it("explains an empty English export", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<ExportMenu />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("Nothing to export")).toBeInTheDocument();
    expect(screen.getByText("No rows match the current filters.")).toBeInTheDocument();
  });

  it("reports an English load failure", async () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(<ExportMenu loadRows={() => Promise.reject(new Error("boom"))} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(await screen.findByText("Export failed")).toBeInTheDocument();
  });
});

describe("re-exports", () => {
  it("keeps the shared badge and empty-state aliases alive", async () => {
    const { EmptyState } = await import("./shared");

    render(
      <div>
        <Badge>جديد</Badge>
        <EmptyState title="لا شيء" />
      </div>,
      { wrapper },
    );

    expect(screen.getByText("جديد")).toBeInTheDocument();
    expect(screen.getAllByText("لا شيء").length).toBeGreaterThan(0);
  });
});
