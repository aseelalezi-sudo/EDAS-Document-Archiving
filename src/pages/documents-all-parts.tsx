import { Folder as FolderIcon, Move, Check } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, cn } from "../components/ui";
import type { FolderNode } from "../types";

export function BulkMoveModal({
  open,
  count,
  folders,
  target,
  onTarget,
  onClose,
  onMove,
}: {
  open: boolean;
  count: number;
  folders: FolderNode[];
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
          {folders.map((f) => (
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
