import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Users, Boxes, Eye, Pencil, Trash2, Check, Clock, Activity, X, Search } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Input, Select, EmptyState, Modal, Field, ConfirmDialog } from "../components/ui";
import { PageHeader, ExportMenu, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Department, Employee, Project } from "../types";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { canManage, canWriteOrg, orgScope, projectDepartmentId } from "../lib/org-scope";
export function Projects() {
  const { t, lang, toast, user, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const location = useLocation();
  const apiMode = config.useApi;
  const { projects: projStore, departments: deptStore, employees: empStore, refreshOrgDirectory } = useDocsStore();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [form, setForm] = useState({ name: "", code: "", manager: "", deptId: "", status: "planned", startDate: "", endDate: "" });
  const projects: Project[] = projStore.items;
  const departments: Department[] = deptStore.items;
  const employees: Employee[] = empStore.items;
  const scope = orgScope(role, user?.department, departments);
  const mayWrite = canWriteOrg(role);
  const managedDepartments = departments.filter((d) => canManage(scope, d.id));
  const canManageRow = (project: Project) => mayWrite && canManage(scope, projectDepartmentId(project));
  const canCreate = mayWrite && (scope === null || managedDepartments.length > 0);
  const editRequestRef = useRef<string | null>(null);

  useEffect(() => {
    const requested = (location.state as { editProjectId?: string } | null)?.editProjectId;
    if (!requested || editRequestRef.current === requested) return;
    const target = projects.find((project) => project.id === requested);
    if (!target) return;
    editRequestRef.current = requested;
    setEditOpen({ ...target });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, projects, navigate]);

  const membersOf = (project: Project) =>
    apiMode ? employees.filter((employee) => project.departments.includes(employee.deptId)).length : project.members;

  const filtered = projects.filter((p) => {
    if (
      q &&
      !(
        p.name.includes(q) ||
        p.nameEn.toLowerCase().includes(q.toLowerCase()) ||
        p.code.toLowerCase().includes(q.toLowerCase()) ||
        (p.manager ?? "").includes(q)
      )
    )
      return false;
    if (fStatus !== "all" && p.status !== fStatus) return false;
    return true;
  });

  const nextCode = () => {
    let index = 1;
    while (projects.some((project) => project.code === `PRJ-${String(index).padStart(3, "0")}`)) index += 1;
    return `PRJ-${String(index).padStart(3, "0")}`;
  };

  const stats = [
    { label: L("المشاريع", "Projects"), value: projects.length, icon: Boxes, color: "from-navy-400 to-navy-600" },
    {
      label: L("نشطة", "Active"),
      value: projects.filter((p) => p.status === "active").length,
      icon: Activity,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: L("مخططة", "Planned"),
      value: projects.filter((p) => p.status === "planned").length,
      icon: Clock,
      color: "from-sky-400 to-sky-600",
    },
    {
      label: L("وثائق المشاريع", "Project docs"),
      value: projects.reduce((sum, project) => sum + project.docs, 0),
      icon: Boxes,
      color: "from-amber-400 to-amber-600",
    },
  ];

  const openCreate = () => {
    setForm({
      name: "",
      code: "",
      manager: "",
      deptId: scope === null ? "" : (managedDepartments[0]?.id ?? ""),
      status: "planned",
      startDate: "",
      endDate: "",
    });
    setAddOpen(true);
  };
  const submit = () => {
    if (!form.name.trim()) return;
    const selectedDepartments = form.deptId ? [form.deptId] : [];
    if (apiMode) {
      void domainApi
        .createProject({
          code: form.code.toUpperCase() || nextCode(),
          name: form.name,
          nameEn: form.name,
          status: form.status,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          departmentId: form.deptId || null,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم إنشاء المشروع", "Project created"), message: form.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setAddOpen(false);
      setForm({ name: "", code: "", manager: "", deptId: "", status: "planned", startDate: "", endDate: "" });
      return;
    }
    projStore.add({
      name: form.name,
      nameEn: form.name,
      code: form.code.toUpperCase() || nextCode(),
      manager: form.manager || "—",
      status: form.status as Project["status"],
      startDate: form.startDate || new Date().toISOString().slice(0, 10),
      endDate: form.endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
      departments: selectedDepartments,
      members: 0,
      docs: 0,
    });
    setAddOpen(false);
    setForm({ name: "", code: "", manager: "", deptId: "", status: "planned", startDate: "", endDate: "" });
    toast({ type: "success", title: L("تم إنشاء المشروع", "Project created"), message: form.name });
  };
  const saveEdit = () => {
    if (!editOpen || !editOpen.name.trim()) return;
    if (apiMode) {
      void domainApi
        .updateProject(editOpen.id, {
          name: editOpen.name,
          code: editOpen.code.toUpperCase(),
          nameEn: editOpen.nameEn,
          status: editOpen.status,
          startDate: editOpen.startDate || undefined,
          endDate: editOpen.endDate || undefined,
          departmentId: editOpen.departments[0] ?? null,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setEditOpen(null);
      return;
    }
    projStore.update(editOpen.id, {
      name: editOpen.name,
      code: editOpen.code.toUpperCase(),
      manager: editOpen.manager,
      status: editOpen.status,
      startDate: editOpen.startDate,
      endDate: editOpen.endDate,
      departments: editOpen.departments,
    });
    toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
    setEditOpen(null);
  };
  const doDelete = (p: Project) => {
    if (apiMode) {
      void domainApi
        .deleteProject(p.id)
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حذف المشروع", "Project deleted"), message: p.name }))
        .catch((error) => toast({ type: "error", title: L("تعذر حذف المشروع", "Could not delete project"), message: serverReason(error) }));
      return;
    }
    if (p.docs > 0) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L(`${p.docs} وثيقة مرتبطة بهذا المشروع`, `${p.docs} documents are linked`),
      });
      return;
    }
    projStore.remove(p.id);
    toast({ type: "success", title: L("تم حذف المشروع", "Project deleted"), message: p.name });
  };

  const statusMeta = (s: string) =>
    s === "active"
      ? {
          cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
          dot: "bg-emerald-500",
          lbl: t("g.active"),
          grad: "from-emerald-400 to-emerald-600",
        }
      : s === "planned"
        ? {
            cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
            dot: "bg-sky-500",
            lbl: L("مخطط", "Planned"),
            grad: "from-sky-400 to-sky-600",
          }
        : { cls: "bg-ink-100 text-ink-500 dark:bg-ink-800", dot: "bg-ink-400", lbl: L("مغلق", "Closed"), grad: "from-ink-300 to-ink-400" };
  const progressOf = (p: Project) => {
    if (!p.startDate || !p.endDate) return 0;
    const start = new Date(p.startDate).getTime();
    const end = new Date(p.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const now = Date.now();
    if (now <= start) return 0;
    if (now >= end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  };
  const daysLeft = (p: Project) => {
    if (!p.endDate) return null;
    const end = new Date(p.endDate).getTime();
    if (!Number.isFinite(end)) return null;
    return Math.ceil((end - Date.now()) / 86400000);
  };
  const deptNameOf = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? (lang === "en" ? d.nameEn : d.name) : id;
  };

  return (
    <div>
      <PageHeader
        title={t("nav.projects")}
        description={L("المشاريع وهياكل مجلداتها وأعضاؤها ووثائقها", "Projects, folder structures, members and documents")}
        breadcrumbs={[{ label: t("nav.org") }, { label: t("nav.projects") }]}
        actions={
          <>
            <ExportMenu
              rows={projects.map((p) => ({
                code: p.code,
                name: p.name,
                manager: p.manager,
                status: p.status,
                startDate: p.startDate,
                endDate: p.endDate,
                departments: p.departments.map(deptNameOf).join(" | "),
                members: membersOf(p),
                docs: p.docs,
              }))}
              filename="edas-projects"
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
            placeholder={L("ابحث في المشاريع…", "Search projects…")}
            aria-label={L("بحث في المشاريع", "Search projects")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="h-8 w-36 text-xs" aria-label={t("g.status")} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">{t("g.all")}</option>
          <option value="active">{t("g.active")}</option>
          <option value="planned">{L("مخطط", "Planned")}</option>
          <option value="closed">{L("مغلق", "Closed")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {projects.length}
        </span>
      </div>

      {/* Create modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إنشاء مشروع", "Create project")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={submit} disabled={!form.name.trim() || (scope !== null && !form.deptId)}>
              {t("g.create")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("اسم المشروع", "Project name")} required className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={L("مشروع جديد", "New project")}
            />
          </Field>
          <Field label={L("الرمز", "Code")} hint={L("أحرف إنجليزية كبيرة", "Uppercase")}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRJ-001" dir="ltr" />
          </Field>
          {!apiMode && (
            <Field label={L("المدير", "Manager")}>
              <Input
                value={form.manager}
                onChange={(e) => setForm({ ...form, manager: e.target.value })}
                placeholder={L("م. ريم الزهراني", "Eng. Reem Al-Zahrani")}
              />
            </Field>
          )}
          <Field
            label={t("g.department")}
            className="col-span-2"
            hint={scope === null ? undefined : L("إداراتك فقط", "Your departments only")}
          >
            <Select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value })}>
              {scope === null && <option value="">{L("بدون إدارة", "No department")}</option>}
              {managedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? d.nameEn : d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={L("تاريخ البداية", "Start date")}>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label={L("تاريخ النهاية", "End date")}>
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label={t("g.status")} className="col-span-2">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="planned">{L("مخطط", "Planned")}</option>
              <option value="active">{L("نشط", "Active")}</option>
              <option value="closed">{L("مغلق", "Closed")}</option>
            </Select>
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
            <Button
              icon={<Check className="h-4 w-4" />}
              onClick={saveEdit}
              disabled={!editOpen?.name?.trim() || (scope !== null && !editOpen?.departments[0])}
            >
              {t("g.save")}
            </Button>
          </>
        }
      >
        {editOpen && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("اسم المشروع", "Project name")} required className="col-span-2">
              <Input value={editOpen.name} onChange={(e) => setEditOpen({ ...editOpen, name: e.target.value })} />
            </Field>
            <Field label={L("الرمز", "Code")}>
              <Input value={editOpen.code} onChange={(e) => setEditOpen({ ...editOpen, code: e.target.value })} dir="ltr" />
            </Field>
            {!apiMode && (
              <Field label={L("المدير", "Manager")}>
                <Input value={editOpen.manager} onChange={(e) => setEditOpen({ ...editOpen, manager: e.target.value })} />
              </Field>
            )}
            <Field label={t("g.department")} className="col-span-2">
              <Select
                value={editOpen.departments[0] ?? ""}
                onChange={(e) => setEditOpen({ ...editOpen, departments: e.target.value ? [e.target.value] : [] })}
              >
                {scope === null && <option value="">{L("بدون إدارة", "No department")}</option>}
                {managedDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {lang === "en" ? d.nameEn : d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={L("تاريخ البداية", "Start")}>
              <Input type="date" value={editOpen.startDate} onChange={(e) => setEditOpen({ ...editOpen, startDate: e.target.value })} />
            </Field>
            <Field label={L("تاريخ النهاية", "End")}>
              <Input type="date" value={editOpen.endDate} onChange={(e) => setEditOpen({ ...editOpen, endDate: e.target.value })} />
            </Field>
            <Field label={t("g.status")} className="col-span-2">
              <Select value={editOpen.status} onChange={(e) => setEditOpen({ ...editOpen, status: e.target.value as Project["status"] })}>
                <option value="planned">{L("مخطط", "Planned")}</option>
                <option value="active">{L("نشط", "Active")}</option>
                <option value="closed">{L("مغلق", "Closed")}</option>
              </Select>
            </Field>
            <div className="col-span-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
              <MetaGrid
                items={[
                  { label: L("الإدارات", "Departments"), value: editOpen.departments.map(deptNameOf).join("، ") || "—" },
                  { label: L("الأعضاء", "Members"), value: membersOf(editOpen) },
                  { label: L("الوثائق", "Documents"), value: editOpen.docs },
                  { label: L("التقدم", "Progress"), value: `${progressOf(editOpen)}%` },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="h-8 w-8" />}
            title={L("لا توجد مشاريع مطابقة", "No matching projects")}
            description={L("جرّب تعديل البحث أو الفلاتر، أو أنشئ مشروعاً جديداً.", "Adjust search/filters or create a new project.")}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const sm = statusMeta(p.status);
            const prog = progressOf(p);
            const dl = daysLeft(p);
            return (
              <Card
                key={p.id}
                className="group flex cursor-pointer flex-col hover:border-navy-300 hover:shadow-card"
                onClick={() => navigate(`/org/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                        sm.grad,
                      )}
                    >
                      <Boxes className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-extrabold text-ink-800 dark:text-ink-100">
                        {lang === "en" ? p.nameEn : p.name}
                      </p>
                      <p className="font-mono text-[11px] text-ink-400">{p.code}</p>
                    </div>
                  </div>
                  <Badge className={sm.cls} dot={sm.dot}>
                    {sm.lbl}
                  </Badge>
                </div>
                {p.manager && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-500">
                    <Users className="h-3.5 w-3.5 text-ink-300" /> {p.manager}
                  </p>
                )}
                {/* Progress */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
                    <span className="text-ink-400">
                      {p.startDate || "—"} → {p.endDate || "—"}
                    </span>
                    {dl !== null && (
                      <span className={cn(dl < 0 ? "text-rose-500" : dl < 60 ? "text-amber-600" : "text-emerald-600")}>
                        {dl < 0 ? L("منتهي", "Ended") : L(`${dl} يوم متبقٍ`, `${dl} days left`)}
                      </span>
                    )}
                  </div>
                  {dl !== null && (
                    <>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            dl < 0 ? "bg-ink-400" : prog > 75 ? "bg-amber-500" : "bg-gradient-to-l from-navy-500 to-teal-500",
                          )}
                          style={{ width: `${prog}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-ink-400">
                        {L("التقدم", "Progress")}: {prog}%
                      </p>
                    </>
                  )}
                </div>
                {/* Stats */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{p.departments.length}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("إدارات", "Depts")}</p>
                  </div>
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{membersOf(p)}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("أعضاء", "Members")}</p>
                  </div>
                  <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-950/50">
                    <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{p.docs}</p>
                    <p className="text-[9px] font-bold uppercase text-ink-400">{L("وثائق", "Docs")}</p>
                  </div>
                </div>
                {/* Depts chips */}
                {p.departments.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {p.departments.map((d) => (
                      <Badge key={d} className="bg-navy-50 text-[10px] text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                        {deptNameOf(d)}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div className="mt-auto flex gap-1.5 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 text-xs"
                    icon={<Eye className="h-3 w-3" />}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      navigate(`/org/projects/${p.id}`);
                    }}
                  >
                    {t("g.view")}
                  </Button>
                  {canManageRow(p) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        icon={<Pencil className="h-3 w-3" />}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditOpen({ ...p });
                        }}
                        aria-label={t("g.edit")}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-rose-600"
                        icon={<Trash2 className="h-3 w-3" />}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDeleteTarget(p);
                        }}
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
        title={L("حذف المشروع", "Delete project")}
        danger
        message={
          deleteTarget
            ? L(
                `سيتم حذف «${deleteTarget.name}» نهائياً. لا يمكن الحذف إذا كانت وثائق مرتبطة بالمشروع.`,
                `"${deleteTarget.nameEn || deleteTarget.name}" will be permanently deleted. Projects with linked documents cannot be deleted.`,
              )
            : ""
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
