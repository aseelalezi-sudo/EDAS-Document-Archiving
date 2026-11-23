import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Folder as FolderIcon,
  FolderOpen,
  Upload,
  FolderPlus,
  Move,
  Download,
  Archive,
  Trash2,
  List as ListIcon,
  LayoutGrid,
  Columns3,
  Eye,
  Check,
  ShieldCheck,
  Search,
  RotateCcw,
  Lock,
  Scale,
  CloudUpload,
  FileText,
  ChevronLeft,
  Pencil,
  Files,
  HardDrive,
  MoreVertical,
} from "lucide-react";
import { useApp } from "../store";
import {
  cn,
  Button,
  Card,
  Input,
  Select,
  Badge,
  StatusBadge,
  ClassificationBadge,
  EmptyState,
  Tooltip,
  ConfirmDialog,
} from "../components/ui";
import { PageHeader, Breadcrumbs, DataTable, RowMenu, Toolbar, Segmented, FileIcon, FolderIcon as FolderGlyph } from "../components/shared";
import { deptName } from "../data";
import { documentBytes, formatBytes } from "../lib/api-mappers";
import { config } from "../config";
import { useDocsStore } from "../store-docs";
import { LibraryMoveModal, LibraryPreviewModal, NewFolderModal, RenameFolderModal } from "./documents-library-parts";
import { PlaceHoldModal } from "./documents-view-parts";
import type { Document, FolderNode } from "../types";
import { ContextMenu, Splitter, FolderTreePanel, type CtxItem } from "./document-widgets";
export function Library() {
  const { t, lang, toast, user, role, dir: dirRTL } = useApp();
  const navigate = useNavigate();
  const [selectedFolder, setSelectedFolder] = useState("root");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"list" | "grid">("list");
  const [showDetails, setShowDetails] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState("root");
  const [newFolderType, setNewFolderType] = useState<FolderNode["type"]>("dept");
  const [newFolderScope, setNewFolderScope] = useState("قسمي");
  const [confirmAction, setConfirmAction] = useState<{ kind: "delete" | "archive"; ids: string[] } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FolderNode | null>(null);
  const [renameName, setRenameName] = useState("");
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderNode | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [treeWidth, setTreeWidth] = useState(256);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [holdDoc, setHoldDoc] = useState<Document | null>(null);
  const [uploading, setUploading] = useState<{ name: string; state: "uploading" | "done" | "error" }[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    folders: allFolders,
    addFolder,
    renameFolder,
    deleteFolder,
    scopedDocs,
    visibleFolders,
    createDocument,
    downloadDocument,
    archiveDocs,
    deleteDocs,
    checkOut,
    checkIn,
    moveDocs,
    systemSettings,
    docsReady,
  } = useDocsStore();

  const allowedTypes = (systemSettings.allowedTypes || "")
    .split(",")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
  const allowedExtensions = allowedTypes.map((type) => `.${type}`);
  const maxFileSize = systemSettings.maxFileSize || "—";
  const canManageFolders = role === "system_admin" || role === "archivist";

  const uploadFiles = (files: File[]) => {
    const accepted = files.filter((file) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (allowedExtensions.length === 0 || allowedExtensions.includes(ext)) return true;
      toast({ type: "error", title: lang === "en" ? "File type not allowed" : "نوع الملف غير مسموح", message: file.name });
      return false;
    });
    if (accepted.length === 0) return;
    setUploading(accepted.map((file) => ({ name: file.name, state: "uploading" })));
    const folderId = selectedFolder && selectedFolder !== "root" ? selectedFolder : undefined;
    void (async () => {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        const title = file.name.replace(/\.[^.]+$/, "") || file.name;
        const id = await createDocument({ title, file, folderId, classification: "INTERNAL" });
        setUploading((prev) => prev.map((item, i) => (i === index ? { ...item, state: id ? "done" : "error" } : item)));
      }
      window.setTimeout(() => setUploading([]), 4000);
    })();
  };

  const openDocMenu = (e: React.MouseEvent, d: Document) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t("g.preview"), icon: <Eye className="h-4 w-4" />, onClick: () => setPreviewDoc(d) },
        {
          label: t("g.download"),
          icon: <Download className="h-4 w-4" />,
          onClick: () => void downloadDocument(d.id),
        },
        {
          label: lang === "en" ? "Open details" : "فتح التفاصيل",
          icon: <FileText className="h-4 w-4" />,
          onClick: () => navigate(`/documents/${d.id}`),
        },
        { divider: true, label: "", onClick: () => {} },
        {
          label: d.checkedOutBy ? (lang === "en" ? "Check-in" : "إعادة") : lang === "en" ? "Check-out" : "حجز",
          icon: d.checkedOutBy ? <RotateCcw className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
          onClick: () => {
            if (d.checkedOutBy) {
              checkIn(d.id, (ok) => {
                if (ok) toast({ type: "success", title: lang === "en" ? "Released" : "تم التحرير" });
              });
            } else {
              checkOut(d.id, user?.name ?? "", (ok) => {
                if (ok) toast({ type: "info", title: lang === "en" ? "Locked" : "تم الحجز" });
              });
            }
          },
        },
        {
          label: t("common.move"),
          icon: <Move className="h-4 w-4" />,
          onClick: () => {
            setSelectedDocs([d.id]);
            setMoveTarget("");
            setMoveOpen(true);
          },
        },
        {
          label: t("doc.placeHold"),
          icon: <Scale className="h-4 w-4" />,
          onClick: () => setHoldDoc(d),
        },
        { divider: true, label: "", onClick: () => {} },
        {
          label: t("g.delete"),
          icon: <Trash2 className="h-4 w-4" />,
          danger: true,
          onClick: () => setConfirmAction({ kind: "delete", ids: [d.id] }),
        },
      ],
    });
  };

  const openFolderMenu = (e: React.MouseEvent, f: FolderNode) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: lang === "en" ? "Open folder" : "فتح المجلد",
          icon: <FolderOpen className="h-4 w-4" />,
          onClick: () => {
            setSelectedFolder(f.id);
            setSelectedDocs([]);
          },
        },
        {
          label: lang === "en" ? "Folder details" : "تفاصيل المجلد",
          icon: <FileText className="h-4 w-4" />,
          onClick: () => navigate(`/library/folders/${f.id}`),
        },
        {
          label: lang === "en" ? "Permissions" : "الصلاحيات",
          icon: <ShieldCheck className="h-4 w-4" />,
          onClick: () => navigate(`/library/folders/${f.id}`, { state: { tab: "permissions" } }),
        },
        { divider: true, label: "", onClick: () => {} },
        {
          label: lang === "en" ? "Upload here" : "ارفع هنا",
          icon: <Upload className="h-4 w-4" />,
          onClick: () => navigate(`/documents/new?folder=${f.id}`),
        },
        {
          label: lang === "en" ? "New subfolder" : "مجلد فرعي جديد",
          icon: <FolderPlus className="h-4 w-4" />,
          onClick: () => openNewFolder(f.id),
        },
        ...(canManageFolders
          ? [
              { divider: true, label: "", onClick: () => {} },
              {
                label: lang === "en" ? "Rename" : "إعادة التسمية",
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => {
                  setRenameTarget(f);
                  setRenameName(lang === "en" ? f.nameEn : f.name);
                },
              },
              ...(f.docs === 0 && f.subfolders === 0
                ? [
                    {
                      label: lang === "en" ? "Delete folder" : "حذف المجلد",
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      onClick: () => setFolderDeleteTarget(f),
                    },
                  ]
                : []),
            ]
          : []),
      ],
    });
  };

  const isRoot = selectedFolder === "root";
  const current = isRoot ? undefined : allFolders.find((f) => f.id === selectedFolder);
  const subfolders = visibleFolders.filter((f) => (isRoot ? !f.parentId || f.parentId === "root" : f.parentId === selectedFolder));
  const docs = scopedDocs
    .filter((d) => (isRoot ? !d.folderId || d.folderId === "root" : d.folderId === selectedFolder))
    .filter((d) => {
      const query = q.trim().toLowerCase();
      if (!query) return true;
      return (
        d.title.toLowerCase().includes(query) ||
        d.titleEn.toLowerCase().includes(query) ||
        d.docNo.toLowerCase().includes(query) ||
        d.owner.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sort === "recent") return b.modifiedAt.localeCompare(a.modifiedAt);
      if (sort === "size") return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
      return a.title.localeCompare(b.title, "ar");
    });
  const activeDoc = scopedDocs.find((d) => d.id === activeDocId) ?? null;
  const libBulkDelete = () => {
    if (selectedDocs.length === 0) return;
    setConfirmAction({ kind: "delete", ids: selectedDocs });
  };
  const runConfirmedAction = () => {
    if (!confirmAction) return;
    const ids = confirmAction.ids;
    if (confirmAction.kind === "archive") {
      archiveDocs(ids, (ok) => {
        if (!ok) return;
        toast({
          type: "success",
          title: t("doc.archiveNow"),
          message: `${ids.length} ${lang === "en" ? "items" : "عنصر"}`,
        });
        setSelectedDocs([]);
      });
      return;
    }
    deleteDocs(ids, (ok) => {
      if (!ok) return;
      toast({
        type: "error",
        title: lang === "en" ? "Moved to trash" : "نقل إلى السلة",
        message: `${ids.length} ${lang === "en" ? "items" : "عنصر"}`,
      });
      setSelectedDocs([]);
    });
  };
  const openNewFolder = (parent: string) => {
    setNewFolderParent(parent);
    setNewFolderName("");
    setNewFolderType("dept");
    setNewFolderScope("قسمي");
    setNewFolderOpen(true);
  };
  const path: FolderNode[] = [];
  let n: FolderNode | undefined = current;
  while (n) {
    path.unshift(n);
    n = allFolders.find((f) => f.id === n!.parentId);
  }
  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const ok = await addFolder({
      id: `f-local-${Date.now()}`,
      name,
      nameEn: name,
      parentId: newFolderParent,
      type: newFolderType,
      docs: 0,
      subfolders: 0,
      accessScope: newFolderScope,
    });
    if (!ok) return;
    if (newFolderParent !== "root" && newFolderParent !== selectedFolder) {
      setSelectedFolder(newFolderParent);
    }
    setNewFolderName("");
    setNewFolderOpen(false);
    toast({ type: "success", title: lang === "en" ? "Folder created" : "تم إنشاء المجلد", message: name });
  };
  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    const ok = await renameFolder(renameTarget.id, { name });
    if (!ok) return;
    toast({ type: "success", title: lang === "en" ? "Folder renamed" : "تمت إعادة التسمية", message: name });
    setRenameTarget(null);
    setRenameName("");
  };
  const submitFolderDelete = async () => {
    if (!folderDeleteTarget) return;
    const target = folderDeleteTarget;
    const ok = await deleteFolder(target.id);
    if (!ok) return;
    if (selectedFolder === target.id) setSelectedFolder("root");
    toast({
      type: "success",
      title: lang === "en" ? "Folder deleted" : "تم حذف المجلد",
      message: lang === "en" ? target.nameEn : target.name,
    });
    setFolderDeleteTarget(null);
  };

  if (!docsReady) {
    return (
      <div aria-busy="true">
        <PageHeader
          title={t("nav.library")}
          description={lang === "en" ? "Browse folders and archived documents" : "تصفّح المجلدات والوثائق المؤرشفة"}
          breadcrumbs={[{ label: t("nav.library") }]}
        />
        <div className="mb-4 flex gap-2">
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800 md:max-w-56" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
        </div>
        <div className="flex gap-4">
          <div className="hidden h-72 w-64 shrink-0 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800 lg:block" />
          <div className="flex-1 space-y-3">
            <div className="h-14 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          </div>
        </div>
        <span className="sr-only">{lang === "en" ? "Loading library…" : "جارٍ تحميل المكتبة…"}</span>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("nav.library")}
        description={lang === "en" ? "Browse folders and archived documents" : "تصفّح المجلدات والوثائق المؤرشفة"}
        breadcrumbs={[{ label: t("nav.library") }]}
        actions={
          <Button
            size="sm"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => navigate(selectedFolder === "root" ? "/documents/new" : `/documents/new?folder=${selectedFolder}`)}
          >
            {t("doc.upload")}
          </Button>
        }
      />
      <Toolbar>
        <div className="relative min-w-40 flex-1 md:max-w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            className="h-8 ps-8 text-xs"
            placeholder={lang === "en" ? "Search in this folder…" : "بحث في هذا المجلد…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" icon={<FolderPlus className="h-4 w-4" />} onClick={() => openNewFolder(selectedFolder)}>
          {t("g.create")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<ShieldCheck className="h-4 w-4" />}
          disabled={!current}
          title={current ? undefined : lang === "en" ? "Select a folder to manage its permissions" : "اختر مجلداً لإدارة صلاحياته"}
          onClick={() => {
            if (current) navigate(`/library/folders/${current.id}`, { state: { tab: "permissions" } });
          }}
        >
          {lang === "en" ? "Permissions" : "الصلاحيات"}
        </Button>
        <div className="ms-auto flex items-center gap-1">
          <Select
            className="h-8 w-36 text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={lang === "en" ? "Sort by" : "ترتيب حسب"}
          >
            <option value="name">{lang === "en" ? "Sort: Name" : "ترتيب: الاسم"}</option>
            <option value="recent">{lang === "en" ? "Sort: Recent" : "ترتيب: الأحدث"}</option>
            <option value="size">{lang === "en" ? "Sort: Size" : "ترتيب: الحجم"}</option>
          </Select>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "", icon: <ListIcon className="h-4 w-4" />, ariaLabel: lang === "en" ? "List view" : "عرض القائمة" },
              { value: "grid", label: "", icon: <LayoutGrid className="h-4 w-4" />, ariaLabel: lang === "en" ? "Grid view" : "عرض الشبكة" },
            ]}
          />
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", showDetails && "text-navy-600")}
            aria-label={lang === "en" ? "Toggle details panel" : "إظهار أو إخفاء لوحة التفاصيل"}
            aria-pressed={showDetails}
            onClick={() => setShowDetails((s) => !s)}
          >
            <Columns3 className="h-4 w-4" />
          </Button>
        </div>
      </Toolbar>

      {(role === "employee" || role === "supervisor" || role === "dept_manager") && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-sm text-navy-700 dark:border-navy-800 dark:bg-navy-900/30 dark:text-navy-200">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            {lang === "en"
              ? "Scoped view — you are viewing folders and documents of your department:"
              : "نطاق العرض — أنت تشاهد مجلدات ووثائق قسمك فقط:"}{" "}
            <strong>
              {user?.department ? deptName(user.department, lang) : lang === "en" ? "not linked to a department" : "غير مرتبط بإدارة"}
            </strong>
            {lang === "en" ? " (plus folders shared with you)" : " (بالإضافة إلى المجلدات المشتركة معك)"}
          </span>
        </div>
      )}

      <div className="flex items-stretch gap-0">
        <div className="hidden shrink-0 lg:flex">
          <div style={{ width: treeWidth }} className="shrink-0">
            <FolderTreePanel
              selected={selectedFolder}
              onSelect={(id) => {
                setSelectedFolder(id);
                setSelectedDocs([]);
              }}
              folders={visibleFolders}
              onContext={openFolderMenu}
            />
          </div>
          <Splitter onDrag={(d) => setTreeWidth((w) => Math.min(420, Math.max(180, w - (dirRTL ? d : -d))))} />
        </div>
        <div className="min-w-0 flex-1">
          <Card pad={false} className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FolderGlyph className="shrink-0" />
                <div className="min-w-0 overflow-x-auto">
                  <Breadcrumbs
                    items={[
                      { label: lang === "en" ? "Library" : "المكتبة" },
                      ...path.map((p) => ({ label: lang === "en" ? p.nameEn : p.name })),
                    ]}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                  {subfolders.length} {lang === "en" ? "folders" : "مجلد"}
                </Badge>
                <span title={isRoot ? (lang === "en" ? "All folders in your scope" : "كل المجلدات في نطاقك") : undefined}>
                  <Badge className="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                    {isRoot ? scopedDocs.length : docs.length}{" "}
                    {lang === "en" ? (isRoot ? "docs total" : "docs") : isRoot ? "وثيقة إجمالاً" : "وثيقة"}
                  </Badge>
                </span>
              </div>
              <Select
                className="h-8 w-full text-xs lg:hidden"
                aria-label={lang === "en" ? "Choose folder" : "اختيار مجلد"}
                value={selectedFolder}
                onChange={(e) => {
                  setSelectedFolder(e.target.value);
                  setSelectedDocs([]);
                }}
              >
                <option value="root">{lang === "en" ? "Library root" : "جذر المكتبة"}</option>
                {visibleFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === "en" ? f.nameEn : f.name}
                  </option>
                ))}
              </Select>
            </div>
            {selectedDocs.length > 0 && (
              <div className="flex items-center gap-2 border-t border-navy-100 bg-navy-50/50 px-4 py-2 dark:border-navy-900 dark:bg-navy-900/20">
                <span className="text-sm font-medium text-navy-700 dark:text-navy-200">
                  {selectedDocs.length} {t("common.selected")}
                </span>
                <div className="ms-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => {
                      void Promise.all(selectedDocs.map((id) => downloadDocument(id)));
                    }}
                  >
                    {t("g.download")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Move className="h-4 w-4" />}
                    onClick={() => {
                      setMoveTarget("");
                      setMoveOpen(true);
                    }}
                  >
                    {t("common.move")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Archive className="h-4 w-4" />}
                    onClick={() => setConfirmAction({ kind: "archive", ids: selectedDocs })}
                  >
                    {t("doc.archiveNow")}
                  </Button>
                  {role !== "employee" && role !== "supervisor" && role !== "auditor" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={libBulkDelete}
                    >
                      {t("g.delete")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {subfolders.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">
                {lang === "en" ? `Subfolders (${subfolders.length})` : `المجلدات الفرعية (${subfolders.length})`}
              </p>
              <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {subfolders.map((f) => {
                  const deptColor: Record<string, string> = {
                    exec: "from-violet-400 to-violet-600",
                    hr: "from-rose-400 to-rose-600",
                    fin: "from-emerald-400 to-emerald-600",
                    legal: "from-amber-400 to-amber-600",
                    it: "from-sky-400 to-sky-600",
                    eng: "from-teal-400 to-teal-600",
                    proc: "from-orange-400 to-orange-600",
                    pmo: "from-purple-400 to-purple-600",
                  };
                  const grad = f.owner ? (deptColor[f.owner] ?? "from-navy-400 to-navy-600") : "from-ink-300 to-ink-400";
                  return (
                    <div key={f.id} className="relative">
                      <button
                        onClick={() => {
                          setSelectedFolder(f.id);
                          setSelectedDocs([]);
                        }}
                        onDoubleClick={() => navigate(`/library/folders/${f.id}`)}
                        onContextMenu={(e) => openFolderMenu(e, f)}
                        className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-4 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900 dark:hover:border-navy-700"
                      >
                        <div
                          className="pointer-events-none absolute -end-6 -top-6 h-16 w-16 rounded-full opacity-[0.07] blur-lg"
                          style={{ background: "linear-gradient(135deg, #4f46e5, #14a89c)" }}
                        />
                        <div className="relative flex items-start gap-3">
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                              grad,
                            )}
                          >
                            <FolderIcon className="h-5 w-5" />
                          </span>
                          <ChevronLeft className="ms-auto me-6 mt-1 h-4 w-4 shrink-0 text-ink-200 transition-all group-hover:-translate-x-0.5 group-hover:text-navy-400 flip-x" />
                        </div>
                        <p className="relative mt-3 line-clamp-2 min-h-[2.4rem] text-[13px] font-bold leading-snug text-ink-700 dark:text-ink-200">
                          {lang === "en" ? f.nameEn : f.name}
                        </p>
                        <p className="relative mt-1 text-[11px] text-ink-400">
                          {f.docs} {lang === "en" ? "docs" : "وثيقة"} · {f.subfolders} {lang === "en" ? "sub" : "فرعي"}
                        </p>
                        <div className="relative mt-auto flex items-center justify-between pt-3 text-[10px] font-semibold">
                          <span className="text-ink-400">{f.accessScope}</span>
                          <span className="text-ink-400">
                            {f.type === "project"
                              ? lang === "en"
                                ? "Project"
                                : "مشروع"
                              : f.type === "shared"
                                ? lang === "en"
                                  ? "Shared"
                                  : "مشترك"
                                : f.type === "archive"
                                  ? lang === "en"
                                    ? "Archive"
                                    : "أرشيف"
                                  : lang === "en"
                                    ? "Department"
                                    : "إدارة"}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-label={`${t("g.folderOptions")} — ${lang === "en" ? f.nameEn || f.name : f.name}`}
                        onClick={(e) => openFolderMenu(e, f)}
                        className="absolute end-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200/70 bg-white/85 text-ink-500 shadow-soft transition-colors hover:border-navy-300 hover:text-navy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-400 dark:border-ink-700 dark:bg-ink-900/85 dark:text-ink-300"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {docs.length === 0 ? (
            <Card>
              <EmptyState
                variant="folder"
                title={
                  isRoot
                    ? lang === "en"
                      ? "No documents at the library root"
                      : "لا توجد وثائق في جذر المكتبة"
                    : lang === "en"
                      ? "This folder is empty"
                      : "هذا المجلد فارغ"
                }
                description={
                  isRoot
                    ? lang === "en"
                      ? "Documents are organised inside the folders above. Pick a folder to browse its contents, or upload a document here."
                      : "الوثائق منظّمة داخل المجلدات أعلاه. اختر مجلداً لتصفّح محتوياته، أو ارفع وثيقة هنا."
                    : lang === "en"
                      ? "Upload a document or create a subfolder to get started. You can also drag & drop files below."
                      : "ارفع وثيقة أو أنشئ مجلداً فرعياً للبدء. يمكنك أيضاً سحب الملفات وإفلاتها بالأسفل."
                }
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      icon={<Upload className="h-4 w-4" />}
                      onClick={() => navigate(isRoot ? "/documents/new" : `/documents/new?folder=${selectedFolder}`)}
                    >
                      {t("doc.upload")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<FolderPlus className="h-4 w-4" />}
                      onClick={() => openNewFolder(selectedFolder)}
                    >
                      {lang === "en" ? "New subfolder" : "مجلد فرعي"}
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : view === "list" ? (
            <div onContextMenu={(e) => e.preventDefault()}>
              <DataTable<Document>
                rows={docs}
                selectable
                selected={selectedDocs}
                onSelectedChange={setSelectedDocs}
                onRowClick={(d) => setActiveDocId(d.id)}
                onRowDoubleClick={(d) => setPreviewDoc(d)}
                onRowContext={openDocMenu}
                columns={[
                  {
                    key: "title",
                    header: t("doc.title"),
                    render: (d) => (
                      <div className="flex items-center gap-2.5">
                        <FileIcon type={d.fileType} size="sm" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 truncate text-start font-medium text-navy-700 dark:text-navy-200 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/documents/${d.id}`);
                            }}
                          >
                            {lang === "en" ? d.titleEn : d.title}
                            {d.checkedOutBy && (
                              <Tooltip label={`${lang === "en" ? "Checked out by" : "محجوزة بواسطة"} ${d.checkedOutBy}`}>
                                <Lock className="h-3.5 w-3.5 text-amber-500" />
                              </Tooltip>
                            )}
                          </button>
                          <p className="text-xs text-ink-400">{d.docNo}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "cat",
                    header: t("g.category"),
                    render: (d) => <span className="text-ink-500">{lang === "en" ? d.categoryEn : d.category}</span>,
                  },
                  { key: "owner", header: t("g.owner"), render: (d) => <span className="text-ink-500">{d.owner}</span> },
                  {
                    key: "ver",
                    header: t("g.version"),
                    render: (d) => <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">{d.version}</Badge>,
                  },
                  { key: "class", header: t("doc.classification"), render: (d) => <ClassificationBadge level={d.classification} /> },
                  { key: "status", header: t("g.status"), render: (d) => <StatusBadge status={d.status} /> },
                  { key: "size", header: t("g.size"), render: (d) => <span className="text-ink-400">{d.size}</span> },
                ]}
                rowActions={(d) => (
                  <RowMenu
                    items={[
                      { label: t("g.preview"), icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/documents/${d.id}/preview`) },
                      {
                        label: t("g.download"),
                        icon: <Download className="h-4 w-4" />,
                        onClick: () => void downloadDocument(d.id),
                      },
                      {
                        label: d.checkedOutBy
                          ? lang === "en"
                            ? "Check-in (release)"
                            : "إعادة (تحرير)"
                          : lang === "en"
                            ? "Check-out (lock)"
                            : "حجز للتحرير",
                        icon: d.checkedOutBy ? <RotateCcw className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                        onClick: () => {
                          if (d.checkedOutBy) {
                            checkIn(d.id, (ok) => {
                              if (ok)
                                toast({
                                  type: "success",
                                  title: lang === "en" ? "Document released" : "تم تحرير الوثيقة",
                                  message: d.title,
                                });
                            });
                          } else {
                            checkOut(d.id, user?.name ?? "", (ok) => {
                              if (ok)
                                toast({
                                  type: "info",
                                  title: lang === "en" ? "Document locked for editing" : "تم حجز الوثيقة للتحرير",
                                  message: `${d.title} — ${user?.name}`,
                                });
                            });
                          }
                        },
                      },
                      {
                        label: t("doc.placeHold"),
                        icon: <Scale className="h-4 w-4" />,
                        onClick: () => setHoldDoc(d),
                      },
                      {
                        label: t("g.delete"),
                        icon: <Trash2 className="h-4 w-4" />,
                        danger: true,
                        onClick: () => setConfirmAction({ kind: "delete", ids: [d.id] }),
                      },
                    ]}
                  />
                )}
              />
            </div>
          ) : (
            <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {docs.map((d) => (
                <Card
                  key={d.id}
                  pad={false}
                  className="group flex cursor-pointer flex-col overflow-hidden transition-all hover:-translate-y-1 hover:border-navy-300 hover:shadow-card"
                  onClick={() => navigate(`/documents/${d.id}`)}
                  onContextMenu={(e) => openDocMenu(e, d)}
                >
                  <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-ink-50 via-ink-100 to-ink-50 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
                    <FileIcon type={d.fileType} size="lg" />
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-ink-950/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 bg-white/90 text-ink-800 hover:bg-white"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/documents/${d.id}/preview`);
                        }}
                      >
                        {lang === "en" ? "View" : "عرض"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 bg-white/90 text-ink-800 hover:bg-white"
                        icon={<Download className="h-3.5 w-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadDocument(d.id);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink-700 dark:text-ink-200">
                      {lang === "en" ? d.titleEn : d.title}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-ink-400">{d.docNo}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <StatusBadge status={d.status} />
                      <span className="text-[10px] text-ink-400">{d.size}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) uploadFiles(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "group relative mt-4 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all",
              dragOver
                ? "scale-[1.02] border-navy-400 bg-navy-50 shadow-glow dark:bg-navy-900/30"
                : "border-ink-200 hover:border-navy-300 hover:bg-ink-50/50 dark:border-ink-700 dark:hover:border-navy-600 dark:hover:bg-ink-900/50",
            )}
          >
            <input
              ref={fileInputRef}
              id="library-upload"
              name="library-upload"
              aria-label={t("doc.upload")}
              type="file"
              multiple
              accept={allowedExtensions.join(",")}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03]"
              style={{ backgroundImage: "radial-gradient(circle, #4f46e5 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            />
            <div
              className={cn(
                "relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl transition-all",
                dragOver ? "scale-110 bg-navy-100 dark:bg-navy-800" : "bg-ink-100 dark:bg-ink-800",
              )}
            >
              <CloudUpload className={cn("h-7 w-7 transition-colors", dragOver ? "text-navy-500" : "text-ink-400")} />
            </div>
            <p className="relative mt-3 text-sm font-semibold text-ink-600 dark:text-ink-300">
              {lang === "en" ? "Drag & drop files here for quick upload" : "اسحب وأفلت الملفات هنا للرفع السريع"}
            </p>
            <p className="relative mt-1 text-xs text-ink-400">
              {allowedTypes.length > 0 ? allowedTypes.map((type) => type.toUpperCase()).join(", ") : "—"} ·{" "}
              {lang === "en"
                ? `Indicative limit ${maxFileSize} MB — the server enforces its own upload policy`
                : `الحد الإرشادي ${maxFileSize} ميغابايت — الخادم يفرض سياسته الخاصة للأنواع والأحجام`}
            </p>
            {uploading.length > 0 && (
              <div className="relative mx-auto mt-4 max-w-sm space-y-2 text-start">
                {uploading.map((u) => (
                  <div key={u.name} className="rounded-xl border border-ink-200 bg-white p-2.5 dark:border-ink-700 dark:bg-ink-900">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-ink-700 dark:text-ink-200">{u.name}</span>
                      <span
                        className={cn(
                          "ms-2 shrink-0 font-semibold",
                          u.state === "done" ? "text-emerald-600" : u.state === "error" ? "text-rose-600" : "text-ink-400",
                        )}
                      >
                        {u.state === "uploading"
                          ? lang === "en"
                            ? "Uploading…"
                            : "جارٍ الرفع…"
                          : u.state === "done"
                            ? lang === "en"
                              ? "Uploaded"
                              : "تم الرفع"
                            : lang === "en"
                              ? "Failed"
                              : "فشل"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="relative mt-3"
              icon={<Upload className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("doc.upload")}
            </Button>
          </div>
        </div>

        {showDetails && activeDoc && (
          <div className="hidden w-72 shrink-0 xl:block">
            <Card pad={false} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-3 dark:border-ink-800 dark:bg-ink-950/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{lang === "en" ? "Preview" : "معاينة"}</span>
              </div>
              <div className="p-4">
                <div className="relative mb-4 flex h-36 items-center justify-center rounded-xl bg-gradient-to-br from-ink-50 via-ink-100 to-ink-50 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
                  <FileIcon type={activeDoc.fileType} size="lg" />
                  <span className="absolute bottom-2 end-2 rounded-lg bg-ink-950/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                    {activeDoc.fileType.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? activeDoc.titleEn : activeDoc.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={activeDoc.status} />
                  <ClassificationBadge level={activeDoc.classification} />
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    { label: t("doc.docNo"), value: activeDoc.docNo, mono: true },
                    { label: t("g.owner"), value: activeDoc.owner },
                    { label: t("g.department"), value: deptName(activeDoc.deptId, lang) },
                    { label: t("g.version"), value: `v${activeDoc.version}` },
                    { label: t("g.size"), value: activeDoc.size },
                    { label: t("g.dateModified"), value: activeDoc.modifiedAt },
                    ...(activeDoc.checkedOutBy ? [{ label: lang === "en" ? "Checked out" : "محجوزة", value: activeDoc.checkedOutBy }] : []),
                    ...(activeDoc.signatureStatus === "signed"
                      ? [{ label: lang === "en" ? "Signed" : "موقّعة", value: activeDoc.signedBy }]
                      : []),
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-ink-400">{item.label}</span>
                      <span className={cn("font-bold text-ink-700 dark:text-ink-200", item.mono && "font-mono")}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Eye className="h-3.5 w-3.5" />}
                    onClick={() => navigate(`/documents/${activeDoc.id}/preview`)}
                  >
                    {t("g.preview")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void downloadDocument(activeDoc.id)}
                  >
                    {t("g.download")}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}

      <LibraryMoveModal
        open={moveOpen}
        count={selectedDocs.length}
        folders={allFolders}
        excludeId={selectedFolder}
        target={moveTarget}
        onTarget={setMoveTarget}
        onClose={() => setMoveOpen(false)}
        onMove={() => {
          const count = selectedDocs.length;
          moveDocs(selectedDocs, moveTarget, (ok) => {
            if (!ok) return;
            const tf = allFolders.find((f) => f.id === moveTarget);
            toast({
              type: "success",
              title: lang === "en" ? "Documents moved" : "تم نقل الوثائق",
              message: `${count} → ${tf ? (lang === "en" ? tf.nameEn : tf.name) : moveTarget}`,
            });
            setSelectedDocs([]);
            setMoveOpen(false);
          });
        }}
      />

      <LibraryPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <PlaceHoldModal open={!!holdDoc} doc={holdDoc} onClose={() => setHoldDoc(null)} />
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

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-ink-200/70 bg-white px-4 py-2.5 text-[11px] font-medium text-ink-500 shadow-soft dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
        <span className="flex items-center gap-1.5">
          <Files className="h-3.5 w-3.5 text-navy-400" />
          <strong className="text-ink-700 dark:text-ink-200">{docs.length}</strong> {lang === "en" ? "documents" : "وثيقة"}
        </span>
        <span className="flex items-center gap-1.5">
          <FolderIcon className="h-3.5 w-3.5 text-navy-400" />
          <strong className="text-ink-700 dark:text-ink-200">{subfolders.length}</strong> {lang === "en" ? "subfolders" : "مجلد فرعي"}
        </span>
        {selectedDocs.length > 0 && (
          <span className="flex items-center gap-1.5 text-navy-600 dark:text-navy-300">
            <Check className="h-3.5 w-3.5" />
            <strong>{selectedDocs.length}</strong> {lang === "en" ? "selected" : "محدد"}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-teal-500" />
          {formatBytes(docs.reduce((total, doc) => total + documentBytes(doc), 0))} {lang === "en" ? "in this folder" : "في هذا المجلد"}
        </span>
        <span className="ms-auto flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {config.useApi
            ? lang === "en"
              ? "API mode"
              : "وضع API"
            : lang === "en"
              ? "Demo mode — local data"
              : "وضع تجريبي — بيانات محلية"}
        </span>
      </div>

      <NewFolderModal
        open={newFolderOpen}
        name={newFolderName}
        onName={setNewFolderName}
        type={newFolderType}
        onType={setNewFolderType}
        scope={newFolderScope}
        onScope={setNewFolderScope}
        onClose={() => setNewFolderOpen(false)}
        onCreate={createFolder}
      />
      <RenameFolderModal
        open={renameTarget !== null}
        name={renameName}
        onName={setRenameName}
        onClose={() => setRenameTarget(null)}
        onRename={() => void submitRename()}
      />
      <ConfirmDialog
        open={folderDeleteTarget !== null}
        onClose={() => setFolderDeleteTarget(null)}
        onConfirm={() => void submitFolderDelete()}
        danger
        title={lang === "en" ? "Delete this folder?" : "حذف هذا المجلد؟"}
        message={
          lang === "en"
            ? `“${folderDeleteTarget?.nameEn ?? ""}” is empty and will be permanently removed. This action is recorded in the audit trail.`
            : `سيتم حذف «${folderDeleteTarget?.name ?? ""}» نهائياً لأنه فارغ. سيُسجَّل الإجراء في سجل التدقيق.`
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
