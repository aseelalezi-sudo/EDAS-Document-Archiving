import { useState } from "react";
import { Plus, Trash2, Check, X, ArrowDown, RefreshCw } from "lucide-react";
import { useApp } from "../store";
import { Button, Select, Badge, Checkbox, ConfirmDialog, EmptyState } from "../components/ui";
import { useDocsStore } from "../store-docs";
import type { ACLRule, PermAction } from "../types";
import { canManageAcl } from "@edas/shared";
import { roleToApi } from "../lib/role-bridge";
export function ACLRulesEditor({ folderId }: { folderId: string }) {
  const { lang, role, toast } = useApp();
  const {
    acls,
    aclFailedFolders,
    retryFolderAcl,
    addACLRule,
    removeACLRule,
    toggleRulePermission,
    toggleRuleEffect,
    getInheritedRules,
    propagateRule,
    getChildrenIds,
    departments: deptStore,
    users: userStore,
  } = useDocsStore();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const canManage = canManageAcl(roleToApi(role));
  const aclFailed = aclFailedFolders.includes(folderId);
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    const ok = await retryFolderAcl(folderId);
    setRetrying(false);
    if (!ok)
      toast({
        type: "error",
        title: L("تعذر تحميل القواعد", "Failed to load rules"),
        message: L("تحقق من الاتصال بالخادم وحاول مجددًا", "Check the server connection and try again"),
      });
  };
  const ownRules = acls[folderId] ?? [];
  const inheritedRules = getInheritedRules(folderId);
  const childrenCount = getChildrenIds(folderId).length;
  const [newType, setNewType] = useState<"department" | "user" | "role">("department");
  const [newId, setNewId] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["view", "download"]);
  const [newEffect, setNewEffect] = useState<"allow" | "deny">("allow");
  const [applyToChildren, setApplyToChildren] = useState(false);
  const [showInherited, setShowInherited] = useState(true);
  const [removeRuleId, setRemoveRuleId] = useState<string | null>(null);
  const PERMS: { key: PermAction; label: string }[] = [
    { key: "view", label: L("عرض", "View") },
    { key: "edit", label: L("تعديل", "Edit") },
    { key: "delete", label: L("حذف", "Delete") },
    { key: "download", label: L("تنزيل", "Download") },
  ];
  const departmentOptions = deptStore.items.map((d) => ({ id: d.id as string, name: lang === "en" ? (d.nameEn ?? d.name) : d.name }));
  const userOptions = userStore.items.filter((u) => u.status !== "inactive").map((u) => ({ id: u.id as string, name: u.name as string }));
  const roleOptions = [
    { id: "employee", name: L("موظف إدارة", "Employee") },
    { id: "supervisor", name: L("مشرف قسم", "Supervisor") },
    { id: "dept_manager", name: L("مدير إدارة", "Manager") },
    { id: "archivist", name: L("مسؤول أرشفة", "Archivist") },
    { id: "auditor", name: L("مدقق", "Auditor") },
  ];
  const principalOptions = newType === "department" ? departmentOptions : newType === "user" ? userOptions : roleOptions;
  const principalName = (rule: ACLRule) => {
    if (rule.principalType === "department") return departmentOptions.find((d) => d.id === rule.principalId)?.name ?? rule.principalName;
    if (rule.principalType === "user") return userOptions.find((u) => u.id === rule.principalId)?.name ?? rule.principalName;
    return roleOptions.find((r) => r.id === rule.principalId)?.name ?? rule.principalName;
  };
  const add = () => {
    const opt = principalOptions.find((o) => o.id === newId);
    if (!opt || newPerms.length === 0) return;
    const rule = {
      principalType: newType,
      principalId: newId,
      principalName: opt.name,
      permissions: newPerms as PermAction[],
      effect: newEffect,
    };
    addACLRule(folderId, rule);
    if (applyToChildren && childrenCount > 0) {
      const n = propagateRule(folderId, rule);
      toast({
        type: "success",
        title: L("تمت إضافة القاعدة", "Rule added"),
        message: `${opt.name} — ${L(`+ تعميم على ${n} مجلد فرعي`, `+ propagated to ${n} subfolders`)}`,
      });
    } else {
      toast({ type: "success", title: L("تمت إضافة القاعدة", "Rule added"), message: opt.name });
    }
    setNewId("");
  };
  const typeBadge = (pt: string) =>
    pt === "department" ? L("قسم", "Dept") : pt === "user" ? L("مستخدم", "User") : pt === "group" ? L("مجموعة", "Group") : L("دور", "Role");

  const effectLabel = (effect?: ACLRule["effect"]) => (effect === "deny" ? L("منع", "Deny") : L("سماح", "Allow"));

  return (
    <div className="space-y-3">
      {/* Inheritance chain info */}
      {inheritedRules.length > 0 && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
              <ArrowDown className="h-3.5 w-3.5" />
              {L(`${inheritedRules.length} قاعدة موروثة من المجلدات الأب`, `${inheritedRules.length} rules inherited from parent folders`)}
            </p>
            <button onClick={() => setShowInherited((s) => !s)} className="text-xs font-semibold text-teal-600 hover:underline">
              {showInherited ? L("إخفاء", "Hide") : L("عرض", "Show")}
            </button>
          </div>
          {showInherited && (
            <div className="mt-2 space-y-1">
              {inheritedRules.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs dark:bg-ink-900">
                  <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    {typeBadge(item.rule.principalType)}
                  </Badge>
                  <span className="font-semibold text-ink-700 dark:text-ink-200">{principalName(item.rule)}</span>
                  <span className="text-ink-400">←</span>
                  <span className="text-ink-400">{item.fromFolderName}</span>
                  <div className="ms-auto flex gap-1">
                    {item.rule.permissions.map((p) => (
                      <Badge key={p} className="bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400">
                        {L(PERMS.find((x) => x.key === p)?.label ?? p, p)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Own rules table */}
      {aclFailed ? (
        <EmptyState
          variant="error"
          title={L("تعذر تحميل القواعد من الخادم", "Failed to load rules from the server")}
          description={L(
            "لن تُعرض قواعد هذا المجلد ولن يُسمح بتعديلها حتى ينجح الجلب — حمايةً من مسح قواعد الخادم الحقيقية.",
            "This folder's rules are hidden and editing is blocked until the fetch succeeds — protecting the server's real rules from being wiped.",
          )}
          action={
            <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} loading={retrying} onClick={() => void retry()}>
              {L("إعادة المحاولة", "Retry")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-2 dark:border-ink-800 dark:bg-ink-950">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                {ownRules.length === 0 && !inheritedRules.length
                  ? L("قواعد هذا المجلد", "Rules for this folder")
                  : ownRules.length > 0
                    ? L(`قواعد خاصة بهذا المجلد (${ownRules.length})`, `Own rules for this folder (${ownRules.length})`)
                    : L("لا قواعد خاصة — المجلد يعتمد على الموروثة", "No own rules — relying on inherited")}
                {ownRules.length === 0 && inheritedRules.length > 0 && (
                  <span className="ms-2 text-teal-500">({L("موروثة فقط", "inherited only")})</span>
                )}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50/50 text-[11px] font-bold uppercase text-ink-400 dark:bg-ink-950/50">
                  <th className="p-2.5 text-start">{L("الجهة", "Principal")}</th>
                  <th className="p-2.5 text-center">{L("الأثر", "Effect")}</th>
                  {PERMS.map((p) => (
                    <th key={p.key} className="p-2.5 text-center">
                      {p.label}
                    </th>
                  ))}
                  {canManage && <th className="w-12" />}
                </tr>
              </thead>
              <tbody>
                {ownRules.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-xs text-ink-400">
                      {L(
                        "لا قواعد خاصة — المجلد متاح لقسمه المالك + الموروثة",
                        "No own rules — folder uses owning department + inherited rules",
                      )}
                    </td>
                  </tr>
                )}
                {ownRules.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100 text-center dark:border-ink-800">
                    <td className="p-2.5 text-start">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40">{typeBadge(r.principalType)}</Badge>
                        <span className="font-semibold text-ink-700 dark:text-ink-200">{principalName(r)}</span>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => toggleRuleEffect(folderId, r.id)}
                          title={L("تبديل بين السماح والمنع", "Toggle between allow and deny")}
                          className={`mx-auto block rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                            r.effect === "deny"
                              ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300"
                          }`}
                        >
                          {effectLabel(r.effect)}
                        </button>
                      ) : (
                        <Badge
                          className={
                            r.effect === "deny"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          }
                        >
                          {effectLabel(r.effect)}
                        </Badge>
                      )}
                    </td>
                    {PERMS.map((p) => (
                      <td key={p.key} className="p-2.5">
                        {canManage ? (
                          <Checkbox
                            checked={r.permissions.includes(p.key)}
                            onChange={() => toggleRulePermission(folderId, r.id, p.key)}
                            label={p.label}
                          />
                        ) : r.permissions.includes(p.key) ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-ink-300" />
                        )}
                      </td>
                    ))}
                    {canManage && (
                      <td className="p-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={L("حذف القاعدة", "Remove rule")}
                          onClick={() => setRemoveRuleId(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add rule form */}
          {canManage && (
            <div className="space-y-2 rounded-xl border border-dashed border-ink-300 p-3 dark:border-ink-700">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-32"
                  value={newType}
                  onChange={(e) => {
                    setNewType(e.target.value as "department" | "user" | "role");
                    setNewId("");
                  }}
                >
                  <option value="department">{L("قسم", "Department")}</option>
                  <option value="user">{L("مستخدم", "User")}</option>
                  <option value="role">{L("دور", "Role")}</option>
                </Select>
                <Select className="w-44" value={newId} onChange={(e) => setNewId(e.target.value)}>
                  <option value="">{L("اختر…", "Select…")}</option>
                  {principalOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap items-center gap-3">
                  {PERMS.map((p) => (
                    <label key={p.key} className="flex items-center gap-1 text-xs text-ink-600 dark:text-ink-300">
                      <Checkbox
                        checked={newPerms.includes(p.key)}
                        onChange={(v) => setNewPerms((prev) => (v ? [...prev, p.key] : prev.filter((x) => x !== p.key)))}
                      />{" "}
                      {p.label}
                    </label>
                  ))}
                </div>
                <Select
                  className="w-28"
                  value={newEffect}
                  aria-label={L("أثر القاعدة", "Rule effect")}
                  onChange={(e) => setNewEffect(e.target.value as "allow" | "deny")}
                >
                  <option value="allow">{L("سماح", "Allow")}</option>
                  <option value="deny">{L("منع", "Deny")}</option>
                </Select>
                <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={!newId || newPerms.length === 0} onClick={add}>
                  {L("إضافة قاعدة", "Add rule")}
                </Button>
              </div>
              {childrenCount > 0 && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs font-semibold text-navy-700 dark:bg-navy-900/30 dark:text-navy-300">
                  <Checkbox checked={applyToChildren} onChange={setApplyToChildren} />
                  {L(`تعميم على ${childrenCount} مجلد فرعي (متكرر)`, `Propagate to ${childrenCount} subfolders (recursive)`)}
                </label>
              )}
            </div>
          )}
          {!canManage && (
            <p className="text-xs text-ink-400">
              {L(
                "لديك صلاحية عرض فقط — إدارة القواعد تتطلب دور مدير النظام أو مسؤول الأرشفة.",
                "Read-only view — managing rules requires System Admin or Archivist role.",
              )}
            </p>
          )}
        </>
      )}
      <ConfirmDialog
        open={removeRuleId !== null}
        onClose={() => setRemoveRuleId(null)}
        onConfirm={() => {
          if (removeRuleId === null) return;
          removeACLRule(folderId, removeRuleId);
          toast({ type: "success", title: L("تم حذف القاعدة", "Rule removed") });
        }}
        title={L("حذف قاعدة الصلاحيات؟", "Remove permission rule?")}
        message={L(
          "سيتم حذف هذه القاعدة من المجلد. قد تفقد جهات معينة الوصول التي كانت تمنحها هذه القاعدة.",
          "This rule will be removed from the folder. Principals may lose the access it granted.",
        )}
        confirmText={L("حذف", "Remove")}
        danger
      />
    </div>
  );
}

/* ---------------- Context Menu (right-click) ---------------- */
