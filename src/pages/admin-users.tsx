import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  LogOut,
  ShieldCheck,
  Check,
  X,
  Users as UsersIcon,
  Activity,
  Search,
} from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Avatar, Modal, Field, Input, Select, FieldError, EmptyState, ConfirmDialog, cn } from "../components/ui";
import { PageHeader, DataTable, RowMenu, ExportMenu, MetaGrid } from "../components/shared";
import { roleLabel } from "../data";
import { useDocsStore } from "../store-docs";
import type { DocUser } from "../types";
import type { Role } from "../store";
import { validators } from "../lib/validation";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { roleToApi } from "../lib/role-bridge";

const STATUS_TO_API = { active: "ACTIVE", inactive: "INACTIVE", locked: "LOCKED" } as const;

export function Users() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const apiMode = config.useApi;
  const { users: usersStore, departments: deptStore, refreshUsers } = useDocsStore();
  const departments = deptStore.items;
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; username: string; email: string; password: string; deptId: string; role: Role }>({
    name: "",
    username: "",
    email: "",
    password: "",
    deptId: "",
    role: "employee",
  });
  const [formErr, setFormErr] = useState<{ name?: string; username?: string; email?: string; password?: string }>({});
  const [resetOpen, setResetOpen] = useState<DocUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const userList: DocUser[] = usersStore.items;
  const openCreate = () => {
    setForm({ name: "", username: "", email: "", password: "", deptId: departments[0]?.id ?? "", role: "employee" });
    setFormErr({});
    setAddOpen(true);
  };
  const validateForm = () => {
    const v = validators(t);
    const e: typeof formErr = {};
    e.name = v.required(form.name) ?? v.minLen(3)(form.name);
    e.username = v.required(form.username) ?? v.username(form.username);
    e.email = v.email(form.email);
    e.password = apiMode ? (form.password.length < 8 ? L("8 أحرف على الأقل", "At least 8 characters") : undefined) : undefined;
    setFormErr(e);
    return !Object.values(e).some(Boolean);
  };
  const submit = async () => {
    if (!validateForm()) return;
    if (apiMode) {
      const departmentId = departments.some((d) => d.id === form.deptId) ? form.deptId : departments[0]?.id;
      setSaving(true);
      try {
        await domainApi.createUser({
          name: form.name,
          username: form.username,
          email: form.email || `${form.username}@edas.gov`,
          password: form.password,
          role: roleToApi(form.role as Role),
          departmentId,
        });
        await refreshUsers();
        toast({ type: "success", title: L("تم إنشاء المستخدم", "User created"), message: form.name });
        setAddOpen(false);
        setForm({ name: "", username: "", email: "", password: "", deptId: departments[0]?.id ?? "", role: "employee" });
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setSaving(false);
      }
      return;
    }
    usersStore.add({
      name: form.name,
      nameEn: form.name,
      username: form.username,
      email: form.email || `${form.username}@edas.gov`,
      empNo: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      jobTitle: L("موظف", "Employee"),
      jobTitleEn: "Employee",
      deptId: form.deptId,
      role: form.role,
      status: "active",
      lastLogin: "—",
      failedAttempts: 0,
      activeSessions: 0,
      initials: form.name.slice(0, 2),
      color: "bg-navy-600",
    });
    setAddOpen(false);
    setForm({ name: "", username: "", email: "", password: "", deptId: departments[0]?.id ?? "", role: "employee" });
    toast({ type: "success", title: L("تم إنشاء المستخدم", "User created"), message: form.name });
  };
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState<DocUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocUser | null>(null);

  const filtered = userList.filter((u) => {
    const ql = q.toLowerCase();
    if (
      q &&
      !(
        u.name.includes(q) ||
        (u.nameEn ?? "").toLowerCase().includes(ql) ||
        u.username.toLowerCase().includes(ql) ||
        (u.email ?? "").toLowerCase().includes(ql)
      )
    )
      return false;
    if (fRole !== "all" && u.role !== fRole) return false;
    if (fStatus !== "all" && u.status !== fStatus) return false;
    return true;
  });

  const stats = [
    { label: L("إجمالي المستخدمين", "Total users"), value: userList.length, icon: UsersIcon, color: "from-navy-400 to-navy-600" },
    {
      label: L("نشطون", "Active"),
      value: userList.filter((u) => u.status === "active").length,
      icon: Activity,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: L("مقفلون", "Locked"),
      value: userList.filter((u) => u.status === "locked").length,
      icon: Lock,
      color: "from-rose-400 to-rose-600",
    },
    {
      label: L("جلسات نشطة", "Active sessions"),
      value: userList.reduce((a: number, u) => a + u.activeSessions, 0),
      icon: Activity,
      color: "from-teal-400 to-teal-600",
    },
    {
      label: L("أدوار", "Roles"),
      value: new Set(userList.map((u) => u.role)).size,
      icon: ShieldCheck,
      color: "from-purple-400 to-purple-600",
    },
  ];

  const saveEdit = async () => {
    if (!editOpen || !editOpen.name.trim()) return;
    if (apiMode) {
      const departmentId = departments.some((d) => d.id === editOpen.deptId) ? editOpen.deptId : undefined;
      setSaving(true);
      try {
        await domainApi.updateUser(editOpen.id, {
          name: editOpen.name,
          username: editOpen.username,
          email: editOpen.email,
          role: roleToApi(editOpen.role as Role),
          status: STATUS_TO_API[editOpen.status],
          departmentId,
        });
        await refreshUsers();
        toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
        setEditOpen(null);
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setSaving(false);
      }
      return;
    }
    usersStore.update(editOpen.id, {
      name: editOpen.name,
      username: editOpen.username,
      email: editOpen.email,
      deptId: editOpen.deptId,
      role: editOpen.role,
      status: editOpen.status,
    });
    toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
    setEditOpen(null);
  };

  const bulkLock = () => {
    if (apiMode) {
      void Promise.all(selected.map((id) => domainApi.updateUser(id, { status: "LOCKED" })))
        .then(() => refreshUsers())
        .then(() => toast({ type: "warning", title: L(`تم قفل ${selected.length} حساب`, `${selected.length} accounts locked`) }))
        .catch(() => toast({ type: "error", title: t("err.api") }));
      setSelected([]);
      return;
    }
    selected.forEach((id) => usersStore.update(id, { status: "locked" }));
    toast({ type: "warning", title: L(`تم قفل ${selected.length} حساب`, `${selected.length} accounts locked`) });
    setSelected([]);
  };
  const bulkUnlock = () => {
    if (apiMode) {
      void Promise.all(selected.map((id) => domainApi.updateUser(id, { status: "ACTIVE" })))
        .then(() => refreshUsers())
        .then(() => toast({ type: "success", title: L(`تم فتح ${selected.length} حساب`, `${selected.length} accounts unlocked`) }))
        .catch(() => toast({ type: "error", title: t("err.api") }));
      setSelected([]);
      return;
    }
    selected.forEach((id) => usersStore.update(id, { status: "active", failedAttempts: 0 }));
    toast({ type: "success", title: L(`تم فتح ${selected.length} حساب`, `${selected.length} accounts unlocked`) });
    setSelected([]);
  };
  const bulkRevoke = () => {
    if (apiMode) {
      void Promise.all(selected.map((id) => domainApi.revokeUserSessions(id)))
        .then(() => refreshUsers())
        .then(() =>
          toast({
            type: "warning",
            title: L("تم إلغاء الجلسات", "Sessions revoked"),
            message: `${selected.length} ${L("مستخدم", "users")}`,
          }),
        )
        .catch(() => toast({ type: "error", title: t("err.api") }));
      setSelected([]);
      return;
    }
    selected.forEach((id) => usersStore.update(id, { activeSessions: 0 }));
    toast({ type: "warning", title: L("تم إلغاء الجلسات", "Sessions revoked"), message: `${selected.length} ${L("مستخدم", "users")}` });
    setSelected([]);
  };

  const doDelete = (target: DocUser) => {
    if (apiMode) {
      void domainApi
        .deleteUser(target.id)
        .then(() => refreshUsers())
        .then(() => toast({ type: "success", title: L("تم حذف المستخدم", "User deleted"), message: target.name }))
        .catch(() => toast({ type: "error", title: t("err.api") }));
      return;
    }
    usersStore.remove(target.id);
    toast({ type: "success", title: L("تم حذف المستخدم", "User deleted"), message: target.name });
  };

  const roleCls = (r: string) =>
    r === "system_admin"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
      : r === "dept_manager"
        ? "bg-navy-100 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300"
        : r === "archivist"
          ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
          : r === "auditor"
            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
            : "bg-ink-100 text-ink-600 dark:bg-ink-800";

  return (
    <div>
      <PageHeader
        title={t("nav.users")}
        description={L("إدارة حسابات المستخدمين وأدوارهم وصلاحياتهم وجلساتهم", "Manage user accounts, roles, permissions and sessions")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.users") }]}
        actions={
          <>
            <ExportMenu
              rows={filtered.map((u) => ({
                name: u.name,
                username: u.username,
                email: u.email,
                role: roleLabel(u.role, lang),
                department: departments.find((d) => d.id === u.deptId)?.name ?? u.deptId,
                status: u.status,
                lastLogin: u.lastLogin,
                failedAttempts: u.failedAttempts,
                activeSessions: u.activeSessions,
              }))}
              filename="edas-users"
            />
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              {t("g.create")}
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
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
            placeholder={L("ابحث في المستخدمين…", "Search users…")}
            aria-label={L("ابحث في المستخدمين", "Search users")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-40 text-xs"
          aria-label={L("تصفية حسب الدور", "Filter by role")}
          value={fRole}
          onChange={(e) => setFRole(e.target.value)}
        >
          <option value="all">
            {t("g.all")} — {L("الدور", "Role")}
          </option>
          {(["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"] as const).map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, lang)}
            </option>
          ))}
        </Select>
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب الحالة", "Filter by status")}
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
        >
          <option value="all">{t("g.all")}</option>
          <option value="active">{t("g.active")}</option>
          <option value="locked">{L("مقفل", "Locked")}</option>
          <option value="inactive">{t("g.inactive")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {userList.length}
        </span>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-navy-300 bg-gradient-to-l from-navy-600 to-navy-700 px-4 py-2.5 text-white shadow-card">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{selected.length}</span>
          <span className="text-sm font-semibold">{L("مستخدم محدد", "users selected")}</span>
          <div className="ms-auto flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              icon={<Unlock className="h-4 w-4" />}
              onClick={bulkUnlock}
            >
              {L("فتح القفل", "Unlock")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              icon={<Lock className="h-4 w-4" />}
              onClick={bulkLock}
            >
              {L("قفل", "Lock")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-rose-500/40"
              icon={<LogOut className="h-4 w-4" />}
              onClick={bulkRevoke}
            >
              {L("إلغاء الجلسات", "Revoke")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:bg-white/10"
              icon={<X className="h-4 w-4" />}
              aria-label={L("إلغاء التحديد", "Clear selection")}
              onClick={() => setSelected([])}
            />
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editOpen}
        onClose={() => setEditOpen(null)}
        title={`${t("g.edit")} — ${editOpen?.name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(null)}>
              {t("g.cancel")}
            </Button>
            <Button icon={<Check className="h-4 w-4" />} onClick={saveEdit} disabled={saving || !editOpen?.name?.trim()}>
              {t("g.save")}
            </Button>
          </>
        }
      >
        {editOpen && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("الاسم", "Full name")} required className="col-span-2">
              <Input value={editOpen.name} onChange={(e) => setEditOpen({ ...editOpen, name: e.target.value })} />
            </Field>
            <Field label={L("اسم الدخول", "Username")}>
              <Input dir="ltr" value={editOpen.username} onChange={(e) => setEditOpen({ ...editOpen, username: e.target.value })} />
            </Field>
            <Field label={L("البريد", "Email")}>
              <Input dir="ltr" value={editOpen.email} onChange={(e) => setEditOpen({ ...editOpen, email: e.target.value })} />
            </Field>
            <Field label={t("g.department")}>
              <Select value={editOpen.deptId} onChange={(e) => setEditOpen({ ...editOpen, deptId: e.target.value })}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {lang === "en" ? d.nameEn : d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={L("الدور", "Role")}>
              <Select value={editOpen.role} onChange={(e) => setEditOpen({ ...editOpen, role: e.target.value as DocUser["role"] })}>
                {(["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"] as const).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r, lang)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("g.status")} className="col-span-2">
              <Select value={editOpen.status} onChange={(e) => setEditOpen({ ...editOpen, status: e.target.value as DocUser["status"] })}>
                <option value="active">{t("g.active")}</option>
                <option value="locked">{L("مقفل", "Locked")}</option>
                <option value="inactive">{t("g.inactive")}</option>
              </Select>
            </Field>
            <div className="col-span-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
              <MetaGrid
                items={[
                  { label: L("الرقم الوظيفي", "Emp no."), value: editOpen.empNo },
                  { label: L("آخر دخول", "Last login"), value: editOpen.lastLogin },
                  { label: L("محاولات فاشلة", "Failed attempts"), value: editOpen.failedAttempts },
                  { label: L("الجلسات", "Sessions"), value: editOpen.activeSessions },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إنشاء مستخدم", "Create user")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={submit} loading={saving} disabled={!form.name.trim() || !form.username.trim()}>
              {t("g.create")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Field label={L("الاسم", "Full name")} required>
              <Input
                invalid={!!formErr.name}
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setFormErr({ ...formErr, name: undefined });
                }}
                placeholder={L("اسم المستخدم", "User name")}
              />
            </Field>
            <FieldError message={formErr.name} />
          </div>
          <div className="space-y-1.5">
            <Field label={L("اسم الدخول", "Username")} required>
              <Input
                invalid={!!formErr.username}
                dir="ltr"
                value={form.username}
                onChange={(e) => {
                  setForm({ ...form, username: e.target.value });
                  setFormErr({ ...formErr, username: undefined });
                }}
                placeholder="ahmad.al-balawi"
              />
            </Field>
            <FieldError message={formErr.username} />
          </div>
          <div className="space-y-1.5">
            <Field label={L("البريد", "Email")}>
              <Input
                invalid={!!formErr.email}
                dir="ltr"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  setFormErr({ ...formErr, email: undefined });
                }}
                placeholder="name@edas.gov"
              />
            </Field>
            <FieldError message={formErr.email} />
          </div>
          {apiMode && (
            <div className="col-span-2 space-y-1.5">
              <Field label={L("كلمة المرور", "Password")} required hint={L("8 أحرف على الأقل", "At least 8 characters")}>
                <Input
                  type="password"
                  invalid={!!formErr.password}
                  dir="ltr"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    setFormErr({ ...formErr, password: undefined });
                  }}
                />
              </Field>
              <FieldError message={formErr.password} />
            </div>
          )}
          <Field label={t("g.department")}>
            <Select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value })}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? d.nameEn : d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={L("الدور", "Role")} className="col-span-2">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(["employee", "supervisor", "dept_manager", "archivist", "system_admin", "auditor"] as const).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
      <Modal
        open={!!resetOpen}
        onClose={() => setResetOpen(null)}
        title={`${L("تعيين كلمة مرور", "Set password")} — ${resetOpen?.name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(null)}>
              {t("g.cancel")}
            </Button>
            <Button
              icon={<Check className="h-4 w-4" />}
              loading={saving}
              disabled={resetPassword.length < 8}
              onClick={async () => {
                if (!resetOpen) return;
                setSaving(true);
                try {
                  await domainApi.resetUserPassword(resetOpen.id, resetPassword);
                  toast({ type: "success", title: L("تم تعيين كلمة المرور", "Password updated"), message: resetOpen.name });
                  setResetOpen(null);
                  setResetPassword("");
                } catch {
                  toast({ type: "error", title: t("err.api") });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t("g.save")}
            </Button>
          </>
        }
      >
        <Field label={L("كلمة المرور الجديدة", "New password")} required hint={L("8 أحرف على الأقل", "At least 8 characters")}>
          <Input type="password" dir="ltr" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
        </Field>
      </Modal>
      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              icon={<UsersIcon className="h-8 w-8" />}
              title={L("لا يوجد مستخدمون مطابقون", "No matching users")}
              description={L("جرّب تعديل البحث أو الفلاتر، أو أنشئ مستخدماً جديداً.", "Adjust search/filters or create a new user.")}
              action={
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  {t("g.create")}
                </Button>
              }
            />
          </Card>
        }
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        columns={[
          {
            key: "user",
            header: L("المستخدم", "User"),
            sortValue: (r) => r.name,
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar initials={r.initials} color={r.color} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy-700 dark:text-navy-200">{r.name}</p>
                  <p className="truncate font-mono text-[11px] text-ink-400">@{r.username}</p>
                </div>
              </div>
            ),
          },
          {
            key: "role",
            header: L("الدور", "Role"),
            sortValue: (r) => r.role,
            render: (r) => <Badge className={roleCls(r.role)}>{roleLabel(r.role, lang)}</Badge>,
          },
          {
            key: "dept",
            header: t("g.department"),
            sortValue: (r) => departments.find((d) => d.id === r.deptId)?.name ?? r.deptId,
            render: (r) => (
              <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                {departments.find((d) => d.id === r.deptId)?.name ?? r.deptId}
              </Badge>
            ),
          },
          {
            key: "status",
            header: t("g.status"),
            sortValue: (r) => r.status,
            render: (r) => (
              <Badge
                className={
                  r.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : r.status === "locked"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                }
                dot={r.status === "active" ? "bg-emerald-500" : r.status === "locked" ? "bg-rose-500" : undefined}
              >
                {r.status === "active" ? t("g.active") : r.status === "locked" ? L("مقفل", "Locked") : t("g.inactive")}
              </Badge>
            ),
          },
          {
            key: "login",
            header: L("آخر دخول", "Last login"),
            sortValue: (r) => r.lastLogin,
            render: (r) => <span className="font-mono text-[11px] text-ink-500">{r.lastLogin}</span>,
          },
          {
            key: "fail",
            header: L("فاشلة", "Failed"),
            sortValue: (r) => r.failedAttempts,
            render: (r) => (
              <span
                className={cn(
                  "text-xs font-bold",
                  r.failedAttempts > 3 ? "text-rose-600" : r.failedAttempts > 0 ? "text-amber-600" : "text-ink-400",
                )}
              >
                {r.failedAttempts}
              </span>
            ),
          },
          {
            key: "sess",
            header: L("الجلسات", "Sessions"),
            sortValue: (r) => r.activeSessions,
            render: (r) => (
              <div className="flex items-center gap-1.5">
                {r.activeSessions > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                <span className="text-xs font-bold text-ink-600 dark:text-ink-300">{r.activeSessions}</span>
              </div>
            ),
          },
        ]}
        rowActions={(r) => (
          <RowMenu
            items={[
              { label: t("g.edit"), icon: <Pencil className="h-4 w-4" />, onClick: () => setEditOpen({ ...r }) },
              {
                label: r.status === "locked" ? L("فتح القفل", "Unlock") : L("قفل", "Lock"),
                icon: r.status === "locked" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                onClick: () => {
                  if (apiMode) {
                    void domainApi
                      .updateUser(r.id, { status: r.status === "locked" ? "ACTIVE" : "LOCKED" })
                      .then(() => refreshUsers())
                      .then(() =>
                        toast({
                          type: "success",
                          title: r.status === "locked" ? L("تم فتح القفل", "Unlocked") : L("تم قفل الحساب", "Account locked"),
                          message: r.name,
                        }),
                      )
                      .catch(() => toast({ type: "error", title: t("err.api") }));
                    return;
                  }
                  usersStore.update(r.id, { status: r.status === "locked" ? "active" : "locked" });
                  toast({
                    type: "success",
                    title: r.status === "locked" ? L("تم فتح القفل", "Unlocked") : L("تم قفل الحساب", "Account locked"),
                    message: r.name,
                  });
                },
              },
              {
                label: r.status === "active" ? L("إيقاف", "Deactivate") : L("تفعيل", "Activate"),
                icon: r.status === "active" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />,
                onClick: () => {
                  if (apiMode) {
                    void domainApi
                      .updateUser(r.id, { status: r.status === "active" ? "INACTIVE" : "ACTIVE" })
                      .then(() => refreshUsers())
                      .then(() =>
                        toast({
                          type: "info",
                          title: r.status === "active" ? L("تم إيقاف الحساب", "Deactivated") : L("تم التفعيل", "Activated"),
                          message: r.name,
                        }),
                      )
                      .catch(() => toast({ type: "error", title: t("err.api") }));
                    return;
                  }
                  usersStore.update(r.id, { status: r.status === "active" ? "inactive" : "active" });
                  toast({
                    type: "info",
                    title: r.status === "active" ? L("تم إيقاف الحساب", "Deactivated") : L("تم التفعيل", "Activated"),
                    message: r.name,
                  });
                },
              },
              ...(apiMode
                ? [
                    {
                      label: L("إعادة تعيين كلمة المرور", "Reset password"),
                      icon: <KeyRound className="h-4 w-4" />,
                      onClick: () => {
                        setResetPassword("");
                        setResetOpen(r);
                      },
                    },
                  ]
                : []),
              {
                label: L("إلغاء الجلسات", "Revoke sessions"),
                icon: <LogOut className="h-4 w-4" />,
                onClick: () => {
                  if (apiMode) {
                    void domainApi
                      .revokeUserSessions(r.id)
                      .then(() => refreshUsers())
                      .then(() => toast({ type: "warning", title: L("تم إلغاء الجلسات", "Sessions revoked"), message: r.name }))
                      .catch(() => toast({ type: "error", title: t("err.api") }));
                    return;
                  }
                  usersStore.update(r.id, { activeSessions: 0 });
                  toast({ type: "warning", title: L("تم إلغاء الجلسات", "Sessions revoked"), message: r.name });
                },
              },
              {
                label: t("g.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onClick: () => setDeleteTarget({ ...r }),
              },
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) doDelete(deleteTarget);
        }}
        title={L("حذف المستخدم", "Delete user")}
        message={L(
          `سيتم حذف حساب «${deleteTarget?.name ?? ""}» نهائياً مع إبطال جلساته. لا يمكن التراجع عن هذا الإجراء.`,
          `The account "${deleteTarget?.name ?? ""}" will be permanently deleted and its sessions revoked. This cannot be undone.`,
        )}
        confirmText={t("g.delete")}
        danger
      />
    </div>
  );
}
