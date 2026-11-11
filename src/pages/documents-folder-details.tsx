import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Archive, Download, Eye, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, StatusBadge, Tabs, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu, MetaGrid, FileIcon, Timeline } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Document } from "../types";
import { ACLRulesEditor } from "./document-widgets";
/* ---------------- Folder Details ---------------- */
export function FolderDetails() {
  const { id } = useParams();
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedTab = (location.state as { tab?: string } | null)?.tab;
  const [tab, setTab] = useState(requestedTab ?? "contents");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ kind: "archive" | "delete"; ids: string[] } | null>(null);
  const { folders: allFolders, scopedDocs, docsReady, downloadDocument, archiveDocs, deleteDocs } = useDocsStore();
  const folder = allFolders.find((f) => f.id === id);

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab, location.key]);

  const runConfirmedAction = () => {
    if (!confirmAction) return;
    const ids = confirmAction.ids;
    if (confirmAction.kind === "archive") {
      archiveDocs(ids, (ok) => {
        if (!ok) return;
        toast({
          type: "success",
          title: t("doc.archiveNow"),
          message: `${ids.length} ${lang === "en" ? "item(s)" : "عنصر"}`,
        });
        setSelected([]);
      });
      return;
    }
    deleteDocs(ids, (ok) => {
      if (!ok) return;
      toast({
        type: "error",
        title: lang === "en" ? "Moved to trash" : "نقل إلى السلة",
        message: `${ids.length} ${lang === "en" ? "item(s)" : "عنصر"}`,
      });
      setSelected([]);
    });
  };

  if (!docsReady) {
    return (
      <div aria-busy="true">
        <PageHeader title={lang === "en" ? "Folder" : "مجلد"} breadcrumbs={[{ label: t("nav.library"), to: "/library" }]} />
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
        <span className="sr-only">{lang === "en" ? "Loading folder…" : "جارٍ تحميل المجلد…"}</span>
      </div>
    );
  }

  if (!folder) {
    return (
      <div>
        <PageHeader
          title={lang === "en" ? "Folder not found" : "المجلد غير موجود"}
          breadcrumbs={[{ label: t("nav.library"), to: "/library" }, { label: lang === "en" ? "Not found" : "غير موجود" }]}
        />
        <Card>
          <EmptyState
            variant="folder"
            title={lang === "en" ? "This folder was not found" : "لم يتم العثور على هذا المجلد"}
            description={
              lang === "en"
                ? "It may have been deleted or you may not have access to it."
                : "قد يكون محذوفاً أو لا تملك صلاحية الوصول إليه."
            }
            action={
              <Button size="sm" onClick={() => navigate("/library")}>
                {lang === "en" ? "Back to library" : "العودة إلى المكتبة"}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const docs = scopedDocs.filter((d) => d.folderId === folder.id);
  const parent = allFolders.find((f) => f.id === folder.parentId);
  const activity = docs.flatMap((d) => d.activity.map((a) => ({ ...a, docTitle: lang === "en" ? d.titleEn : d.title }))).slice(0, 8);

  return (
    <div>
      <PageHeader
        title={lang === "en" ? folder.nameEn : folder.name}
        description={lang === "en" ? "Manage folder contents and permissions" : "إدارة محتويات وصلاحيات المجلد"}
        breadcrumbs={[{ label: t("nav.library"), to: "/library" }, { label: lang === "en" ? folder.nameEn : folder.name }]}
        actions={
          <Button size="sm" variant="outline" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setTab("permissions")}>
            {t("doc.permissions")}
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [lang === "en" ? "Documents" : "الوثائق", docs.length],
          [lang === "en" ? "Subfolders" : "المجلدات الفرعية", folder.subfolders],
          [lang === "en" ? "Access scope" : "نطاق الوصول", folder.accessScope],
          [lang === "en" ? "Parent folder" : "المجلد الأب", parent ? (lang === "en" ? parent.nameEn : parent.name) : "—"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-xs text-ink-400">{label}</p>
            <p className="mt-1 text-lg font-bold text-ink-800 dark:text-ink-100">{value}</p>
          </Card>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-navy-600 px-4 py-2.5 text-white shadow-soft">
          <span className="text-sm font-semibold">
            {selected.length} {t("common.selected")}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void Promise.all(selected.map((docId) => downloadDocument(docId)))}
            >
              {t("g.download")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              icon={<Archive className="h-4 w-4" />}
              onClick={() => setConfirmAction({ kind: "archive", ids: selected })}
            >
              {t("doc.archiveNow")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/90 hover:bg-white/10"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmAction({ kind: "delete", ids: selected })}
            >
              {t("g.delete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:bg-white/10"
              icon={<X className="h-4 w-4" />}
              onClick={() => setSelected([])}
            />
          </div>
        </div>
      )}
      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "contents", label: lang === "en" ? "Contents" : "المحتوى" },
              { id: "permissions", label: t("doc.permissions") },
              { id: "activity", label: t("doc.activityLog") },
              { id: "info", label: lang === "en" ? "Information" : "معلومات" },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "contents" &&
            (docs.length === 0 ? (
              <EmptyState
                variant="folder"
                title={lang === "en" ? "This folder is empty" : "هذا المجلد فارغ"}
                description={lang === "en" ? "Upload documents to start filling it." : "ارفع وثائق لبدء تعبئته."}
                action={
                  <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => navigate(`/documents/new?folder=${folder.id}`)}>
                    {t("doc.upload")}
                  </Button>
                }
              />
            ) : (
              <DataTable<Document>
                rows={docs}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                onRowDoubleClick={(d) => navigate(`/documents/${d.id}`)}
                columns={[
                  {
                    key: "title",
                    header: t("doc.title"),
                    render: (d) => (
                      <div className="flex items-center gap-2.5">
                        <FileIcon type={d.fileType} size="sm" />
                        <span className="font-medium text-navy-700 dark:text-navy-200">{lang === "en" ? d.titleEn : d.title}</span>
                      </div>
                    ),
                  },
                  { key: "status", header: t("g.status"), render: (d) => <StatusBadge status={d.status} /> },
                  { key: "owner", header: t("g.owner"), render: (d) => d.owner },
                  { key: "size", header: t("g.size"), render: (d) => <span className="text-ink-400">{d.size}</span> },
                ]}
                rowActions={(d) => (
                  <RowMenu
                    items={[
                      { label: t("g.view"), icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/documents/${d.id}`) },
                      {
                        label: t("g.download"),
                        icon: <Download className="h-4 w-4" />,
                        onClick: () => void downloadDocument(d.id),
                      },
                    ]}
                  />
                )}
              />
            ))}
          {tab === "permissions" && (
            <div>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
                <ShieldCheck className="h-4 w-4" />{" "}
                {lang === "en"
                  ? "Permission model: department scope + folder ACL rules + role defaults"
                  : "نموذج الصلاحيات: نطاق القسم + قواعد ACL للمجلد + أدوار النظام"}
              </div>
              <ACLRulesEditor folderId={folder.id} />
            </div>
          )}
          {tab === "activity" &&
            (activity.length === 0 ? (
              <EmptyState
                title={lang === "en" ? "No activity recorded" : "لا يوجد نشاط مسجّل"}
                description={
                  lang === "en" ? "Actions on this folder's documents will appear here." : "ستظهر هنا العمليات على وثائق هذا المجلد."
                }
              />
            ) : (
              <Timeline
                items={activity.map((a) => ({
                  id: a.id,
                  title: a.action,
                  subtitle: `${a.docTitle} — ${a.user}`,
                  time: a.date,
                  done: true,
                }))}
              />
            ))}
          {tab === "info" && (
            <MetaGrid
              items={[
                { label: t("g.name"), value: lang === "en" ? folder.nameEn : folder.name },
                { label: lang === "en" ? "Folder ID" : "رمز المجلد", value: folder.id },
                { label: lang === "en" ? "Access scope" : "نطاق الوصول", value: folder.accessScope },
                { label: lang === "en" ? "Documents" : "عدد الوثائق", value: String(docs.length) },
                { label: lang === "en" ? "Owner" : "المالك", value: folder.owner ?? "—" },
                {
                  label: lang === "en" ? "Parent folder" : "المجلد الأب",
                  value: parent ? (lang === "en" ? parent.nameEn : parent.name) : "—",
                },
              ]}
            />
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
        danger={confirmAction?.kind === "delete"}
        title={
          confirmAction?.kind === "archive"
            ? lang === "en"
              ? "Archive selected documents?"
              : "أرشفة الوثائق المحددة؟"
            : lang === "en"
              ? "Move selected documents to trash?"
              : "نقل الوثائق المحددة إلى السلة؟"
        }
        message={
          lang === "en"
            ? `${confirmAction?.ids.length ?? 0} document(s) will be ${confirmAction?.kind === "archive" ? "archived" : "moved to trash"}.`
            : `سيتم ${confirmAction?.kind === "archive" ? "أرشفة" : "نقل"} ${confirmAction?.ids.length ?? 0} وثيقة.`
        }
        confirmText={confirmAction?.kind === "archive" ? t("doc.archiveNow") : t("g.delete")}
      />
    </div>
  );
}
