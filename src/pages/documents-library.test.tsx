import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import { config } from "../config";
import type { Document, FolderNode } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { Library } from "./documents-library";

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
  category: "عقود",
  categoryEn: "Contracts",
  categoryId: "contract",
  version: "1.0",
};

const docs: Document[] = [
  {
    ...base,
    id: "d1",
    docNo: "EDAS-2026001",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    deptId: "legal",
    owner: "أمل",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-11-01",
    retentionEnd: "2031-01-01",
    retentionDays: 120,
    size: "1.0 MB",
    sizeBytes: 1048576,
    fileType: "pdf",
    folderId: "root",
    content: "نص العقد الكامل",
  },
  {
    ...base,
    id: "d2",
    docNo: "EDAS-2026002",
    title: "محضر اجتماع",
    titleEn: "Meeting minutes",
    deptId: "exec",
    owner: "سارة",
    classification: "public",
    status: "pending",
    createdAt: "2026-02-01",
    modifiedAt: "2026-10-01",
    retentionEnd: "2026-12-01",
    retentionDays: 12,
    size: "2 KB",
    sizeBytes: 2048,
    fileType: "office",
    folderId: "root",
    checkedOutBy: "خالد",
  },
  {
    ...base,
    id: "d3",
    docNo: "EDAS-2026003",
    title: "مخطط المشروع",
    titleEn: "Project drawing",
    deptId: "eng",
    owner: "خالد",
    classification: "restricted",
    status: "draft",
    createdAt: "2026-03-01",
    modifiedAt: "2026-09-01",
    retentionEnd: "2027-01-01",
    retentionDays: 300,
    size: "1 KB",
    sizeBytes: 1024,
    fileType: "cad",
    folderId: "f-legal",
    description: "وصف المخطط",
    signatureStatus: "signed",
    signedBy: "مدير الإدارة",
  },
  {
    ...base,
    id: "d4",
    docNo: "EDAS-2026004",
    title: "ملحق سري",
    titleEn: "Secret annex",
    deptId: "legal",
    owner: "أمل",
    classification: "confidential",
    status: "archived",
    createdAt: "2026-04-01",
    modifiedAt: "2026-08-01",
    retentionEnd: "2027-02-01",
    retentionDays: 400,
    size: "3 KB",
    sizeBytes: 3072,
    fileType: "pdf",
    folderId: "f-sub",
  },
  {
    ...base,
    id: "d5",
    docNo: "EDAS-2026005",
    title: "مذكرة داخلية",
    titleEn: "Internal memo",
    deptId: "legal",
    owner: "منى",
    classification: "internal",
    status: "approved",
    createdAt: "2026-05-01",
    modifiedAt: "2026-10-15",
    retentionEnd: "2027-03-01",
    retentionDays: 500,
    size: "4 KB",
    fileType: "text",
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
    owner: "legal",
    docs: 2,
    subfolders: 2,
    accessScope: "قسمي",
  },
  {
    id: "f-eng",
    name: "مجلد المشروع",
    nameEn: "Project folder",
    parentId: null,
    type: "project",
    owner: "eng",
    docs: 0,
    subfolders: 0,
    accessScope: "عام",
  },
  {
    id: "f-arc",
    name: "أرشيف 2020",
    nameEn: "Archive 2020",
    parentId: "root",
    type: "archive",
    owner: "pmo",
    docs: 0,
    subfolders: 0,
    accessScope: "خاص",
  },
  {
    id: "f-shared",
    name: "مجلد مشترك",
    nameEn: "Shared folder",
    parentId: "root",
    type: "shared",
    owner: "exec",
    docs: 2,
    subfolders: 0,
    accessScope: "عام",
  },
  {
    id: "f-sub",
    name: "مجلد فرعي",
    nameEn: "Sub folder",
    parentId: "f-legal",
    type: "dept",
    owner: "legal",
    docs: 1,
    subfolders: 0,
    accessScope: "قسمي",
  },
  {
    id: "f-empty",
    name: "مجلد بلا محتوى",
    nameEn: "",
    parentId: "f-legal",
    type: "shared",
    owner: "ops",
    docs: 0,
    subfolders: 0,
    accessScope: "عام",
  },
];

interface AppOverrides {
  lang?: "ar" | "en";
  role?: string;
  department?: string | null;
  userName?: string | null;
  anonymous?: boolean;
  toast?: ReturnType<typeof vi.fn>;
}

interface DocsOverrides {
  ready?: boolean;
  rows?: Document[];
  tree?: FolderNode[];
  allowedTypes?: string;
  maxFileSize?: string;
  addFolder?: ReturnType<typeof vi.fn>;
  renameFolder?: ReturnType<typeof vi.fn>;
  deleteFolder?: ReturnType<typeof vi.fn>;
  createDocument?: ReturnType<typeof vi.fn>;
  archiveDocs?: ReturnType<typeof vi.fn>;
  deleteDocs?: ReturnType<typeof vi.fn>;
  checkIn?: ReturnType<typeof vi.fn>;
  checkOut?: ReturnType<typeof vi.fn>;
  moveDocs?: ReturnType<typeof vi.fn>;
  addHold?: ReturnType<typeof vi.fn>;
}

function setup(app: AppOverrides = {}, overrides: DocsOverrides = {}) {
  const lang = app.lang ?? "ar";
  const toast = app.toast ?? vi.fn();
  const rows = overrides.rows ?? docs;
  const tree = overrides.tree ?? folders;
  const callbacks = {
    addFolder: overrides.addFolder ?? vi.fn().mockResolvedValue(true),
    renameFolder: overrides.renameFolder ?? vi.fn().mockResolvedValue(true),
    deleteFolder: overrides.deleteFolder ?? vi.fn().mockResolvedValue(true),
    createDocument: overrides.createDocument ?? vi.fn().mockResolvedValue("new-doc"),
    downloadDocument: vi.fn().mockResolvedValue(undefined),
    archiveDocs: overrides.archiveDocs ?? vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    deleteDocs: overrides.deleteDocs ?? vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    checkIn: overrides.checkIn ?? vi.fn((_id: string, done: (ok: boolean) => void) => done(true)),
    checkOut: overrides.checkOut ?? vi.fn((_id: string, _by: string, done: (ok: boolean) => void) => done(true)),
    moveDocs: overrides.moveDocs ?? vi.fn((_ids: string[], _target: string, done: (ok: boolean) => void) => done(true)),
    addHold: overrides.addHold ?? vi.fn().mockResolvedValue(true),
  };

  mocks.app.mockReturnValue({
    t: translator(lang),
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    density: "comfortable",
    toast,
    user: app.anonymous
      ? null
      : { name: app.userName === undefined ? "سارة" : app.userName, department: app.department === undefined ? "legal" : app.department },
    role: app.role ?? "archivist",
  });
  mocks.docs.mockReturnValue({
    folders: tree,
    visibleFolders: tree,
    scopedDocs: rows,
    docsReady: overrides.ready ?? true,
    systemSettings: { allowedTypes: overrides.allowedTypes ?? "pdf,docx", maxFileSize: overrides.maxFileSize ?? "50" },
    ...callbacks,
  });

  function Probe() {
    const location = useLocation();
    return (
      <p data-testid="location">
        {location.pathname}
        {location.search}
        {location.state ? `|${JSON.stringify(location.state)}` : ""}
      </p>
    );
  }

  const view = render(
    <MemoryRouter>
      <Library />
      <Probe />
    </MemoryRouter>,
  );

  return { ...view, toast, ...callbacks };
}

function bodyRows() {
  return Array.from(screen.getAllByRole("rowgroup")[1].querySelectorAll("tr"));
}

function grid(container: HTMLElement) {
  return container.querySelector(".grid.auto-rows-fr") as HTMLElement;
}

function folderCard(container: HTMLElement, name: string) {
  const card = within(grid(container))
    .getAllByRole("button")
    .find((button) => button.className.includes("flex-col") && button.textContent?.includes(name));
  if (!card) throw new Error(`folder card not found: ${name}`);
  return card;
}

function folderOption(container: HTMLElement, name: string, lang: "ar" | "en" = "ar") {
  return within(grid(container)).getByRole("button", {
    name: `${(lang === "ar" ? AR : EN)["g.folderOptions"]} — ${name}`,
  });
}

function detailsPanel(container: HTMLElement) {
  return container.querySelector(".w-72") as HTMLElement | null;
}

function fileInput(container: HTMLElement) {
  return container.querySelector("input[type='file']") as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("loading", () => {
  it("shows the skeleton until the store is ready", () => {
    const { container } = setup({}, { ready: false });

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(screen.getByText("جارٍ تحميل المكتبة…")).toHaveClass("sr-only");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(9);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("speaks English while loading", () => {
    setup({ lang: "en" }, { ready: false });

    expect(screen.getByText("Loading library…")).toHaveClass("sr-only");
  });
});

describe("root view", () => {
  it("lists the root subfolders and documents", () => {
    const { container } = setup();

    expect(screen.getByText("المجلدات الفرعية (4)")).toBeInTheDocument();
    expect(within(grid(container)).getByText("المجلد القانوني")).toBeInTheDocument();
    expect(within(grid(container)).getByText("مجلد المشروع")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("5 وثيقة إجمالاً")).toBeInTheDocument();
  });

  it("summarises the folder in the footer", () => {
    setup();

    expect(screen.getByText(/في هذا المجلد/).closest("span")).toHaveTextContent("1.0 MB");
    expect(screen.getByText("وضع تجريبي — بيانات محلية")).toBeInTheDocument();
    expect(screen.getByText("4", { selector: "strong" })).toBeInTheDocument();
  });

  it("shows the scoped banner for department roles and falls back without a department", () => {
    const first = setup({ role: "employee" });
    expect(screen.getByText(/نطاق العرض/)).toHaveTextContent("الشؤون القانونية");
    first.unmount();

    setup({ role: "supervisor", department: null });
    expect(screen.getByText(/نطاق العرض/)).toHaveTextContent("غير مرتبط بإدارة");
  });

  it("hides the scoped banner from the archivist", () => {
    setup({ role: "archivist" });

    expect(screen.queryByText(/نطاق العرض/)).toBeNull();
  });

  it("welcomes the new folder dialog from the empty state and uploads from it", () => {
    setup({}, { rows: [] });
    const uploadButtons = screen.getAllByRole("button", { name: AR["doc.upload"] });

    fireEvent.click(uploadButtons[1]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");

    fireEvent.click(screen.getByRole("button", { name: "مجلد فرعي" }));
    expect(screen.getByRole("dialog", { name: "مجلد جديد" })).toBeInTheDocument();
  });

  it("widens the tree while the splitter is dragged", () => {
    setup();
    const splitter = screen.getByRole("separator") as HTMLElement;
    const tree = splitter.previousElementSibling as HTMLElement;

    splitter.setPointerCapture = vi.fn();
    fireEvent.pointerDown(splitter, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 260, pointerId: 1 });
    fireEvent.pointerUp(splitter, { pointerId: 1 });

    expect(tree.style.width).toBe("296px");
  });

  it("clamps the tree width at both ends", () => {
    setup({ lang: "en" });
    const splitter = screen.getByRole("separator") as HTMLElement;
    const tree = splitter.previousElementSibling as HTMLElement;
    expect(tree.style.width).toBe("256px");

    splitter.setPointerCapture = vi.fn();
    fireEvent.pointerDown(splitter, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter, { clientX: 260, pointerId: 1 });
    expect(tree.style.width).toBe("296px");

    fireEvent.pointerMove(splitter, { clientX: 10000, pointerId: 1 });
    expect(tree.style.width).toBe("180px");

    fireEvent.pointerMove(splitter, { clientX: -10000, pointerId: 1 });
    expect(tree.style.width).toBe("420px");
    fireEvent.pointerUp(splitter, { pointerId: 1 });
  });

  it("treats an anonymous session as unlinked to a department", () => {
    const { checkOut } = setup({ anonymous: true, role: "employee" });

    expect(screen.getByText(/نطاق العرض/)).toHaveTextContent("غير مرتبط بإدارة");

    fireEvent.click(within(bodyRows()[0]).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حجز للتحرير" }));

    expect(checkOut).toHaveBeenCalledWith("d1", "", expect.any(Function));
  });

  it("renders a folder that has no owner with the neutral colour", () => {
    const tree: FolderNode[] = [
      ...folders,
      {
        id: "f-orphan",
        name: "مجلد بلا مالك",
        nameEn: "Orphan folder",
        parentId: null,
        type: "shared",
        owner: "",
        docs: 0,
        subfolders: 0,
        accessScope: "عام",
      },
    ];
    const { container } = setup({}, { tree });

    expect(within(grid(container)).getByText("مجلد بلا مالك")).toBeInTheDocument();
    expect(screen.getByText("المجلدات الفرعية (5)")).toBeInTheDocument();
  });

  it("labels the footer with the API mode when the API is configured", () => {
    config.useApi = true;
    try {
      const arabic = setup();
      expect(screen.getByText("وضع API")).toBeInTheDocument();
      arabic.unmount();

      setup({ lang: "en" });
      expect(screen.getByText("API mode")).toBeInTheDocument();
    } finally {
      config.useApi = false;
    }
  });

  it("falls back to a dash when no size limit is configured", () => {
    setup({}, { maxFileSize: "" });

    expect(screen.getByText(/— ميغابايت/)).toBeInTheDocument();
  });

  it("uploads from the header into the root or into the open folder", () => {
    const { container } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: AR["doc.upload"] })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new");
    expect(screen.getByTestId("location")).not.toHaveTextContent("folder=");

    fireEvent.click(folderCard(container, "المجلد القانوني"));
    fireEvent.click(screen.getAllByRole("button", { name: AR["doc.upload"] })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new?folder=f-legal");
  });
});

describe("navigation between folders", () => {
  it("opens a folder from its card and narrows the documents", () => {
    const { container } = setup();

    fireEvent.click(folderCard(container, "المجلد القانوني"));

    expect(screen.getByText("2 وثيقة")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("المجلدات الفرعية (2)")).toBeInTheDocument();
    expect(within(grid(container)).getByText("مجلد فرعي")).toBeInTheDocument();
    expect(within(grid(container)).getByText("مجلد بلا محتوى")).toBeInTheDocument();
  });

  it("opens a folder from the mobile selector", () => {
    setup();

    fireEvent.change(screen.getByLabelText("اختيار مجلد"), { target: { value: "f-legal" } });

    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("المجلد القانوني", { selector: "nav *" })).toBeInTheDocument();
  });

  it("opens a folder from the tree panel", () => {
    const { container } = setup();
    const tree = container.querySelector("div.hidden.w-64") as HTMLElement;

    const node = within(tree)
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("المجلد القانوني"));
    fireEvent.click(node as HTMLElement);

    expect(screen.getByText("2 وثيقة")).toBeInTheDocument();
  });

  it("opens the folder details on a double click", () => {
    const { container } = setup();

    fireEvent.doubleClick(folderCard(container, "مجلد المشروع"));

    expect(screen.getByTestId("location")).toHaveTextContent("/library/folders/f-eng");
  });

  it("disables the permissions button at the root and enables it inside a folder", () => {
    const { container } = setup();
    const permissions = screen.getByRole("button", { name: "الصلاحيات" });

    expect(permissions).toBeDisabled();
    expect(permissions).toHaveAttribute("title", "اختر مجلداً لإدارة صلاحياته");

    fireEvent.click(folderCard(container, "المجلد القانوني"));
    fireEvent.click(screen.getByRole("button", { name: "الصلاحيات" }));

    expect(screen.getByTestId("location")).toHaveTextContent('/library/folders/f-legal|{"tab":"permissions"}');
  });

  it("explains an empty root and an empty folder", () => {
    const empty = setup({}, { rows: [] });
    expect(screen.getByText("لا توجد وثائق في جذر المكتبة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مجلد فرعي" })).toBeInTheDocument();
    empty.unmount();

    const filled = setup({}, { rows: [docs[0]] });
    fireEvent.click(folderCard(filled.container, "مجلد المشروع"));
    expect(screen.getByText("هذا المجلد فارغ")).toBeInTheDocument();
  });

  it("uploads into the empty folder from its empty state", () => {
    const { container } = setup();

    fireEvent.click(folderCard(container, "مجلد المشروع"));
    const uploadButtons = screen.getAllByRole("button", { name: AR["doc.upload"] });
    fireEvent.click(uploadButtons[1]);

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new?folder=f-eng");
  });
});

describe("listing, sorting and search", () => {
  it("sorts by name, recency and size", () => {
    const { container } = setup();
    fireEvent.click(folderCard(container, "المجلد القانوني"));
    const sort = screen.getByDisplayValue("ترتيب: الاسم");

    expect(within(bodyRows()[0]).getByText("مخطط المشروع")).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText("مذكرة داخلية")).toBeInTheDocument();

    fireEvent.change(sort, { target: { value: "recent" } });
    expect(within(bodyRows()[0]).getByText("مذكرة داخلية")).toBeInTheDocument();

    fireEvent.change(sort, { target: { value: "size" } });
    expect(within(bodyRows()[0]).getByText("مخطط المشروع")).toBeInTheDocument();
  });

  it("treats a missing size as zero when sorting by size", () => {
    const rows: Document[] = [
      { ...docs[4], id: "d5r", docNo: "EDAS-2026007", title: "بلا حجم", folderId: "root" },
      { ...docs[0], id: "d1r", docNo: "EDAS-2026008", folderId: "root" },
    ];
    setup({}, { rows });

    fireEvent.change(screen.getByDisplayValue("ترتيب: الاسم"), { target: { value: "size" } });

    expect(within(bodyRows()[0]).getByText("عقد التوريد")).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText("بلا حجم")).toBeInTheDocument();
  });

  it("filters by title, English title, number and owner", () => {
    setup();
    const search = screen.getByPlaceholderText("بحث في هذا المجلد…");

    fireEvent.change(search, { target: { value: "عقد" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(search, { target: { value: "MINUTES" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(search, { target: { value: "2026001" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(search, { target: { value: "سارة" } });
    expect(bodyRows()).toHaveLength(1);

    fireEvent.change(search, { target: { value: "   " } });
    expect(bodyRows()).toHaveLength(2);
  });

  it("opens a document from its title button and previews it on a row double click", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /عقد التوريد/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");

    fireEvent.doubleClick(bodyRows()[1]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("blocks the browser menu over the document table", () => {
    setup();
    const table = screen.getByRole("table");
    const event = createEvent.contextMenu(table);

    fireEvent(table, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("shows the details panel of the active row and hides it again", () => {
    const { container } = setup();

    fireEvent.click(bodyRows()[0]);
    const panel = detailsPanel(container) as HTMLElement;
    expect(within(panel).getByText("معاينة", { selector: "span" })).toBeInTheDocument();
    expect(within(panel).getByText("EDAS-2026001")).toBeInTheDocument();
    expect(within(panel).getByText("v1.0")).toBeInTheDocument();
    expect(within(panel).getByText("PDF")).toBeInTheDocument();

    fireEvent.click(container.querySelector(".lucide-columns-3")?.closest("button") as Element);
    expect(detailsPanel(container)).toBeNull();

    fireEvent.click(bodyRows()[0]);
    fireEvent.click(container.querySelector(".lucide-columns-3")?.closest("button") as Element);
    fireEvent.click(within(detailsPanel(container) as HTMLElement).getByRole("button", { name: AR["g.preview"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");
  });

  it("downloads from the details panel", () => {
    const { container, downloadDocument } = setup();

    fireEvent.click(bodyRows()[0]);
    fireEvent.click(within(detailsPanel(container) as HTMLElement).getByRole("button", { name: AR["g.download"] }));

    expect(downloadDocument).toHaveBeenCalledWith("d1");
  });

  it("adds the lock and signature lines to the details panel", () => {
    const first = setup();
    fireEvent.click(bodyRows()[1]);
    const lockedPanel = detailsPanel(first.container) as HTMLElement;
    expect(within(lockedPanel).getByText("محجوزة")).toBeInTheDocument();
    expect(within(lockedPanel).getByText("خالد")).toBeInTheDocument();
    first.unmount();

    const second = setup();
    fireEvent.click(folderCard(second.container, "المجلد القانوني"));
    fireEvent.click(bodyRows()[0]);
    const signedPanel = detailsPanel(second.container) as HTMLElement;
    expect(within(signedPanel).getByText("موقّعة")).toBeInTheDocument();
    expect(within(signedPanel).getByText("مدير الإدارة")).toBeInTheDocument();
  });
});

describe("grid view", () => {
  it("switches to cards and opens a document", () => {
    const { container } = setup();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);

    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByText("عقد التوريد"));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("opens the context menu from a card right click", () => {
    const { container } = setup();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);
    fireEvent.contextMenu(screen.getByText("عقد التوريد"));

    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "فتح التفاصيل" })).toBeInTheDocument();
  });

  it("previews and downloads from the card without navigating", () => {
    const { container, downloadDocument } = setup();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);
    fireEvent.click(screen.getAllByRole("button", { name: "عرض" })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");

    const download = screen
      .getAllByRole("button")
      .find((button) => button.querySelector(".lucide-download") && !button.textContent?.trim());
    fireEvent.click(download as HTMLElement);
    expect(downloadDocument).toHaveBeenCalledWith("d1");
  });
});

describe("folder context menu", () => {
  it("opens the same menu from a right click on the card", () => {
    const { container } = setup();

    fireEvent.contextMenu(folderCard(container, "المجلد القانوني"));

    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "فتح المجلد" })).toBeInTheDocument();
  });

  it("opens a folder from its menu", () => {
    const { container } = setup();

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "فتح المجلد" }));

    expect(screen.getByText("2 وثيقة")).toBeInTheDocument();
  });

  it("navigates to the details, the permissions and the upload page from the menu", () => {
    const { container } = setup();

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "تفاصيل المجلد" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/library/folders/f-legal");
    expect(screen.getByTestId("location")).not.toHaveTextContent("permissions");

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "الصلاحيات" }));
    expect(screen.getByTestId("location")).toHaveTextContent('/library/folders/f-legal|{"tab":"permissions"}');

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "ارفع هنا" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/new?folder=f-legal");
  });

  it("creates a subfolder from the menu and follows it", async () => {
    const { container, addFolder } = setup();

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "مجلد فرعي جديد" }));
    const dialog = screen.getByRole("dialog", { name: "مجلد جديد" });

    fireEvent.change(within(dialog).getByPlaceholderText("مجلد جديد"), { target: { value: "مجلد جديد تمامًا" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() => expect(addFolder).toHaveBeenCalledWith(expect.objectContaining({ name: "مجلد جديد تمامًا", parentId: "f-legal" })));
    await waitFor(() => expect(screen.getByText("2 وثيقة")).toBeInTheDocument());
  });

  it("renames a folder from its menu", async () => {
    const { container, renameFolder, toast } = setup();

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة التسمية" }));
    const dialog = screen.getByRole("dialog", { name: "إعادة تسمية المجلد" });

    fireEvent.change(within(dialog).getByDisplayValue("أرشيف 2020"), { target: { value: "أرشيف 2021" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() => expect(renameFolder).toHaveBeenCalledWith("f-arc", { name: "أرشيف 2021" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت إعادة التسمية" }));
  });

  it("keeps the rename dialog open when the server refuses", async () => {
    const { container, toast } = setup({}, { renameFolder: vi.fn().mockResolvedValue(false) });

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة التسمية" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.save"] }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "إعادة تسمية المجلد" })).toBeInTheDocument());
    expect(toast).not.toHaveBeenCalled();
  });

  it("closes the rename dialog without saving", () => {
    const { container, renameFolder } = setup();

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة التسمية" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "اسم آخر" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.cancel"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(renameFolder).not.toHaveBeenCalled();
  });

  it("does not rename when the name is blank", async () => {
    const { container, renameFolder } = setup();

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة التسمية" }));
    const dialog = screen.getByRole("dialog", { name: "إعادة تسمية المجلد" });

    fireEvent.change(within(dialog).getByDisplayValue("أرشيف 2020"), { target: { value: "  " } });
    fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Enter" });

    await waitFor(() => expect(renameFolder).not.toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "إعادة تسمية المجلد" })).toBeInTheDocument();
  });

  it("ignores keys other than Enter in the rename input", () => {
    const { container, renameFolder } = setup();

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة التسمية" }));
    const input = within(screen.getByRole("dialog")).getByRole("textbox");

    fireEvent.change(input, { target: { value: "اسم آخر" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(renameFolder).not.toHaveBeenCalled();
  });

  it("deletes an empty folder after a confirmation", async () => {
    const { container, deleteFolder, toast } = setup();

    fireEvent.click(folderOption(container, "مجلد المشروع"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حذف المجلد" }));
    const confirm = screen.getByRole("dialog", { name: "حذف هذا المجلد؟" });
    expect(confirm).toHaveTextContent("«مجلد المشروع»");

    fireEvent.click(within(confirm).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("f-eng"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حذف المجلد" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns to the root after deleting the folder being browsed", async () => {
    const { container, deleteFolder } = setup();
    const tree = container.querySelector("div.hidden.w-64") as HTMLElement;

    fireEvent.click(tree.querySelector(".lucide-chevron-down") as Element);
    const emptyNode = within(tree)
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("مجلد بلا محتوى"));
    fireEvent.click(emptyNode as HTMLElement);
    expect(screen.getByText("هذا المجلد فارغ")).toBeInTheDocument();

    fireEvent.click(within(tree).getByRole("button", { name: `${AR["g.folderOptions"]} — مجلد بلا محتوى` }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حذف المجلد" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "حذف هذا المجلد؟" })).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("f-empty"));
    await waitFor(() => expect(screen.getByText("المجلدات الفرعية (4)")).toBeInTheDocument());
  });

  it("keeps the folder when the delete is refused", async () => {
    const { container, toast } = setup({}, { deleteFolder: vi.fn().mockResolvedValue(false) });

    fireEvent.click(folderOption(container, "مجلد المشروع"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حذف المجلد" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("المجلدات الفرعية (4)")).toBeInTheDocument();
  });

  it("offers no delete for a folder that still holds documents", () => {
    const { container } = setup();

    fireEvent.click(folderOption(container, "المجلد القانوني"));
    const menu = screen.getByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "إعادة التسمية" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "حذف المجلد" })).toBeNull();
  });

  it("hides rename and delete from roles that cannot manage folders", () => {
    const { container } = setup({ role: "employee" });

    fireEvent.click(folderOption(container, "أرشيف 2020"));
    const menu = screen.getByRole("menu");

    expect(within(menu).queryByRole("menuitem", { name: "إعادة التسمية" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "حذف المجلد" })).toBeNull();
  });
});

describe("creating folders", () => {
  it("creates a folder at the root with the chosen type and scope", async () => {
    const { addFolder, toast } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "مجلد جديد" });
    expect(within(dialog).getByRole("button", { name: AR["g.create"] })).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("مجلد جديد"), { target: { value: "مجلد جديد تمامًا" } });
    fireEvent.change(within(dialog).getByDisplayValue("إدارة"), { target: { value: "shared" } });
    fireEvent.change(within(dialog).getByDisplayValue("قسمي"), { target: { value: "عام" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() => expect(addFolder).toHaveBeenCalled());
    expect(addFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: "مجلد جديد تمامًا", type: "shared", accessScope: "عام", parentId: "root" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم إنشاء المجلد" }));
  });

  it("submits the dialog with Enter", async () => {
    const { addFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const input = within(screen.getByRole("dialog", { name: "مجلد جديد" })).getByPlaceholderText("مجلد جديد");

    fireEvent.change(input, { target: { value: "فرعي" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(addFolder).toHaveBeenCalledWith(expect.objectContaining({ name: "فرعي" })));
  });

  it("ignores Enter while the name is blank", async () => {
    const { addFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "مجلد جديد" });

    fireEvent.keyDown(within(dialog).getByPlaceholderText("مجلد جديد"), { key: "Enter" });

    await waitFor(() => expect(addFolder).not.toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "مجلد جديد" })).toBeInTheDocument();
  });

  it("ignores keys other than Enter in the new folder input", () => {
    const { addFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const input = within(screen.getByRole("dialog", { name: "مجلد جديد" })).getByPlaceholderText("مجلد جديد");

    fireEvent.change(input, { target: { value: "غير منشأ" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(addFolder).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when creation is refused", async () => {
    const { toast } = setup({}, { addFolder: vi.fn().mockResolvedValue(false) });

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "مجلد جديد" });
    fireEvent.change(within(dialog).getByPlaceholderText("مجلد جديد"), { target: { value: "مرفوض" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.create"] }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "مجلد جديد" })).toBeInTheDocument());
    expect(toast).not.toHaveBeenCalled();
  });

  it("closes the dialog without creating anything", () => {
    const { addFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["g.create"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.cancel"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(addFolder).not.toHaveBeenCalled();
  });
});

describe("document context menu", () => {
  function openDocMenu(index = 0) {
    fireEvent.contextMenu(bodyRows()[index]);
    return screen.getByRole("menu");
  }

  it("previews a document and can switch to the full preview", () => {
    setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["g.preview"] }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("نص العقد الكامل");
    expect(dialog).toHaveTextContent("معاينة وصفية فقط");

    fireEvent.click(within(dialog).getByRole("button", { name: "معاينة كاملة" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the description when a document has no content", () => {
    const { container } = setup();

    fireEvent.click(folderCard(container, "المجلد القانوني"));
    fireEvent.contextMenu(bodyRows()[0]);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: AR["g.preview"] }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("الوصف")).toBeInTheDocument();
    expect(within(dialog).getByText("وصف المخطط")).toBeInTheDocument();
  });

  it("opens the details from the preview dialog", () => {
    setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["g.preview"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "التفاصيل" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("downloads and opens the details", () => {
    const { downloadDocument } = setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["g.download"] }));
    expect(downloadDocument).toHaveBeenCalledWith("d1");

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: "فتح التفاصيل" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("locks and releases a document", () => {
    const { checkOut, checkIn, toast } = setup();

    fireEvent.click(within(openDocMenu(0)).getByRole("menuitem", { name: "حجز" }));
    expect(checkOut).toHaveBeenCalledWith("d1", "سارة", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم الحجز" }));

    fireEvent.click(within(openDocMenu(1)).getByRole("menuitem", { name: "إعادة" }));
    expect(checkIn).toHaveBeenCalledWith("d2", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم التحرير" }));
  });

  it("locks anonymously when the profile has no name", () => {
    const { checkOut } = setup({ userName: null });

    fireEvent.click(within(openDocMenu(0)).getByRole("menuitem", { name: "حجز" }));

    expect(checkOut).toHaveBeenCalledWith("d1", "", expect.any(Function));
  });

  it("stays silent when the lock call fails", () => {
    const { toast } = setup(
      {},
      {
        checkOut: vi.fn((_id: string, _by: string, done: (ok: boolean) => void) => done(false)),
        checkIn: vi.fn((_id: string, done: (ok: boolean) => void) => done(false)),
      },
    );

    fireEvent.click(within(openDocMenu(0)).getByRole("menuitem", { name: "حجز" }));
    fireEvent.click(within(openDocMenu(1)).getByRole("menuitem", { name: "إعادة" }));

    expect(toast).not.toHaveBeenCalled();
  });

  it("moves a single document", () => {
    const { moveDocs, toast } = setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["common.move"] }));
    const dialog = screen.getByRole("dialog", { name: "نقل 1 وثيقة" });
    fireEvent.click(within(dialog).getByRole("button", { name: "مجلد المشروع" }));
    fireEvent.click(within(dialog).getByRole("button", { name: AR["common.move"] }));

    expect(moveDocs).toHaveBeenCalledWith(["d1"], "f-eng", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "1 → مجلد المشروع" }));
  });

  it("keeps the move dialog open when the server refuses", () => {
    const { toast } = setup({}, { moveDocs: vi.fn((_ids: string[], _t: string, done: (ok: boolean) => void) => done(false)) });

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["common.move"] }));
    const dialog = screen.getByRole("dialog", { name: "نقل 1 وثيقة" });
    fireEvent.click(within(dialog).getByRole("button", { name: "مجلد المشروع" }));
    fireEvent.click(within(dialog).getByRole("button", { name: AR["common.move"] }));

    expect(screen.getByRole("dialog", { name: "نقل 1 وثيقة" })).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it("places a legal hold after asking for a reason", async () => {
    const { addHold, toast } = setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["doc.placeHold"] }));
    const dialog = screen.getByRole("dialog", { name: AR["doc.placeHold"] });

    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.confirm"] }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "السبب مطلوب" }));

    fireEvent.change(within(dialog).getByPlaceholderText("سبب الحجز القانوني"), { target: { value: "نزاع قضائي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("1447/ق/302"), { target: { value: "1447/ق/9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.confirm"] }));

    await waitFor(() => expect(addHold).toHaveBeenCalledWith(expect.objectContaining({ reason: "نزاع قضائي", caseRef: "1447/ق/9" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم وضع الحجز القانوني" }));
  });

  it("closes the hold dialog without placing anything", () => {
    const { addHold } = setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["doc.placeHold"] }));
    const dialog = screen.getByRole("dialog", { name: AR["doc.placeHold"] });
    fireEvent.change(within(dialog).getByPlaceholderText("سبب الحجز القانوني"), { target: { value: "سبب" } });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.cancel"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(addHold).not.toHaveBeenCalled();
  });

  it("deletes a single document from the context menu", async () => {
    const { deleteDocs } = setup();

    fireEvent.click(within(openDocMenu()).getByRole("menuitem", { name: AR["g.delete"] }));
    const dialog = screen.getByRole("dialog", { name: "نقل الوثائق المحددة إلى السلة؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
  });
});

describe("row actions", () => {
  it("previews, downloads, releases and deletes from the row menu", async () => {
    const { downloadDocument, checkIn, deleteDocs, toast } = setup();
    const row = bodyRows()[1];

    fireEvent.click(within(row).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: AR["g.download"] }));
    expect(downloadDocument).toHaveBeenCalledWith("d2");

    fireEvent.click(within(row).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة (تحرير)" }));
    expect(checkIn).toHaveBeenCalledWith("d2", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تحرير الوثيقة" }));

    fireEvent.click(within(row).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: AR["g.preview"] }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d2/preview");

    fireEvent.click(within(row).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: AR["g.delete"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalledWith(["d2"], expect.any(Function)));
  });

  it("locks a free document from the row menu", () => {
    const { checkOut, toast } = setup();
    const row = bodyRows()[0];

    fireEvent.click(within(row).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حجز للتحرير" }));

    expect(checkOut).toHaveBeenCalledWith("d1", "سارة", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حجز الوثيقة للتحرير" }));
  });

  it("stays silent when the row lock calls fail", () => {
    const { toast } = setup(
      {},
      {
        checkIn: vi.fn((_id: string, done: (ok: boolean) => void) => done(false)),
        checkOut: vi.fn((_id: string, _by: string, done: (ok: boolean) => void) => done(false)),
      },
    );

    fireEvent.click(within(bodyRows()[0]).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "حجز للتحرير" }));
    fireEvent.click(within(bodyRows()[1]).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "إعادة (تحرير)" }));

    expect(toast).not.toHaveBeenCalled();
  });

  it("opens the hold dialog from the row menu", () => {
    setup();

    fireEvent.click(within(bodyRows()[0]).getByRole("button", { name: AR["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: AR["doc.placeHold"] }));

    expect(screen.getByRole("dialog", { name: AR["doc.placeHold"] })).toBeInTheDocument();
  });
});

describe("bulk actions", () => {
  it("shows the selection bar with the number of documents", () => {
    setup();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText("1 محدد")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(screen.getByText("2 محدد")).toBeInTheDocument();
  });

  it("downloads the whole selection", () => {
    const { downloadDocument } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getAllByRole("checkbox")[2]);

    fireEvent.click(screen.getByRole("button", { name: AR["g.download"] }));

    expect(downloadDocument).toHaveBeenCalledWith("d1");
    expect(downloadDocument).toHaveBeenCalledWith("d2");
  });

  it("archives the selection", async () => {
    const { archiveDocs, toast } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: AR["doc.archiveNow"] }));
    expect(screen.getByRole("dialog")).toHaveTextContent("أرشفة الوثائق المحددة؟");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["doc.archiveNow"] }));

    await waitFor(() => expect(archiveDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "1 عنصر" }));
  });

  it("moves the selection and excludes the current folder", () => {
    const { container, moveDocs } = setup();
    fireEvent.click(folderCard(container, "المجلد القانوني"));
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: AR["common.move"] }));

    const dialog = screen.getByRole("dialog", { name: "نقل 1 وثيقة" });
    expect(within(dialog).queryByRole("button", { name: "المجلد القانوني" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "مجلد المشروع" }));
    fireEvent.click(within(dialog).getByRole("button", { name: AR["common.move"] }));

    expect(moveDocs).toHaveBeenCalledWith(["d3"], "f-eng", expect.any(Function));
  });

  it("deletes the selection for a manager but not for an employee", () => {
    const manager = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByRole("button", { name: AR["g.delete"] })).toBeInTheDocument();
    manager.unmount();

    setup({ role: "employee" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.queryByRole("button", { name: AR["g.delete"] })).toBeNull();
  });

  it("stays silent when the server refuses the bulk action", async () => {
    const { toast, archiveDocs } = setup(
      {},
      {
        archiveDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(false)),
      },
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: AR["doc.archiveNow"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["doc.archiveNow"] }));

    await waitFor(() => expect(archiveDocs).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays silent when the server refuses the bulk delete", async () => {
    const { toast, deleteDocs } = setup({}, { deleteDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(false)) });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: AR["g.delete"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("1 محدد")).toBeInTheDocument();
  });

  it("closes the move dialog without moving", () => {
    const { moveDocs } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: AR["common.move"] }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "نقل 1 وثيقة" })).getByRole("button", { name: AR["g.cancel"] }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(moveDocs).not.toHaveBeenCalled();
  });

  it("drops the selection after the bulk delete", async () => {
    const { deleteDocs, toast } = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: AR["g.delete"] }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: AR["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "نقل إلى السلة" }));
    await waitFor(() => expect(screen.queryByText("1 محدد")).toBeNull());
  });
});

describe("upload zone", () => {
  it("accepts the configured extensions and reports success", async () => {
    const { container, createDocument } = setup();

    expect(fileInput(container)).toHaveAttribute("accept", ".pdf,.docx");
    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "report.pdf")] } });

    await waitFor(() =>
      expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ title: "report", classification: "INTERNAL" })),
    );
    expect(await screen.findByText("تم الرفع")).toBeInTheDocument();
    expect(fileInput(container).value).toBe("");
  });

  it("uploads several files in one go", async () => {
    const { container, createDocument } = setup();

    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "one.pdf"), new File(["b"], "two.docx")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(2));
    expect(createDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: "one" }));
    expect(createDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: "two" }));
    await waitFor(() => expect(screen.getAllByText("تم الرفع")).toHaveLength(2));
  });

  it("rejects a disallowed extension with a message", () => {
    const { container, createDocument, toast } = setup();

    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "setup.exe")] } });

    expect(createDocument).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "نوع الملف غير مسموح", message: "setup.exe" }));
  });

  it("uploads inside the selected folder and reports a failure state", async () => {
    const { container, createDocument } = setup({}, { createDocument: vi.fn().mockResolvedValue(undefined) });

    fireEvent.click(folderCard(container, "المجلد القانوني"));
    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "memo.docx")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ folderId: "f-legal", title: "memo" })));
    expect(await screen.findByText("فشل")).toHaveClass("text-rose-600");
  });

  it("accepts any file when no type list is configured", () => {
    const { container, createDocument, toast } = setup({}, { allowedTypes: "" });

    expect(fileInput(container)).toHaveAttribute("accept", "");
    expect(screen.getByText(/^— ·/)).toBeInTheDocument();

    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "anything.bin")] } });

    expect(toast).not.toHaveBeenCalled();
    expect(createDocument).toHaveBeenCalled();
  });

  it("lists every allowed type in upper case", async () => {
    const { container, createDocument } = setup({}, { allowedTypes: "pdf, docx, txt" });

    expect(screen.getByText(/PDF, DOCX, TXT/)).toBeInTheDocument();
    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "notes.txt")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
  });

  it("drops files onto the zone and highlights it while dragging", async () => {
    const { container, createDocument } = setup();
    const zone = container.querySelector(".border-dashed") as HTMLElement;

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-navy-400");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-navy-400");

    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "dropped.pdf")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ title: "dropped" })));
  });

  it("ignores a drop without files", () => {
    const { container, createDocument } = setup();
    const zone = container.querySelector(".border-dashed") as HTMLElement;

    fireEvent.drop(zone, { dataTransfer: { files: [] } });

    expect(createDocument).not.toHaveBeenCalled();
  });

  it("ignores an empty file picker change", () => {
    const { container, createDocument } = setup();

    fireEvent.change(fileInput(container), { target: { files: [] } });

    expect(createDocument).not.toHaveBeenCalled();
  });

  it("keeps the whole name of a file without an extension", async () => {
    const { container, createDocument } = setup({}, { allowedTypes: "" });
    const zone = container.querySelector(".border-dashed") as HTMLElement;

    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "README")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ title: "README" })));
  });

  it("falls back to the dotted name when stripping the extension leaves nothing", async () => {
    const { container, createDocument } = setup();

    fireEvent.change(fileInput(container), { target: { files: [new File(["a"], ".pdf")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ title: ".pdf" })));
  });

  it("opens the file picker from the drop zone button", () => {
    setup();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const buttons = screen.getAllByRole("button", { name: AR["doc.upload"] });

    fireEvent.click(buttons[buttons.length - 1]);

    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("clears the upload list a few seconds after the batch", async () => {
    vi.useFakeTimers();
    try {
      const { container } = setup();

      fireEvent.change(fileInput(container), { target: { files: [new File(["a"], "late.pdf")] } });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("تم الرفع")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText("تم الرفع")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("English interface", () => {
  it("translates the scoped banner", () => {
    setup({ lang: "en", role: "dept_manager" });

    expect(screen.getByText(/Scoped view/)).toHaveTextContent("Legal Affairs");
    expect(screen.getByText(/plus folders shared with you/)).toBeInTheDocument();
  });

  it("names an unlinked department in the English banner", () => {
    setup({ lang: "en", role: "employee", department: null });

    expect(screen.getByText(/Scoped view/)).toHaveTextContent("not linked to a department");
  });

  it("falls back to the Arabic folder name in the folder menu label", () => {
    const { container } = setup({ lang: "en" });

    fireEvent.click(folderCard(container, "Legal folder"));

    expect(folderOption(container, "مجلد بلا محتوى", "en")).toBeInTheDocument();
  });

  it("explains an empty root in English", () => {
    setup({ lang: "en" }, { rows: [] });

    expect(screen.getByText("No documents at the library root")).toBeInTheDocument();
    expect(screen.getByText(/Documents are organised inside the folders above/)).toBeInTheDocument();
  });

  it("shows the English details drawer for a locked and a signed document", () => {
    const locked = setup({ lang: "en" });
    fireEvent.click(bodyRows()[1]);
    const lockedPanel = detailsPanel(locked.container) as HTMLElement;
    expect(within(lockedPanel).getByText("Preview", { selector: "span" })).toBeInTheDocument();
    expect(within(lockedPanel).getByText("Meeting minutes")).toBeInTheDocument();
    expect(within(lockedPanel).getByText("Checked out")).toBeInTheDocument();
    locked.unmount();

    const signed = setup({ lang: "en" });
    fireEvent.click(folderCard(signed.container, "Legal folder"));
    fireEvent.click(bodyRows()[0]);
    const signedPanel = detailsPanel(signed.container) as HTMLElement;
    expect(within(signedPanel).getByText("Signed")).toBeInTheDocument();
    expect(within(signedPanel).getByText("Project drawing")).toBeInTheDocument();
  });

  it("creates a folder in English", async () => {
    const { addFolder, toast } = setup({ lang: "en" });

    fireEvent.click(screen.getByRole("button", { name: EN["g.create"] }));
    const dialog = screen.getByRole("dialog", { name: "New folder" });
    fireEvent.change(within(dialog).getByPlaceholderText("New folder"), { target: { value: "Plan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: EN["g.create"] }));

    await waitFor(() => expect(addFolder).toHaveBeenCalledWith(expect.objectContaining({ name: "Plan" })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Folder created" }));
  });

  it("renames and deletes folders in English", async () => {
    const { container, renameFolder, deleteFolder, toast } = setup({ lang: "en" });

    fireEvent.click(folderOption(container, "Archive 2020", "en"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Rename" }));
    const renameDialog = screen.getByRole("dialog", { name: "Rename folder" });
    expect(within(renameDialog).getByDisplayValue("Archive 2020")).toBeInTheDocument();
    fireEvent.change(within(renameDialog).getByRole("textbox"), { target: { value: "Archive 2021" } });
    fireEvent.click(within(renameDialog).getByRole("button", { name: EN["g.save"] }));

    await waitFor(() => expect(renameFolder).toHaveBeenCalledWith("f-arc", { name: "Archive 2021" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Folder renamed" }));

    fireEvent.click(folderOption(container, "Archive 2020", "en"));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Delete folder" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete this folder?" });
    expect(deleteDialog).toHaveTextContent("“Archive 2020”");
    fireEvent.click(within(deleteDialog).getByRole("button", { name: EN["g.delete"] }));

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith("f-arc"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Folder deleted", message: "Archive 2020" }));
  });

  it("confirms the bulk archive in English", async () => {
    const { archiveDocs, toast } = setup({ lang: "en" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: EN["doc.archiveNow"] }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Archive selected documents?");
    expect(dialog).toHaveTextContent("1 document(s) will be archived.");
    fireEvent.click(within(dialog).getByRole("button", { name: EN["doc.archiveNow"] }));

    await waitFor(() => expect(archiveDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "1 items" }));
  });

  it("deletes the selection in English and marks it in the footer", async () => {
    const { deleteDocs, toast } = setup({ lang: "en" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("selected", { selector: "span" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: EN["g.delete"] }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Move selected documents to trash?");
    expect(dialog).toHaveTextContent("1 document(s) will be moved to trash.");
    fireEvent.click(within(dialog).getByRole("button", { name: EN["g.delete"] }));

    await waitFor(() => expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function)));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved to trash" }));
  });

  it("moves the selection in English", () => {
    const { moveDocs, toast } = setup({ lang: "en" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    fireEvent.click(screen.getByRole("button", { name: EN["common.move"] }));
    const dialog = screen.getByRole("dialog", { name: "Move 1 document(s)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Project folder" }));
    fireEvent.click(within(dialog).getByRole("button", { name: EN["common.move"] }));

    expect(moveDocs).toHaveBeenCalledWith(["d1"], "f-eng", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Documents moved", message: "1 → Project folder" }));
  });

  it("locks, releases and checks in from the menus in English", () => {
    const { checkOut, checkIn, toast } = setup({ lang: "en" });

    fireEvent.click(within(bodyRows()[0]).getByRole("button", { name: EN["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Check-out (lock)" }));
    expect(checkOut).toHaveBeenCalledWith("d1", "سارة", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Document locked for editing" }));

    fireEvent.click(within(bodyRows()[1]).getByRole("button", { name: EN["g.rowOptions"] }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Check-in (release)" }));
    expect(checkIn).toHaveBeenCalledWith("d2", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Document released" }));

    fireEvent.contextMenu(bodyRows()[1]);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Check-in" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Released" }));
  });

  it("locks a free document from the context menu in English", () => {
    const { checkOut, toast } = setup({ lang: "en" });

    fireEvent.contextMenu(bodyRows()[0]);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Check-out" }));

    expect(checkOut).toHaveBeenCalledWith("d1", "سارة", expect.any(Function));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Locked" }));
  });

  it("opens the descriptive preview in English", () => {
    setup({ lang: "en" });

    fireEvent.contextMenu(bodyRows()[0]);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: EN["g.preview"] }));
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("Supply contract");
    expect(dialog).toHaveTextContent("Descriptive preview only — open Full preview to view the file.");
    expect(within(dialog).getByText("Description")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Full preview" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");
  });

  it("reports the English upload states and rejects a wrong type", async () => {
    const pending = vi.fn(() => new Promise<string>(() => {}));
    const slow = setup({ lang: "en" }, { createDocument: pending });
    fireEvent.change(fileInput(slow.container), { target: { files: [new File(["a"], "slow.pdf")] } });
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    slow.unmount();

    const done = setup({ lang: "en" });
    fireEvent.change(fileInput(done.container), { target: { files: [new File(["a"], "done.pdf")] } });
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    done.unmount();

    const failed = setup({ lang: "en" }, { createDocument: vi.fn().mockResolvedValue(undefined) });
    fireEvent.change(fileInput(failed.container), { target: { files: [new File(["a"], "bad.pdf")] } });
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    failed.unmount();

    const rejected = setup({ lang: "en" });
    fireEvent.change(fileInput(rejected.container), { target: { files: [new File(["a"], "setup.exe")] } });
    expect(rejected.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "File type not allowed", message: "setup.exe" }));
  });

  it("translates the header, sort options and folder cards", () => {
    const { container } = setup({ lang: "en" });

    expect(screen.getByText("Browse folders and archived documents")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sort: Name")).toBeInTheDocument();
    expect(screen.getByText("Subfolders (4)")).toBeInTheDocument();
    expect(within(grid(container)).getByText("Legal folder")).toBeInTheDocument();
    expect(screen.getByText("5 docs total")).toBeInTheDocument();
  });

  it("translates the empty folder, the details and the footer", () => {
    const { container } = setup({ lang: "en" });

    fireEvent.click(folderCard(container, "Project folder"));

    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
    expect(screen.getByText("Demo mode — local data")).toBeInTheDocument();
    expect(screen.getByText(/in this folder/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New subfolder" })).toBeInTheDocument();
  });

  it("translates the confirm dialogs and the context menu", () => {
    setup({ lang: "en" });

    fireEvent.contextMenu(bodyRows()[0]);
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Open details" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: EN["g.delete"] }));
    expect(screen.getByRole("dialog", { name: "Move selected documents to trash?" })).toBeInTheDocument();
  });

  it("translates the folder menu and the drawer controls", () => {
    const { container } = setup({ lang: "en" });

    fireEvent.click(folderOption(container, "Legal folder", "en"));
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Open folder" })).toBeInTheDocument();
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: "Delete folder" })).toBeNull();

    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Open folder" }));
    expect(screen.getByText("2 docs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permissions" })).toBeEnabled();
  });

  it("translates the upload zone and the grid", () => {
    const { container } = setup({ lang: "en" });

    expect(screen.getByText("Drag & drop files here for quick upload")).toBeInTheDocument();
    expect(screen.getByText(/Indicative limit 50 MB/)).toBeInTheDocument();

    fireEvent.click(container.querySelector(".lucide-layout-grid")?.closest("button") as Element);
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(2);
  });
});
