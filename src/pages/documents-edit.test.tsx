import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { EditDocument } from "./documents-edit";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
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
    status: "draft",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1.2 MB",
    fileType: "pdf",
    folderId: "f-1",
    tags: ["عقود", "2026"],
    description: "وصف الوثيقة",
    descriptionEn: "Description",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    docs: [doc()],
    docsReady: true,
    loadDocument: vi.fn().mockResolvedValue(undefined),
    updateDocument: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn(), user: { name: "أمل السبيعي" } };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(url = "/documents/doc-1/edit") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/documents/:id/edit" element={<EditDocument />} />
        <Route path="/documents/:id" element={<div>صفحة الوثيقة</div>} />
        <Route path="/documents" element={<div>قائمة الوثائق</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("edit document", () => {
  it("renders the loading shell while the document is loading", () => {
    mockStore({ docs: [], docsReady: false });
    mockApp();

    renderPage();

    expect(screen.getByText("جارٍ تحميل الوثيقة…")).toBeInTheDocument();
  });

  it("asks the store to load a document that is not cached yet", () => {
    const store = mockStore({ docs: [] });
    mockApp();

    renderPage();

    expect(store.loadDocument).toHaveBeenCalledWith("doc-1");
    expect(screen.getByText("الوثيقة غير موجودة")).toBeInTheDocument();
  });

  it("blocks editing when another user has it checked out", () => {
    mockStore({ docs: [doc({ checkedOutBy: "خالد العمري" })] });
    mockApp();

    renderPage();

    expect(screen.getByText(/محجوزة للتحرير بواسطة/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("عقد التوريد")).toBeDisabled();
    expect(screen.getByRole("button", { name: t("g.save") })).toBeDisabled();
  });

  it("requires a change reason before saving and sends the edited metadata", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    const save = screen.getByRole("button", { name: t("g.save") });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("عقد التوريد"), { target: { value: "عقد التوريد المحدّث" } });
    fireEvent.change(screen.getByDisplayValue("عقود, 2026"), { target: { value: "عقود, عاجل" } });
    fireEvent.change(screen.getByPlaceholderText("اشرح سبب التعديل (إلزامي)"), { target: { value: "تصحيح العنوان" } });
    fireEvent.click(save);

    await waitFor(() =>
      expect(store.updateDocument).toHaveBeenCalledWith("doc-1", {
        title: "عقد التوريد المحدّث",
        description: "وصف الوثيقة",
        category: "po",
        classification: "INTERNAL",
        tags: ["عقود", "عاجل"],
        reason: "تصحيح العنوان",
      }),
    );
    await waitFor(() => expect(screen.getByText("صفحة الوثيقة")).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حفظ التعديلات", message: "عقد التوريد المحدّث" }));
  });

  it("keeps the form and shows an unsaved-changes dialog when leaving", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.change(screen.getByDisplayValue("عقد التوريد"), { target: { value: "عنوان معدّل" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.cancel") }));

    const dialog = screen.getByRole("dialog", { name: t("topbar.unsavedChanges") });
    fireEvent.click(within(dialog).getByRole("button", { name: t("topbar.discard") }));

    expect(screen.getByText("صفحة الوثيقة")).toBeInTheDocument();
  });

  it("keeps the protected fields read-only and shows the current summary", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByDisplayValue("EDAS-2026001")).toBeDisabled();
    expect(screen.getByDisplayValue("أمل السبيعي")).toBeDisabled();
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
  });
});
