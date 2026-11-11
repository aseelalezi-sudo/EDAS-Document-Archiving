import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, ZoomIn, ZoomOut, RotateCw, ArrowLeft, FileText, Info, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import type { FilePreviewDto, FilePreviewReason } from "@edas/shared";
import { useApp } from "../store";
import { cn, Button, Card, StatusBadge, Tooltip, EmptyState } from "../components/ui";
import { SectionTitle, MetaGrid, FileIcon } from "../components/shared";
import { deptName } from "../data";
import { useDocsStore } from "../store-docs";
import { usePreviewObjectUrl } from "../lib/preview";
import { docsApi } from "../lib/docs-api";
import { ApiError } from "../lib/api-client";
import { logError } from "../lib/log-error";

const PdfViewer = lazy(() => import("../components/preview/pdf-viewer").then((module) => ({ default: module.PdfViewer })));
const DxfViewer = lazy(() => import("../components/preview/dxf-viewer").then((module) => ({ default: module.DxfViewer })));

function reasonMessage(reason: FilePreviewReason | null, lang: "ar" | "en"): string {
  const en = lang === "en";
  switch (reason) {
    case "converter_unavailable":
      return en
        ? "This file type needs an external converter that is not installed on the server. Ask an administrator to install LibreOffice (Office files) or the ODA File Converter (DWG)."
        : "يحتاج هذا النوع من الملفات إلى أداة تحويل خارجية غير مثبتة على الخادم. اطلب من المسؤول تثبيت LibreOffice لملفات Office أو ODA File Converter لملفات DWG.";
    case "too_large":
      return en ? "The file is larger than the preview size limit." : "حجم الملف أكبر من الحد المسموح للمعاينة.";
    case "unreadable":
      return en ? "The stored file could not be read from storage." : "تعذّرت قراءة الملف من التخزين.";
    case "unsupported_type":
      return en
        ? "This file type cannot be previewed in the browser. Download it to open it with the appropriate application."
        : "لا يمكن معاينة هذا النوع من الملفات في المتصفح. نزّله لفتحه بالتطبيق المناسب.";
    case "type_mismatch":
      return en
        ? "The stored content does not match the file name or declared type, so preview was blocked."
        : "محتوى الملف لا يطابق اسمه أو نوعه المعلن، لذلك تم إيقاف المعاينة.";
    case "image_not_supported":
      return en ? "This image format is not supported by the browser." : "صيغة الصورة غير مدعومة في المتصفح.";
    case "conversion_timeout":
      return en ? "The conversion took too long and was stopped." : "استغرق التحويل وقتاً طويلاً وتم إيقافه.";
    case "conversion_produced_no_output":
      return en ? "The converter finished without producing a preview file." : "انتهت أداة التحويل دون إنتاج ملف معاينة.";
    case "converter_busy":
      return en
        ? "The server is busy converting other files. Try again shortly."
        : "الخادم مشغول بتحويل ملفات أخرى. أعد المحاولة بعد قليل.";
    case "conversion_failed":
      return en ? "The file could not be converted for preview." : "تعذّر تحويل الملف للمعاينة.";
    default:
      return en ? "Preview is not available for this file." : "المعاينة غير متاحة لهذا الملف.";
  }
}

interface BlobPreviewProps {
  path: string;
  lang: "ar" | "en";
  alt: string;
  kind: "image" | "text";
  zoom: number;
  rotation: number;
}

function BlobPreview({ path, lang, alt, kind, zoom, rotation }: BlobPreviewProps) {
  const objectUrl = usePreviewObjectUrl(path);

  if (objectUrl.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-ink-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        {lang === "en" ? "Loading preview…" : "جارٍ تحميل المعاينة…"}
      </div>
    );
  }
  if (objectUrl.error || !objectUrl.url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-ink-500">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
        {lang === "en" ? "The file could not be loaded from storage." : "تعذّر تحميل الملف من التخزين."}
      </div>
    );
  }
  if (kind === "text") {
    return (
      <iframe title={alt} src={objectUrl.url} className="h-full w-full rounded-lg border border-ink-200 bg-white dark:border-ink-800" />
    );
  }
  return (
    <img
      src={objectUrl.url}
      alt={alt}
      className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
      style={{ transform: `rotate(${rotation}deg) scale(${zoom / 100})` }}
    />
  );
}

/* ---------------- Document Preview ---------------- */
export function DocumentPreview() {
  const { id } = useParams();
  const { t, lang, apiMode } = useApp();
  const navigate = useNavigate();
  const { docs, docsReady, downloadDocument, loadDocument, can } = useDocsStore();
  const doc = docs.find((d) => d.id === id);
  const [zoom, setZoom] = useState(100);
  const [rot, setRot] = useState(0);
  const [showMeta, setShowMeta] = useState(true);
  const [preview, setPreview] = useState<FilePreviewDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const version = doc ? (doc.versions.find((v) => v.current) ?? doc.versions[0]) : undefined;
  const fileId = version?.fileId;
  const title = lang === "en" ? doc?.titleEn : doc?.title;
  const isArabic = lang !== "en";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetailLoading(true);
    loadDocument(id)
      .catch((error) => logError("document detail load", error))
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadDocument]);

  useEffect(() => {
    setPreview(null);
    setFailed(false);
    setForbidden(false);
    if (!fileId || !apiMode) return;
    let cancelled = false;
    const controller = new AbortController();
    docsApi
      .preview(fileId, controller.signal)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 403) setForbidden(true);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fileId, apiMode, reloadKey]);

  const previewStatus = preview?.status;
  useEffect(() => {
    if (!fileId || !apiMode || previewStatus !== "converting") return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      docsApi
        .preview(fileId, controller.signal)
        .then((result) => setPreview(result))
        .catch((error) => {
          if (!controller.signal.aborted) logError("preview poll", error);
        });
    }, 2500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fileId, apiMode, previewStatus]);

  const retry = async () => {
    if (!fileId) return;
    setRetrying(true);
    setFailed(false);
    try {
      setPreview(await docsApi.retryPreview(fileId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setForbidden(true);
      } else {
        setFailed(true);
        setReloadKey((value) => value + 1);
      }
    } finally {
      setRetrying(false);
    }
  };

  if (!doc) {
    if (apiMode && (!docsReady || detailLoading)) {
      return (
        <div aria-busy="true" className="space-y-3">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
          <div className="h-[60vh] animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          <span className="sr-only">{isArabic ? "جارٍ تحميل الوثيقة…" : "Loading document…"}</span>
        </div>
      );
    }
    return (
      <EmptyState
        title={isArabic ? "الوثيقة غير موجودة" : "Document not found"}
        description={isArabic ? "قد تكون الوثيقة قد حُذفت." : "The document may have been deleted."}
        action={
          <Button onClick={() => navigate("/library")} icon={<ArrowLeft className="h-4 w-4 flip-x" />}>
            {t("g.back")}
          </Button>
        }
      />
    );
  }

  const canDownload = can("download", doc.folderId, doc.deptId);
  const mayDownload = apiMode ? (preview?.downloadable ?? canDownload) : canDownload;
  const download = () => void downloadDocument(doc.id, version?.id);
  const showImageTools = preview?.status === "ready" && preview.kind === "image";
  const previewUrl = preview?.url ?? null;

  const renderPreview = () => {
    if (!apiMode) {
      return (
        <EmptyState
          title={isArabic ? "المعاينة تتطلب الاتصال بالخادم" : "Preview requires the server connection"}
          description={
            isArabic
              ? "يعمل التطبيق حالياً في الوضع التجريبي دون خادم، لذا لا يمكن معاينة الملف داخل الصفحة. يمكنك تنزيل نسخة تجريبية أو تشغيل الخادم للمعاينة الكاملة."
              : "The app is running in offline prototype mode, so the stored file cannot be previewed here. Download a demo copy or connect the API for full previews."
          }
          action={
            mayDownload ? (
              <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
                {t("g.download")}
              </Button>
            ) : undefined
          }
        />
      );
    }
    if (!fileId) {
      return detailLoading ? (
        <p className="text-sm text-ink-500">{isArabic ? "جارٍ تحميل المعاينة…" : "Loading preview…"}</p>
      ) : (
        <EmptyState
          title={isArabic ? "لا يوجد ملف مرفق" : "No file attached"}
          description={
            isArabic ? "لا يوجد إصدار ملف مخزَّن لمعاينته لهذه الوثيقة." : "This document has no stored file version to preview."
          }
        />
      );
    }
    if (forbidden) {
      return (
        <EmptyState
          title={isArabic ? "لا تملك صلاحية معاينة هذه الوثيقة" : "You cannot preview this document"}
          description={
            isArabic
              ? "تحتاج صلاحية عرض على الوثيقة لمعاينتها. اطلب من مالك الوثيقة أو مسؤول النظام منحك الوصول."
              : "Preview requires view permission on this document. Ask the document owner or an administrator for access."
          }
        />
      );
    }
    if (failed) {
      return (
        <EmptyState
          title={isArabic ? "تعذّر تحميل المعاينة" : "Preview could not be loaded"}
          description={
            isArabic
              ? "تعذّر الاتصال بخدمة المعاينة. تحقق من اتصالك ثم أعد المحاولة، أو نزّل الملف."
              : "The preview service could not be reached. Check your connection and try again, or download the file."
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => setReloadKey((value) => value + 1)}
              >
                {isArabic ? "إعادة المحاولة" : "Try again"}
              </Button>
              {mayDownload && (
                <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
                  {t("g.download")}
                </Button>
              )}
            </div>
          }
        />
      );
    }
    if (!preview) {
      return (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {isArabic ? "جارٍ تحميل المعاينة…" : "Loading preview…"}
        </div>
      );
    }
    if (preview.status === "converting") {
      return (
        <div className="flex max-w-md flex-col items-center gap-3 p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-navy-500" />
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">
            {preview.kind === "cad"
              ? isArabic
                ? "جارٍ تحويل مخطط DWG للمعاينة…"
                : "Converting the DWG drawing for preview…"
              : isArabic
                ? "جارٍ تحويل الملف إلى PDF للمعاينة…"
                : "Converting the file to PDF for preview…"}
          </p>
          <p className="text-xs text-ink-400">
            {isArabic
              ? "قد يستغرق هذا بعض الوقت. ستُحدَّث المعاينة تلقائياً."
              : "This can take a moment. The preview refreshes automatically."}
          </p>
        </div>
      );
    }
    if (preview.status === "failed" || preview.status === "unavailable") {
      return (
        <EmptyState
          title={
            preview.status === "failed"
              ? isArabic
                ? "فشل التحويل"
                : "Conversion failed"
              : isArabic
                ? "المعاينة غير متاحة"
                : "Preview unavailable"
          }
          description={reasonMessage(preview.reason, lang)}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {preview.retryable && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => void retry()}
                  disabled={retrying}
                >
                  {retrying ? (isArabic ? "جارٍ إعادة المحاولة…" : "Retrying…") : isArabic ? "إعادة المحاولة" : "Try again"}
                </Button>
              )}
              {mayDownload && (
                <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
                  {t("g.download")}
                </Button>
              )}
            </div>
          }
        />
      );
    }
    if (!previewUrl) {
      return (
        <EmptyState title={isArabic ? "المعاينة غير متاحة" : "Preview unavailable"} description={reasonMessage("unsupported_type", lang)} />
      );
    }
    if (preview.kind === "pdf") {
      return (
        <Suspense fallback={<PreviewFallback label={isArabic ? "جارٍ تهيئة عارض PDF…" : "Preparing the PDF viewer…"} />}>
          <PdfViewer
            url={previewUrl}
            labels={{
              loading: isArabic ? "جارٍ تحميل مستند PDF…" : "Loading the PDF…",
              progress: isArabic ? "تم التحميل" : "Loaded",
              error: isArabic ? "تعذّر عرض مستند PDF." : "The PDF could not be displayed.",
              retry: isArabic ? "إعادة المحاولة" : "Try again",
              previous: isArabic ? "الصفحة السابقة" : "Previous page",
              next: isArabic ? "الصفحة التالية" : "Next page",
              page: isArabic ? "صفحة PDF" : "PDF page",
              zoomIn: isArabic ? "تكبير" : "Zoom in",
              zoomOut: isArabic ? "تصغير" : "Zoom out",
              fit: isArabic ? "ملاءمة العرض" : "Fit to width",
              rotate: isArabic ? "تدوير" : "Rotate",
            }}
          />
        </Suspense>
      );
    }
    if (preview.kind === "cad") {
      return (
        <Suspense fallback={<PreviewFallback label={isArabic ? "جارٍ تهيئة عارض CAD…" : "Preparing the CAD viewer…"} />}>
          <DxfViewer
            url={previewUrl}
            labels={{
              loading: isArabic ? "جارٍ تحميل المخطط…" : "Loading the drawing…",
              parsing: isArabic ? "جارٍ تجهيز المخطط…" : "Preparing the drawing…",
              error: isArabic ? "تعذّر عرض مخطط CAD." : "The CAD drawing could not be displayed.",
              retry: isArabic ? "إعادة المحاولة" : "Try again",
              zoomIn: isArabic ? "تكبير" : "Zoom in",
              zoomOut: isArabic ? "تصغير" : "Zoom out",
              fit: isArabic ? "ملاءمة الرسم" : "Fit drawing",
              layers: isArabic ? "الطبقات" : "Layers",
              showLayer: isArabic ? "إظهار الطبقة" : "Show layer",
              hideLayer: isArabic ? "إخفاء الطبقة" : "Hide layer",
            }}
          />
        </Suspense>
      );
    }
    if (preview.kind === "image" || preview.kind === "text") {
      return (
        <BlobPreview key={previewUrl} path={previewUrl} lang={lang} alt={title ?? ""} kind={preview.kind} zoom={zoom} rotation={rot} />
      );
    }
    return (
      <EmptyState
        title={isArabic ? "المعاينة المباشرة غير مدعومة" : "Inline preview not supported"}
        description={reasonMessage(preview.reason ?? "unsupported_type", lang)}
        action={
          mayDownload ? (
            <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
              {t("g.download")}
            </Button>
          ) : undefined
        }
      />
    );
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate(`/documents/${doc.id}`)}>
          {t("g.back")}
        </Button>
        <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-ink-700" />
        <div className="flex items-center gap-2">
          <FileIcon type={doc.fileType} size="sm" />
          <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{title}</span>
          <StatusBadge status={doc.status} />
        </div>
        <div className="ms-auto flex items-center gap-1">
          {mayDownload && (
            <Button
              size="sm"
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              aria-label={t("g.download")}
              title={t("g.download")}
              onClick={download}
            />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto xl:flex-row xl:overflow-hidden">
        <Card pad={false} className="flex min-h-[420px] min-w-0 flex-1 flex-col xl:min-h-0">
          <div className="flex items-center gap-1 border-b border-ink-100 px-2 py-1.5 dark:border-ink-800">
            {showImageTools && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((value) => Math.max(50, value - 10))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xs text-ink-500">{zoom}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((value) => Math.min(300, value + 10))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRot((value) => (value + 90) % 360)}>
                  <RotateCw className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-5 w-px bg-ink-200 dark:bg-ink-700" />
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showMeta && "text-navy-600")}
              onClick={() => setShowMeta((value) => !value)}
              aria-label={t("doc.metadata")}
              title={t("doc.metadata")}
            >
              <Info className="h-4 w-4" />
            </Button>
            <span className="ms-auto pe-1 text-[11px] text-ink-400">
              {isArabic ? `الإصدار ${version?.v ?? "—"}` : `Version ${version?.v ?? "—"}`}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-ink-100 dark:bg-ink-950">
            <div className="flex h-full w-full items-center justify-center">{renderPreview()}</div>
          </div>
        </Card>

        {showMeta && (
          <Card className="w-full shrink-0 overflow-y-auto xl:w-64">
            <SectionTitle title={t("doc.metadata")} icon={<FileText className="h-4 w-4 text-navy-500" />} />
            <MetaGrid
              items={[
                { label: t("doc.docNo"), value: doc.docNo },
                { label: t("g.version"), value: doc.version },
                { label: t("doc.classification"), value: t(`doc.classification.${doc.classification}`) },
                { label: t("g.owner"), value: doc.owner },
                { label: t("g.department"), value: deptName(doc.deptId, lang) },
                { label: t("g.size"), value: doc.size },
                { label: t("g.dateCreated"), value: doc.createdAt },
                { label: t("g.dateModified"), value: doc.modifiedAt },
              ]}
            />
            <Tooltip
              label={
                isArabic
                  ? "تُبثّ المعاينة عبر الخادم بعد التحقق من صلاحياتك"
                  : "Previews stream through the API after checking your permissions"
              }
            >
              <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
                {isArabic
                  ? "تُقدَّم المعاينة عبر رابط محمي بالجلسة، وتُخزَّن نسخ المعاينة المؤقتة بشكل خاص."
                  : "Previews are streamed through an authenticated endpoint, and converted copies are stored privately."}
              </p>
            </Tooltip>
          </Card>
        )}
      </div>
    </div>
  );
}

function PreviewFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-ink-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}
