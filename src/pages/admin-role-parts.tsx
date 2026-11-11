import { Check, ShieldCheck } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, Field, Input, cn } from "../components/ui";

export interface RoleDraft {
  name: string;
  nameEn: string;
  desc: string;
  scope: string;
  color: string;
}

export function CreateRoleModal({
  open,
  role,
  onRoleChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  role: RoleDraft;
  onRoleChange: (role: RoleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={L("إنشاء دور جديد", "Create new role")}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button icon={<Check className="h-4 w-4" />} onClick={onSubmit} disabled={!role.name.trim()}>
            {t("g.create")}
          </Button>
        </>
      }
    >
      {" "}
      <div className="space-y-4">
        {" "}
        <Field label={L("اسم الدور (عربي)", "Role name (Arabic)")} required>
          <Input
            value={role.name}
            onChange={(e) => onRoleChange({ ...role, name: e.target.value })}
            placeholder={L("مثال: مسؤول جودة", "e.g. QA Officer")}
          />
        </Field>{" "}
        <Field label={L("اسم الدور (إنجليزي)", "Role name (English)")}>
          <Input
            dir="ltr"
            value={role.nameEn}
            onChange={(e) => onRoleChange({ ...role, nameEn: e.target.value })}
            placeholder="QA Officer"
          />
        </Field>{" "}
        <Field label={L("الوصف", "Description")} hint={L("وظيفة الدور ومسؤولياته", "The role's purpose and responsibilities")}>
          <Input
            value={role.desc}
            onChange={(e) => onRoleChange({ ...role, desc: e.target.value })}
            placeholder={L("مراجعة الجودة والامتثال", "Quality and compliance review")}
          />
        </Field>{" "}
        <div>
          {" "}
          <p className="mb-2 text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("نطاق الدور", "Role scope")}</p>{" "}
          <div className="grid grid-cols-3 gap-2">
            {[
              [L("عام", "Global"), "global"],
              [L("خط إداري", "Business line"), "dept"],
              [L("مشروع", "Project"), "project"],
            ].map(([l, v]) => (
              <button
                key={v}
                type="button"
                aria-pressed={role.scope === v}
                onClick={() => onRoleChange({ ...role, scope: v })}
                className={cn(
                  "rounded-xl border-2 py-2.5 text-center transition-all",
                  role.scope === v
                    ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                    : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                )}
              >
                <p className="text-xs font-bold text-ink-700 dark:text-ink-200">{l}</p>
              </button>
            ))}
          </div>{" "}
        </div>{" "}
        <div>
          {" "}
          <p className="mb-2 text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("لون الدور", "Role color")}</p>{" "}
          <div className="flex flex-wrap gap-2">
            {[
              ["navy", "from-navy-400 to-navy-600"],
              ["teal", "from-teal-400 to-teal-600"],
              ["purple", "from-purple-400 to-purple-600"],
              ["emerald", "from-emerald-400 to-emerald-600"],
              ["amber", "from-amber-400 to-amber-600"],
              ["rose", "from-rose-400 to-rose-600"],
            ].map(([k, g]) => (
              <button
                key={k}
                type="button"
                aria-pressed={role.color === k}
                aria-label={L(`لون ${k}`, `Color ${k}`)}
                onClick={() => onRoleChange({ ...role, color: k })}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-all",
                  g,
                  role.color === k && "ring-2 ring-offset-2 ring-navy-400 scale-110",
                )}
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
            ))}
          </div>{" "}
        </div>{" "}
        <div className="rounded-xl border border-navy-200 bg-navy-50 p-3.5 dark:border-navy-800 dark:bg-navy-900/30">
          {" "}
          <p className="text-xs text-navy-700 dark:text-navy-200">
            {L(
              "سيبدأ الدور بصلاحيات عرض فقط لكل الوحدات. يمكنك تعديلها من محرر الدور بعد الإنشاء.",
              "The role starts with view-only permissions. Adjust them in the role editor after creation.",
            )}
          </p>{" "}
        </div>{" "}
      </div>{" "}
    </Modal>
  );
}
