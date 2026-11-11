import { useNavigate } from "react-router-dom";
import { Folder as FolderIcon, Move, Check, Eye, FileText } from "lucide-react";
import { useApp } from "../store";
import { deptName } from "../data";
import { Button, Modal, cn, Badge, StatusBadge, ClassificationBadge, Field, Input, Select } from "../components/ui";
import { FileIcon } from "../components/shared";
import type { Document, FolderNode } from "../types";

export function LibraryMoveModal({
  open,
  count,
  folders,
  excludeId,
  target,
  onTarget,
  onClose,
  onMove,
}: {
  open: boolean;
  count: number;
  folders: FolderNode[];
  excludeId: string;
  target: string;
  onTarget: (id: string) => void;
  onClose: () => void;
  onMove: () => void;
}) {
  const { t, lang } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lang === "en" ? `Move ${count} document(s)` : `نقل ${count} وثيقة`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button disabled={!target} icon={<Move className="h-4 w-4" />} onClick={onMove}>
            {t("common.move")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-500">{lang === "en" ? "Select the destination folder:" : "اختر المجلد الهدف:"}</p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
          {folders
            .filter((f) => f.id !== excludeId)
            .map((f) => (
              <button
                key={f.id}
                onClick={() => onTarget(f.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                  target === f.id
                    ? "bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                    : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                )}
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-navy-400" />
                <span className="flex-1 truncate">{lang === "en" ? f.nameEn : f.name}</span>
                {target === f.id && <Check className="h-4 w-4 shrink-0 text-navy-600" />}
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

export function LibraryPreviewModal({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  const { lang } = useApp();
  const navigate = useNavigate();
  return (
    <Modal open={!!doc} onClose={onClose} size="xl" footer={null}>
      {doc && (
        <div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileIcon type={doc.fileType} size="md" />
              <div>
                <p className="font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? doc.titleEn : doc.title}</p>
                <p className="text-xs text-ink-400">
                  {doc.docNo} · {deptName(doc.deptId, lang)}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                icon={<Eye className="h-4 w-4" />}
                onClick={() => {
                  navigate(`/documents/${doc.id}/preview`);
                  onClose();
                }}
              >
                {lang === "en" ? "Full preview" : "معاينة كاملة"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<FileText className="h-4 w-4" />}
                onClick={() => {
                  navigate(`/documents/${doc.id}`);
                  onClose();
                }}
              >
                {lang === "en" ? "Details" : "التفاصيل"}
              </Button>
            </div>
          </div>
          <div className="flex h-80 items-start justify-center overflow-auto rounded-xl border border-ink-200 bg-gradient-to-b from-ink-50 to-white p-8 dark:border-ink-800 dark:from-ink-950 dark:to-ink-900">
            <div className="w-full max-w-lg space-y-4">
              <div className="flex items-center justify-between border-b border-ink-200 pb-3 dark:border-ink-800">
                <FileIcon type={doc.fileType} size="md" />
                <span className="font-mono text-xs text-ink-400">{doc.docNo}</span>
              </div>
              <h3 className="text-center text-lg font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? doc.titleEn : doc.title}</h3>
              {(doc.content || doc.description) && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{lang === "en" ? "Description" : "الوصف"}</p>
                  <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">{doc.content ?? doc.description}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
                <StatusBadge status={doc.status} />
                <ClassificationBadge level={doc.classification} />
                <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">v{doc.version}</Badge>
                <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">{doc.size}</Badge>
              </div>
              <p className="text-center text-[10px] text-ink-300">
                {lang === "en"
                  ? "Descriptive preview only — open Full preview to view the file."
                  : "معاينة وصفية فقط — افتح «معاينة كاملة» لعرض الملف."}
              </p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function RenameFolderModal({
  open,
  name,
  onName,
  onClose,
  onRename,
}: {
  open: boolean;
  name: string;
  onName: (v: string) => void;
  onClose: () => void;
  onRename: () => void;
}) {
  const { t, lang } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lang === "en" ? "Rename folder" : "إعادة تسمية المجلد"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button onClick={onRename} disabled={!name.trim()}>
            {t("g.save")}
          </Button>
        </>
      }
    >
      <Field label={lang === "en" ? "Folder name" : "اسم المجلد"} required>
        <Input
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename();
          }}
        />
      </Field>
    </Modal>
  );
}

export function NewFolderModal({
  open,
  name,
  onName,
  type,
  onType,
  scope,
  onScope,
  onClose,
  onCreate,
}: {
  open: boolean;
  name: string;
  onName: (v: string) => void;
  type: FolderNode["type"];
  onType: (v: FolderNode["type"]) => void;
  scope: string;
  onScope: (v: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { t, lang } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lang === "en" ? "New folder" : "مجلد جديد"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button onClick={onCreate} disabled={!name.trim()}>
            {t("g.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={lang === "en" ? "Folder name" : "اسم المجلد"} required>
          <Input
            placeholder={lang === "en" ? "New folder" : "مجلد جديد"}
            value={name}
            onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate();
            }}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={lang === "en" ? "Folder type" : "نوع المجلد"}>
            <Select value={type} onChange={(e) => onType(e.target.value as FolderNode["type"])}>
              <option value="dept">{lang === "en" ? "Department" : "إدارة"}</option>
              <option value="project">{lang === "en" ? "Project" : "مشروع"}</option>
              <option value="shared">{lang === "en" ? "Shared" : "مشترك"}</option>
              <option value="archive">{lang === "en" ? "Archive" : "أرشيف"}</option>
            </Select>
          </Field>
          <Field label={lang === "en" ? "Access scope" : "نطاق الوصول"}>
            <Select value={scope} onChange={(e) => onScope(e.target.value)}>
              <option value="قسمي">{lang === "en" ? "Department" : "قسمي"}</option>
              <option value="عام">{lang === "en" ? "Public" : "عام"}</option>
              <option value="خاص">{lang === "en" ? "Private" : "خاص"}</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
