import { Fragment, useState } from "react";
import { Pencil, Trash2, ShieldCheck, Eye, Download as DownloadIcon, ChevronDown } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, cn, Tooltip } from "../components/ui";
import { PageHeader } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { ACLRulesEditor } from "./document-widgets";
export function Permissions() {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { folders, acls, getInheritedRules, hasOwnRules, departments: deptStore } = useDocsStore();
  const deptColumns = deptStore.items;
  const [editFolder, setEditFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>(["root"]);

  const getPerms = (folderId: string, deptId: string): string[] => {
    const folder = folders.find((f) => f.id === folderId);
    const rules = acls[folderId] ?? [];
    const rule = rules.find((r) => r.principalType === "department" && r.principalId === deptId);
    if (rule) return rule.permissions;
    const inherited = getInheritedRules(folderId);
    for (const item of inherited) {
      if (item.rule.principalType === "department" && item.rule.principalId === deptId) return item.rule.permissions;
    }
    if (folder?.owner === deptId) return ["view", "edit", "download"];
    return [];
  };
  const folderName = (id: string) => {
    const f = folders.find((x) => x.id === id);
    return f ? (lang === "en" ? f.nameEn : f.name) : id;
  };
  const getDepth = (id: string): number => {
    let depth = 0;
    let current = folders.find((f) => f.id === id);
    while (current?.parentId) {
      depth++;
      current = folders.find((f) => f.id === current!.parentId);
    }
    return depth;
  };
  const treeRoots = folders.filter((f) => !f.parentId);
  const toggleExpand = (id: string) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const renderFolderRow = (f: (typeof folders)[number]) => {
    const depth = getDepth(f.id);
    const children = folders.filter((x) => x.parentId === f.id);
    const inherited = getInheritedRules(f.id);
    const hasOwn = hasOwnRules(f.id);
    const isExpanded = expanded.includes(f.id);
    return (
      <Fragment key={f.id}>
        <tr className="group/row border-b border-ink-50 transition-colors last:border-0 hover:bg-navy-50/50 dark:border-ink-800/50 dark:hover:bg-navy-500/5">
          <td className="sticky start-0 z-10 bg-white px-4 py-2.5 font-semibold text-ink-700 group-hover/row:bg-navy-50/50 dark:bg-ink-900 dark:group-hover/row:bg-navy-500/5 dark:text-ink-200">
            <div className="flex items-center gap-1.5" style={{ paddingInlineStart: depth * 20 }}>
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(f.id)}
                  aria-expanded={isExpanded}
                  aria-label={
                    isExpanded
                      ? L(`طي ${lang === "en" ? f.nameEn : f.name}`, `Collapse ${lang === "en" ? f.nameEn : f.name}`)
                      : L(`توسيع ${lang === "en" ? f.nameEn : f.name}`, `Expand ${lang === "en" ? f.nameEn : f.name}`)
                  }
                  className="shrink-0 rounded p-0.5 hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 text-ink-400 transition-transform", !isExpanded && "-rotate-90")} />
                </button>
              ) : (
                <span className="w-[18px] shrink-0" />
              )}
              <ShieldCheck className="h-4 w-4 shrink-0 text-navy-400" />
              <span className="truncate">{lang === "en" ? f.nameEn : f.name}</span>
              {inherited.length > 0 && (
                <Tooltip label={L(`${inherited.length} قاعدة موروثة من الأب`, `${inherited.length} inherited rules`)}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-100 text-[9px] font-bold text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    ↓{inherited.length}
                  </span>
                </Tooltip>
              )}
              {hasOwn && (
                <Tooltip label={L("لديه قواعد خاصة", "Has own rules")}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-navy-100 text-[9px] font-bold text-navy-700 dark:bg-navy-900 dark:text-navy-300">
                    ●
                  </span>
                </Tooltip>
              )}
            </div>
          </td>
          {deptColumns.map((d) => {
            const perms = getPerms(f.id, d.id);
            const isOwner = f.owner === d.id;
            return (
              <td key={d.id} className="px-2 py-2.5 text-center">
                {perms.length === 0 ? (
                  <span className="text-ink-300">—</span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-1 py-0.5",
                      isOwner && "bg-emerald-50 dark:bg-emerald-500/10",
                    )}
                  >
                    {perms.includes("view") && <Eye className="h-3.5 w-3.5 text-emerald-500" />}
                    {perms.includes("edit") && <Pencil className="h-3.5 w-3.5 text-navy-500" />}
                    {perms.includes("delete") && <Trash2 className="h-3.5 w-3.5 text-rose-500" />}
                    {perms.includes("download") && <DownloadIcon className="h-3.5 w-3.5 text-teal-500" />}
                  </span>
                )}
              </td>
            );
          })}
          <td className="px-4 py-2.5 text-center">
            <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditFolder(f.id)}>
              {L("إدارة", "Manage")}
            </Button>
          </td>
        </tr>
        {isExpanded && children.map((c) => renderFolderRow(c))}
      </Fragment>
    );
  };

  return (
    <div>
      <PageHeader
        title={t("nav.permissions")}
        description={L(
          "صلاحيات هرمية حسب المجلد الرئيسي والفرعي مع توريث تلقائي",
          "Hierarchical folder permissions with automatic inheritance",
        )}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.permissions") }]}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-xs text-navy-700 dark:border-navy-800 dark:bg-navy-900/30 dark:text-navy-200">
        <span className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" /> {L("عرض", "View")}
        </span>
        <span className="flex items-center gap-1">
          <Pencil className="h-3.5 w-3.5" /> {L("تعديل", "Edit")}
        </span>
        <span className="flex items-center gap-1">
          <Trash2 className="h-3.5 w-3.5" /> {L("حذف", "Delete")}
        </span>
        <span className="flex items-center gap-1">
          <DownloadIcon className="h-3.5 w-3.5" /> {L("تنزيل", "Download")}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-bold text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
          ↓ {L("موروثة", "Inherited")}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 font-bold text-navy-700 dark:bg-navy-900 dark:text-navy-300">
          ● {L("خاصة", "Own")}
        </span>
        <span className="ms-auto">
          {L(
            "القواعد تتورث من الأب للأبناء تلقائياً — يمكن التجاوز بقواعد خاصة",
            "Rules inherit from parent to children automatically — can be overridden",
          )}
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-ink-200/70 bg-white shadow-soft dark:border-ink-800 dark:bg-ink-900/80">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/70 text-[11px] font-bold uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-950/50">
              <th className="sticky start-0 z-10 bg-ink-50 px-4 py-3 text-start dark:bg-ink-950">
                {L("المجلد (شجرة هرمية)", "Folder (tree)")}
              </th>
              {deptColumns.map((d) => (
                <th key={d.id} className="px-2 py-3 text-center">
                  {d.code}
                </th>
              ))}
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody>{treeRoots.map((f) => renderFolderRow(f))}</tbody>
        </table>
      </div>
      <Modal
        open={!!editFolder}
        onClose={() => setEditFolder(null)}
        title={`${L("صلاحيات مجلد", "Folder permissions")}: ${editFolder ? folderName(editFolder) : ""}`}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setEditFolder(null)}>
            {t("g.close")}
          </Button>
        }
      >
        {editFolder && <ACLRulesEditor folderId={editFolder} />}
      </Modal>
    </div>
  );
}
