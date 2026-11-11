import { useEffect, useState } from "react";
import { RotateCcw, Save, ShieldCheck, Users as UsersIcon } from "lucide-react";
import type { AclAction, RolePolicyDto, UserRole } from "@edas/shared";
import { useApp } from "../store";
import { Badge, Button, Card, Checkbox, ConfirmDialog, cn } from "../components/ui";
import { PageHeader } from "../components/shared";
import { domainApi } from "../lib/domain-api";

const ROLE_LABELS: Record<UserRole, [string, string]> = {
  EMPLOYEE: ["موظف", "Employee"],
  SUPERVISOR: ["مشرف", "Supervisor"],
  DEPT_MANAGER: ["مدير إدارة", "Department manager"],
  ARCHIVIST: ["أمين أرشيف", "Archivist"],
  AUDITOR: ["مدقق", "Auditor"],
  SYSTEM_ADMIN: ["مسؤول النظام", "System administrator"],
};

const ACTION_LABELS: Record<AclAction, [string, string]> = {
  VIEW: ["عرض", "View"],
  CREATE: ["إنشاء", "Create"],
  EDIT: ["تعديل", "Edit"],
  DELETE: ["حذف", "Delete"],
  APPROVE: ["اعتماد", "Approve"],
  EXPORT: ["تصدير", "Export"],
};

const ACTIONS: AclAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"];

export function RolesPolicyPanel() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [items, setItems] = useState<RolePolicyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<RolePolicyDto | null>(null);

  const load = () => {
    setLoading(true);
    domainApi
      .rolePolicies()
      .then((result) => {
        setItems(result.items);
        setDirty({});
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = (role: UserRole, action: AclAction) => {
    if (action === "VIEW") return;
    setItems((current) =>
      current.map((item) => {
        if (item.role !== role) return item;
        const has = item.actions.includes(action);
        return { ...item, actions: has ? item.actions.filter((entry) => entry !== action) : [...item.actions, action] };
      }),
    );
    setDirty((current) => ({ ...current, [role]: true }));
  };

  const save = (item: RolePolicyDto) => {
    setBusyRole(item.role);
    domainApi
      .updateRolePolicy(item.role, item.actions)
      .then((updated) => {
        setItems((current) => current.map((entry) => (entry.role === updated.role ? updated : entry)));
        setDirty((current) => ({ ...current, [updated.role]: false }));
        toast({ type: "success", title: L("تم حفظ الصلاحيات", "Permissions saved") });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setBusyRole(null));
  };

  const reset = (item: RolePolicyDto) => {
    setBusyRole(item.role);
    domainApi
      .resetRolePolicy(item.role)
      .then((updated) => {
        setItems((current) => current.map((entry) => (entry.role === updated.role ? updated : entry)));
        setDirty((current) => ({ ...current, [updated.role]: false }));
        toast({ type: "success", title: L("تمت استعادة الافتراضي", "Defaults restored") });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setBusyRole(null));
  };

  return (
    <div>
      <PageHeader
        title={t("nav.roles")}
        description={L(
          "الصلاحيات الافتراضية لكل دور على مستوى النظام. تُطبَّق على كل الطلبات وتُدمج مع قواعد ACL الخاصة بالمجلدات.",
          "Default system-wide capabilities per role. Applied to every request and combined with folder-level ACL rules.",
        )}
      />
      {failed ? (
        <Card className="p-6 text-sm text-ink-500">
          {L("تعذر تحميل الصلاحيات. أعد المحاولة لاحقاً.", "Could not load permissions. Try again later.")}
          <Button className="ms-3" size="sm" variant="outline" onClick={load}>
            {L("إعادة المحاولة", "Retry")}
          </Button>
        </Card>
      ) : loading ? (
        <Card className="p-6 text-sm text-ink-500">{L("جارٍ التحميل…", "Loading…")}</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((item) => {
            const fixed = item.role === "SYSTEM_ADMIN";
            const busy = busyRole === item.role;
            return (
              <Card key={item.role} className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{ROLE_LABELS[item.role][lang === "en" ? 1 : 0]}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-400">
                        <UsersIcon className="h-3 w-3" />
                        {item.userCount} {L("مستخدم", "users")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      item.customized
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-ink-100 text-ink-500 dark:bg-ink-800",
                    )}
                  >
                    {fixed ? L("ثابت", "Fixed") : item.customized ? L("مخصص", "Customized") : L("افتراضي", "Default")}
                  </Badge>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ACTIONS.map((action) => {
                    const on = item.actions.includes(action);
                    return (
                      <label
                        key={action}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          fixed || action === "VIEW" ? "text-ink-400" : "cursor-pointer text-ink-700 dark:text-ink-200",
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onChange={() => toggle(item.role, action)}
                          className={fixed || action === "VIEW" ? "pointer-events-none opacity-60" : undefined}
                        />
                        {ACTION_LABELS[action][lang === "en" ? 1 : 0]}
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2">
                  {dirty[item.role] && (
                    <span className="me-auto text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {L("تغييرات غير محفوظة", "Unsaved changes")}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw className="h-4 w-4" />}
                    disabled={fixed || !item.customized || busy}
                    onClick={() => setResetTarget(item)}
                  >
                    {L("استعادة الافتراضي", "Restore defaults")}
                  </Button>
                  <Button
                    size="sm"
                    icon={<Save className="h-4 w-4" />}
                    loading={busy}
                    disabled={fixed || !dirty[item.role]}
                    onClick={() => save(item)}
                  >
                    {L("حفظ", "Save")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={() => {
          if (resetTarget) reset(resetTarget);
        }}
        title={L("استعادة الصلاحيات الافتراضية", "Restore default permissions")}
        message={L(
          `ستُستعاد الصلاحيات الافتراضية للدور «${resetTarget ? ROLE_LABELS[resetTarget.role][lang === "en" ? 1 : 0] : ""}» وستُفقد التخصيصات الحالية.`,
          `Default capabilities for "${resetTarget ? ROLE_LABELS[resetTarget.role][1] : ""}" will be restored and current customizations will be lost.`,
        )}
        confirmText={L("استعادة", "Restore")}
      />
    </div>
  );
}
