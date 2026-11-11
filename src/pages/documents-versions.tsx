import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, RotateCcw, GitCompareArrows, History, ArrowLeft } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Document } from "../types";
export function VersionsContent({ doc }: { doc: Document }) {
  const { t, lang, toast } = useApp();
  const { restoreVersion, downloadDocument } = useDocsStore();
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {doc.versions.map((v) => (
          <div
            key={v.v}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border p-3",
              v.current
                ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                : "border-ink-200 dark:border-ink-800",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg font-bold text-white",
                v.current ? "bg-emerald-500" : "bg-ink-400",
              )}
            >
              v{v.v}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{v.comment}</p>
              <p className="text-xs text-ink-400">
                {v.by} · {v.date} · {v.size} · {v.fingerprint}
              </p>
            </div>
            {v.current && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {lang === "en" ? "Current version" : "الإصدار الحالي"}
              </Badge>
            )}
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="h-4 w-4" />}
                disabled={!v.id}
                title={v.id ? t("g.download") : lang === "en" ? "No stored file for this version" : "لا يوجد ملف مخزَّن لهذا الإصدار"}
                onClick={() => {
                  if (v.id) void downloadDocument(doc.id, v.id);
                }}
              >
                {t("g.download")}
              </Button>
              {!v.current && (
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setPendingRestore(v.v)}>
                  {lang === "en" ? "Restore" : "استعادة"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore === null) return;
          const version = pendingRestore;
          void restoreVersion(doc.id, version).then((ok) => {
            if (ok)
              toast({
                type: "success",
                title: lang === "en" ? `Restored to v${version}` : `تمت الاستعادة للإصدار ${version}`,
                message: lang === "en" ? "The current version has been replaced." : "تم استبدال الإصدار الحالي.",
              });
          });
        }}
        title={lang === "en" ? `Restore version ${pendingRestore ?? ""}?` : `استعادة الإصدار ${pendingRestore ?? ""}؟`}
        message={
          lang === "en"
            ? "Restoring an older version replaces the current version of this document. A new version entry will be recorded."
            : "استعادة إصدار أقدم تستبدل الإصدار الحالي للوثيقة، وسيُسجَّل إصدار جديد في السجل."
        }
        confirmText={lang === "en" ? "Restore" : "استعادة"}
        danger
      />
    </div>
  );
}

/* ---------------- Versions page ---------------- */
export function Versions() {
  const { id } = useParams();
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const { docs: storeDocs, docsReady, restoreVersion, loadDocument } = useDocsStore();
  const doc = storeDocs.find((d) => d.id === id);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  useEffect(() => {
    if (id) void loadDocument(id);
  }, [id, loadDocument]);

  const doRestore = (v: string) => {
    if (!doc) return;
    void restoreVersion(doc.id, v).then((ok) => {
      if (!ok) return;
      toast({
        type: "success",
        title: lang === "en" ? `Restored to v${v}` : `تمت الاستعادة للإصدار ${v}`,
        message: lang === "en" ? "Document version and history updated" : "تم تحديث إصدار الوثيقة وسجلها",
      });
    });
  };
  if (!doc) {
    if (!docsReady) {
      return (
        <div aria-busy="true">
          <PageHeader title={t("doc.versions")} breadcrumbs={[{ label: t("nav.documents"), to: "/documents" }]} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-72 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
            <div className="h-72 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          </div>
          <span className="sr-only">{lang === "en" ? "Loading versions…" : "جارٍ تحميل الإصدارات…"}</span>
        </div>
      );
    }
    return (
      <div>
        <PageHeader
          title={lang === "en" ? "Document not found" : "الوثيقة غير موجودة"}
          breadcrumbs={[{ label: t("nav.documents"), to: "/documents" }, { label: lang === "en" ? "Not found" : "غير موجودة" }]}
        />
        <Card>
          <EmptyState
            title={lang === "en" ? "Document not found" : "الوثيقة غير موجودة"}
            description={
              lang === "en"
                ? "It may have been deleted or you may not have access to it."
                : "قد تكون محذوفة أو لا تملك صلاحية الوصول إليها."
            }
            action={
              <Button size="sm" onClick={() => navigate("/documents")}>
                {lang === "en" ? "Back to documents" : "العودة إلى الوثائق"}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title={`${t("doc.versions")} — ${doc.docNo}`}
        description={lang === "en" ? "Document version history, comparison and restore" : "سجل إصدارات الوثيقة والمقارنة والاستعادة"}
        breadcrumbs={[
          { label: t("nav.documents"), to: "/documents" },
          { label: lang === "en" ? doc.titleEn : doc.title, to: `/documents/${doc.id}` },
          { label: t("doc.versions") },
        ]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="h-4 w-4 flip-x" />}
            onClick={() => navigate(`/documents/${doc.id}`)}
          >
            {t("g.back")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={lang === "en" ? "Version history" : "سجل الإصدارات"} icon={<History className="h-4 w-4 text-navy-500" />} />
          <div className="space-y-2">
            {doc.versions.map((v) => (
              <div
                key={v.id ?? v.v}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  v.current
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                    : "border-ink-200 dark:border-ink-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white",
                    v.current ? "bg-emerald-500" : "bg-ink-400",
                  )}
                >
                  v{v.v}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{v.comment}</p>
                  <p className="text-xs text-ink-400">
                    {v.by} · {v.date} · {v.size}
                  </p>
                </div>
                {v.current && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {lang === "en" ? "Current" : "حالي"}
                  </Badge>
                )}
                {!v.current && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setPendingRestore(v.v)}>
                    {lang === "en" ? "Restore" : "استعادة"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle
            title={lang === "en" ? "Compare versions" : "مقارنة الإصدارات"}
            icon={<GitCompareArrows className="h-4 w-4 text-navy-500" />}
          />
          {doc.versions.length < 2 ? (
            <EmptyState
              title={lang === "en" ? "Not enough versions" : "لا توجد إصدارات كافية"}
              description={
                lang === "en"
                  ? "At least two versions are required to compare metadata."
                  : "يلزم إصداران على الأقل لمقارنة البيانات الوصفية."
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {doc.versions.slice(0, 2).map((version) => (
                  <div key={version.id ?? version.v} className="rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                    <p className="mb-2 text-xs font-semibold text-ink-500">
                      {lang === "en" ? `Version ${version.v}` : `الإصدار ${version.v}`}
                      {version.current ? (lang === "en" ? " (current)" : " (حالي)") : ""}
                    </p>
                    {[
                      [t("g.owner"), version.by || "—"],
                      [t("g.dateCreated"), version.date],
                      [t("g.size"), version.size],
                      [lang === "en" ? "Version note" : "تعليق الإصدار", version.comment || "—"],
                      ["SHA-256", version.fingerprint || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded px-1 py-0.5">
                        <p className="text-[10px] text-ink-400">{label}</p>
                        <p className="truncate text-sm text-ink-700 dark:text-ink-200">{value}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-navy-50 p-3 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
                {lang === "en"
                  ? `Latest change: version ${doc.versions[0]?.v} by ${doc.versions[0]?.by || "—"} on ${doc.versions[0]?.date}. Binary content comparison is not available in the interface.`
                  : `آخر تغيير: الإصدار ${doc.versions[0]?.v} بواسطة ${doc.versions[0]?.by || "—"} بتاريخ ${doc.versions[0]?.date}. مقارنة محتوى الملفات غير متاحة في الواجهة.`}
              </div>
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore !== null) doRestore(pendingRestore);
        }}
        title={lang === "en" ? `Restore version ${pendingRestore ?? ""}?` : `استعادة الإصدار ${pendingRestore ?? ""}؟`}
        message={
          lang === "en"
            ? "Restoring an older version replaces the current version of this document. A new version entry will be recorded."
            : "استعادة إصدار أقدم تستبدل الإصدار الحالي للوثيقة، وسيُسجَّل إصدار جديد في السجل."
        }
        confirmText={lang === "en" ? "Restore" : "استعادة"}
        danger
      />
    </div>
  );
}
