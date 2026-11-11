import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Maximize2, RefreshCw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "../ui";
import { absoluteApiUrl } from "../../lib/preview";
import { pdfRenderIntent, supportsAnimationFrame } from "./pdf-render";

export interface PdfViewerLabels {
  loading: string;
  progress: string;
  error: string;
  retry: string;
  previous: string;
  next: string;
  page: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  rotate: string;
}

interface PdfViewerProps {
  url: string;
  labels: PdfViewerLabels;
}

type PdfModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfModule> | null = null;

async function loadPdfjs(): Promise<PdfModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?worker&inline")]);
      pdfjs.GlobalWorkerOptions.workerPort = new worker.default();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export function PdfViewer({ url, labels }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [baseWidth, setBaseWidth] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const fittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setStatus("loading");
    setError(null);
    setProgress(0);
    setPages(0);
    fittedRef.current = false;

    (async () => {
      const pdfjs = await loadPdfjs();
      if (cancelled) return;
      const task = pdfjs.getDocument({
        url: absoluteApiUrl(url),
        withCredentials: true,
        disableFontFace: true,
      });
      loadingTask = task;
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        if (cancelled || !total) return;
        setProgress(Math.min(100, Math.round((loaded / total) * 100)));
      };
      const document = await task.promise;
      if (cancelled) {
        await task.destroy();
        return;
      }
      documentRef.current = document;
      setPages(document.numPages);
      setPage(1);
      setStatus("ready");
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });

    return () => {
      cancelled = true;
      documentRef.current = null;
      void loadingTask?.destroy();
    };
  }, [url, reloadKey]);

  useEffect(() => {
    if (status !== "ready") return;
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    (async () => {
      const pdfPage = await document.getPage(Math.min(Math.max(1, page), document.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1, rotation });
      setBaseWidth(base.width);
      const viewport = pdfPage.getViewport({ scale, rotation });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      const animationFrame = await supportsAnimationFrame();
      if (cancelled) return;
      const task = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        intent: pdfRenderIntent(animationFrame),
      });
      renderTask = task;
      await task.promise;
      if (!cancelled && !fittedRef.current) {
        fittedRef.current = true;
        const container = canvas.parentElement;
        if (container && base.width > 0) {
          const available = container.clientWidth - 32;
          if (available > 0) setScale(Math.max(0.25, Math.min(3, available / base.width)));
        }
      }
    })().catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof Error && cause.name === "RenderingCancelledException") return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [status, page, scale, rotation, pages, reloadKey]);

  const fit = useCallback(() => {
    const container = canvasRef.current?.parentElement;
    if (!container || baseWidth <= 0) return;
    const available = container.clientWidth - 32;
    if (available <= 0) return;
    setScale(Math.max(0.25, Math.min(3, available / baseWidth)));
  }, [baseWidth]);

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="max-w-md text-sm text-ink-600 dark:text-ink-300">{labels.error}</p>
        <p className="max-w-md break-words text-xs text-ink-400 dark:text-ink-300">{error}</p>
        <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setReloadKey((value) => value + 1)}>
          {labels.retry}
        </Button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-navy-500" />
        <p className="text-sm text-ink-600 dark:text-ink-300">{labels.loading}</p>
        {progress > 0 && (
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
            <div className="h-full rounded-full bg-navy-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {progress > 0 && (
          <span className="text-[11px] text-ink-400">
            {labels.progress} {progress}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 bg-white/60 px-2 py-1.5 dark:border-ink-800 dark:bg-ink-900/40">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.previous}
          title={labels.previous}
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronRight className="h-4 w-4 flip-x" />
        </Button>
        <span className="min-w-16 text-center text-xs text-ink-500">
          {page} / {pages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.next}
          title={labels.next}
          disabled={page >= pages}
          onClick={() => setPage((value) => Math.min(pages, value + 1))}
        >
          <ChevronLeft className="h-4 w-4 flip-x" />
        </Button>
        <div className="mx-1 h-5 w-px bg-ink-200 dark:bg-ink-700" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.zoomOut}
          title={labels.zoomOut}
          onClick={() => setScale((value) => Math.max(0.25, Number((value - 0.2).toFixed(2))))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs text-ink-500">{Math.round(scale * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.zoomIn}
          title={labels.zoomIn}
          onClick={() => setScale((value) => Math.min(4, Number((value + 0.2).toFixed(2))))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={labels.fit} title={labels.fit} onClick={fit}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.rotate}
          title={labels.rotate}
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-ink-100 p-4 dark:bg-ink-950">
        <canvas ref={canvasRef} className="mx-auto block rounded bg-white shadow-lg" aria-label={labels.page} />
      </div>
    </div>
  );
}
