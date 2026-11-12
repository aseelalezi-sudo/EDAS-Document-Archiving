import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document, FileType, FolderNode } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { AllDocuments } from "./documents-all";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
    return text;
  };
}

const base = {
  sectionId: "sec-1",
  ownerEn: "",
  tags: [],
  description: "",
  descriptionEn: "",
  versions: [],
  activity: [],
  sizeBytes: 1024,
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const docs: Document[] = [
  {
    ...base,
    id: "d1",
    docNo: "EDAS-2026001",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "contract",
    deptId: "legal",
    owner: "أمل",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: daysAgo(2),
    retentionEnd: "2031-01-01",
    retentionDays: 120,
    size: "1.2 MB",
    fileType: "pdf",
    folderId: "f-legal",
  },
  {
    ...base,
    id: "d2",
    docNo: "EDAS-2026002",
    title: "محضر اجتماع",
    titleEn: "Meeting minutes",
    category: "بريد وارد",
    categoryEn: "Incoming mail",
    categoryId: "incoming",
    deptId: "exec",
    owner: "سارة",
    version: "2.0",
    classification: "public",
    status: "pending",
    createdAt: "2026-02-01",
    modifiedAt: daysAgo(20),
    retentionEnd: "2026-12-01",
    retentionDays: 12,
    size: "640 KB",
    fileType: "office",
    folderId: "f-exec",
  },
  {
    ...base,
    id: "d3",
    docNo: "EDAS-2026003",
    title: "مخطط المشروع",
    titleEn: "Project drawing",
    category: "طلب شراء",
    categoryEn: "Purchase order",
    categoryId: "po",
    deptId: "eng",
    owner: "خالد",
    version: "3.1",
    classification: "restricted",
    status: "draft",
    createdAt: "2020-01-01",
    modifiedAt: daysAgo(400),
    retentionEnd: "2026-11-09",
    retentionDays: -3,
    size: "4 MB",
    fileType: "cad",
    folderId: "f-eng",
    checkedOutBy: "خالد",
  },
  {
    ...base,
    id: "d4",
    docNo: "EDAS-2026004",
    title: "صورة أرشيفية",
    titleEn: "Archived photo",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "contract",
    deptId: "legal",
    owner: "أمل",
    version: "1.0",
    classification: "confidential",
    status: "archived",
    createdAt: "2026-03-01",
    modifiedAt: daysAgo(60),
    retentionEnd: "2032-01-01",
    retentionDays: 45,
    size: "2 MB",
    fileType: "zip" as FileType,
    folderId: "f-legal",
  },
];

const folders: FolderNode[] = [
  {
    id: "f-legal",
    name: "المجلد القانوني",
    nameEn: "Legal folder",
    parentId: null,
    type: "dept",
    docs: 2,
    subfolders: 0,
    accessScope: "dept",
  },
  {
    id: "f-exec",
    name: "المجلد التنفيذي",
    nameEn: "Executive folder",
    parentId: null,
    type: "dept",
    docs: 1,
    subfolders: 0,
    accessScope: "dept",
  },
];

const departments = [
  { id: "legal", name: "الشؤون القانونية", nameEn: "Legal affairs" },
  { id: "exec", name: "الإدارة التنفيذية", nameEn: "Executive" },
  { id: "eng", name: "الهندسة", nameEn: "Engineering" },
];

interface AppOverrides {
  lang?: "ar" | "en";
  role?: string;
  toast?: ReturnType<typeof vi.fn>;
}

interface DocsOverrides {
  ready?: boolean;
  rows?: Document[];
  meta?: { loaded: number; total: number };
  loadingMore?: boolean;
  can?: (action: string, folderId: string, deptId?: string) => boolean;
  loadMoreDocuments?: ReturnType<typeof vi.fn>;
  archiveDocs?: ReturnType<typeof vi.fn>;
  deleteDocs?: ReturnType<typeof vi.fn>;
  checkIn?: ReturnType<typeof vi.fn>;
  checkOut?: ReturnType<typeof vi.fn>;
  moveDocs?: ReturnType<typeof vi.fn>;
  downloadDocument?: ReturnType<typeof vi.fn>;
}

function setup(app: AppOverrides = {}, overrides: DocsOverrides = {}) {
  const lang = app.lang ?? "ar";
  const toast = app.toast ?? vi.fn();
  const callbacks = {
    loadMoreDocuments: overrides.loadMoreDocuments ?? vi.fn(),
    archiveDocs: overrides.archiveDocs ?? vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    deleteDocs: overrides.deleteDocs ?? vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    checkIn: overrides.checkIn ?? vi.fn((_id: string, done: (ok: boolean) => void) => done(true)),
    checkOut: overrides.checkOut ?? vi.fn((_id: string, _by: string, done: (ok: boolean) => void) => done(true)),
    moveDocs: overrides.moveDocs ?? vi.fn((_ids: string[], _target: string, done: (ok: boolean) => void) => done(true)),
    downloadDocument: overrides.downloadDocument ?? vi.fn(),
  };
  const rows = overrides.rows ?? docs;

  mocks.app.mockReturnValue({
    t: translator(lang),
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    density: "comfortable",
    toast,
    user: { name: "سارة", department: "legal" },
    role: app.role ?? "system_admin",
  });
  mocks.docs.mockReturnValue({
    docs: rows,
    docsMeta: overrides.meta ?? { loaded: rows.length, total: rows.length },
    docsLoadingMore: overrides.loadingMore ?? false,
    docsReady: overrides.ready ?? true,
    scopedDocs: rows,
    can: overrides.can ?? (() => true),
    folders,
    departments: { items: departments },
    ...callbacks,
  });

  function Probe() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname}</p>;
  }

  const view = render(
    <MemoryRouter>
      <AllDocuments />
      <Probe />
    </MemoryRouter>,
  );

  return { ...view, toast, ...callbacks };
}

function bodyRows() {
  return Array.from(screen.getAllByRole("rowgroup")[1].querySelectorAll("tr"));
}

function openRowMenu(index: number, lang: "ar" | "en" = "ar") {
  const row = bodyRows()[index];
  fireEvent.click(within(row).getByRole("button", { name: (lang === "ar" ? AR : EN)["g.rowOptions"] }));
  return screen.getByRole("menu");
}

function bulkBar(lang: "ar" | "en" = "ar") {
  return screen.getByText((lang === "ar" ? AR : EN)["common.selected"]).parentElement as HTMLElement;
}

function columnsPanel(container: HTMLElement) {
  return container.querySelector("div.absolute.end-0.z-30") as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("loading and header", () => {
  it("shows the skeleton until the documents are ready", () => {
    const { container } = setup({}, { ready: false });

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(screen.getByText("جارٍ تحميل الوثائق…")).toHaveClass("sr-only");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(13);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("speaks English while loading", () => {
    setup({ lang: "en" }, { ready: false });

    expect(screen.getByText("Loading documents…")).toHaveClass("sr-only");
  });

  it("counts the filtered documents against the server total", () => {
    setup({}, { meta: { loaded: 4, total: 9 } });

    expect(screen.getByText(/4 من 9 وثيقة/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/المستودع المركزي/, { selector: "p" })).toBeInTheDocument();
  });

  it("falls back to the loaded documents when the server total is missing", () => {
    setup({}, { meta: { loaded: 0, total: 0 } });

    expect(screen.getByText(/4 من 4 وثيقة/, { selector: "p" })).toBeInTheDocument();
  });

  it("lists every document with its badges", () => {
    setup();

    expect(bodyRows()).toHaveLength(4);
    expect(within(bodyRows()[0]).getByText("EDAS-2026001")).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByText(AR["doc.status.approved"])).toBeInTheDocument();
    expect(within(bodyRows()[2]).getByText(AR["doc.classification.restricted"])).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: new RegExp(AR["doc.classification"]) }).length).toBe(1);
  });

  it("shows the retention column once it is enabled, warning on low and expired retention", () => {
    const { container } = setup();

    expect(screen.queryAllByRole("columnheader", { name: /نهاية الاحتفاظ/ })).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: AR["g.columns"] }));
    const retention = within(columnsPanel(container))
      .getAllByRole("checkbox")
      .find((box) => box.closest("label")?.textContent?.includes("نهاية الاحتفاظ"));
    fireEvent.click(retention as Element);

    expect(screen.getByText("2031-01-01")).toBeInTheDocument();
    expect(screen.getByText("2026-11-09")).toHaveClass("text-rose-500");
    expect(screen.getByText("2026-12-01")).toHaveClass("text-amber-600");
    expect(screen.getByText("2032-01-01")).toHaveClass("text-ink-400");
    expect(container.querySelectorAll(".lucide-triangle-alert")).toHaveLength(2);

    fireEvent.click(screen.getByRole("columnheader", { name: /نهاية الاحتفاظ/ }));
    expect(within(bodyRows()[0]).getByText(/20\d\d-\d\d-\d\d/)).toBeInTheDocument();
  });

  it("opens the create page from the header", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["doc.newDoc"] }));

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");
  });
});

describe("status overview", () => {
  it("shows a card per status with its share", () => {
    setup();

    const approved = screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent?.includes(AR["doc.status.approved"]));
    expect(approved).toBeDefined();
    expect(approved?.textContent).toContain("25%");
  });

  it("filters by a status card and clears it again", () => {
    setup();
    const card = screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "false" && b.textContent?.includes("معتمدة"));

    fireEvent.click(card as HTMLElement);
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { pressed: true }));
    expect(bodyRows()).toHaveLength(4);
  });

  it("filters from the status select and keeps only the populated statuses", () => {
    setup();

    const select = screen.getAllByRole("combobox")[0];
    expect(within(select).getAllByRole("option")).toHaveLength(5);

    fireEvent.change(select, { target: { value: "archived" } });

    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]).getByText("EDAS-2026004")).toBeInTheDocument();
  });
});

describe("search and chips", () => {
  it("matches the title, the document number and the owner", () => {
    setup();
    const input = screen.getByPlaceholderText("ابحث بالعنوان أو الرقم أو المالك…");

    fireEvent.change(input, { target: { value: "محضر" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(input, { target: { value: "EDAS-2026003" } });
    expect(within(bodyRows()[0]).getByText("مخطط المشروع")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "أمل" } });
    expect(bodyRows()).toHaveLength(2);
  });

  it("matches the English title and the body text without case", () => {
    setup();

    fireEvent.change(screen.getByPlaceholderText("ابحث بالعنوان أو الرقم أو المالك…"), { target: { value: "SUPPLY" } });
    expect(bodyRows()).toHaveLength(1);
  });

  it("clears the search from the inline button and from the chip", () => {
    const { container } = setup();
    const input = screen.getByPlaceholderText("ابحث بالعنوان أو الرقم أو المالك…");

    fireEvent.change(input, { target: { value: "عقد" } });
    fireEvent.click(container.querySelector(".end-3.top-1\\/2") as Element);
    expect(bodyRows()).toHaveLength(4);

    fireEvent.change(input, { target: { value: "عقد" } });
    const chip = screen.getByText(/🔍/).closest("span") as HTMLElement;
    fireEvent.click(within(chip).getByRole("button"));
    expect(bodyRows()).toHaveLength(4);
  });

  it("clears the status chip and everything at once", () => {
    setup();
    const select = screen.getAllByRole("combobox")[0];

    fireEvent.change(select, { target: { value: "pending" } });
    const chips = screen.getByText("نشط:").parentElement as HTMLElement;
    expect(chips).toHaveTextContent(AR["doc.status.pending"]);
    fireEvent.click(within(chips).getAllByRole("button")[0]);
    expect(bodyRows()).toHaveLength(4);

    fireEvent.change(select, { target: { value: "pending" } });
    fireEvent.change(screen.getByPlaceholderText("ابحث بالعنوان أو الرقم أو المالك…"), { target: { value: "عقد" } });
    fireEvent.click(screen.getByRole("button", { name: "مسح الكل" }));
    expect(bodyRows()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "مسح الكل" })).toBeNull();
  });
});

describe("advanced filters", () => {
  it("filters by department, classification, category, type and period", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "متقدمة" }));

    const selects = screen.getAllByRole("combobox");
    const [, fDept, fClass, fCat, fType, fPeriod] = selects;

    fireEvent.change(fDept, { target: { value: "legal" } });
    expect(bodyRows()).toHaveLength(2);

    fireEvent.change(fClass, { target: { value: "confidential" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText(/فلتر متقدم/).textContent).toBe("2 فلتر متقدم");

    fireEvent.change(fCat, { target: { value: "incoming" } });
    expect(screen.getByText(/فلتر متقدم/).textContent).toBe("3 فلتر متقدم");
    expect(screen.getByText("لا توجد وثائق مطابقة")).toBeInTheDocument();

    fireEvent.change(fDept, { target: { value: "all" } });
    fireEvent.change(fCat, { target: { value: "all" } });
    fireEvent.change(fClass, { target: { value: "all" } });
    expect(bodyRows()).toHaveLength(4);

    fireEvent.change(fType, { target: { value: "pdf" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(fType, { target: { value: "all" } });
    fireEvent.change(fPeriod, { target: { value: "week" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(fPeriod, { target: { value: "month" } });
    expect(bodyRows()).toHaveLength(2);

    fireEvent.change(fPeriod, { target: { value: "quarter" } });
    expect(bodyRows()).toHaveLength(3);
  });

  it("lists the categories and file types that actually occur", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "متقدمة" }));
    const [, , , fCat, fType] = screen.getAllByRole("combobox");

    const categoryNames = within(fCat)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(categoryNames).toEqual(["الكل", "مراسلات واردة", "عقد", "أمر شراء"]);

    const typeNames = within(fType)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(typeNames).toEqual(["الكل", "PDF", "Office", "DWG", "ZIP"]);
  });

  it("clears the advanced filters from the badge row", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "متقدمة" }));
    const [, fDept] = screen.getAllByRole("combobox");

    fireEvent.change(fDept, { target: { value: "legal" } });
    fireEvent.click(screen.getByRole("button", { name: "مسح المتقدمة" }));

    expect(bodyRows()).toHaveLength(4);
    expect(screen.queryByText(/فلتر متقدم/)).toBeNull();
  });

  it("hides and restores columns from the column menu", () => {
    const { container } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.columns"] }));
    const panel = columnsPanel(container);

    fireEvent.click(within(panel).getAllByRole("checkbox")[0]);
    expect(screen.queryAllByRole("columnheader", { name: new RegExp(AR["doc.docNo"]) })).toHaveLength(0);

    fireEvent.click(within(panel).getByRole("button", { name: "الكل" }));
    expect(screen.getAllByRole("columnheader", { name: new RegExp(AR["doc.docNo"]) })).toHaveLength(1);

    fireEvent.click(container.querySelector("[aria-hidden='true'].fixed.inset-0") as Element);
    expect(columnsPanel(container)).toBeNull();
  });
});

describe("views", () => {
  it("opens a document from its row", () => {
    setup();
    const row = bodyRows().find((candidate) => candidate.textContent?.includes("عقد التوريد")) as HTMLElement;

    fireEvent.click(row);

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("sorts by every visible column", () => {
    setup();
    const headers = screen
      .getAllByRole("columnheader")
      .filter((header) => header.querySelector("button") || header.textContent?.includes("⇅"));

    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((header) => fireEvent.click(header));

    expect(bodyRows()).toHaveLength(4);
  });

  it("switches to the grid view and opens a card", () => {
    const { container } = setup();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByText("EDAS-2026001").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("عقد التوريد"));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("previews and downloads from the grid card without opening it", () => {
    const downloadDocument = vi.fn();
    const { container } = setup({}, { downloadDocument });

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);
    fireEvent.click(screen.getAllByRole("button", { name: "عرض" })[0]);

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");

    container.querySelectorAll(".lucide-download").forEach((icon) => {
      const button = icon.closest("button");
      if (button?.getAttribute("aria-label") === AR["g.download"]) fireEvent.click(button);
    });
    expect(downloadDocument).toHaveBeenCalled();
  });

  it("shows the empty slot in the grid when the filters match nothing", () => {
    const { container } = setup();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);
    fireEvent.change(container.querySelector("input[placeholder]") as Element, { target: { value: "لا شيء" } });

    expect(screen.getByText("لا توجد وثائق مطابقة")).toBeInTheDocument();
  });

  it("groups the documents on the kanban board", () => {
    const { container } = setup();
    const icons = container.querySelectorAll(".lucide-columns-3");

    fireEvent.click(icons[icons.length - 1].closest("button") as Element);

    expect(screen.getAllByText("فارغ")).toHaveLength(1);
    expect(screen.getAllByText(AR["doc.status.hold"]).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("مخطط المشروع"));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d3");
  });
});

describe("row actions", () => {
  it("previews and opens the versions of a document", () => {
    setup();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: AR["g.preview"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: AR["doc.versions"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/versions");
  });

  it("edits a document", () => {
    setup();

    fireEvent.click(within(openRowMenu(1)).getByRole("menuitem", { name: AR["g.edit"] }));

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d2/edit");
  });

  it("checks a free document out and reports it", () => {
    const { toast, checkOut } = setup();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "حجز للتحرير" }));

    expect(checkOut).toHaveBeenCalledWith("d1", "سارة", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حجز الوثيقة للتحرير" }));
  });

  it("checks a locked document back in", () => {
    const { toast, checkIn } = setup();

    fireEvent.click(within(openRowMenu(2)).getByRole("menuitem", { name: "إعادة (تحرير)" }));

    expect(checkIn).toHaveBeenCalledWith("d3", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تحرير الوثيقة" }));
  });

  it("stays silent when the lock could not be released", () => {
    const { toast } = setup({}, { checkIn: vi.fn((_id: string, done: (ok: boolean) => void) => done(false)) });

    fireEvent.click(within(openRowMenu(2)).getByRole("menuitem", { name: "إعادة (تحرير)" }));

    expect(toast).not.toHaveBeenCalled();
  });

  it("hides edit and delete when the role forbids them", () => {
    setup({}, { can: (action) => action === "view" });

    const menu = openRowMenu(0);
    expect(within(menu).queryByRole("menuitem", { name: AR["g.edit"] })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: AR["g.delete"] })).toBeNull();
  });

  it("asks before deleting a single document and confirms", async () => {
    const { deleteDocs, toast } = setup();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: AR["g.delete"] }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("سيتم نقل 1 وثيقة");

    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "نقل إلى السلة" }));
  });
});

describe("bulk actions", () => {
  it("exports the selection as CSV", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { toast } = setup();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bar = bulkBar();
    expect(bar).toHaveTextContent("1");
    fireEvent.click(within(bar).getByRole("button", { name: AR["g.export"] }));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith({ type: "success", title: AR["g.export"] });
  });

  it("archives the selection", async () => {
    const { archiveDocs, toast } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getAllByRole("checkbox")[2]);

    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["doc.archiveNow"] }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("أرشفة الوثائق المحددة؟");

    fireEvent.click(within(dialog).getByRole("button", { name: AR["doc.archiveNow"] }));

    await waitFor(() => expect(archiveDocs).toHaveBeenCalledWith(["d1", "d2"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "2 وثيقة مؤرشفة" }));
    await waitFor(() => expect(screen.queryByText(AR["common.selected"])).toBeNull());
  });

  it("moves the selection to another folder", () => {
    const { moveDocs, toast } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["common.move"] }));
    const dialog = screen.getByRole("dialog", { name: "نقل 1 وثيقة" });
    const confirm = within(dialog).getByRole("button", { name: AR["common.move"] });
    expect(confirm).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "المجلد التنفيذي" }));
    fireEvent.click(confirm);

    expect(moveDocs).toHaveBeenCalledWith(["d1"], "f-exec", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "1 → المجلد التنفيذي" }));
  });

  it("keeps the bulk bar silent when the server refuses", async () => {
    const { toast, archiveDocs, deleteDocs, moveDocs } = setup(
      {},
      {
        archiveDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(false)),
        deleteDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(false)),
        moveDocs: vi.fn((_ids: string[], _t: string, done: (ok: boolean) => void) => done(false)),
      },
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["doc.archiveNow"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["doc.archiveNow"] }));
    await waitFor(() => expect(archiveDocs).toHaveBeenCalled());

    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["g.delete"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));
    await waitFor(() => expect(deleteDocs).toHaveBeenCalled());

    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["common.move"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "المجلد القانوني" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["common.move"] }));
    await waitFor(() => expect(moveDocs).toHaveBeenCalled());

    expect(toast).not.toHaveBeenCalled();
  });

  it("clears the selection from the bar", () => {
    setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText(AR["common.selected"])).toBeInTheDocument();

    fireEvent.click(within(bulkBar()).getAllByRole("button").at(-1) as Element);

    expect(screen.queryByText(AR["common.selected"])).toBeNull();
  });

  it("closes the confirm dialog without acting", () => {
    const { archiveDocs } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["doc.archiveNow"] }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["confirm.no"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(archiveDocs).not.toHaveBeenCalled();
  });

  it("closes the move dialog without moving", () => {
    const { moveDocs } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(within(bulkBar()).getByRole("button", { name: AR["common.move"] }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.cancel"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(moveDocs).not.toHaveBeenCalled();
  });
});

describe("scope and paging", () => {
  it("explains the scoped view to department roles", () => {
    setup({ role: "dept_manager" });

    const banner = screen.getByText(/تُعرض وثائق قسمك/).closest("div") as HTMLElement;
    expect(banner).toHaveTextContent("الشؤون القانونية");
  });

  it.each(["employee", "supervisor"])("scopes the view for the %s role", (role) => {
    setup({ role });

    expect(screen.getByText(/عرض مُقيّد بصلاحياتك/)).toBeInTheDocument();
  });

  it("hides the scope banner from administrators", () => {
    setup({ role: "system_admin" });

    expect(screen.queryByText(/عرض مُقيّد بصلاحياتك/)).toBeNull();
  });

  it("loads the next page of documents", () => {
    const { loadMoreDocuments } = setup({}, { meta: { loaded: 4, total: 12 } });

    expect(screen.getByText("تم تحميل 4 من 12 وثيقة.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد" }));

    expect(loadMoreDocuments).toHaveBeenCalledOnce();
  });

  it("marks the paging banner while the next page is loading", () => {
    setup({}, { meta: { loaded: 4, total: 12 }, loadingMore: true });

    expect(screen.getByRole("button", { name: "جارٍ التحميل…" })).toBeDisabled();
  });
});

describe("empty results", () => {
  it("offers to clear the filters and to upload a document", () => {
    setup({}, { rows: [] });

    expect(screen.getByText("لا توجد وثائق مطابقة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مسح الفلاتر" })).toBeInTheDocument();

    const createButtons = screen.getAllByRole("button", { name: AR["doc.newDoc"] });
    fireEvent.click(createButtons[createButtons.length - 1]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");
  });

  it("clears the search and the status from the empty slot", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("ابحث بالعنوان أو الرقم أو المالك…"), { target: { value: "لا شيء" } });
    expect(screen.getByText("لا توجد وثائق مطابقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));

    expect(bodyRows()).toHaveLength(4);
  });
});

describe("English interface", () => {
  it("translates the counts, the chips and the kanban", () => {
    const { container } = setup({ lang: "en" }, { meta: { loaded: 4, total: 7 } });

    expect(screen.getByText(/4 of 7 documents/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search title, number, owner…")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search title, number, owner…"), { target: { value: "archived" } });
    expect(screen.getByText("Active:")).toBeInTheDocument();

    const icons = container.querySelectorAll(".lucide-columns-3");
    fireEvent.click(icons[icons.length - 1].closest("button") as Element);
    expect(screen.getAllByText("Empty")).toHaveLength(4);
  });

  it("translates the confirm dialog of a bulk delete", () => {
    setup({ lang: "en" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(within(bulkBar("en")).getByRole("button", { name: EN["g.delete"] }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Move selected documents to trash?");
    expect(screen.getByRole("dialog")).toHaveTextContent("1 document(s) will be moved to trash.");
  });

  it("translates the row actions and the move dialog", () => {
    setup({ lang: "en" });
    const menu = openRowMenu(0, "en");

    expect(within(menu).getByRole("menuitem", { name: "Check-out (lock)" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: EN["g.edit"] })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Check-out (lock)" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("translates the scoped banner and the paging notice", () => {
    setup({ lang: "en", role: "supervisor" }, { meta: { loaded: 2, total: 5 } });

    expect(screen.getByText(/Scoped view — showing documents of your department/)).toBeInTheDocument();
    expect(screen.getByText("Loaded 2 of 5 documents.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });
});
