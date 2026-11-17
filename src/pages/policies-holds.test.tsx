import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document, FolderNode, LegalHold } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { LegalHolds } from "./policies-holds";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const MONTH = new Date().toISOString().slice(0, 7);
const TODAY = new Date().toISOString().slice(0, 10);

function doc(id: string, overrides: Partial<Document> = {}): Document {
  return {
    id,
    docNo: `EDAS-${id}`,
    title: `وثيقة ${id}`,
    titleEn: `Document ${id}`,
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "po",
    deptId: "legal",
    sectionId: "",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "archived",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1 MB",
    fileType: "pdf",
    folderId: "f-1",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  } as Document;
}

const DOCS = [
  doc("doc-1", { title: "عقد التوريد", folderId: "f-1" }),
  doc("doc-2", { title: "ملحق العقد", folderId: "f-1-child" }),
  doc("doc-3", { title: "محضر اجتماع", folderId: "f-2" }),
  doc("doc-4", { title: "وثيقة رابعة", folderId: "f-2" }),
  doc("doc-5", { title: "وثيقة خامسة", folderId: "f-1" }),
  doc("doc-6", { title: "وثيقة سادسة", folderId: "f-1" }),
];

const FOLDERS: FolderNode[] = [
  { id: "f-1", name: "عقود", nameEn: "Contracts", parentId: null, type: "dept", docs: 4, subfolders: 1, accessScope: "dept" },
  { id: "f-1-child", name: "ملاحق", nameEn: "Annexes", parentId: "f-1", type: "dept", docs: 1, subfolders: 0, accessScope: "dept" },
  { id: "f-2", name: "محاضر", nameEn: "Minutes", parentId: null, type: "dept", docs: 2, subfolders: 0, accessScope: "dept" },
  { id: "f-empty", name: "فارغ", nameEn: "Empty", parentId: null, type: "dept", docs: 0, subfolders: 0, accessScope: "dept" },
];

const HOLDS: LegalHold[] = [
  {
    id: "h-1",
    ref: "HOLD-2026-001",
    caseRef: "CASE/302",
    reason: "نزاع تجاري قيد التقاضي",
    placedBy: "أمل السبيعي",
    placedAt: `${MONTH}-03`,
    items: 6,
    documentIds: DOCS.map((item) => item.id),
    status: "active",
  },
  {
    id: "h-2",
    ref: "HOLD-2025-009",
    caseRef: "HOLD-2025-009",
    reason: "تحقيق داخلي منتهٍ",
    placedBy: "خالد العتيبي",
    placedAt: "2025-12-01",
    releasedAt: "2026-01-05",
    releasedByName: "سارة",
    items: 1,
    documentIds: ["doc-3"],
    status: "released",
  },
  {
    id: "h-3",
    ref: "HOLD-2026-002",
    caseRef: "CASE/310",
    reason: "مراجعة تنظيمية",
    placedBy: "خالد العتيبي",
    placedAt: `${MONTH}-10`,
    items: 1,
    documentIds: [],
    status: "active",
  },
];

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    user: { name: "أمل السبيعي" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    holds: { items: HOLDS },
    docs: DOCS,
    scopedDocs: DOCS,
    folders: FOLDERS,
    addHold: vi.fn().mockResolvedValue(true),
    releaseHold: vi.fn().mockResolvedValue(true),
    getChildrenIds: vi.fn((id: string) => (id === "f-1" ? ["f-1-child"] : [])),
    docsReady: true,
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/policies/legal-holds"]}>
      <Routes>
        <Route
          path="/policies/legal-holds"
          element={
            <>
              <LegalHolds />
              <LocationProbe />
            </>
          }
        />
        <Route path="/documents/:id/preview" element={<LocationProbe />} />
        <Route path="/documents" element={<LocationProbe />} />
        <Route path="/reports/audit-trail" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("legal holds", () => {
  it("renders the stats and active hold cards", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.legalHolds")).length).toBeGreaterThan(0);
    expect(screen.getByText("HOLD-2026-001")).toBeInTheDocument();
    expect(screen.getByText("CASE/302")).toBeInTheDocument();
    expect(screen.getByText("نزاع تجاري قيد التقاضي")).toBeInTheDocument();
    expect(screen.getAllByText("الحجز ساري").length).toBeGreaterThan(1);
    expect(screen.queryByText("HOLD-2025-009")).toBeNull();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /الحجوزات النشطة/ })).toBeInTheDocument();
  });

  it("switches to released holds and their timeline", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /تم الإفراج عنها/ }));
    expect(screen.getByText("HOLD-2025-009")).toBeInTheDocument();
    expect(screen.getByText("مفرج عنه")).toBeInTheDocument();
    expect(screen.getAllByText("2026-01-05").length).toBeGreaterThan(1);
    expect(screen.getByText("تم الإفراج")).toBeInTheDocument();
    expect(screen.getByText("سارة")).toBeInTheDocument();
    expect(screen.queryByText("HOLD-2026-001")).toBeNull();
  });

  it("shows the empty states for both tabs", () => {
    mockStore({ holds: { items: [HOLDS[2]] } });
    mockApp();
    const view = renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /تم الإفراج عنها/ }));
    expect(screen.getByText("لا توجد حجوزات مفرج عنها")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "وضع حجز" })).toBeNull();

    view.unmount();
    mockStore({ holds: { items: [HOLDS[1]] } });
    renderPage();
    expect(screen.getByText("لا توجد حجوزات نشطة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "وضع حجز" })).toBeInTheDocument();
  });

  it("places a hold for all documents", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "وضع حجز قانوني" }));
    const dialog = screen.getByRole("dialog", { name: "وضع حجز قانوني" });
    const submit = within(dialog).getByRole("button", { name: "وضع الحجز" });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("مثال: نزاع تجاري قيد التقاضي مع المورّد"), {
      target: { value: "نزاع تجاري جديد" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("قضية 1447/ق/302"), { target: { value: "قضية 1447/ق/999" } });
    expect(submit).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "تحديد الكل" }));
    expect(within(dialog).getByText("6 محدد")).toBeInTheDocument();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(store.addHold).toHaveBeenCalledWith({
        ref: "قضية 1447/ق/999",
        reason: "نزاع تجاري جديد",
        caseRef: "قضية 1447/ق/999",
        placedBy: "أمل السبيعي",
        placedAt: TODAY,
        items: 6,
        documentIds: DOCS.map((item) => item.id),
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({ type: "warning", title: "تم وضع الحجز القانوني", message: "6 عنصر محمي من الإتلاف" });
    expect(screen.queryByRole("dialog", { name: "وضع حجز قانوني" })).toBeNull();
  });

  it("selects a folder and keeps the dialog open when the hold fails", async () => {
    const store = mockStore({ addHold: vi.fn().mockResolvedValue(false) });
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "وضع حجز قانوني" }));
    const dialog = screen.getByRole("dialog", { name: "وضع حجز قانوني" });

    const folder = within(dialog).getByRole("button", { name: /عقود/ });
    expect(folder).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(folder);
    expect(folder).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("4 محدد")).toBeInTheDocument();
    fireEvent.click(folder);
    expect(within(dialog).queryByText("4 محدد")).toBeNull();

    fireEvent.change(within(dialog).getByPlaceholderText("مثال: نزاع تجاري قيد التقاضي مع المورّد"), { target: { value: "سبب" } });
    fireEvent.change(within(dialog).getByPlaceholderText("قضية 1447/ق/302"), { target: { value: "CASE-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /ملحق العقد/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "وضع الحجز" }));

    await waitFor(() => expect(store.addHold).toHaveBeenCalled());
    expect(app.toast).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "وضع حجز قانوني" })).toBeInTheDocument();
  });

  it("shows the loading hint and skips empty folders", () => {
    mockStore({ docsReady: false });
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "وضع حجز قانوني" }));
    const dialog = screen.getByRole("dialog", { name: "وضع حجز قانوني" });
    expect(within(dialog).getByText("جارٍ تحميل الوثائق…")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /فارغ/ })).toBeNull();
  });

  it("releases an active hold", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "الإفراج عن الحجز" })[0]);
    const dialog = screen.getByRole("dialog", { name: "الإفراج عن الحجز" });
    expect(within(dialog).getByText("6 عنصر")).toBeInTheDocument();
    expect(within(dialog).getByText("نتيجة الإفراج")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإفراج" }));
    await waitFor(() => expect(store.releaseHold).toHaveBeenCalledWith("h-1"));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم الإفراج عن الحجز", message: "HOLD-2026-001 — 6 عنصر" });
    expect(screen.queryByRole("dialog", { name: "الإفراج عن الحجز" })).toBeNull();
  });

  it("cancels and reports a failed release", async () => {
    const store = mockStore({ releaseHold: vi.fn().mockResolvedValue(false) });
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "الإفراج عن الحجز" })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "الإفراج عن الحجز" })).getByRole("button", { name: t("g.cancel") }));
    expect(screen.queryByRole("dialog", { name: "الإفراج عن الحجز" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "الإفراج عن الحجز" })[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "الإفراج عن الحجز" })).getByRole("button", { name: "تأكيد الإفراج" }));
    await waitFor(() => expect(store.releaseHold).toHaveBeenCalled());
    expect(app.toast).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "الإفراج عن الحجز" })).toBeInTheDocument();
  });

  it("navigates to held documents and the audit trail", () => {
    mockStore();
    mockApp();
    let view = renderPage();

    fireEvent.click(screen.getByRole("button", { name: /عقد التوريد/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/doc-1/preview");

    view.unmount();
    view = renderPage();
    const documentsButtons = screen.getAllByRole("button", { name: "الوثائق" });
    expect(documentsButtons[1]).toBeDisabled();
    fireEvent.click(documentsButtons[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/doc-1/preview");

    view.unmount();
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "سجل التدقيق" })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/audit-trail");
  });

  it("renders English labels", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Legal Holds").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Active holds/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place legal hold" })).toBeInTheDocument();
    expect(screen.getByText("Held documents")).toBeInTheDocument();
  });
});
