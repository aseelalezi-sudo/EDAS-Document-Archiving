import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Users, FolderTree, Activity, FileText, BarChart3, Pencil } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Avatar, Tabs, StatusBadge, EmptyState } from "../components/ui";
import { PageHeader, StatCard, MetaGrid, DataTable, FileIcon } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { Document } from "../types";
import { canManage, canWriteOrg, orgScope, projectDepartmentId } from "../lib/org-scope";
export function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang, role, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [tab, setTab] = useState("overview");
  const { projects, departments, employees, scopedDocs, folders, docsReady } = useDocsStore();
  const proj = projects.items.find((p) => p.id === id);

  if (!proj && !docsReady) {
    return (
      <div>
        <PageHeader title={L("جارٍ التحميل…", "Loading…")} breadcrumbs={[{ label: t("nav.projects"), to: "/org/projects" }]} />
        <Card>
          <div className="space-y-3 py-6" aria-busy="true">
            <div className="h-5 w-1/3 animate-pulse rounded bg-ink-100 dark:bg-ink-800" />
            <div className="h-24 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
            <div className="h-40 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800" />
          </div>
        </Card>
      </div>
    );
  }

  if (!proj) {
    return (
      <div>
        <PageHeader
          title={L("المشروع غير موجود", "Project not found")}
          breadcrumbs={[{ label: t("nav.projects"), to: "/org/projects" }, { label: L("غير موجود", "Not found") }]}
        />
        <Card>
          <EmptyState
            title={L("لم يتم العثور على المشروع", "Project not found")}
            description={L(
              "قد يكون السجل محذوفاً أو لا تملك صلاحية الوصول إليه.",
              "The record may have been deleted or you may not have access to it.",
            )}
            action={
              <Button size="sm" onClick={() => navigate("/org/projects")}>
                {L("العودة إلى المشاريع", "Back to projects")}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const deptNames = ((proj.departments ?? []) as string[])
    .map((deptId) => {
      const dept = departments.items.find((d) => d.id === deptId);
      return dept ? (lang === "en" ? (dept.nameEn ?? dept.name) : dept.name) : deptId;
    })
    .filter(Boolean);
  const projectDocs = scopedDocs.filter((d) => d.projectId === proj.id);
  const members = employees.items.filter((e) => proj.departments.includes(e.deptId) || (!!proj.manager && e.name === proj.manager));
  const projectFolders = folders.filter((f) => f.type === "project" && f.projectId === proj.id);
  const canEdit = canWriteOrg(role) && canManage(orgScope(role, user?.department, departments.items), projectDepartmentId(proj));

  return (
    <div>
      <PageHeader
        title={lang === "en" ? proj.nameEn : proj.name}
        description={`${proj.code}${proj.manager ? ` · ${proj.manager}` : ""}`}
        breadcrumbs={[{ label: t("nav.projects"), to: "/org/projects" }, { label: lang === "en" ? proj.nameEn : proj.name }]}
        actions={
          canEdit ? (
            <Button
              size="sm"
              variant="outline"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate("/org/projects", { state: { editProjectId: proj.id } })}
            >
              {t("g.edit")}
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={L("الأعضاء", "Members")} value={members.length} icon={<Users className="h-5 w-5" />} accent="navy" />
        <StatCard label={L("الوثائق", "Documents")} value={projectDocs.length} icon={<FolderTree className="h-5 w-5" />} accent="teal" />
        <StatCard label={L("الإدارات", "Departments")} value={deptNames.length} icon={<Building2 className="h-5 w-5" />} accent="purple" />
        <StatCard
          label={t("g.status")}
          value={proj.status === "active" ? t("g.active") : proj.status === "planned" ? L("مخطط", "Planned") : L("مغلق", "Closed")}
          icon={<Activity className="h-5 w-5" />}
          accent="amber"
        />
      </div>
      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: t("doc.overview") },
              { id: "members", label: L("الأعضاء", "Members") },
              { id: "docs", label: L("الوثائق", "Documents") },
              { id: "folders", label: L("هيكل المجلدات", "Folder structure") },
              { id: "reports", label: L("التقارير", "Reports") },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "overview" && (
            <MetaGrid
              items={[
                { label: L("الرمز", "Code"), value: proj.code || "—" },
                { label: L("المدير", "Manager"), value: proj.manager || "—" },
                { label: L("البداية", "Start"), value: proj.startDate || "—" },
                { label: L("النهاية", "End"), value: proj.endDate || "—" },
                { label: L("الإدارات", "Departments"), value: deptNames.join(lang === "en" ? ", " : "، ") || "—" },
                {
                  label: t("g.status"),
                  value: proj.status === "active" ? t("g.active") : proj.status === "planned" ? L("مخطط", "Planned") : L("مغلق", "Closed"),
                },
              ]}
            />
          )}
          {tab === "members" &&
            (members.length === 0 ? (
              <EmptyState
                title={L("لا أعضاء مرتبطون", "No linked members")}
                description={L("لم يُربط أي موظف بإدارات هذا المشروع بعد.", "No employees are linked to this project's departments yet.")}
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => navigate(`/org/employees/${member.id}`)}
                    className="flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-start hover:border-navy-300 dark:border-ink-800"
                  >
                    <Avatar initials={member.initials} color={member.color} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-700 dark:text-ink-200">
                        {lang === "en" ? member.nameEn : member.name}
                      </p>
                      <p className="truncate text-xs text-ink-400">{lang === "en" ? member.jobTitleEn : member.jobTitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          {tab === "docs" &&
            (projectDocs.length === 0 ? (
              <EmptyState
                title={L("لا وثائق مرتبطة", "No linked documents")}
                description={L("لم تُربط أي وثيقة بهذا المشروع بعد.", "No documents are linked to this project yet.")}
                action={
                  <Button size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => navigate("/documents/new")}>
                    {L("وثيقة جديدة", "New document")}
                  </Button>
                }
              />
            ) : (
              <DataTable<Document>
                rows={projectDocs}
                columns={[
                  {
                    key: "title",
                    header: t("doc.title"),
                    render: (doc) => (
                      <div className="flex items-center gap-2.5">
                        <FileIcon type={doc.fileType} size="sm" />
                        <span className="font-medium text-navy-700 dark:text-navy-200">{lang === "en" ? doc.titleEn : doc.title}</span>
                      </div>
                    ),
                  },
                  { key: "status", header: t("g.status"), render: (doc) => <StatusBadge status={doc.status} /> },
                  { key: "owner", header: t("g.owner"), render: (doc) => doc.owner },
                ]}
                onRowClick={(doc) => navigate(`/documents/${doc.id}`)}
              />
            ))}
          {tab === "folders" &&
            (projectFolders.length === 0 ? (
              <EmptyState
                variant="folder"
                title={L("لا مجلدات مشاريع", "No project folders")}
                description={L("أنشئ مجلداً من نوع «مشروع» من شاشة المكتبة.", 'Create a folder of type "project" from the library screen.')}
                action={
                  <Button size="sm" onClick={() => navigate("/library")}>
                    {L("فتح المكتبة", "Open library")}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {projectFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => navigate(`/library/folders/${folder.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg border border-ink-200 p-3 text-start text-sm hover:border-navy-300 dark:border-ink-800"
                  >
                    <FolderTree className="h-4 w-4 text-navy-400" />
                    <span className="font-semibold text-navy-700 dark:text-navy-200">{lang === "en" ? folder.nameEn : folder.name}</span>
                    <span className="ms-auto text-xs text-ink-400">{folder.docs}</span>
                  </button>
                ))}
              </div>
            ))}
          {tab === "reports" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-navy-50 p-3 text-sm text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
              <BarChart3 className="h-4 w-4" />
              <span className="flex-1">
                {L(
                  "تقارير الوثائق المرتبطة بهذا المشروع متاحة من مركز التقارير.",
                  "Reports for this project's documents are available from the reports centre.",
                )}
              </span>
              <Button size="sm" variant="outline" onClick={() => navigate("/reports")}>
                {L("فتح التقارير", "Open reports")}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
