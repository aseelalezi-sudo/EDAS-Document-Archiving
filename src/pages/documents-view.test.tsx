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
        <Route path="/documents" element={<div>documents-list</div>} />
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

  it("validates and places a legal hold from the toolbar", async () => {
    const store = mockStore({ addHold: vi.fn().mockResolvedValue(true) });
    const app = mockApp();
    const today = new Date().toISOString().slice(0, 10);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "حجز قانوني" }));
    const dialog = screen.getByRole("dialog", { name: "حجز قانوني" });
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "السبب مطلوب" }));
    expect(store.addHold).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText("سبب الحجز القانوني"), { target: { value: "نزاع تعاقدي" } });
    fireEvent.change(within(dialog).getByPlaceholderText("1447/ق/302"), { target: { value: "CASE-9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }));

    await waitFor(() =>
      expect(store.addHold).toHaveBeenCalledWith({
        ref: "CASE-9",
        reason: "نزاع تعاقدي",
        caseRef: "CASE-9",
        placedBy: "مدير النظام",
        placedAt: today,
        items: 1,
        documentIds: ["doc-1"],
      }),
    );
    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({
        type: "warning",
        title: "تم وضع الحجز القانوني",
        message: "EDAS-2026001 — محمية من الإتلاف",
      }),
    );
    expect(screen.queryByRole("dialog", { name: "حجز قانوني" })).toBeNull();
  });

  it("schedules the retention from the active policies only", async () => {
    const store = mockStore({
      scheduleRetention: vi.fn().mockResolvedValue(true),
      policies: {
        items: [
          { id: "p1", name: "سياسة 5 سنوات", retentionMonths: 60, status: "active" },
          { id: "p2", name: "سياسة قديمة", retentionMonths: 12, status: "inactive" },
        ],
      },
    });
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "جدولة الاحتفاظ" }));
    const dialog = screen.getByRole("dialog", { name: "جدولة الاحتفاظ" });
    const select = within(dialog).getByRole("combobox");
    expect(within(select).getByRole("option", { name: /سياسة 5 سنوات/ })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /سياسة قديمة/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "تأكيد" })).toBeDisabled();

    fireEvent.change(select, { target: { value: "p1" } });
    expect(within(dialog).getByText("2031-01-01")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }));

    await waitFor(() => expect(store.scheduleRetention).toHaveBeenCalledWith("doc-1", "p1"));
    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تمت جدولة الاحتفاظ", message: "EDAS-2026001 — سياسة 5 سنوات" }),
    );
    expect(screen.queryByRole("dialog", { name: "جدولة الاحتفاظ" })).toBeNull();
  });

  it("disables retention scheduling and hides declaration for other roles", () => {
    mockStore({ can: vi.fn(() => true) });
    mockApp({ role: "employee" });

    renderPage();

    expect(screen.getByRole("button", { name: "جدولة الاحتفاظ" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "إعلان كسجل" })).toBeNull();
  });

  it("uploads a new version and sends the document for approval", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    const file = new File(["%PDF"], "v2.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("رفع إصدار جديد"), { target: { files: [file] } });
    await waitFor(() => expect(store.uploadNewVersion).toHaveBeenCalledWith("doc-1", "مدير النظام", file));
    await waitFor(() =>
      expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم رفع v2.pdf", message: "أُضيف الإصدار الجديد للسجل" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "إرسال للموافقة" }));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "إرسال للموافقة", message: "بانتظار المعتمدين" }));
  });

  it("keeps an uploaded version silent when the store rejects it", async () => {
    const store = mockStore({ uploadNewVersion: vi.fn().mockResolvedValue(false) });
    const app = mockApp();

    renderPage();

    const file = new File(["%PDF"], "v3.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("رفع إصدار جديد"), { target: { files: [file] } });
    await waitFor(() => expect(store.uploadNewVersion).toHaveBeenCalled());
    expect(app.toast).not.toHaveBeenCalled();
  });

  it("shows signed and declared badges and locks the document", () => {
    mockStore({
      docs: [doc({ signatureStatus: "signed", signedBy: "أمل السبيعي", declaredRecord: true, tags: [], retentionEnd: "" })],
    });
    mockApp();

    renderPage();

    expect(screen.getByText("موقّعة — أمل السبيعي")).toBeInTheDocument();
    expect(screen.getByText("سجل رسمي")).toBeInTheDocument();
    expect(screen.queryByText("بانتظار التوقيع")).toBeNull();
    expect(screen.queryByRole("button", { name: "طلب توقيع" })).toBeNull();
    expect(screen.queryByRole("button", { name: "توقيع" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إعلان كسجل" })).toBeNull();
    expect(screen.getByRole("button", { name: "حذف" })).toBeDisabled();
    expect(screen.getByText("غير محددة")).toBeInTheDocument();
    expect(screen.getByText("لا توجد وسوم")).toBeInTheDocument();
  });

  it("reports the trash result only when the deletion succeeds", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    fireEvent.click(screen.getByRole("button", { name: "نقل إلى السلة" }));
    const done = store.deleteDocs.mock.calls[0][1] as (ok: boolean) => void;

    act(() => done(false));
    expect(app.toast).not.toHaveBeenCalled();
    expect(screen.queryByText("documents-list")).toBeNull();

    act(() => done(true));
    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "نقل إلى السلة" });
    expect(screen.getByText("documents-list")).toBeInTheDocument();
  });

  it("renders the English toolbar and header", () => {
    mockStore({ docs: [doc({ signatureStatus: "none" })] });
    mockApp({ t: translator("en"), lang: "en" });

    renderPage();

    expect(screen.getByRole("heading", { name: "Supply contract" })).toBeInTheDocument();
    expect(screen.getByText("Version 1.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Legal hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule retention" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request signature" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Declare record" })).toBeInTheDocument();
  });
});
