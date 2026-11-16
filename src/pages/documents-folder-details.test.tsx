import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document, FolderNode } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("./document-widgets", () => ({
  ACLRulesEditor: ({ folderId }: { folderId: string }) => <div>محرر صلاحيات {folderId}</div>,
}));

import { FolderDetails } from "./documents-folder-details";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function folder(overrides: Partial<FolderNode> = {}): FolderNode {
  return {
    id: "f-1",
    name: "العقود",
    nameEn: "Contracts",
    parentId: "root",
    type: "dept",
    owner: "أمل السبيعي",
    docs: 2,
    subfolders: 1,
    accessScope: "الشؤون القانونية",
    ...overrides,
  };
}

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    docNo: "EDAS-2026001",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    category: "أوامر الشراء",
    categoryEn: "Purchase orders",
    categoryId: "po",
    deptId: "legal",
    sectionId: "sec-1",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1.2 MB",
    fileType: "pdf",
    folderId: "f-1",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    folders: [folder({ id: "root", name: "الجذر", nameEn: "Root", parentId: null }), folder()],
    scopedDocs: [
      doc(),
      doc({
        id: "doc-2",
        title: "عقد الصيانة",
        titleEn: "Maintenance contract",
        owner: "خالد العمري",
        activity: [
          {
            id: "act-1",
            action: "أرشفة الوثيقة",
            actionEn: "Archive document",
            user: "أمل السبيعي",
            target: "EDAS-2026002",
            date: "2026-01-03",
            icon: "archive",
          },
        ],
      }),
    ],
    docsReady: true,
    downloadDocument: vi.fn().mockResolvedValue(true),
    archiveDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    deleteDocs: vi.fn((_ids: string[], done: (ok: boolean) => void) => done(true)),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(url = "/library/f-1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/library/:id" element={<FolderDetails />} />
        <Route path="/library" element={<div>المكتبة</div>} />
        <Route path="/documents/new" element={<div>وثيقة جديدة</div>} />
        <Route path="/documents/:id" element={<div>صفحة الوثيقة</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("folder details", () => {
  it("shows the loading shell while the library is loading", () => {
    mockStore({ docsReady: false });
    mockApp();

    renderPage();

    expect(screen.getByText("جارٍ تحميل المجلد…")).toBeInTheDocument();
  });

  it("reports a missing folder and offers a way back", () => {
    mockStore();
    mockApp();

    renderPage("/library/missing");

    expect(screen.getByText("لم يتم العثور على هذا المجلد")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المكتبة" }));
    expect(screen.getByText("المكتبة")).toBeInTheDocument();
  });

  it("lists the folder counters and its documents", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByRole("heading", { name: "العقود" })).toBeInTheDocument();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("عقد الصيانة")).toBeInTheDocument();
    expect(screen.getByText("الجذر")).toBeInTheDocument();
  });

  it("selects documents and archives them after confirmation", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText(/محدد/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("doc.archiveNow") }));
    const dialog = screen.getByRole("dialog", { name: "أرشفة الوثائق المحددة؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("doc.archiveNow") }));

    expect(store.archiveDocs).toHaveBeenCalledWith(["doc-1"], expect.any(Function));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("doc.archiveNow") }));
  });

  it("moves the selected documents to the trash after confirmation", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: t("g.delete") }));
    const dialog = screen.getByRole("dialog", { name: "نقل الوثائق المحددة إلى السلة؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: t("g.delete") }));

    expect(store.deleteDocs).toHaveBeenCalledWith(["doc-1"], expect.any(Function));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "نقل إلى السلة" }));
  });

  it("downloads the selected documents from the bulk bar", () => {
    const store = mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    const bars = screen.getAllByRole("button", { name: t("g.download") });
    fireEvent.click(bars[bars.length - 1]);

    expect(store.downloadDocument).toHaveBeenCalledWith("doc-1");
  });

  it("opens the permissions tab from the header and renders the ACL editor", () => {
    mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: t("doc.permissions") }));

    expect(screen.getByText("محرر صلاحيات f-1")).toBeInTheDocument();
    expect(screen.getByText(/نموذج الصلاحيات/)).toBeInTheDocument();
  });

  it("shows the activity timeline and the folder information", () => {
    mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: t("doc.activityLog") }));
    expect(screen.getByText("أرشفة الوثيقة")).toBeInTheDocument();
    expect(screen.getByText(/عقد الصيانة — أمل السبيعي/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "معلومات" }));
    expect(screen.getByText("f-1")).toBeInTheDocument();
    expect(screen.getAllByText("الشؤون القانونية").length).toBeGreaterThan(0);
  });

  it("offers an upload link when the folder is empty", () => {
    mockStore({ scopedDocs: [] });
    mockApp();

    renderPage();

    expect(screen.getByText("هذا المجلد فارغ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("doc.upload") }));
    expect(screen.getByText("وثيقة جديدة")).toBeInTheDocument();
  });

  it("opens the tab requested through the route state", () => {
    mockStore();
    mockApp();

    render(
      <MemoryRouter initialEntries={[{ pathname: "/library/f-1", state: { tab: "permissions" } }]}>
        <Routes>
          <Route path="/library/:id" element={<FolderDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("محرر صلاحيات f-1")).toBeInTheDocument();
  });
});
