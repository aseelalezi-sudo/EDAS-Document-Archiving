import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { Versions } from "./documents-versions";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
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
    tags: [],
    description: "",
    descriptionEn: "",
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

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    docs: [doc()],
    docsReady: true,
    loadDocument: vi.fn().mockResolvedValue(undefined),
    restoreVersion: vi.fn().mockResolvedValue(true),
    downloadDocument: vi.fn(),
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/documents/doc-1/versions"]}>
      <Routes>
        <Route path="/documents/:id/versions" element={<Versions />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("document versions page", () => {
  it("renders the history, the comparison and the honest binary-comparison note", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByText("سجل الإصدارات")).toBeInTheDocument();
    expect(screen.getAllByText("الإصدار الأول").length).toBeGreaterThan(0);
    expect(screen.getByText("مقارنة الإصدارات")).toBeInTheDocument();
    expect(screen.getByText(/مقارنة محتوى الملفات غير متاحة في الواجهة/)).toBeInTheDocument();
    expect(screen.getByText("حالي")).toBeInTheDocument();
  });

  it("restores an older version after confirmation", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "استعادة" }));
    const dialog = screen.getByRole("dialog", { name: "استعادة الإصدار 0.9؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "استعادة" }));

    await waitFor(() => expect(store.restoreVersion).toHaveBeenCalledWith("doc-1", "0.9"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت الاستعادة للإصدار 0.9" })));
  });

  it("explains a document with a single version instead of showing a comparison", () => {
    mockStore({ docs: [doc({ versions: [doc().versions[0]] })] });
    mockApp();

    renderPage();

    expect(screen.getByText("لا توجد إصدارات كافية")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "استعادة" })).not.toBeInTheDocument();
  });

  it("shows the loading shell and then the not-found state", () => {
    mockStore({ docs: [], docsReady: false });
    mockApp();

    const { unmount } = renderPage();
    expect(screen.getByText("جارٍ تحميل الإصدارات…")).toBeInTheDocument();
    unmount();

    mockStore({ docs: [], docsReady: true });
    renderPage();
    expect(screen.getAllByText("الوثيقة غير موجودة").length).toBeGreaterThan(0);
  });
});
