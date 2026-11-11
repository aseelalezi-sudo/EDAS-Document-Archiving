import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Check, X, Activity, Search, Users, Building2, GitBranch, Boxes } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Avatar, Modal, Field, Input, Select, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu, ExportMenu, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Department, Employee, Section } from "../types";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { canManage, canWriteOrg, orgScope } from "../lib/org-scope";

const SECTION_GRADIENTS = [
  "from-violet-400 to-violet-600",
  "from-rose-400 to-rose-600",
  "from-emerald-400 to-emerald-600",
  "from-amber-400 to-amber-600",
  "from-sky-400 to-sky-600",
  "from-teal-400 to-teal-600",
  "from-orange-400 to-orange-600",
  "from-purple-400 to-purple-600",
];

function gradientFor(id: string) {
  const hash = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SECTION_GRADIENTS[hash % SECTION_GRADIENTS.length];
}

export function Sections() {
  const { t, lang, toast, user, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiMode = config.useApi;
  const { sections: secStore, departments: deptStore, employees: empStore, refreshOrgDirectory } = useDocsStore();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Section | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);
  const [q, setQ] = useState("");
  const [fDept, setFDept] = useState(() => searchParams.get("dept") ?? "all");
  const [form, setForm] = useState({ name: "", code: "", deptId: "", head: "" });
  const sections: Section[] = secStore.items;
  const departments: Department[] = deptStore.items;
  const allEmployees: Employee[] = empStore.items;
  const scope = orgScope(role, user?.department, departments);
  const mayWrite = canWriteOrg(role);
  const canManageRow = (deptId: string) => mayWrite && canManage(scope, deptId);
  const managedDepartments = departments.filter((d) => canManage(scope, d.id));
  const canCreate = mayWrite && managedDepartments.length > 0;

  const empCount = (secId: string) => allEmployees.filter((e) => e.sectionId === secId).length;
  const filtered = sections.filter((s) => {
    if (
      q &&
      !(
        s.name.includes(q) ||
        s.nameEn.toLowerCase().includes(q.toLowerCase()) ||
        s.code.toLowerCase().includes(q.toLowerCase()) ||
        (s.head ?? "").includes(q)
      )
    )
      return false;
    if (fDept !== "all" && s.deptId !== fDept) return false;
    return true;
  });

  const stats = [
    { label: L("الأقسام", "Sections"), value: sections.length, icon: GitBranch, color: "from-navy-400 to-navy-600" },
    {
      label: L("الإدارات", "Departments"),
      value: new Set(sections.map((s) => s.deptId)).size,
      icon: Building2,
      color: "from-teal-400 to-teal-600",
    },
    { label: L("الموظفون", "Employees"), value: allEmployees.length, icon: Users, color: "from-purple-400 to-purple-600" },
    {
      label: L("متوسط لكل قسم", "Avg / section"),
      value: sections.length ? (allEmployees.length / sections.length).toFixed(1) : "0",
      icon: Activity,
      color: "from-amber-400 to-amber-600",
    },
  ];

  const nextCode = () => {
    let index = 1;
    while (sections.some((s) => s.code === `SEC-${String(index).padStart(3, "0")}`)) index += 1;
    return `SEC-${String(index).padStart(3, "0")}`;
  };
  const openCreate = () => {
    setForm({ name: "", code: "", deptId: managedDepartments[0]?.id ?? "", head: "" });
    setAddOpen(true);
  };
  const submit = () => {
    if (!form.name.trim()) return;
    if (!form.deptId) {
      toast({
        type: "error",
        title: L("اختر الإدارة", "Select a department"),
        message: L("أنشئ إدارة أولاً", "Create a department first"),
      });
      return;
    }
    if (apiMode) {
      void domainApi
        .createSection({
          code: form.code.toUpperCase() || nextCode(),
          name: form.name,
          nameEn: form.name,
          manager: form.head || undefined,
          departmentId: form.deptId,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم إنشاء القسم", "Section created"), message: form.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setAddOpen(false);
      setForm({ name: "", code: "", deptId: "", head: "" });
      return;
    }
    secStore.add({
      name: form.name,
      nameEn: form.name,
      code: form.code.toUpperCase() || nextCode(),
      deptId: form.deptId,
      head: form.head || "—",
      employees: 0,
      status: "active",
    });
    setAddOpen(false);
    setForm({ name: "", code: "", deptId: "", head: "" });
    toast({ type: "success", title: L("تم إنشاء القسم", "Section created"), message: form.name });
  };
  const saveEdit = () => {
    if (!editOpen || !editOpen.name.trim()) return;
    if (apiMode) {
      void domainApi
        .updateSection(editOpen.id, {
          name: editOpen.name,
          code: editOpen.code.toUpperCase(),
          departmentId: editOpen.deptId,
          nameEn: editOpen.nameEn,
          manager: editOpen.head,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setEditOpen(null);
      return;
    }
    secStore.update(editOpen.id, { name: editOpen.name, code: editOpen.code.toUpperCase(), deptId: editOpen.deptId, head: editOpen.head });
    toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
    setEditOpen(null);
  };
  const doDelete = (s: Section) => {
    if (apiMode) {
      void domainApi
        .deleteSection(s.id)
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حذف القسم", "Section deleted"), message: s.name }))
        .catch((error) => toast({ type: "error", title: L("تعذر حذف القسم", "Could not delete section"), message: serverReason(error) }));
      return;
    }
    const emp = allEmployees.filter((e) => e.sectionId === s.id).length;
    if (emp > 0) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L(`${emp} موظف مرتبط بهذا القسم`, `${emp} employees are linked`),
      });
      return;
    }
    secStore.remove(s.id);
    toast({ type: "success", title: L("تم حذف القسم", "Section deleted"), message: s.name });
  };
  const deptNameOf = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? (lang === "en" ? d.nameEn : d.name) : id;
  };

  return (
    <div>
      <PageHeader
        title={t("nav.sections")}
        description={L("الأقسام التابعة للإدارات مع توزيع الموظفين", "Sections under departments with employee distribution")}
        breadcrumbs={[{ label: t("nav.org") }, { label: t("nav.sections") }]}
        actions={
          <>
            <ExportMenu
              rows={filtered.map((s) => ({
                code: s.code,
                name: s.name,
                department: deptNameOf(s.deptId),
                head: s.head,
                employees: empCount(s.id),
                status: s.status,
              }))}
              filename="edas-sections"
            />
            {canCreate && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                {t("g.create")}
              </Button>
            )}
          </>
        }
      />

      {/* Stats */}
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
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <div className="relative min-w-40 flex-1 md:max-w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={L("مسح البحث", "Clear search")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            className="h-8 px-9 text-xs"
            placeholder={L("ابحث في الأقسام…", "Search sections…")}
            aria-label={L("بحث في الأقسام", "Search sections")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-44 text-xs"
          aria-label={L("تصفية حسب الإدارة", "Filter by department")}
          value={fDept}
          onChange={(e) => setFDept(e.target.value)}
        >
          <option value="all">
            {t("g.all")} — {t("g.department")}
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {lang === "en" ? d.nameEn : d.name}
            </option>
          ))}
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {sections.length}
        </span>
      </div>

      {/* Create modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إنشاء قسم", "Create section")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={submit} disabled={!form.name.trim()}>
              {t("g.create")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("اسم القسم", "Section name")} required className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={L("قسم جديد", "New section")}
            />
          </Field>
          <Field label={L("الرمز", "Code")} hint={L("أحرف إنجليزية كبيرة", "Uppercase letters")}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SEC-N" dir="ltr" />
          </Field>
          <Field label={t("g.department")} required>
            <Select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value })}>
              {managedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? d.nameEn : d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={L("رئيس القسم", "Section head")}
            className="col-span-2"
            hint={L("المسمى الوظيفي لرئيس القسم", "Job title of the section head")}
          >
            <Input
              value={form.head}
              onChange={(e) => setForm({ ...form, head: e.target.value })}
              placeholder={L("أ. مها العنزي", "Ms. Maha Al-Anazi")}
            />
          </Field>
        </div>
      </Modal>

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
            <Button icon={<Check className="h-4 w-4" />} onClick={saveEdit} disabled={!editOpen?.name?.trim()}>
              {t("g.save")}
            </Button>
          </>
        }
      >
        {editOpen && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("اسم القسم", "Section name")} required className="col-span-2">
              <Input value={editOpen.name} onChange={(e) => setEditOpen({ ...editOpen, name: e.target.value })} />
            </Field>
            <Field label={L("الرمز", "Code")}>
              <Input value={editOpen.code} onChange={(e) => setEditOpen({ ...editOpen, code: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t("g.department")}>
              <Select value={editOpen.deptId} onChange={(e) => setEditOpen({ ...editOpen, deptId: e.target.value })}>
                {managedDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {lang === "en" ? d.nameEn : d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={L("رئيس القسم", "Section head")} className="col-span-2">
              <Input value={editOpen.head} onChange={(e) => setEditOpen({ ...editOpen, head: e.target.value })} />
            </Field>
            <div className="col-span-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
              <MetaGrid
                items={[
                  { label: L("الموظفون", "Employees"), value: empCount(editOpen.id) },
                  { label: L("الإدارة", "Department"), value: deptNameOf(editOpen.deptId) },
                  { label: L("الحالة", "Status"), value: t("g.active") },
                  { label: L("الرمز", "Code"), value: editOpen.code },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Table */}
      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              icon={<GitBranch className="h-8 w-8" />}
              title={L("لا توجد أقسام مطابقة", "No matching sections")}
              description={L("جرّب تعديل البحث أو الفلاتر، أو أنشئ قسماً جديداً.", "Adjust search/filters or create a new section.")}
              action={
                canCreate ? (
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                    {t("g.create")}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        }
        columns={[
          {
            key: "name",
            header: t("g.name"),
            sortValue: (r) => r.name,
            render: (r) => {
              const grad = gradientFor(r.deptId);
              return (
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
                      grad,
                    )}
                  >
                    <GitBranch className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-navy-700 dark:text-navy-200">{lang === "en" ? r.nameEn : r.name}</p>
                    <p className="font-mono text-[11px] text-ink-400">{r.code}</p>
                  </div>
                </div>
              );
            },
          },
          {
            key: "dept",
            header: t("g.department"),
            sortValue: (r) => deptNameOf(r.deptId),
            render: (r) => (
              <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">{deptNameOf(r.deptId)}</Badge>
            ),
          },
          {
            key: "head",
            header: L("رئيس القسم", "Section head"),
            sortValue: (r) => r.head,
            render: (r) => (
              <span className="flex items-center gap-2 text-xs text-ink-500">
                <Avatar initials={(r.head ?? "—").slice(0, 2)} color="bg-navy-600" size="xs" /> {r.head}
              </span>
            ),
          },
          {
            key: "emp",
            header: L("الموظفون", "Employees"),
            sortValue: (r) => empCount(r.id),
            render: (r) => {
              const n = empCount(r.id);
              return (
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "font-bold",
                      n > 10
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                        : n > 3
                          ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                          : "bg-ink-100 text-ink-600 dark:bg-ink-800",
                    )}
                  >
                    {n}
                  </Badge>
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className={cn("h-full rounded-full", n > 10 ? "bg-purple-500" : n > 3 ? "bg-teal-500" : "bg-ink-400")}
                      style={{ width: `${Math.min(100, (n / 15) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            },
          },
          {
            key: "status",
            header: t("g.status"),
            sortValue: (r) => r.status,
            render: () => (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" dot="bg-emerald-500">
                {t("g.active")}
              </Badge>
            ),
          },
        ]}
        rowActions={(r) => (
          <RowMenu
            items={[
              ...(canManageRow(r.deptId)
                ? [{ label: t("g.edit"), icon: <Pencil className="h-4 w-4" />, onClick: () => setEditOpen({ ...r }) }]
                : []),
              {
                label: L("الموظفون", "Employees"),
                icon: <Users className="h-4 w-4" />,
                onClick: () => navigate(`/org/employees?dept=${r.deptId}`),
              },
              {
                label: L("الوثائق", "Documents"),
                icon: <Boxes className="h-4 w-4" />,
                onClick: () => navigate(`/documents?dept=${r.deptId}`),
              },
              ...(canManageRow(r.deptId)
                ? [{ label: t("g.delete"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTarget(r) }]
                : []),
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
        title={L("حذف القسم", "Delete section")}
        danger
        message={
          deleteTarget
            ? L(
                `سيتم حذف «${deleteTarget.name}» نهائياً. لا يمكن الحذف إذا كان مرتبطاً بموظفين.`,
                `"${deleteTarget.nameEn || deleteTarget.name}" will be permanently deleted. Deletion is blocked when employees are linked.`,
              )
            : ""
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
