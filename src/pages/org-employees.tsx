import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, ShieldCheck, X, Activity, Search, Clock, Eye, Users, Mail, Phone, Layers } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Avatar, Modal, Field, Input, Select, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu, ExportMenu, Segmented, downloadCsv } from "../components/shared";
import { departments as seedDepartments } from "../data";
import { useDocsStore } from "../store-docs";
import type { Department, Employee } from "../types";
import { EmployeeEditModal } from "./org-employee-parts";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { serverReason } from "../lib/api-client";
import { canManage, canWriteOrg, employeeDepartmentId, orgScope } from "../lib/org-scope";

const EMPLOYEE_STATUS = { active: "ACTIVE", leave: "INACTIVE", inactive: "INACTIVE" } as const;

export function Employees() {
  const { t, lang, toast, user, role } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const apiMode = config.useApi;
  const { employees: empStore, departments: deptStore, sections: sectionStore, refreshOrgDirectory } = useDocsStore();
  const departments: Department[] = apiMode || deptStore.items.length > 0 ? deptStore.items : seedDepartments;
  const scope = orgScope(role, user?.department, departments);
  const mayWrite = canWriteOrg(role);
  const managedDepartments = departments.filter((d) => canManage(scope, d.id));
  const canCreate = mayWrite && (scope === null || scope.size > 0);
  const canManageRow = (employee: Employee) => mayWrite && canManage(scope, employeeDepartmentId(employee, sectionStore.items));
  const defaultDeptId = departments[0]?.id ?? "";
  const emptyForm = { name: "", empNo: "", jobTitle: "", deptId: defaultDeptId, sectionId: "", email: "", phone: "" };
  const [view, setView] = useState<"table" | "cards">("table");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number; total: number } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const employees: Employee[] = empStore.items;
  const [editOpen, setEditOpen] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [q, setQ] = useState("");
  const [fDept, setFDept] = useState(() => searchParams.get("dept") ?? "all");
  const [fStatus, setFStatus] = useState("all");
  const editRequestRef = useRef<string | null>(null);

  useEffect(() => {
    const requested = (location.state as { editEmployeeId?: string } | null)?.editEmployeeId;
    if (!requested || editRequestRef.current === requested) return;
    const target = employees.find((employee) => employee.id === requested);
    if (!target) return;
    editRequestRef.current = requested;
    setEditOpen({ ...target });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, employees, navigate]);

  const nextEmpNo = (() => {
    const highest = employees.reduce((max, employee) => {
      const match = employee.empNo.match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 3000);
    let counter = highest;
    return () => {
      counter += 1;
      return `EMP-${counter}`;
    };
  })();

  const filtered = employees.filter((e) => {
    const ql = q.toLowerCase();
    if (
      q &&
      !(
        e.name.includes(q) ||
        (e.nameEn ?? "").toLowerCase().includes(ql) ||
        e.empNo.toLowerCase().includes(ql) ||
        (e.jobTitle ?? "").includes(q) ||
        (e.email ?? "").toLowerCase().includes(ql)
      )
    )
      return false;
    if (fDept !== "all" && e.deptId !== fDept) return false;
    if (fStatus !== "all" && e.status !== fStatus) return false;
    return true;
  });

  const stats = [
    { label: L("الموظفون", "Employees"), value: employees.length, icon: Users, color: "from-navy-400 to-navy-600" },
    {
      label: L("نشطون", "Active"),
      value: employees.filter((e) => e.status === "active").length,
      icon: Activity,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: L("في إجازة", "On leave"),
      value: employees.filter((e) => e.status === "leave").length,
      icon: Clock,
      color: "from-amber-400 to-amber-600",
    },
    {
      label: L("مرتبطون بحساب", "With account"),
      value: employees.filter((e) => e.userId).length,
      icon: ShieldCheck,
      color: "from-purple-400 to-purple-600",
    },
  ];

  const saveEdit = () => {
    if (!editOpen || !editOpen.name.trim()) return;
    if (apiMode) {
      void domainApi
        .updateEmployee(editOpen.id, {
          name: editOpen.name,
          nameEn: editOpen.nameEn,
          jobTitle: editOpen.jobTitle,
          email: editOpen.email || undefined,
          phone: editOpen.phone || undefined,
          status: EMPLOYEE_STATUS[editOpen.status],
          departmentId: editOpen.deptId || null,
          sectionId: editOpen.sectionId || null,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setEditOpen(null);
      return;
    }
    empStore.update(editOpen.id, {
      name: editOpen.name,
      jobTitle: editOpen.jobTitle,
      deptId: editOpen.deptId,
      sectionId: editOpen.sectionId,
      email: editOpen.email,
      phone: editOpen.phone,
      status: editOpen.status,
    });
    toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editOpen.name });
    setEditOpen(null);
  };
  const doDelete = (e: Employee) => {
    if (apiMode && e.userId) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L("مرتبط بحساب مستخدم — ألغِ الربط أولاً", "Linked to a user account — unlink first"),
      });
      return;
    }
    if (apiMode) {
      void domainApi
        .deleteEmployee(e.id)
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم حذف الموظف", "Employee deleted"), message: e.name }))
        .catch((error) => toast({ type: "error", title: L("تعذر حذف الموظف", "Could not delete employee"), message: serverReason(error) }));
      return;
    }
    if (e.userId) {
      toast({
        type: "warning",
        title: L("لا يمكن الحذف", "Cannot delete"),
        message: L("مرتبط بحساب مستخدم — ألغِ الربط أولاً", "Linked to a user account — unlink first"),
      });
      return;
    }
    empStore.remove(e.id);
    toast({ type: "success", title: L("تم حذف الموظف", "Employee deleted"), message: e.name });
  };
  const deptNameOf = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? (lang === "en" ? d.nameEn : d.name) : id;
  };

  const findDepartment = (key: string) => {
    const value = key.trim();
    if (!value) return undefined;
    return departments.find(
      (department) =>
        department.id === value ||
        department.code.toLowerCase() === value.toLowerCase() ||
        department.name === value ||
        department.nameEn === value ||
        department.nameEn.toLowerCase() === value.toLowerCase(),
    );
  };
  const findSection = (key: string, departmentId?: string) => {
    const value = key.trim();
    if (!value) return undefined;
    return sectionStore.items.find(
      (section) =>
        (!departmentId || section.deptId === departmentId) &&
        (section.id === value ||
          section.code.toLowerCase() === value.toLowerCase() ||
          section.name === value ||
          section.nameEn === value ||
          section.nameEn.toLowerCase() === value.toLowerCase()),
    );
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result).replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ type: "error", title: L("الملف فارغ", "File is empty") });
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      let ok = 0,
        fail = 0;
      for (const line of lines.slice(1)) {
        const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const i = headers.indexOf(k);
            if (i >= 0 && cells[i]) return cells[i];
          }
          return "";
        };
        const name = get("name", "الاسم");
        const deptKey = get("dept", "department", "departmentid", "الإدارة");
        const sectionKey = get("section", "sectionid", "القسم");
        const department = findDepartment(deptKey);
        const section = findSection(sectionKey, department?.id);
        if (!name || (deptKey && !department) || (sectionKey && !section)) {
          fail++;
          continue;
        }
        const row = {
          name,
          nameEn: get("nameen", "name_en") || name,
          jobTitle: get("jobtitle", "title", "المسمى") || L("موظف", "Employee"),
          jobTitleEn: get("jobtitleen") || "Employee",
          empNo: get("empno", "id") || nextEmpNo(),
          email: get("email") || `${name.split(" ")[0]}@edas.gov`,
          phone: get("phone") || "+966 5xxxxxxxx",
        };
        if (apiMode) {
          try {
            await domainApi.createEmployee({
              empNo: row.empNo,
              name: row.name,
              nameEn: row.nameEn,
              jobTitle: row.jobTitle,
              jobTitleEn: row.jobTitleEn,
              email: row.email,
              phone: row.phone,
              status: "ACTIVE",
              departmentId: department?.id,
              sectionId: section?.id,
            });
            ok++;
          } catch {
            fail++;
          }
          continue;
        }
        empStore.add({
          ...row,
          deptId: department?.id ?? defaultDeptId,
          sectionId: section?.id ?? "",
          manager: get("manager") || "—",
          status: "active",
          initials: name.slice(0, 2),
          color: "bg-navy-600",
        });
        ok++;
      }
      if (apiMode && ok > 0) {
        await refreshOrgDirectory().catch(() => toast({ type: "error", title: t("err.api") }));
      }
      setImportResult({ ok, fail, total: lines.length - 1 });
      toast({
        type: ok > 0 ? "success" : "error",
        title: L(`تم استيراد ${ok} موظف`, `Imported ${ok} employees`),
        message: fail > 0 ? L(`${fail} صف فشل`, `${fail} rows failed`) : undefined,
      });
    };
    reader.readAsText(file, "utf-8");
  };
  const openAdd = () => {
    setForm({ ...emptyForm, deptId: managedDepartments[0]?.id ?? "" });
    setAddOpen(true);
  };
  const submit = () => {
    if (!form.name.trim()) return;
    const departmentId = managedDepartments.some((d) => d.id === form.deptId) ? form.deptId : managedDepartments[0]?.id;
    const sectionId = sectionStore.items.some((s) => s.id === form.sectionId && s.deptId === departmentId) ? form.sectionId : "";
    if (apiMode) {
      void domainApi
        .createEmployee({
          empNo: form.empNo.trim() || nextEmpNo(),
          name: form.name,
          nameEn: form.name,
          jobTitle: form.jobTitle || L("موظف", "Employee"),
          jobTitleEn: form.jobTitle || "Employee",
          email: form.email || undefined,
          phone: form.phone || undefined,
          status: "ACTIVE",
          departmentId,
          sectionId: sectionId || undefined,
        })
        .then(() => refreshOrgDirectory())
        .then(() => toast({ type: "success", title: L("تم إضافة الموظف", "Employee added"), message: form.name }))
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      setAddOpen(false);
      setForm({ ...emptyForm, deptId: defaultDeptId });
      return;
    }
    empStore.add({
      name: form.name,
      nameEn: form.name,
      jobTitle: form.jobTitle || L("موظف", "Employee"),
      jobTitleEn: form.jobTitle || "Employee",
      empNo: form.empNo.trim() || nextEmpNo(),
      deptId: departmentId,
      sectionId,
      manager: "—",
      email: form.email || `${form.name.split(" ")[0]}@edas.gov`,
      phone: form.phone || "+966 5xxxxxxxx",
      userId: undefined,
      status: "active",
      initials: form.name.slice(0, 2),
      color: "bg-navy-600",
    });
    setAddOpen(false);
    setForm({ ...emptyForm, deptId: defaultDeptId });
    toast({ type: "success", title: L("تم إضافة الموظف", "Employee added"), message: form.name });
  };
  return (
    <div>
      <PageHeader
        title={t("nav.employees")}
        description={`${L("دليل الموظفين —", "Employee directory —")} ${employees.length} ${L("موظف", "employees")}`}
        breadcrumbs={[{ label: t("nav.org") }, { label: t("nav.employees") }]}
        actions={
          <>
            <ExportMenu
              rows={employees.map((e) => ({
                empNo: e.empNo,
                name: e.name,
                jobTitle: e.jobTitle,
                department: departments.find((d) => d.id === e.deptId)?.name ?? e.deptId,
                email: e.email,
                phone: e.phone,
                status: e.status,
              }))}
              filename="edas-employees"
            />
            {canCreate && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Layers className="h-4 w-4" />}
                  onClick={() => {
                    setImportResult(null);
                    setImportOpen(true);
                  }}
                >
                  {t("g.import")}
                </Button>
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                  {t("g.add")}
                </Button>
              </>
            )}
          </>
        }
      />
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={L("استيراد موظفين", "Import employees")}
        footer={
          <Button variant="outline" onClick={() => setImportOpen(false)}>
            {t("g.close")}
          </Button>
        }
      >
        <div className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) importFile(f);
            }}
            className="rounded-xl border-2 border-dashed border-ink-300 p-6 text-center transition-colors hover:border-navy-400 dark:border-ink-600"
          >
            <Layers className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-2 text-sm font-semibold text-ink-600 dark:text-ink-300">{L("اسحب ملف CSV هنا", "Drag a CSV file here")}</p>
            <p className="mt-1 text-xs text-ink-400">
              {L(
                "الأعمدة: name, empNo, jobTitle, dept, section, email, phone",
                "Columns: name, empNo, jobTitle, dept, section, email, phone",
              )}
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-navy-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-700">
              <input
                id="employee-import-file"
                name="employee-import-file"
                type="file"
                aria-label={L("اختيار ملف", "Choose file")}
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = "";
                }}
              />
              {L("اختيار ملف", "Choose file")}
            </label>
          </div>
          {importResult && (
            <div
              className={cn(
                "rounded-xl border p-3 text-sm",
                importResult.ok > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
              )}
            >
              <p className="font-bold">{L("نتيجة الاستيراد", "Import result")}</p>
              <p className="mt-1 text-xs">
                {L(
                  `نجح: ${importResult.ok} · فشل: ${importResult.fail} · الإجمالي: ${importResult.total}`,
                  `Success: ${importResult.ok} · Failed: ${importResult.fail} · Total: ${importResult.total}`,
                )}
              </p>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() =>
              downloadCsv("employees-template.csv", [
                {
                  name: "أحمد البلوي",
                  empNo: "",
                  jobTitle: "مهندس",
                  dept: "IT",
                  section: "IT-INF",
                  email: "ahmad@edas.gov",
                  phone: "+966 550000001",
                },
                {
                  name: "سارة المطيري",
                  empNo: "",
                  jobTitle: "مستشارة",
                  dept: "LEG",
                  section: "",
                  email: "sara@edas.gov",
                  phone: "+966 550000002",
                },
              ])
            }
          >
            {L("تنزيل قالب CSV", "Download CSV template")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إضافة موظف", "Add employee")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={submit} disabled={!form.name.trim()}>
              {t("g.add")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("الاسم الكامل", "Full name")} required className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={L("اسم الموظف", "Employee name")}
            />
          </Field>
          <Field label={L("الرقم الوظيفي", "Employee no.")} hint={L("يُولّد تلقائياً إن تُرك فارغاً", "Auto-generated if empty")}>
            <Input value={form.empNo} onChange={(e) => setForm({ ...form, empNo: e.target.value })} placeholder="EMP-4001" dir="ltr" />
          </Field>
          <Field label={L("المسمى الوظيفي", "Job title")}>
            <Input
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              placeholder={L("مهندس", "Engineer")}
            />
          </Field>
          <Field label={t("g.department")}>
            <Select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value, sectionId: "" })}>
              {managedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? d.nameEn : d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("g.section")}>
            <Select value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
              <option value="">{L("— بدون قسم —", "— No section —")}</option>
              {sectionStore.items
                .filter((section) => section.deptId === form.deptId)
                .map((section) => (
                  <option key={section.id} value={section.id}>
                    {lang === "en" ? section.nameEn : section.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={L("البريد", "Email")}>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@edas.gov" />
          </Field>
          <Field label={L("الهاتف", "Phone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+966 5xxxxxxxx" />
          </Field>
        </div>
      </Modal>
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
            placeholder={L("ابحث بالاسم أو الرقم…", "Search name or no…")}
            aria-label={L("بحث في الموظفين", "Search employees")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="h-8 w-40 text-xs"
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
        <Select className="h-8 w-36 text-xs" aria-label={t("g.status")} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">{t("g.all")}</option>
          <option value="active">{t("g.active")}</option>
          {!apiMode && <option value="leave">{L("إجازة", "On leave")}</option>}
          {apiMode && <option value="inactive">{t("g.inactive")}</option>}
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {employees.length}
        </span>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: L("جدول", "Table") },
            { value: "cards", label: L("بطاقات", "Cards") },
          ]}
        />
      </div>

      <EmployeeEditModal
        editOpen={editOpen}
        onClose={() => setEditOpen(null)}
        onChange={(patch) => setEditOpen((prev) => (prev ? { ...prev, ...patch } : prev))}
        onSave={saveEdit}
      />

      {view === "table" ? (
        <DataTable
          rows={filtered}
          empty={
            <Card>
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title={L("لا يوجد موظفون مطابقون", "No matching employees")}
                description={L("جرّب تعديل البحث أو الفلاتر، أو أضف موظفاً جديداً.", "Adjust search/filters or add a new employee.")}
                action={
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                    {t("g.add")}
                  </Button>
                }
              />
            </Card>
          }
          columns={[
            {
              key: "emp",
              header: L("الموظف", "Employee"),
              sortValue: (r) => r.name,
              render: (r) => (
                <div className="flex items-center gap-2.5">
                  <Avatar initials={r.initials} color={r.color} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-navy-700 dark:text-navy-200">{r.name}</p>
                    <p className="font-mono text-[11px] text-ink-400">{r.empNo}</p>
                  </div>
                </div>
              ),
            },
            {
              key: "title",
              header: L("المسمى", "Title"),
              sortValue: (r) => r.jobTitle,
              render: (r) => <span className="text-xs text-ink-500">{lang === "en" ? r.jobTitleEn : r.jobTitle}</span>,
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
              key: "manager",
              header: L("المدير المباشر", "Manager"),
              sortValue: (r) => r.manager,
              render: (r) => <span className="text-xs text-ink-500">{r.manager || "—"}</span>,
            },
            {
              key: "email",
              header: L("البريد", "Email"),
              sortValue: (r) => r.email,
              render: (r) =>
                r.email ? (
                  <a
                    href={`mailto:${r.email}`}
                    onClick={(event) => event.stopPropagation()}
                    className="font-mono text-[11px] text-navy-600 hover:underline dark:text-navy-300"
                  >
                    {r.email}
                  </a>
                ) : (
                  <span className="text-[11px] text-ink-300">—</span>
                ),
            },
            {
              key: "acc",
              header: L("الحساب", "Account"),
              sortValue: (r) => (r.userId ? 1 : 0),
              render: (r) =>
                r.userId ? (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                    <ShieldCheck className="h-3 w-3" /> {L("مرتبط", "Linked")}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-ink-300">—</span>
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
                      : r.status === "leave"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                  }
                  dot={r.status === "active" ? "bg-emerald-500" : undefined}
                >
                  {r.status === "active" ? t("g.active") : r.status === "leave" ? L("إجازة", "On leave") : t("g.inactive")}
                </Badge>
              ),
            },
          ]}
          onRowClick={(r) => navigate(`/org/employees/${r.id}`)}
          rowActions={(r) => (
            <RowMenu
              items={[
                { label: t("g.view"), icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/org/employees/${r.id}`) },
                ...(canManageRow(r)
                  ? [
                      { label: t("g.edit"), icon: <Pencil className="h-4 w-4" />, onClick: () => setEditOpen({ ...r }) },
                      { label: t("g.delete"), icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTarget(r) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={L("لا يوجد موظفون مطابقون", "No matching employees")}
            description={L("جرّب تعديل البحث أو الفلاتر، أو أضف موظفاً جديداً.", "Adjust search/filters or add a new employee.")}
            action={
              canCreate ? (
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                  {t("g.add")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => (
            <Card
              key={e.id}
              className="group cursor-pointer hover:border-navy-300 hover:shadow-card"
              onClick={() => navigate(`/org/employees/${e.id}`)}
            >
              <div className="flex items-start gap-3">
                <Avatar initials={e.initials} color={e.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink-800 dark:text-ink-100">{e.name}</p>
                  <p className="truncate text-xs text-ink-400">{lang === "en" ? e.jobTitleEn : e.jobTitle}</p>
                  <Badge className="mt-1 bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">{deptNameOf(e.deptId)}</Badge>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-2.5 dark:border-ink-800">
                <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-400">
                  <Mail className="h-3 w-3 shrink-0" />
                  {e.email ? (
                    <a
                      href={`mailto:${e.email}`}
                      onClick={(event) => event.stopPropagation()}
                      className="truncate hover:text-navy-600 hover:underline"
                    >
                      {e.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-400">
                  <Phone className="h-3 w-3 shrink-0" /> {e.phone}
                </p>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <Badge
                  className={
                    e.status === "active"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  }
                  dot={e.status === "active" ? "bg-emerald-500" : undefined}
                >
                  {e.status === "active" ? t("g.active") : L("إجازة", "On leave")}
                </Badge>
                {e.userId ? (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                    <ShieldCheck className="h-3 w-3" />
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 flex-1 text-xs"
                  icon={<Eye className="h-3 w-3" />}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    navigate(`/org/employees/${e.id}`);
                  }}
                >
                  {t("g.view")}
                </Button>
                {canManageRow(e) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      icon={<Pencil className="h-3 w-3" />}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditOpen({ ...e });
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
                        setDeleteTarget(e);
                      }}
                      aria-label={t("g.delete")}
                    />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) doDelete(deleteTarget);
        }}
        title={L("حذف الموظف", "Delete employee")}
        danger
        message={
          deleteTarget
            ? L(
                `سيتم حذف سجل «${deleteTarget.name}» نهائياً. لا يمكن حذف الموظف إذا كان مرتبطاً بحساب مستخدم.`,
                `"${deleteTarget.nameEn || deleteTarget.name}" will be permanently deleted. Employees linked to a user account cannot be deleted.`,
              )
            : ""
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
