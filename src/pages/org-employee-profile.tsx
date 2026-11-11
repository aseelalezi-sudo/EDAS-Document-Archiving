import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck, Mail, Building2, GitBranch, ChevronLeft, Phone, Pencil } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Avatar, Tabs, EmptyState } from "../components/ui";
import { PageHeader, MetaGrid, Timeline } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { canManage, canWriteOrg, employeeDepartmentId, orgScope } from "../lib/org-scope";
export function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang, role, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [tab, setTab] = useState("overview");
  const { employees, users, departments, sections, projects, auditLog } = useDocsStore();
  const emp = employees.items.find((e) => e.id === id);

  if (!emp) {
    return (
      <div>
        <PageHeader
          title={L("الموظف غير موجود", "Employee not found")}
          breadcrumbs={[{ label: t("nav.employees"), to: "/org/employees" }, { label: L("غير موجود", "Not found") }]}
        />
        <Card>
          <EmptyState
            title={L("لم يتم العثور على الموظف", "Employee not found")}
            description={L(
              "قد يكون السجل محذوفاً أو لا تملك صلاحية الوصول إليه.",
              "The record may have been deleted or you may not have access to it.",
            )}
            action={
              <Button size="sm" onClick={() => navigate("/org/employees")}>
                {L("العودة إلى الموظفين", "Back to employees")}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const linkedUser = users.items.find((u) => u.id === emp.userId || (!!emp.email && u.email === emp.email));
  const dept = departments.items.find((d) => d.id === emp.deptId);
  const section = sections.items.find((s) => s.id === emp.sectionId);
  const deptLabel = dept ? (lang === "en" ? (dept.nameEn ?? dept.name) : dept.name) : emp.deptId || "—";
  const sectionLabel = section ? (lang === "en" ? (section.nameEn ?? section.name) : section.name) : emp.sectionId || "—";
  const empProjects = projects.items.filter(
    (p) => (!!p.manager && p.manager === emp.name) || (!!emp.deptId && p.departments.includes(emp.deptId)),
  );
  const activity = auditLog.filter((entry) => entry.user === emp.name || (linkedUser && entry.user === linkedUser.name)).slice(0, 12);
  const canOpenUsers = role === "system_admin";
  const canEdit =
    canWriteOrg(role) && canManage(orgScope(role, user?.department, departments.items), employeeDepartmentId(emp, sections.items));

  return (
    <div>
      <PageHeader
        title={lang === "en" ? emp.nameEn : emp.name}
        description={lang === "en" ? emp.jobTitleEn : emp.jobTitle}
        breadcrumbs={[{ label: t("nav.employees"), to: "/org/employees" }, { label: lang === "en" ? emp.nameEn : emp.name }]}
        actions={
          canEdit ? (
            <Button
              size="sm"
              variant="outline"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate("/org/employees", { state: { editEmployeeId: emp.id } })}
            >
              {t("g.edit")}
            </Button>
          ) : undefined
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar initials={emp.initials} color={emp.color} size="lg" />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? emp.nameEn : emp.name}</h2>
            <p className="text-sm text-ink-400">
              {(lang === "en" ? emp.jobTitleEn : emp.jobTitle) || "—"} · {emp.empNo}
            </p>
          </div>
          <Badge
            className={
              emp.status === "active"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            }
          >
            {emp.status === "active" ? t("g.active") : emp.status === "leave" ? L("إجازة", "On leave") : t("g.inactive")}
          </Badge>
        </div>
      </Card>
      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: t("doc.overview") },
              { id: "org", label: L("الهيكل التنظيمي", "Organization") },
              { id: "contact", label: L("بيانات الاتصال", "Contact") },
              { id: "projects", label: t("nav.projects") },
              { id: "account", label: L("حساب المستخدم", "User account") },
              { id: "activity", label: t("doc.activityLog") },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "overview" && (
            <MetaGrid
              items={[
                { label: L("الرقم الوظيفي", "Employee no."), value: emp.empNo || "—" },
                { label: L("المسمى", "Title"), value: (lang === "en" ? emp.jobTitleEn : emp.jobTitle) || "—" },
                { label: t("g.department"), value: deptLabel },
                { label: t("g.section"), value: sectionLabel },
                { label: L("المدير المباشر", "Direct manager"), value: emp.manager || "—" },
                {
                  label: t("g.status"),
                  value: emp.status === "active" ? t("g.active") : emp.status === "leave" ? L("إجازة", "On leave") : t("g.inactive"),
                },
              ]}
            />
          )}
          {tab === "org" && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Building2 className="h-5 w-5 text-navy-500" />
              <span className="text-ink-600 dark:text-ink-300">{deptLabel}</span>
              <ChevronLeft className="h-4 w-4 flip-x text-ink-300" />
              <GitBranch className="h-4 w-4 text-navy-400" />
              <span className="text-ink-500 dark:text-ink-400">{sectionLabel}</span>
            </div>
          )}
          {tab === "contact" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                <Mail className="h-4 w-4 text-navy-400" /> {emp.email || "—"}
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                <Phone className="h-4 w-4 text-navy-400" /> {emp.phone || "—"}
              </div>
            </div>
          )}
          {tab === "projects" &&
            (empProjects.length === 0 ? (
              <EmptyState
                title={L("لا مشاريع مرتبطة", "No linked projects")}
                description={L(
                  "لم يُسجَّل هذا الموظف كمدير أو عضواً في أي مشروع.",
                  "This employee is not recorded as a manager or member of any project.",
                )}
              />
            ) : (
              <div className="space-y-2">
                {empProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`/org/projects/${project.id}`)}
                    className="flex w-full items-center justify-between rounded-lg border border-ink-200 p-3 text-start text-sm hover:border-navy-300 dark:border-ink-800"
                  >
                    <span className="font-semibold text-navy-700 dark:text-navy-200">{lang === "en" ? project.nameEn : project.name}</span>
                    <span className="text-xs text-ink-400">{project.code}</span>
                  </button>
                ))}
              </div>
            ))}
          {tab === "account" &&
            (linkedUser ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> {L("حساب مرتبط:", "Linked account:")} {linkedUser.username}
                  {canOpenUsers && (
                    <Button size="sm" variant="outline" className="ms-auto" onClick={() => navigate("/admin/users")}>
                      {L("إدارة المستخدمين", "Manage users")}
                    </Button>
                  )}
                </div>
                <MetaGrid
                  items={[
                    { label: L("اسم المستخدم", "Username"), value: linkedUser.username },
                    { label: L("الدور", "Role"), value: linkedUser.role },
                    { label: L("آخر دخول", "Last login"), value: linkedUser.lastLogin || "—" },
                    { label: L("الجلسات النشطة", "Active sessions"), value: String(linkedUser.activeSessions ?? 0) },
                  ]}
                />
              </div>
            ) : (
              <EmptyState
                title={L("لا حساب مستخدم مرتبط", "No linked user account")}
                description={L(
                  "هذا السجل التنظيمي غير مرتبط بحساب دخول بعد.",
                  "This organizational record is not linked to a login account yet.",
                )}
              />
            ))}
          {tab === "activity" &&
            (activity.length === 0 ? (
              <EmptyState
                title={L("لا نشاط مسجّل", "No activity recorded")}
                description={L("ستظهر هنا عمليات هذا الموظف المسجلة في سجل التدقيق.", "This employee's audited actions will appear here.")}
              />
            ) : (
              <Timeline
                items={activity.map((entry) => ({
                  id: entry.id,
                  title: entry.action,
                  subtitle: `${entry.module} · ${entry.entityType}`,
                  time: entry.datetime,
                  done: true,
                }))}
              />
            ))}
        </div>
      </Card>
    </div>
  );
}
