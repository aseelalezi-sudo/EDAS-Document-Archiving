import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Check, X, Search, Users, ChevronDown, Building2, GitBranch, Boxes } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Modal, Field, Input, Select, EmptyState, Tooltip, ConfirmDialog } from "../components/ui";
import { PageHeader, RowMenu, ExportMenu, MetaGrid, Segmented } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Department, Employee } from "../types";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { canManage, canWriteOrg, orgScope } from "../lib/org-scope";

const DEPT_GRADIENTS = [
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
  return DEPT_GRADIENTS[hash % DEPT_GRADIENTS.length];
}

export function Departments() {
  const { t, lang, toast, user, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const apiMode = config.useApi;
  const { departments: deptStore, sections: secStore, employees: empStore, scopedDocs, refreshOrgDirectory } = useDocsStore();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Department | null>(null);
  const [moveOpen, setMoveOpen] = useState<Department | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [view, setView] = useState<"tree" | "cards">("tree");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", code: "", manager: "", parentId: "" });
  const departments: Department[] = deptStore.items;
  const allSections = secStore.items;
  const allEmployees: Employee[] = empStore.items;
  const scope = orgScope(role, user?.department, departments);
  const mayWrite = canWriteOrg(role);
  const canManageRow = (departmentId: string) => mayWrite && canManage(scope, departmentId);
  const canCreate = mayWrite && (scope === null || scope.size > 0);
  const parentCandidates = departments.filter((d) => canManage(scope, d.id));
  const visibleDepts = q
    ? departments.filter(
        (d) => d.name.includes(q) || d.nameEn.toLowerCase().includes(q.toLowerCase()) || d.code.toLowerCase().includes(q.toLowerCase()),
      )
    : departments;
  const roots = visibleDepts.filter((d) => !d.parentId);
  const treeNodes = q ? visibleDepts : roots;
  const toggle = (id: string) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const descendantsOf = (id: string) => {
    const result: string[] = [];
    const walk = (parentId: string) => {
      departments
        .filter((d) => d.parentId === parentId)
        .forEach((child) => {
          result.push(child.id);
          walk(child.id);
        });
    };
    walk(id);
    return result;
  };
  const nextCode = (prefix: string) => {
    let index = 1;
    while (departments.some((d) => d.code === `${prefix}-${String(index).padStart(3, "0")}`)) index += 1;
    return `${prefix}-${String(index).padStart(3, "0")}`;
  };

  const openCreate = () => {
    setForm({ name: "", code: "", manager: "", parentId: scope ? [...scope][0] : "" });
    setAddOpen(true);
  };
  const stats = [
    { label: L("الإدارات", "Departments"), value: departments.length, icon: Building2, color: "from-navy-400 to-navy-600" },
    { label: L("الأقسام", "Sections"), value: allSections.length, icon: GitBranch, color: "from-teal-400 to-teal-600" },
    { label: L("الموظفون", "Employees"), value: allEmployees.length, icon: Users, color: "from-purple-400 to-purple-600" },
    { label: L("الوثائق", "Documents"), value: scopedDocs.length, icon: Boxes, color: "from-amber-400 to-amber-600" },
  ];

  const saveEdit = () => {
    if (!editOpen || !editOpen.name.trim()) return;
    if (apiMode) {
      void domainApi
        .updateDepartment(editOpen.id, {
          name: editOpen.name,
          code: editOpen.code.toUpperCase(),
          nameEn: editOpen.nameEn,
          manager: editOpen.manager,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setEditOpen(null);
      return;
    }
    deptStore.update(editOpen.id, { name: editOpen.name, code: editOpen.code.toUpperCase(), manager: editOpen.manager });
    toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
    setEditOpen(null);
  };
  const doDelete = (d: Department) => {
    if (apiMode) {
      void domainApi
        .deleteDepartment(d.id)
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حذف الإدارة", "Department deleted"), message: d.name }))
        .catch((error) =>
          toast({ type: "error", title: L("تعذر حذف الإدارة", "Could not delete department"), message: serverReason(error) }),
        );
      return;
    }
    const childSec = allSections.filter((s) => s.deptId === d.id).length;
    const childEmp = allEmployees.filter((e) => e.deptId === d.id).length;
    const childDept = departments.filter((item) => item.parentId === d.id).length;
    if (childSec > 0 || childEmp > 0 || childDept > 0) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L(
          `${childDept} إدارة فرعية، ${childSec} قسم و${childEmp} موظف مرتبط`,
          `${childDept} sub-departments, ${childSec} sections and ${childEmp} employees linked`,
        ),
      });
      return;
    }
    deptStore.remove(d.id);
    toast({ type: "success", title: L("تم حذف الإدارة", "Department deleted"), message: d.name });
  };
  const openMove = (department: Department) => {
    setMoveOpen(department);
    setMoveParentId(canManage(scope, department.parentId) ? (department.parentId ?? "") : "");
  };
  const moveCandidates = moveOpen
    ? parentCandidates.filter((department) => department.id !== moveOpen.id && !descendantsOf(moveOpen.id).includes(department.id))
    : [];
  const submitMove = () => {
    if (!moveOpen) return;
    const parentId = moveParentId || null;
    if (apiMode) {
      void domainApi
        .updateDepartment(moveOpen.id, { parentId })
        .then(() => refreshOrgDirectory())
        .then(() => {
          toast({ type: "success", title: L("تم نقل الإدارة", "Department moved"), message: moveOpen.name });
          setExpanded((items) => (parentId && !items.includes(parentId) ? [...items, parentId] : items));
          setMoveOpen(null);
        })
        .catch((error) =>
          toast({ type: "error", title: L("تعذر نقل الإدارة", "Could not move department"), message: serverReason(error) }),
        );
      return;
    }
    deptStore.update(moveOpen.id, { parentId });
    toast({ type: "success", title: L("تم نقل الإدارة", "Department moved"), message: moveOpen.name });
    setExpanded((items) => (parentId && !items.includes(parentId) ? [...items, parentId] : items));
    setMoveOpen(null);
  };
  const submit = () => {
    if (!form.name.trim()) return;
    if (apiMode) {
      void domainApi
        .createDepartment({
          code: form.code.toUpperCase() || nextCode("DEPT"),
          name: form.name,
          nameEn: form.name,
          manager: form.manager || undefined,
          parentId: form.parentId || undefined,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم إنشاء الإدارة", "Department created"), message: form.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setAddOpen(false);
      setForm({ name: "", code: "", manager: "", parentId: "" });
      return;
    }
    deptStore.add({
      name: form.name,
      nameEn: form.name,
      code: form.code.toUpperCase() || nextCode("DEPT"),
      parentId: form.parentId || null,
      manager: form.manager || "—",
      employees: 0,
      docs: 0,
      status: "active",
    });
    setAddOpen(false);
    setForm({ name: "", code: "", manager: "", parentId: "" });
    toast({ type: "success", title: L("تم إنشاء الإدارة", "Department created"), message: form.name });
  };
  const renderNode = (d: Department, depth: number) => {
    const children = visibleDepts.filter((x) => x.parentId === d.id);
    const isOpen = expanded.includes(d.id) || !!q;
    const sec = allSections.filter((s) => s.deptId === d.id).length;
    const emp = allEmployees.filter((e) => e.deptId === d.id).length;
    const grad = gradientFor(d.id);
    const manages = canManageRow(d.id);
    const menuItems = [
      {
        label: L("الموظفون", "Employees"),
        icon: <Users className="h-4 w-4" />,
        onClick: () => navigate(`/org/employees?dept=${d.id}`),
      },
      ...(manages
        ? [
            {
              label: L("إضافة قسم", "Add section"),
              icon: <Plus className="h-4 w-4" />,
              onClick: () => navigate(`/org/sections?dept=${d.id}`),
            },
            {
              label: L("نقل داخل الهيكل", "Move in tree"),
              icon: <GitBranch className="h-4 w-4" />,
              onClick: () => openMove(d),
            },
            { label: t("g.delete"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTarget(d) },
          ]
        : []),
    ];
    return (
      <div key={d.id}>
        <div
          className={cn(
            "group flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-soft transition-all hover:border-navy-300 hover:shadow-card dark:bg-ink-900",
            depth === 0 ? "border-ink-200/70 dark:border-ink-800" : "border-ink-200/50 dark:border-ink-800/60",
          )}
          style={{ marginInlineStart: depth * 28 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(d.id)}
              aria-expanded={isOpen}
              aria-label={isOpen ? L("طي", "Collapse") : L("توسيع", "Expand")}
              className="shrink-0 rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", !isOpen && "-rotate-90")} />
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
              grad,
            )}
          >
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[15px] font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? d.nameEn : d.name}</p>
              <Badge className="bg-ink-100 font-mono text-[10px] text-ink-500 dark:bg-ink-800">{d.code}</Badge>
              {depth > 0 && <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">{L("فرعي", "Sub")}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-400">
              <span>👤 {d.manager}</span>
              <span>
                · 🔗 {sec} {L("قسم", "sec")}
              </span>
              <span>
                · 👥 {emp} {L("موظف", "emp")}
              </span>
              <span>
                · 📄 {d.docs} {L("وثيقة", "docs")}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip label={L("الوثائق", "Documents")}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={L("الوثائق", "Documents")}
                onClick={() => navigate(`/documents?dept=${d.id}`)}
              >
                <Boxes className="h-4 w-4" />
              </Button>
            </Tooltip>
            {manages && (
              <Tooltip label={t("g.edit")}>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("g.edit")} onClick={() => setEditOpen({ ...d })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            <RowMenu items={menuItems} />
          </div>
        </div>
        {isOpen && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };
  return (
    <div>
      <PageHeader
        title={t("nav.departments")}
        description={L(
          "الهيكل التنظيمي للإدارات والخطوط الإدارية والأقسام الفرعية",
          "Organizational structure of departments, business lines and sub-departments",
        )}
        breadcrumbs={[{ label: t("nav.org") }, { label: t("nav.departments") }]}
        actions={
          <>
            <ExportMenu
              rows={departments.map((d) => ({ code: d.code, name: d.name, manager: d.manager, docs: d.docs, status: d.status }))}
              filename="edas-departments"
            />
            {canCreate && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                {t("g.create")}
              </Button>
            )}
          </>
        }
      />

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

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/70 bg-white px-3.5 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
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
            placeholder={L("ابحث في الإدارات…", "Search departments…")}
            aria-label={L("بحث في الإدارات", "Search departments")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "tree", label: L("شجرة", "Tree"), icon: <GitBranch className="h-4 w-4" /> },
            { value: "cards", label: L("بطاقات", "Cards"), icon: <Building2 className="h-4 w-4" /> },
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronDown className="h-3.5 w-3.5" />}
          onClick={() => setExpanded(expanded.length > 1 ? [] : departments.map((d) => d.id))}
        >
          {expanded.length > 1 ? L("طي الكل", "Collapse") : L("توسيع الكل", "Expand")}
        </Button>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إنشاء إدارة", "Create department")}
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
          <Field label={L("اسم الإدارة", "Department name")} required className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={L("إدارة جديدة", "New department")}
            />
          </Field>
          <Field label={L("الرمز", "Code")} hint={L("أحرف إنجليزية كبيرة", "Uppercase")}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="NEW" dir="ltr" />
          </Field>
          <Field label={L("المدير", "Manager")}>
            <Input
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
              placeholder={L("اسم المدير", "Manager name")}
            />
          </Field>
          <Field
            label={L("الإدارة الأم", "Parent dept")}
            hint={scope === null ? L("فارغة = رئيسية", "Empty = root") : L("إداراتك فقط", "Your departments only")}
            className="col-span-2"
          >
            <Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              {scope === null && <option value="">{L("— رئيسية —", "— Root —")}</option>}
              {parentCandidates.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? d.nameEn : d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!moveOpen}
        onClose={() => setMoveOpen(null)}
        title={`${L("نقل داخل الهيكل", "Move in tree")} — ${moveOpen?.name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setMoveOpen(null)}>
              {t("g.cancel")}
            </Button>
            <Button icon={<GitBranch className="h-4 w-4" />} onClick={submitMove} disabled={scope !== null && !moveParentId}>
              {L("نقل", "Move")}
            </Button>
          </>
        }
      >
        {moveOpen && (
          <div className="space-y-3">
            <div className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600 dark:bg-ink-950 dark:text-ink-300">
              {scope === null
                ? L("اختر الإدارة الأم الجديدة أو اجعلها إدارة رئيسية.", "Choose a new parent department or make it a root department.")
                : L(
                    "يمكن النقل داخل إداراتك فقط؛ لا يمكن جعلها إدارة رئيسية.",
                    "You can only move it inside your own departments; it cannot become a root department.",
                  )}
            </div>
            <Field label={L("الإدارة الأم", "Parent department")}>
              <Select value={moveParentId} onChange={(e) => setMoveParentId(e.target.value)}>
                {scope === null && <option value="">{L("— رئيسية —", "— Root —")}</option>}
                {moveCandidates.map((department) => (
                  <option key={department.id} value={department.id}>
                    {lang === "en" ? department.nameEn : department.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

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
            <Field label={L("اسم الإدارة", "Department name")} required className="col-span-2">
              <Input value={editOpen.name} onChange={(e) => setEditOpen({ ...editOpen, name: e.target.value })} />
            </Field>
            <Field label={L("الرمز", "Code")}>
              <Input value={editOpen.code} onChange={(e) => setEditOpen({ ...editOpen, code: e.target.value })} dir="ltr" />
            </Field>
            <Field label={L("المدير", "Manager")}>
              <Input value={editOpen.manager} onChange={(e) => setEditOpen({ ...editOpen, manager: e.target.value })} />
            </Field>
            <div className="col-span-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
              <MetaGrid
                items={[
                  { label: L("الأقسام", "Sections"), value: allSections.filter((s) => s.deptId === editOpen.id).length },
                  { label: L("الموظفون", "Employees"), value: allEmployees.filter((e) => e.deptId === editOpen.id).length },
                  { label: L("الوثائق", "Documents"), value: editOpen.docs },
                  { label: L("الحالة", "Status"), value: t("g.active") },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      {view === "tree" ? (
        visibleDepts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title={L("لا توجد إدارات مطابقة", "No matching departments")}
              description={L("جرّب كلمة بحث مختلفة أو أنشئ إدارة جديدة.", "Try a different keyword or create one.")}
              action={
                canCreate ? (
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                    {t("g.create")}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">{treeNodes.map((d) => renderNode(d, 0))}</div>
        )
      ) : visibleDepts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title={L("لا توجد إدارات مطابقة", "No matching departments")}
            description={L("جرّب كلمة بحث مختلفة أو أنشئ إدارة جديدة.", "Try a different keyword or create one.")}
            action={
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                {t("g.create")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleDepts.map((d) => {
            const grad = gradientFor(d.id);
            const sec = allSections.filter((s) => s.deptId === d.id).length;
            const emp = allEmployees.filter((e) => e.deptId === d.id).length;
            return (
              <Card key={d.id} className="group flex flex-col">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                      grad,
                    )}
                  >
                    <Building2 className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold text-ink-800 dark:text-ink-100">
                      {lang === "en" ? d.nameEn : d.name}
                    </p>
                    <p className="font-mono text-[11px] text-ink-400">{d.code}</p>
                  </div>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                  <Users className="h-3.5 w-3.5 text-ink-300" /> {d.manager}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { l: L("أقسام", "Sec"), v: sec },
                    { l: L("موظفون", "Emp"), v: emp },
                    { l: L("وثائق", "Docs"), v: d.docs },
                  ].map((m) => (
                    <div key={m.l} className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                      <p className="text-lg font-extrabold text-ink-800 dark:text-ink-100">{m.v}</p>
                      <p className="text-[9px] font-bold uppercase text-ink-400">{m.l}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    icon={<Boxes className="h-3.5 w-3.5" />}
                    onClick={() => navigate(`/documents?dept=${d.id}`)}
                  >
                    {L("الوثائق", "Docs")}
                  </Button>
                  {canManageRow(d.id) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => setEditOpen({ ...d })}
                        aria-label={t("g.edit")}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setDeleteTarget(d)}
                        aria-label={t("g.delete")}
                      />
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) doDelete(deleteTarget);
        }}
        title={L("حذف الإدارة", "Delete department")}
        danger
        message={
          deleteTarget
            ? L(
                `سيتم حذف «${deleteTarget.name}» نهائياً. لا يمكن الحذف إذا كانت مرتبطة بإدارات فرعية أو أقسام أو موظفين.`,
                `"${deleteTarget.nameEn || deleteTarget.name}" will be permanently deleted. Deletion is blocked when sub-departments, sections or employees are linked.`,
              )
            : ""
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
