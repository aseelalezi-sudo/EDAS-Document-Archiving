import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { AuditEntry, Document } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("./acl-rules-editor", () => ({
  ACLRulesEditor: ({ folderId }: { folderId: string }) => <div data-testid="acl-editor">{folderId}</div>,
}));

import { DocumentDetails } from "./documents-view";

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

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    docNo: "EDAS-2026001",
    title: "عقد توريد",
    titleEn: "Supply contract",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "contracts",
    deptId: "legal",
    sectionId: "legal-1",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "approved",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2030-01-01",
    retentionDays: 120,
    size: "12 KB",
    fileType: "pdf",
    folderId: "f-contracts",
    tags: ["عقد"],
    description: "وصف الوثيقة",
    descriptionEn: "Document description",
    versions: [
      {
        id: "version-1",
        v: "1.0",
        date: "2026-01-01",
        by: "أمل السبيعي",
        size: "12 KB",
        fingerprint: "abc123",
        comment: "الإصدار الأول",
        current: true,
      },
      {
        id: "version-2",
        v: "0.9",
        date: "2025-12-01",
        by: "أمل السبيعي",
        size: "10 KB",
        fingerprint: "def456",
        comment: "مسودة",
      },
    ],
    activity: [],
    ...overrides,
  };
}

function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "audit-1",
    datetime: "2026-01-03 10:00",
    user: "مدير النظام",
    module: "workflow",
    action: "اعتماد الوثيقة",
    entityType: "document",
    entityId: "doc-1",
    deptId: "legal",
    ip: "127.0.0.1",
    result: "success",
    correlation: "corr-1",
    detail: "",
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    docs: [doc()],
    docsReady: true,
    loadDocument: vi.fn().mockResolvedValue(undefined),
    checkIn: vi.fn(),
    can: vi.fn(() => true),
    requestSignature: vi.fn().mockResolvedValue(true),
    declareRecord: vi.fn().mockResolvedValue(true),
    deleteDocs: vi.fn(),
    uploadNewVersion: vi.fn().mockResolvedValue(true),
    sendForApproval: vi.fn().mockResolvedValue(true),
    downloadDocument: vi.fn(),
    auditLog: [] as AuditEntry[],
    restoreVersion: vi.fn().mockResolvedValue(true),
    addHold: vi.fn(),
    signDocument: vi.fn(),
    scheduleRetention: vi.fn(),
    policies: { items: [] },
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(overrides: Record<string, unknown> = {}) {
  const app = {
    t: translator("ar"),
    lang: "ar",
    toast: vi.fn(),
    role: "system_admin",
    user: { name: "مدير النظام" },
    ...overrides,
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(docId = "doc-1") {
  return render(
    <MemoryRouter initialEntries={[`/documents/${docId}`]}>
      <Routes>
        <Route path="/documents/:id" element={<DocumentDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("document details", () => {
  it("loads the document by id and renders the overview", async () => {
    const store = mockStore();
    mockApp();

    renderPage();

    expect(store.loadDocument).toHaveBeenCalledWith("doc-1");
    expect(screen.getByRole("heading", { name: "عقد توريد" })).toBeInTheDocument();
    expect(screen.getAllByText("EDAS-2026001").length).toBeGreaterThan(0);
    expect(screen.getByText("وصف الوثيقة")).toBeInTheDocument();
    expect(screen.getByText("#عقد")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/120 يوم/)).toBeInTheDocument());
  });

  it("shows the loading shell while the store is not ready and a not-found state afterwards", () => {
    mockStore({ docs: [], docsReady: false });
    mockApp();

    const { unmount } = renderPage();
    expect(screen.getByText("جارٍ تحميل الوثيقة…")).toBeInTheDocument();
    unmount();

    mockStore({ docs: [], docsReady: true });
    renderPage();
    expect(screen.getByText("الوثيقة غير موجودة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "العودة إلى الوثائق" })).toBeInTheDocument();
  });

  it("disables download and edit when the folder permissions do not allow them", () => {
    mockStore({ can: vi.fn(() => false) });
    mockApp({ role: "employee" });

    renderPage();

    expect(screen.getByRole("button", { name: "تنزيل" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تعديل" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "حذف" })).toBeDisabled();
  });

  it("releases a checked-out document and reports the outcome", async () => {
    const store = mockStore({ docs: [doc({ checkedOutBy: "سارة" })] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "إعادة" }));

    expect(store.checkIn).toHaveBeenCalledWith("doc-1", expect.any(Function));
    const done = store.checkIn.mock.calls[0][1] as (ok: boolean) => void;
    act(() => done(true));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "تم تحرير الوثيقة" }));
  });

  it("renders the metadata, related documents and empty workflow tabs", () => {
    mockStore({
      docs: [
        doc(),
        doc({ id: "doc-2", docNo: "EDAS-2026002", title: "ملحق العقد", folderId: "f-contracts" }),
        doc({ id: "doc-3", docNo: "EDAS-2026003", title: "وثيقة أخرى", categoryId: "other" }),
      ],
    });
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "البيانات الوصفية" }));
    expect(screen.getByText("النوع")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "الوثائق المرتبطة" }));
    expect(screen.getByText("ملحق العقد")).toBeInTheDocument();
    expect(screen.queryByText("وثيقة أخرى")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "سير العمل" }));
    expect(screen.getByText("لا يوجد نشاط لسير العمل")).toBeInTheDocument();
  });

  it("shows the workflow activity and the server access events when present", () => {
    mockStore({
      docs: [
        doc({
          status: "pending",
          activity: [
            {
              id: "act-1",
              user: "مدير النظام",
              action: "أرسلت للموافقة",
              actionEn: "sent for approval",
              target: "عقد توريد",
              date: "2026-01-03",
              icon: "send",
            },
          ],
        }),
      ],
      auditLog: [auditEntry(), auditEntry({ id: "audit-2", entityId: "other" })],
    });
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "سير العمل" }));
    expect(screen.getByText("هذه الوثيقة بانتظار الموافقة.")).toBeInTheDocument();
    expect(screen.getByText("أرسلت للموافقة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "سجل الوصول" }));
    expect(screen.getByText("اعتماد الوثيقة")).toBeInTheDocument();
    expect(screen.getAllByText("اعتماد الوثيقة")).toHaveLength(1);
  });

  it("lists versions and restores an older one after confirmation", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /الإصدارات/ }));
    expect(screen.getByText("الإصدار الأول")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "استعادة" }));
    const dialog = screen.getByRole("dialog", { name: "استعادة الإصدار 0.9؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "استعادة" }));

    await waitFor(() => expect(store.restoreVersion).toHaveBeenCalledWith("doc-1", "0.9"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الاستعادة للإصدار 0.9" })));
  });

  it("moves the document to the trash from the confirmation dialog", () => {
    const store = mockStore();
    mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    expect(screen.getByText(/سيتم نقل الوثيقة إلى سلة المحذوفات/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نقل إلى السلة" }));

    expect(store.deleteDocs).toHaveBeenCalledWith(["doc-1"], expect.any(Function));
  });

  it("requests a signature and declares a record with explicit feedback", async () => {
    const store = mockStore({ docs: [doc({ signatureStatus: "none" })] });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "طلب توقيع" }));
    await waitFor(() => expect(store.requestSignature).toHaveBeenCalledWith("doc-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم طلب التوقيع" })));

    fireEvent.click(screen.getByRole("button", { name: "إعلان كسجل" }));
    fireEvent.click(screen.getByRole("button", { name: "إعلان السجل" }));
    await waitFor(() => expect(store.declareRecord).toHaveBeenCalledWith("doc-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم الإعلان كسجل رسمي" })));
  });

  it("mounts the folder ACL editor on the permissions tab and explains a missing folder", () => {
    mockStore();
    mockApp();

    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    expect(screen.getByTestId("acl-editor")).toHaveTextContent("f-contracts");
    unmount();

    mockStore({ docs: [doc({ folderId: "" })] });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الصلاحيات" }));
    expect(screen.getByText("لا يوجد مجلد مرتبط")).toBeInTheDocument();
  });
});
