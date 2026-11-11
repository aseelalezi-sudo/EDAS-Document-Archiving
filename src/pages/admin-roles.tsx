import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, Check, X, AlertTriangle, Users as UsersIcon, Copy, Network, Search } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Modal, Field, Input, Select, Checkbox, EmptyState, ConfirmDialog, cn } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { roleLabel } from "../data";
import { useDocsStore } from "../store-docs";
import { CreateRoleModal } from "./admin-role-parts";
import type { Role } from "../store";
import { config } from "../config";
import { usePersistentState } from "../utils/persist";
import { RolesPolicyPanel } from "./admin-roles-api";

type PermMap = Record<string, Record<string, string[]>>;

export function Roles() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [editor, setEditor] = useState<string | null>(null);
  const [matrix, setMatrix] = useState(false);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteRole, setDeleteRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState({
    name: "",
    nameEn: "",
    desc: "",
    scope: "dept",
    color: "navy",
  });
  const { users: usersStore } = useDocsStore();
  const userList = usersStore.items;
  const BUILTIN: Role[] = ["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"];
  const [customRoles, setCustomRoles] = usePersistentState<
    {
      id: string;
      name: string;
      nameEn: string;
      desc: string;
      scope: string;
      color: string;
      status: string;
    }[]
  >("customRoles", [
    {
      id: "role_qa",
      name: L("مدقق جودة", "QA Reviewer"),
      nameEn: "QA Reviewer",
      desc: L("مراجعة الجودة والامتثال", "Quality & compliance review"),
      scope: L("عام", "Global"),
      color: "teal",
      status: "active",
    },
    {
      id: "role_proj",
      name: L("مدير مشروع", "Project Manager"),
      nameEn: "Project Manager",
      desc: L("إدارة وثائق المشاريع", "Project documents"),
      scope: L("مشروع", "Project"),
      color: "purple",
      status: "active",
    },
  ]);
  const roles: string[] = [...BUILTIN, ...customRoles.map((c) => c.id)];
  const MOD_KEYS = ["documents", "library", "workflow", "policies", "org", "users", "security", "reports", "audit", "settings"];
  const MOD_LBL: Record<string, [string, string]> = {
    documents: ["الوثائق", "Documents"],
    library: ["المكتبة", "Library"],
    workflow: ["سير العمل", "Workflow"],
    policies: ["السياسات", "Policies"],
    org: ["الهيكل التنظيمي", "Organization"],
    users: ["المستخدمون", "Users"],
    security: ["الأمان", "Security"],
    reports: ["التقارير", "Reports"],
    audit: ["التدقيق", "Audit"],
    settings: ["الإعدادات", "Settings"],
  };
  const PERM_KEYS = ["view", "create", "edit", "delete", "approve", "export"];
  const PERM_LBL: Record<string, [string, string]> = {
    view: ["عرض", "View"],
    create: ["إنشاء", "Create"],
    edit: ["تعديل", "Edit"],
    delete: ["حذف", "Delete"],
    approve: ["اعتماد", "Approve"],
    export: ["تصدير", "Export"],
  };
  const defaultPerms: PermMap = {
    employee: {
      documents: ["view", "create", "edit", "export"],
      library: ["view", "create"],
      workflow: ["view", "approve"],
      policies: ["view"],
      org: [],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: [],
      settings: ["view"],
    },
    supervisor: {
      documents: ["view", "create", "edit", "export"],
      library: ["view", "create"],
      workflow: ["view", "approve"],
      policies: ["view"],
      org: ["view"],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: [],
      settings: ["view"],
    },
    dept_manager: {
      documents: ["view", "create", "edit", "delete", "export"],
      library: ["view", "create", "edit", "delete"],
      workflow: ["view", "approve", "create", "edit"],
      policies: ["view"],
      org: ["view", "edit"],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: ["view"],
      settings: ["view", "edit"],
    },
    archivist: {
      documents: ["view", "create", "edit", "export"],
      library: ["view", "create", "edit", "export"],
      workflow: ["view", "approve"],
      policies: ["view", "create", "edit", "delete"],
      org: ["view", "create", "edit"],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: ["view", "export"],
      settings: ["view", "edit"],
    },
    system_admin: Object.fromEntries(MOD_KEYS.map((m) => [m, [...PERM_KEYS]])),
    auditor: {
      documents: ["view"],
      library: ["view"],
      workflow: ["view"],
      policies: ["view"],
      org: ["view"],
      users: ["view"],
      security: ["view"],
      reports: ["view", "export"],
      audit: ["view", "export"],
      settings: [],
    },
    role_qa: {
      documents: ["view", "approve"],
      library: ["view"],
      workflow: ["view", "approve"],
      policies: ["view"],
      org: ["view"],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: ["view", "export"],
      settings: [],
    },
    role_proj: {
      documents: ["view", "create", "edit", "export"],
      library: ["view", "create", "edit"],
      workflow: ["view", "create", "approve"],
      policies: ["view"],
      org: ["view"],
      users: [],
      security: [],
      reports: ["view", "export"],
      audit: [],
      settings: [],
    },
  };
  const [savedPerms, setSavedPerms] = usePersistentState<PermMap>("rolePermissions", defaultPerms);
  const [draftPerms, setDraftPerms] = useState<PermMap | null>(null);
  const permState: PermMap = draftPerms ?? { ...defaultPerms, ...savedPerms };
  const setPermState = (updater: (prev: PermMap) => PermMap) => setDraftPerms(updater(permState));
  const persistPerms = (updater: (prev: PermMap) => PermMap) => {
    const next = updater(permState);
    setDraftPerms(next);
    setSavedPerms(next);
    setMatrixDirty(false);
  };
  const commitPerms = () => {
    if (draftPerms) setSavedPerms(draftPerms);
    setDraftPerms(null);
    setMatrixDirty(false);
  };
  const discardPerms = () => {
    setDraftPerms(null);
    setMatrixDirty(false);
  };
  if (config.useApi) return <RolesPolicyPanel />;
  const permCount = (r: string) => Object.values(permState[r] ?? {}).reduce((a, v) => a + v.length, 0);
  const roleLabelOf = (id: string) => {
    const c = customRoles.find((x) => x.id === id);
    return c ? (lang === "en" ? c.nameEn : c.name) : roleLabel(id as Role, lang);
  };
  const modLbl = (k: string) => (lang === "en" ? MOD_LBL[k][1] : MOD_LBL[k][0]);
  const permLbl = (k: string) => (lang === "en" ? PERM_LBL[k][1] : PERM_LBL[k][0]);
  const togglePerm = (role: string, mod: string, perm: string) => {
    setPermState((p) => {
      const cur = p[role]?.[mod] ?? [];
      const next = cur.includes(perm) ? cur.filter((x) => x !== perm) : [...cur, perm];
      return { ...p, [role]: { ...p[role], [mod]: next } };
    });
    setMatrixDirty(true);
  };
  const toggleModule = (role: string, mod: string) => {
    setPermState((p) => {
      const cur = p[role]?.[mod] ?? [];
      const all = cur.length === PERM_KEYS.length;
      return { ...p, [role]: { ...p[role], [mod]: all ? [] : [...PERM_KEYS] } };
    });
    setMatrixDirty(true);
  };
  const stats = [
    {
      label: L("الأدوار", "Roles"),
      value: roles.length,
      icon: ShieldCheck,
      color: "from-navy-400 to-navy-600",
    },
    {
      label: L("المستخدمون", "Users"),
      value: userList.length,
      icon: UsersIcon,
      color: "from-teal-400 to-teal-600",
    },
    {
      label: L("الوحدات", "Modules"),
      value: MOD_KEYS.length,
      icon: Network,
      color: "from-purple-400 to-purple-600",
    },
    {
      label: L("إجمالي الصلاحيات", "Total perms"),
      value: roles.reduce((a, r) => a + permCount(r), 0),
      icon: Check,
      color: "from-emerald-400 to-emerald-600",
    },
  ];
  const submitRole = () => {
    if (!newRole.name.trim()) return;
    const id = `role_${newRole.nameEn.trim().toLowerCase().replace(/\s+/g, "_") || Date.now()}`;
    setCustomRoles((p) => [
      ...p,
      {
        id,
        name: newRole.name,
        nameEn: newRole.nameEn || newRole.name,
        desc: newRole.desc,
        scope:
          newRole.scope === "global"
            ? L("عام", "Global")
            : newRole.scope === "dept"
              ? L("خط إداري", "Business line")
              : L("مشروع", "Project"),
        color: newRole.color,
        status: "active",
      },
    ]);
    persistPerms((p) => ({
      ...p,
      [id]: Object.fromEntries(MOD_KEYS.map((m) => [m, ["view"]])),
    }));
    setCreateOpen(false);
    toast({
      type: "success",
      title: L("تم إنشاء الدور", "Role created"),
      message: `${newRole.name} — ${L("اضبط الصلاحيات من المحرر", "Set permissions in the editor")}`,
    });
    setEditor(id);
  };
  const doDeleteRole = (id: string) => {
    if (userList.some((u) => u.role === id)) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L("مستخدمون مرتبطون بهذا الدور", "Users are assigned to this role"),
      });
      return;
    }
    setCustomRoles((p) => p.filter((x) => x.id !== id));
    persistPerms((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    toast({ type: "success", title: L("تم حذف الدور", "Role deleted"), message: roleLabelOf(id) });
  };
  const duplicateRole = (id: string) => {
    const source = customRoles.find((c) => c.id === id);
    const baseName = roleLabelOf(id);
    const newId = `role_copy_${Date.now()}`;
    const name = L(`${baseName} (نسخة)`, `${baseName} (copy)`);
    setCustomRoles((p) => [
      ...p,
      {
        id: newId,
        name,
        nameEn: `${source?.nameEn ?? baseName} (copy)`,
        desc: source?.desc ?? L(`نسخة من دور ${baseName}`, `Copy of ${baseName}`),
        scope: source?.scope ?? L("عام", "Global"),
        color: source?.color ?? "navy",
        status: "active",
      },
    ]);
    persistPerms((p) => ({ ...p, [newId]: Object.fromEntries(MOD_KEYS.map((m) => [m, [...(p[id]?.[m] ?? [])]])) }));
    setEditor(newId);
    toast({ type: "success", title: L("تم نسخ الدور", "Role duplicated"), message: name });
  };
  const updateCustomRole = (id: string, patch: { name?: string; nameEn?: string; scope?: string }) => {
    setCustomRoles((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const SCOPE_OPTIONS = [
    { key: "global", label: L("عام", "Global") },
    { key: "dept", label: L("خط إداري", "Business line") },
    { key: "project", label: L("مشروع", "Project") },
  ];
  const editingCustom = editor ? customRoles.find((c) => c.id === editor) : undefined;
  const filteredRoles = roles.filter(
    (r) => !q || roleLabelOf(r).includes(q) || userList.filter((u) => u.role === r).some((u) => u.name.includes(q)),
  );
  const roleCls = (r: string) =>
    r === "system_admin"
      ? "from-purple-400 to-purple-600"
      : r === "dept_manager"
        ? "from-navy-400 to-navy-600"
        : r === "archivist"
          ? "from-teal-400 to-teal-600"
          : r === "auditor"
            ? "from-sky-400 to-sky-600"
            : "from-ink-400 to-ink-600";
  return (
    <div>
      {" "}
      <PageHeader
        title={t("nav.roles")}
        description={L("الأدوار وشجرة الصلاحيات حسب الوحدات مع مصفوفة تفاعلية", "Roles, permission tree and interactive matrix")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.roles") }]}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              icon={<Network className="h-4 w-4" />}
              onClick={() => {
                setMatrix(true);
                setMatrixDirty(false);
              }}
            >
              {L("مصفوفة الصلاحيات", "Permission matrix")}
            </Button>
            <Button
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setCreateOpen(true);
                setNewRole({
                  name: "",
                  nameEn: "",
                  desc: "",
                  scope: "dept",
                  color: "navy",
                });
              }}
            >
              {t("g.create")}
            </Button>
          </>
        }
      />{" "}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", s.color)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-extrabold text-ink-900 dark:text-white">{s.value}</p>
              <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>{" "}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        {" "}
        <div className="relative min-w-40 flex-1 md:max-w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              aria-label={L("مسح البحث", "Clear search")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            className="h-8 px-9 text-xs"
            placeholder={L("ابحث في الأدوار…", "Search roles…")}
            aria-label={L("ابحث في الأدوار", "Search roles")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>{" "}
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filteredRoles.length} {L("من", "of")} {roles.length}
        </span>{" "}
      </div>{" "}
      {filteredRoles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-8 w-8" />}
            title={L("لا توجد أدوار مطابقة", "No matching roles")}
            description={L("جرّب كلمة بحث مختلفة.", "Try a different keyword.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {" "}
          {filteredRoles.map((r) => {
            const uc = userList.filter((u) => u.role === r).length;
            const mods = Object.entries(permState[r] ?? {}).filter(([, v]) => v.length > 0).length;
            return (
              <Card
                key={r}
                className="group flex cursor-pointer flex-col hover:border-navy-300 hover:shadow-card"
                onClick={() => setEditor(r)}
              >
                {" "}
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                      roleCls(r),
                    )}
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" dot="bg-emerald-500">
                    {t("g.active")}
                  </Badge>
                </div>{" "}
                <p className="mt-3 text-[15px] font-extrabold text-ink-800 dark:text-ink-100">{roleLabelOf(r)}</p>{" "}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{uc}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("مستخدم", "Users")}</p>
                  </div>
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{mods}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("وحدة", "Mods")}</p>
                  </div>
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{permCount(r)}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("صلاحية", "Perms")}</p>
                  </div>
                </div>{" "}
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {MOD_KEYS.filter((m) => (permState[r]?.[m] ?? []).length > 0).map((m) => (
                    <span
                      key={m}
                      className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-600 dark:bg-navy-900/40 dark:text-navy-300"
                    >
                      {modLbl(m)}
                    </span>
                  ))}
                </div>{" "}
                <div className="mt-auto flex gap-1.5 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 text-xs"
                    icon={<Pencil className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditor(r);
                    }}
                  >
                    {t("g.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    icon={<Copy className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateRole(r);
                    }}
                    aria-label={L("نسخ", "Copy")}
                  />
                  {!BUILTIN.includes(r as Role) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-rose-600"
                      icon={<Trash2 className="h-3 w-3" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteRole(r);
                      }}
                      aria-label={t("g.delete")}
                    />
                  )}
                </div>{" "}
              </Card>
            );
          })}{" "}
        </div>
      )}{" "}
      <Modal
        open={!!editor}
        onClose={() => {
          setEditor(null);
          discardPerms();
        }}
        title={`${L("محرر الدور", "Role editor")} — ${editor ? roleLabelOf(editor) : ""}`}
        size="lg"
        footer={
          <>
            <Button
              icon={<Check className="h-4 w-4" />}
              onClick={() => {
                const c = editor ? permCount(editor) : 0;
                commitPerms();
                setEditor(null);
                toast({
                  type: "success",
                  title: L("تم حفظ الصلاحيات", "Permissions saved"),
                  message: `${c} ${L("صلاحية", "permissions")}`,
                });
              }}
            >
              {t("g.save")}
            </Button>
          </>
        }
      >
        {" "}
        {editor && (
          <div className="space-y-3">
            {" "}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={L("اسم الدور", "Role name")}
                hint={editingCustom ? undefined : L("أسماء الأدوار الأساسية ثابتة", "Built-in role names are fixed")}
              >
                <Input
                  value={editingCustom ? (lang === "en" ? editingCustom.nameEn : editingCustom.name) : roleLabelOf(editor)}
                  disabled={!editingCustom}
                  onChange={(e) =>
                    editingCustom && updateCustomRole(editor, lang === "en" ? { nameEn: e.target.value } : { name: e.target.value })
                  }
                />
              </Field>
              <Field label={L("نوع النطاق", "Scope type")}>
                <Select
                  value={editingCustom?.scope ?? L("خط إداري", "Business line")}
                  disabled={!editingCustom}
                  onChange={(e) => editingCustom && updateCustomRole(editor, { scope: e.target.value })}
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>{" "}
            <SectionTitle
              title={`${L("شجرة الصلاحيات", "Permission tree")} — ${permCount(editor)} ${L("صلاحية", "perms")}`}
              icon={<ShieldCheck className="h-4 w-4 text-navy-500" />}
            />{" "}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
              {" "}
              {MOD_KEYS.map((m) => {
                const cur = permState[editor]?.[m] ?? [];
                const all = cur.length === PERM_KEYS.length;
                return (
                  <div key={m} className="rounded-lg p-1.5 transition-colors hover:bg-ink-50 dark:hover:bg-ink-950">
                    {" "}
                    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm font-bold text-ink-700 dark:text-ink-200">
                      <Checkbox checked={all} onChange={() => toggleModule(editor, m)} /> {modLbl(m)}
                      {all && (
                        <Badge className="bg-emerald-100 text-[9px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          {L("كامل", "Full")}
                        </Badge>
                      )}
                    </label>{" "}
                    <div className="ms-7 flex flex-wrap gap-2.5 pb-1 pt-0.5">
                      {PERM_KEYS.map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                          <Checkbox checked={cur.includes(p)} onChange={() => togglePerm(editor, m, p)} /> {permLbl(p)}
                        </label>
                      ))}
                    </div>{" "}
                  </div>
                );
              })}{" "}
            </div>{" "}
            <p className="text-xs text-ink-400">
              {L(
                "يُطبَّق الحفظ محلياً في هذا المتصفح (وضع العرض التجريبي)؛ الخادم لا يحتوي جدول أدوار مخصصة.",
                "Saving applies locally in this browser (demo mode); the server has no custom-role table.",
              )}
            </p>{" "}
          </div>
        )}{" "}
      </Modal>{" "}
      <Modal
        open={matrix}
        onClose={() => {
          setMatrix(false);
          discardPerms();
        }}
        title={L("مصفوفة الصلاحيات", "Permission matrix")}
        size="xl"
        footer={
          <>
            {matrixDirty && (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                <AlertTriangle className="h-4 w-4" /> {t("topbar.unsavedChanges")}
              </div>
            )}
            <div className="ms-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMatrix(false);
                  discardPerms();
                }}
              >
                {t("g.close")}
              </Button>
              <Button
                icon={<Check className="h-4 w-4" />}
                onClick={() => {
                  commitPerms();
                  setMatrix(false);
                  toast({
                    type: "success",
                    title: L("تم حفظ المصفوفة", "Matrix saved"),
                  });
                }}
              >
                {t("g.save")}
              </Button>
            </div>
          </>
        }
      >
        {" "}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-xs text-ink-400 dark:border-ink-800">
                <th className="sticky start-0 bg-white p-2 text-start">{L("الوحدة / الدور", "Module / Role")}</th>
                {roles.map((r) => (
                  <th key={r} className="p-2 text-center">
                    {roleLabelOf(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOD_KEYS.map((m) => (
                <tr
                  key={m}
                  className="border-b border-ink-100 text-center last:border-0 hover:bg-navy-50/40 dark:border-ink-800/60 dark:hover:bg-navy-500/5"
                >
                  <td className="sticky start-0 z-10 bg-white p-2.5 text-start font-bold text-ink-700 dark:bg-ink-900 dark:text-ink-200">
                    {modLbl(m)}
                  </td>
                  {roles.map((r) => {
                    const cur = permState[r]?.[m] ?? [];
                    return (
                      <td key={r} className="p-1.5">
                        <button
                          onClick={() => toggleModule(r, m)}
                          className={cn(
                            "mx-auto flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:scale-110",
                            cur.length === PERM_KEYS.length
                              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                              : cur.length > 0
                                ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15"
                                : "bg-ink-100 text-ink-300 dark:bg-ink-800",
                          )}
                          title={`${cur.length}/${PERM_KEYS.length}`}
                        >
                          {cur.length === PERM_KEYS.length ? (
                            <Check className="h-4 w-4" />
                          ) : cur.length > 0 ? (
                            <span className="text-[10px] font-bold">{cur.length}</span>
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>{" "}
        <p className="mt-3 text-xs text-ink-400">
          {L(
            "هذه المصفوفة للعرض والتحرير المحلي فقط؛ الصلاحيات الفعلية تأتي من مصفوفة الأدوار في الخادم.",
            "This matrix is local-only; effective permissions come from the server role policy.",
          )}
        </p>{" "}
      </Modal>{" "}
      <CreateRoleModal
        open={createOpen}
        role={newRole}
        onRoleChange={setNewRole}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitRole}
      />
      <ConfirmDialog
        open={!!deleteRole}
        onClose={() => setDeleteRole(null)}
        onConfirm={() => {
          if (deleteRole) doDeleteRole(deleteRole);
        }}
        title={L("حذف الدور", "Delete role")}
        message={L(
          `سيتم حذف الدور «${deleteRole ? roleLabelOf(deleteRole) : ""}» وصلاحياته المحفوظة في هذا المتصفح. لا يمكن التراجع.`,
          `The role "${deleteRole ? roleLabelOf(deleteRole) : ""}" and its permissions saved in this browser will be deleted. This cannot be undone.`,
        )}
        confirmText={t("g.delete")}
        danger
      />
    </div>
  );
}
