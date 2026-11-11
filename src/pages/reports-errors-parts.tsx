import { Bug, Check } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, Select, Input, Badge, Avatar, cn } from "../components/ui";
import { SectionTitle, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { ErrorItem, ErrorNote } from "../types";

export function ErrorDetailModal({
  detail,
  onClose,
  onChangeStatus,
  onAssign,
  notes,
  note,
  onNote,
  onAddNote,
  sevCls,
  sevGrad,
  sevLabel,
  statusLabel,
}: {
  detail: ErrorItem | null;
  onClose: () => void;
  onChangeStatus: (id: string, status: ErrorItem["status"]) => void;
  onAssign: (id: string, owner: string) => void;
  notes: ErrorNote[];
  note: string;
  onNote: (v: string) => void;
  onAddNote: () => void;
  sevCls: (s: string) => string;
  sevGrad: (s: string) => string;
  sevLabel: (s: string) => string;
  statusLabel: (s: string) => string;
}) {
  const { t, lang } = useApp();
  const { users: usersStore } = useDocsStore();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const ownerOptions = (usersStore.items as { name: string }[])
    .map((item) => item.name)
    .filter((name, index, all) => Boolean(name) && all.indexOf(name) === index)
    .slice(0, 6);
  return (
    <Modal
      open={!!detail}
      onClose={onClose}
      title={L("تفاصيل الخطأ", "Error details")}
      size="lg"
      footer={
        <>
          <Select
            className="w-40"
            value={detail?.status ?? "new"}
            onChange={(e) => detail && onChangeStatus(detail.id, e.target.value as ErrorItem["status"])}
          >
            <option value="new">{L("جديد", "New")}</option>
            <option value="investigating">{L("قيد التحقيق", "Investigating")}</option>
            <option value="resolved">{L("محلول", "Resolved")}</option>
            <option value="ignored">{L("متجاهل", "Ignored")}</option>
          </Select>
          <Button variant="outline" onClick={() => onClose()}>
            {t("g.close")}
          </Button>
          <Button
            icon={<Check className="h-4 w-4" />}
            onClick={() => {
              if (detail) onChangeStatus(detail.id, "resolved");
              onClose();
            }}
          >
            {L("حل", "Resolve")}
          </Button>
        </>
      }
    >
      {detail && (
        <div className="space-y-4">
          {/* Header */}
          <div
            className={cn(
              "rounded-xl border-2 p-3.5",
              detail.severity === "critical"
                ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                : detail.severity === "high"
                  ? "border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10"
                  : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                  sevGrad(detail.severity),
                )}
              >
                <Bug className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-extrabold text-ink-800 dark:text-ink-100">{detail.code}</p>
                <p className="mt-0.5 text-xs font-medium text-ink-600 dark:text-ink-300">{detail.message}</p>
              </div>
              <Badge className={sevCls(detail.severity)}>{sevLabel(detail.severity)}</Badge>
            </div>
          </div>
          {/* Data */}
          <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
            <SectionTitle title={L("بيانات الخطأ", "Error data")} />
            <div className="mt-2">
              <MetaGrid
                items={[
                  { label: L("الوحدة", "Module"), value: detail.module },
                  { label: L("المسار", "Path"), value: <span className="font-mono text-xs">{detail.path}</span> },
                  { label: L("الوقت", "Time"), value: detail.datetime },
                  { label: L("المستخدم المتأثر", "Affected"), value: detail.affectedUser },
                  { label: L("رقم الترابط", "Correlation"), value: detail.correlation },
                  { label: L("المسؤول", "Owner"), value: detail.owner },
                  { label: L("الحالة", "Status"), value: statusLabel(detail.status) },
                ]}
              />
            </div>
          </div>
          {/* Assign */}
          <div>
            <SectionTitle title={L("تعيين المسؤول", "Assign owner")} />
            <div className="flex flex-wrap gap-2">
              {ownerOptions.map((owner) => (
                <button
                  key={owner}
                  onClick={() => onAssign(detail.id, owner)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    detail.owner === owner
                      ? "border-navy-300 bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                      : "border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800",
                  )}
                >
                  <Avatar initials={owner.slice(0, 2)} color="bg-purple-600" size="xs" />
                  {owner}
                </button>
              ))}
            </div>
          </div>
          {/* Notes */}
          <div>
            <SectionTitle title={`${L("ملاحظات داخلية", "Internal notes")} (${notes.length})`} />
            <div className="space-y-2">
              {notes.map((n, i) => (
                <div key={i} className="rounded-lg bg-ink-50 p-2.5 dark:bg-ink-950">
                  <p className="text-xs font-semibold text-ink-500">
                    {n.by} · {n.at}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-700 dark:text-ink-200">{n.text}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  placeholder={L("أضف ملاحظة…", "Add a note…")}
                  value={note}
                  onChange={(e) => onNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddNote()}
                />
                <Button size="sm" onClick={onAddNote} disabled={!note.trim()}>
                  {L("إضافة", "Add")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
