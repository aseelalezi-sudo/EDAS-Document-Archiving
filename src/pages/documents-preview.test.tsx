import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePreviewDto, FilePreviewReason } from "@edas/shared";
import type { Document } from "../types";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  store: vi.fn(),
  app: vi.fn(),
  preview: vi.fn(),
  retryPreview: vi.fn(),
  logError: vi.fn(),
  objectUrl: { url: "blob:preview", loading: false, error: false } as { url: string | null; loading: boolean; error: boolean },
}));

vi.mock("../store-docs", () => ({ useDocsStore: mocks.store }));
vi.mock("../lib/docs-api", () => ({ docsApi: { preview: mocks.preview, retryPreview: mocks.retryPreview } }));
vi.mock("../lib/preview", () => ({
  absoluteApiUrl: (path: string) => path,
  usePreviewObjectUrl: () => mocks.objectUrl,
}));
vi.mock("../lib/log-error", () => ({ logError: mocks.logError }));
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
        <Route path="/documents/:id" element={<div data-testid="doc-route" />} />
        <Route path="/library" element={<div data-testid="library-route" />} />
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
  mocks.logError.mockReset();
  mocks.objectUrl = { url: "blob:preview", loading: false, error: false };
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

describe("document preview states and tools", () => {
  it("shows a loading blob while the image streams", async () => {
    mocks.objectUrl = { url: null, loading: true, error: false };
    mocks.preview.mockResolvedValue(preview({ kind: "image", status: "ready", detectedType: "image" }));

    renderPreview();

    await waitFor(() => expect(screen.getByText(/تحميل المعاينة/)).toBeInTheDocument());
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("explains a blob that could not be loaded", async () => {
    mocks.objectUrl = { url: null, loading: false, error: true };
    mocks.preview.mockResolvedValue(preview({ kind: "image", status: "ready", detectedType: "image" }));

    renderPreview();

    expect(await screen.findByText("تعذّر تحميل الملف من التخزين.")).toBeInTheDocument();
  });

  it("renders text previews in a blob iframe", async () => {
    mocks.preview.mockResolvedValue(preview({ kind: "text", status: "ready", detectedType: "text" }));

    renderPreview();

    expect(await screen.findByTitle("عقد توريد")).toHaveAttribute("src", "blob:preview");
  });

  it("zooms, rotates and toggles the metadata panel", async () => {
    mocks.preview.mockResolvedValue(preview({ kind: "image", status: "ready", detectedType: "image" }));
    const view = renderPreview();

    await screen.findByRole("img", { name: "عقد توريد" });
    expect(screen.getByText("100%")).toBeInTheDocument();
    const clickIcon = (name: string) => fireEvent.click(view.container.querySelector(`.lucide-${name}`)!.closest("button")!);

    clickIcon("zoom-out");
    expect(screen.getByText("90%")).toBeInTheDocument();
    clickIcon("zoom-in");
    expect(screen.getByText("100%")).toBeInTheDocument();
    clickIcon("rotate-cw");
    expect(screen.getByRole("img").getAttribute("style")).toContain("rotate(90deg)");

    expect(screen.getByText("doc.docNo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "doc.metadata" }));
    expect(screen.queryByText("doc.docNo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "doc.metadata" }));
    expect(screen.getByText("doc.docNo")).toBeInTheDocument();
  });

  it("downloads the current version and goes back to the document", async () => {
    const st = store();
    mocks.store.mockReturnValue(st);
    renderPreview();

    await screen.findByTestId("pdf-viewer");
    fireEvent.click(screen.getByRole("button", { name: "g.download" }));
    await waitFor(() => expect(st.downloadDocument).toHaveBeenCalledWith("doc-1", "version-1"));

    fireEvent.click(screen.getByRole("button", { name: "g.back" }));
    expect(screen.getByTestId("doc-route")).toBeInTheDocument();
  });

  it("guides a missing document back to the library", async () => {
    mocks.store.mockReturnValue(store({ docs: [] }));
    renderPreview();

    expect(await screen.findByText("الوثيقة غير موجودة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "g.back" }));
    expect(screen.getByTestId("library-route")).toBeInTheDocument();
  });

  it("logs a failed detail load without blocking the preview", async () => {
    const error = new Error("detail boom");
    mocks.store.mockReturnValue(store({ loadDocument: vi.fn().mockRejectedValue(error) }));
    renderPreview();

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
    await waitFor(() => expect(mocks.logError).toHaveBeenCalledWith("document detail load", error));
  });

  it("re-fetches the preview after a connection failure", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(preview());

    renderPreview();

    expect(await screen.findByText("تعذّر تحميل المعاينة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
  });

  it("waits for the detail load before declaring no attached file", async () => {
    let finish!: () => void;
    const loadDocument = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    mocks.store.mockReturnValue(store({ docs: [doc({ versions: [] })], loadDocument }));
    renderPreview();

    expect(screen.getByText("جارٍ تحميل المعاينة…")).toBeInTheDocument();
    await act(async () => finish());

    expect(await screen.findByText("لا يوجد ملف مرفق")).toBeInTheDocument();
  });

  it("announces a DWG conversion and then polls for the result", async () => {
    vi.useFakeTimers();
    try {
      mocks.preview
        .mockResolvedValueOnce(preview({ kind: "cad", status: "converting", source: "dwg", detectedType: "dwg", url: null }))
        .mockRejectedValueOnce(new Error("poll boom"))
        .mockResolvedValueOnce(preview({ kind: "cad", status: "ready", detectedType: "dwg" }));
      renderPreview();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("جارٍ تحويل مخطط DWG للمعاينة…")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(mocks.logError).toHaveBeenCalledWith("preview poll", expect.any(Error));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByTestId("dxf-viewer")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the conversion failure after an unsuccessful retry", async () => {
    mocks.preview.mockResolvedValue(preview({ status: "failed", url: null, reason: "conversion_failed", retryable: true }));
    mocks.retryPreview.mockRejectedValue(new Error("still failing"));

    renderPreview();

    expect(await screen.findByText("فشل التحويل")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });

    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
    expect(screen.getByText("فشل التحويل")).toBeInTheDocument();
  });

  it("switches to the forbidden state when the retry is refused", async () => {
    mocks.preview.mockResolvedValue(preview({ status: "failed", url: null, reason: "conversion_failed", retryable: true }));
    mocks.retryPreview.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));

    renderPreview();

    expect(await screen.findByText("فشل التحويل")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });

    expect(await screen.findByText("لا تملك صلاحية معاينة هذه الوثيقة")).toBeInTheDocument();
  });

  it("renders the viewer for a failed job right after a successful retry", async () => {
    mocks.preview.mockResolvedValue(preview({ status: "failed", url: null, reason: "conversion_failed", retryable: true }));
    mocks.retryPreview.mockResolvedValue(preview());

    renderPreview();

    expect(await screen.findByText("فشل التحويل")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    });

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
  });

  it("blocks the inline view when a ready preview has no URL", async () => {
    mocks.preview.mockResolvedValue(preview({ status: "ready", url: null }));

    renderPreview();

    expect(await screen.findByText("المعاينة غير متاحة")).toBeInTheDocument();
    expect(screen.getByText(/لا يمكن معاينة هذا النوع من الملفات/)).toBeInTheDocument();
  });

  it("falls back for a ready preview kind without a viewer", async () => {
    mocks.preview.mockResolvedValue(preview({ kind: "unsupported", status: "ready", detectedType: "bin" }));

    renderPreview();

    expect(await screen.findByText("المعاينة المباشرة غير مدعومة")).toBeInTheDocument();
  });
});

describe("document preview reasons", () => {
  const reasons: [FilePreviewReason, string][] = [
    ["too_large", "حجم الملف أكبر من الحد المسموح للمعاينة."],
    ["unreadable", "تعذّرت قراءة الملف من التخزين."],
    ["unsupported_type", "لا يمكن معاينة هذا النوع من الملفات في المتصفح."],
    ["type_mismatch", "محتوى الملف لا يطابق اسمه أو نوعه المعلن"],
    ["image_not_supported", "صيغة الصورة غير مدعومة في المتصفح."],
    ["conversion_timeout", "استغرق التحويل وقتاً طويلاً وتم إيقافه."],
    ["conversion_produced_no_output", "انتهت أداة التحويل دون إنتاج ملف معاينة."],
    ["converter_busy", "الخادم مشغول بتحويل ملفات أخرى."],
  ];

  it.each(reasons)("explains the %s reason", async (reason, message) => {
    mocks.preview.mockResolvedValue(preview({ kind: "unsupported", status: "unavailable", url: null, reason }));

    renderPreview();

    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
  });

  it("falls back to the generic message when no reason is recorded", async () => {
    mocks.preview.mockResolvedValue(preview({ kind: "unsupported", status: "unavailable", url: null, reason: null }));

    renderPreview();

    expect(await screen.findByText("المعاينة غير متاحة لهذا الملف.")).toBeInTheDocument();
  });
});
