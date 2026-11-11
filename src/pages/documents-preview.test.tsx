import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePreviewDto } from "@edas/shared";
import type { Document } from "../types";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  store: vi.fn(),
  app: vi.fn(),
  preview: vi.fn(),
  retryPreview: vi.fn(),
}));

vi.mock("../store-docs", () => ({ useDocsStore: mocks.store }));
vi.mock("../lib/docs-api", () => ({ docsApi: { preview: mocks.preview, retryPreview: mocks.retryPreview } }));
vi.mock("../lib/preview", () => ({
  absoluteApiUrl: (path: string) => path,
  usePreviewObjectUrl: () => ({ url: "blob:preview", loading: false, error: false }),
}));
vi.mock("../components/preview/pdf-viewer", () => ({
  PdfViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer">{url}</div>,
}));
vi.mock("../components/preview/dxf-viewer", () => ({
  DxfViewer: ({ url }: { url: string }) => <div data-testid="dxf-viewer">{url}</div>,
}));
vi.mock("../store", () => ({
  useApp: mocks.app,
}));

import { DocumentPreview } from "./documents-preview";

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
    size: "12 KB",
    fileType: "pdf",
    folderId: "f-contracts",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [
      {
        id: "version-1",
        fileId: "file-1",
        mimeType: "application/pdf",
        v: "1.0",
        date: "2026-01-01",
        by: "أمل السبيعي",
        size: "12 KB",
        fingerprint: "",
        comment: "",
        current: true,
      },
    ],
    activity: [],
    retentionDays: 30,
    ...overrides,
  };
}

function preview(overrides: Partial<FilePreviewDto> = {}): FilePreviewDto {
  return {
    fileId: "file-1",
    kind: "pdf",
    status: "ready",
    source: "original",
    detectedType: "pdf",
    fileName: "contract.pdf",
    mimeType: "application/pdf",
    url: "/api/v1/preview/files/file-1/content?kind=original",
    reason: null,
    message: null,
    retryable: false,
    expiresInSeconds: 900,
    startedAt: null,
    elapsedMs: null,
    ...overrides,
  };
}

function store(overrides: Record<string, unknown> = {}) {
  return {
    docs: [doc()],
    docsReady: true,
    loadDocument: vi.fn().mockResolvedValue(undefined),
    downloadDocument: vi.fn().mockResolvedValue(undefined),
    can: () => true,
    ...overrides,
  };
}

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={["/documents/doc-1/preview"]}>
      <Routes>
        <Route path="/documents/:id/preview" element={<DocumentPreview />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.store.mockReset();
  mocks.app.mockReset();
  mocks.preview.mockReset();
  mocks.retryPreview.mockReset();
  mocks.store.mockReturnValue(store());
  mocks.app.mockReturnValue({ t: (key: string) => key, lang: "ar", apiMode: true });
  mocks.preview.mockResolvedValue(preview());
});

describe("document preview", () => {
  it("renders the PDF viewer for a ready PDF preview", async () => {
    renderPreview();

    expect(await screen.findByText("عقد توريد")).toBeInTheDocument();
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith("file-1", expect.anything()));
    const viewer = await screen.findByTestId("pdf-viewer");
    expect(viewer).toHaveTextContent("/api/v1/preview/files/file-1/content?kind=original");
  });

  it("shows the download action when the caller may download the file", async () => {
    renderPreview();

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "g.download" })).toBeInTheDocument();
  });

  it("hides the download action when the caller may not download", async () => {
    mocks.store.mockReturnValue(store({ can: () => false }));
    mocks.preview.mockResolvedValue(preview({ downloadable: false }));

    renderPreview();

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "g.download" })).toBeNull();
  });

  it("explains a refused preview instead of a connection failure", async () => {
    mocks.preview.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));

    renderPreview();

    expect(await screen.findByText("لا تملك صلاحية معاينة هذه الوثيقة")).toBeInTheDocument();
  });

  it("shows a conversion state while Office files are being prepared", async () => {
    mocks.preview.mockResolvedValue(preview({ kind: "pdf", status: "converting", source: "office", detectedType: "docx", url: null }));

    renderPreview();

    expect(await screen.findByText("جارٍ تحويل الملف إلى PDF للمعاينة…")).toBeInTheDocument();
  });

  it("explains that previews need the API in offline prototype mode", async () => {
    mocks.app.mockReturnValue({ t: (key: string) => key, lang: "ar", apiMode: false });

    renderPreview();

    expect(await screen.findByText("المعاينة تتطلب الاتصال بالخادم")).toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("explains that LibreOffice is missing instead of failing silently", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        kind: "unsupported",
        status: "unavailable",
        source: "office",
        detectedType: "docx",
        url: null,
        reason: "converter_unavailable",
      }),
    );

    renderPreview();

    expect(await screen.findByText("المعاينة غير متاحة")).toBeInTheDocument();
    expect(screen.getByText(/LibreOffice/)).toBeInTheDocument();
  });

  it("renders converted DWG output in the CAD viewer", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        kind: "cad",
        status: "ready",
        source: "dwg",
        detectedType: "dwg",
        url: "/api/v1/preview/files/file-1/content?kind=preview",
      }),
    );

    renderPreview();

    const viewer = await screen.findByTestId("dxf-viewer");
    expect(viewer).toHaveTextContent("kind=preview");
  });

  it("renders images through an authenticated blob URL", async () => {
    mocks.preview.mockResolvedValue(
      preview({ kind: "image", status: "ready", detectedType: "image", url: "/api/v1/preview/files/file-1/content?kind=original" }),
    );

    renderPreview();

    const image = await screen.findByRole("img", { name: "عقد توريد" });
    expect(image).toHaveAttribute("src", "blob:preview");
  });

  it("offers a retry action for a failed conversion", async () => {
    mocks.preview.mockResolvedValue(
      preview({ status: "failed", url: null, reason: "conversion_failed", retryable: true, detectedType: "xlsx" }),
    );
    mocks.retryPreview.mockResolvedValue(preview());

    renderPreview();

    expect(await screen.findByText("فشل التحويل")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });
    await waitFor(() => expect(mocks.retryPreview).toHaveBeenCalledWith("file-1"));
  });

  it("keeps a loading state instead of a false not-found while the list loads", async () => {
    mocks.store.mockReturnValue(store({ docs: [], docsReady: false }));
    const view = renderPreview();

    expect(screen.getByText("جارٍ تحميل الوثيقة…")).toBeInTheDocument();
    expect(screen.queryByText("الوثيقة غير موجودة")).toBeNull();

    mocks.store.mockReturnValue(store({ docs: [], docsReady: true }));
    view.rerender(
      <MemoryRouter initialEntries={["/documents/doc-1/preview"]}>
        <Routes>
          <Route path="/documents/:id/preview" element={<DocumentPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("الوثيقة غير موجودة")).toBeInTheDocument();
  });
});
