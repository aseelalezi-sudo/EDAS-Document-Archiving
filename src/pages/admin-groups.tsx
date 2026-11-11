import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Boxes, Users as UsersIcon, Search, Eye } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Avatar, Modal, Field, Input, Select, EmptyState, ConfirmDialog, cn } from "../components/ui";
import { PageHeader, ExportMenu } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { GroupDetailModal } from "./admin-group-parts";
import { config } from "../config";
import { usePersistentState } from "../utils/persist";
import { domainApi } from "../lib/domain-api";
import { roleLabel } from "../data";
import type { GroupDto } from "@edas/shared";
import type { Role } from "../store";
import type { DocUser } from "../types";

interface GroupRow {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  type: string;
  scope: string;
  members: string[];
  memberRoles: string[];
  created: string;
}

export function Groups() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const apiMode = config.useApi;
  const { users: usersStore } = useDocsStore();
  const userList = usersStore.items;
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("all");
  const [editor, setEditor] = useState<GroupRow | "new" | null>(null);
  const [detail, setDetail] = useState<GroupRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    desc: "",
    type: "functional",
    scope: "",
    members: [] as string[],
  });
  const [groups, setGroups] = usePersistentState<GroupRow[]>("groups", [
    {
      id: "g1",
      name: L("مسؤولو الأرشفة", "Archiving Officers"),
      nameEn: "Archiving Officers",
      desc: L("إدارة سياسات الاحتفاظ", "Manage retention policies"),
      type: "functional",
      scope: L("عام", "Global"),
      members: ["u-9", "u-7"],
      memberRoles: [L("مسؤول الأرشفة", "Archivist")],
      created: "2025-09-14",
    },
    {
      id: "g2",
      name: L("فريق المحاسبة", "Accounting Team"),
      nameEn: "Accounting Team",
      desc: L("معالجة الفواتير", "Invoice processing"),
      type: "dept",
      scope: lang === "en" ? "Finance" : "المالية",
      members: ["u-3", "u-10"],
      memberRoles: [L("موظف إدارة", "Employee")],
      created: "2025-10-02",
    },
    {
      id: "g3",
      name: L("فريق مشروع ألفا", "Project Alpha Team"),
      nameEn: "Project Alpha Team",
      desc: L("وثائق ومخرجات المشروع", "Project documents"),
      type: "project",
      scope: lang === "en" ? "Project Alpha" : "مشروع ألفا",
      members: ["u-1", "u-8", "u-11"],
      memberRoles: [L("موظف إدارة", "Employee"), L("مدير مشروع", "Project Manager")],
      created: "2025-11-20",
    },
  ]);
  const toRow = (g: GroupDto): GroupRow => {
    const memberRoles = Array.from(
      new Set(
        g.memberIds
          .map((memberId) => userList.find((user) => user.id === memberId)?.role as Role | undefined)
          .filter((role): role is Role => !!role)
          .map((role) => roleLabel(role, lang)),
      ),
    );
    return {
      id: g.id,
      name: lang === "en" ? (g.nameEn ?? g.name) : g.name,
      nameEn: g.nameEn ?? g.name,
      desc: g.desc,
      type: g.type,
      scope: g.scope,
      members: g.memberIds,
      memberRoles,
      created: String(g.createdAt).slice(0, 10),
    };
  };
  const reloadGroups = () => {
    if (!apiMode) return;
    void domainApi
      .groups()
      .then((page) => setGroups(page.items.map(toRow)))
      .catch(() => toast({ type: "error", title: t("err.api") }));
  };
  const reloadRef = useRef(reloadGroups);
  reloadRef.current = reloadGroups;
  useEffect(() => {
    if (apiMode) reloadRef.current();
  }, [apiMode]);
  const typeLbl = (k: string) =>
    k === "functional" ? L("وظيفية", "Functional") : k === "dept" ? L("إدارية", "Departmental") : L("مشروع", "Project");
  const typeCls = (k: string) =>
    k === "functional"
      ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
      : k === "dept"
        ? "bg-navy-100 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300"
        : "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300";
  const typeGrad = (k: string) =>
    k === "functional" ? "from-teal-400 to-teal-600" : k === "dept" ? "from-navy-400 to-navy-600" : "from-purple-400 to-purple-600";
  const filtered = groups.filter((g) => {
    if (q && !(g.name.includes(q) || (g.nameEn ?? "").toLowerCase().includes(q.toLowerCase()) || g.desc.includes(q))) return false;
    if (fType !== "all" && g.type !== fType) return false;
    return true;
  });
  const stats = [
    {
      label: L("المجموعات", "Groups"),
      value: groups.length,
      icon: Boxes,
      color: "from-navy-400 to-navy-600",
    },
    {
      label: L("وظيفية", "Functional"),
      value: groups.filter((g) => g.type === "functional").length,
      icon: Boxes,
      color: "from-teal-400 to-teal-600",
    },
    {
      label: L("مشروع", "Project"),
      value: groups.filter((g) => g.type === "project").length,
      icon: Boxes,
      color: "from-purple-400 to-purple-600",
    },
    {
      label: L("إجمالي الأعضاء", "Members"),
      value: groups.reduce((a, g) => a + g.members.length, 0),
      icon: UsersIcon,
      color: "from-emerald-400 to-emerald-600",
    },
  ];
  const submit = async () => {
    if (!form.name.trim()) return;
    if (apiMode) {
      setBusy(true);
      try {
        await domainApi.createGroup({
          name: form.name,
          nameEn: form.nameEn || undefined,
          desc: form.desc,
          scope: form.scope,
          type: form.type,
          memberIds: form.members,
        });
        reloadGroups();
        toast({ type: "success", title: L("تم إنشاء المجموعة", "Group created"), message: form.name });
        setEditor(null);
        setForm({ name: "", nameEn: "", desc: "", type: "functional", scope: "", members: [] });
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setBusy(false);
      }
      return;
    }
    setGroups((p) => [
      ...p,
      {
        id: `g-${Date.now()}`,
        name: form.name,
        nameEn: form.nameEn || form.name,
        desc: form.desc,
        type: form.type,
        scope: form.scope || L("عام", "Global"),
        members: form.members,
        memberRoles: [],
        created: new Date().toISOString().slice(0, 10),
      },
    ]);
    setEditor(null);
    setForm({
      name: "",
      nameEn: "",
      desc: "",
      type: "functional",
      scope: "",
      members: [],
    });
    toast({
      type: "success",
      title: L("تم إنشاء المجموعة", "Group created"),
      message: form.name,
    });
  };
  const saveEdit = async () => {
    if (!editor || editor === "new" || !editor.name.trim()) return;
    if (apiMode) {
      setBusy(true);
      try {
        await domainApi.updateGroup(editor.id, {
          name: editor.name,
          nameEn: editor.nameEn || undefined,
          desc: editor.desc,
          scope: editor.scope,
          type: editor.type,
          memberIds: editor.members,
        });
        reloadGroups();
        toast({ type: "success", title: L("تم حفظ التعديلات", "Changes saved"), message: editor.name });
        setEditor(null);
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setBusy(false);
      }
      return;
    }
    setGroups((p) =>
      p.map((x) =>
        x.id === editor.id
          ? {
              ...x,
              name: editor.name,
              nameEn: editor.nameEn,
              desc: editor.desc,
              type: editor.type,
              scope: editor.scope,
              members: editor.members,
            }
          : x,
      ),
    );
    toast({
      type: "success",
      title: L("تم حفظ التعديلات", "Changes saved"),
      message: editor.name,
    });
    setEditor(null);
  };
  const doDelete = async (id: string) => {
    const target = groups.find((g) => g.id === id);
    if (apiMode) {
      try {
        await domainApi.deleteGroup(id);
        reloadGroups();
        toast({ type: "success", title: L("تم حذف المجموعة", "Group deleted"), message: target?.name });
      } catch {
        toast({ type: "error", title: t("err.api") });
      }
      return;
    }
    setGroups((p) => p.filter((x) => x.id !== id));
    toast({ type: "success", title: L("تم حذف المجموعة", "Group deleted"), message: target?.name });
  };
  const memberOf = (ids: string[]) => userList.filter((u) => ids.includes(u.id));
  return (
    <div>
      {" "}
      <PageHeader
        title={t("nav.groups")}
        description={L(
          "المجموعات الوظيفية والإدارية ومجموعات المشاريع وأدوارها",
          "Functional, departmental, project groups and their roles",
        )}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.groups") }]}
        actions={
          <ExportMenu
            rows={groups.map((g) => ({
              name: g.name,
              type: typeLbl(g.type),
              scope: g.scope,
              members: g.members.length,
              memberRoles: g.memberRoles.join(" | "),
              created: g.created,
            }))}
            filename="edas-groups"
          />
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
            placeholder={L("ابحث في المجموعات…", "Search groups…")}
            aria-label={L("ابحث في المجموعات", "Search groups")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>{" "}
        <Select
          className="h-8 w-36 text-xs"
          aria-label={L("تصفية حسب النوع", "Filter by type")}
          value={fType}
          onChange={(e) => setFType(e.target.value)}
        >
          <option value="all">{t("g.all")}</option>
          <option value="functional">{L("وظيفية", "Functional")}</option>
          <option value="dept">{L("إدارية", "Departmental")}</option>
          <option value="project">{L("مشروع", "Project")}</option>
        </Select>{" "}
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {groups.length}
        </span>{" "}
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setForm({
              name: "",
              nameEn: "",
              desc: "",
              type: "functional",
              scope: "",
              members: [],
            });
            setEditor("new");
          }}
        >
          {t("g.create")}
        </Button>{" "}
      </div>{" "}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="h-8 w-8" />}
            title={L("لا توجد مجموعات مطابقة", "No matching groups")}
            description={L("جرّب تعديل البحث أو أنشئ مجموعة جديدة.", "Adjust search or create a new group.")}
            action={
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setForm({
                    name: "",
                    nameEn: "",
                    desc: "",
                    type: "functional",
                    scope: "",
                    members: [],
                  });
                  setEditor("new");
                }}
              >
                {t("g.create")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {" "}
          {filtered.map((g) => {
            const mem = memberOf(g.members);
            return (
              <Card
                key={g.id}
                className="group flex cursor-pointer flex-col hover:border-navy-300 hover:shadow-card"
                onClick={() => setDetail(g)}
              >
                {" "}
                <div className="flex items-start justify-between">
                  {" "}
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-110",
                      typeGrad(g.type),
                    )}
                  >
                    <Boxes className="h-5 w-5" />
                  </span>{" "}
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={typeCls(g.type)}>{typeLbl(g.type)}</Badge>
                  </div>{" "}
                </div>{" "}
                <p className="mt-3 text-[15px] font-extrabold text-ink-800 dark:text-ink-100">{g.name}</p>{" "}
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-400">{g.desc}</p>{" "}
                <div className="mt-2.5 flex items-center gap-2 text-xs text-ink-400">
                  <span className="flex items-center gap-1">
                    <UsersIcon className="h-3.5 w-3.5" /> {g.members.length} {L("عضو", "members")}
                  </span>
                  <span>· {g.scope}</span>
                </div>{" "}
                <div className="mt-2.5 flex items-center gap-1">
                  {" "}
                  <div className="flex -space-x-2">
                    {mem.slice(0, 4).map((m) => (
                      <Avatar key={m.id} initials={m.initials} color={m.color} size="xs" ring />
                    ))}
                  </div>{" "}
                  {mem.length > 4 && <span className="text-[10px] text-ink-400">+{mem.length - 4}</span>}{" "}
                </div>{" "}
                <div className="mt-auto flex gap-1.5 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                  {" "}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 text-xs"
                    icon={<Eye className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetail(g);
                    }}
                  >
                    {t("g.view")}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    icon={<Pencil className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditor(g);
                    }}
                    aria-label={t("g.edit")}
                  />{" "}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600"
                    icon={<Trash2 className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(g);
                    }}
                    aria-label={t("g.delete")}
                  />{" "}
                </div>{" "}
              </Card>
            );
          })}{" "}
        </div>
      )}{" "}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor === "new" ? L("إنشاء مجموعة", "Create group") : `${L("محرر المجموعة", "Group editor")} — ${editor?.name ?? ""}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditor(null)}>
              {t("g.cancel")}
            </Button>
            <Button
              icon={<Check className="h-4 w-4" />}
              loading={busy}
              onClick={() => (editor === "new" ? void submit() : void saveEdit())}
              disabled={editor === "new" && !form.name.trim()}
            >
              {editor === "new" ? t("g.create") : t("g.save")}
            </Button>
          </>
        }
      >
        {" "}
        {editor === "new" ? (
          <div className="space-y-4">
            {" "}
            <div className="grid grid-cols-2 gap-3">
              <Field label={L("اسم المجموعة (عربي)", "Name (Arabic)")} required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={L("فريق الجودة", "QA Team")}
                />
              </Field>
              <Field label={L("الاسم (إنجليزي)", "Name (English)")}>
                <Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="QA Team" />
              </Field>
            </div>{" "}
            <Field label={L("الوصف", "Description")}>
              <Input
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder={L("وظيفة المجموعة", "Group purpose")}
              />
            </Field>{" "}
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("نوع المجموعة", "Group type")}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["functional", L("وظيفية", "Functional")],
                  ["dept", L("إدارية", "Departmental")],
                  ["project", L("مشروع", "Project")],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, type: v })}
                    aria-pressed={form.type === v}
                    className={cn(
                      "rounded-xl border-2 py-2.5 text-center transition-all",
                      form.type === v
                        ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                        : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                    )}
                  >
                    <p className="text-xs font-bold text-ink-700 dark:text-ink-200">{l}</p>
                  </button>
                ))}
              </div>
            </div>{" "}
            <Field label={L("النطاق", "Scope")}>
              <Input
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                placeholder={L("عام / اسم الإدارة / المشروع", "Global / dept / project")}
              />
            </Field>{" "}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("الأعضاء", "Members")}</p>
                {form.members.length > 0 && (
                  <Badge className="bg-navy-100 text-navy-700 dark:bg-navy-900 dark:text-navy-200">
                    {form.members.length} {L("محدد", "selected")}
                  </Badge>
                )}
              </div>{" "}
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
                {userList.map((u: DocUser) => (
                  <button
                    key={u.id}
                    type="button"
                    role="checkbox"
                    aria-checked={form.members.includes(u.id)}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        members: f.members.includes(u.id) ? f.members.filter((x) => x !== u.id) : [...f.members, u.id],
                      }))
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                      form.members.includes(u.id)
                        ? "bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                        : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        form.members.includes(u.id) ? "border-navy-600 bg-navy-600 text-white" : "border-ink-300 dark:border-ink-600",
                      )}
                    >
                      {form.members.includes(u.id) && <Check className="h-3 w-3" />}
                    </span>
                    <Avatar initials={u.initials} color={u.color} size="xs" />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="text-[10px] text-ink-400">{u.username}</span>
                  </button>
                ))}
              </div>
            </div>{" "}
          </div>
        ) : editor ? (
          <div className="space-y-4">
            {" "}
            <div className="grid grid-cols-2 gap-3">
              <Field label={L("اسم المجموعة", "Group name")} required className="col-span-2">
                <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </Field>
              <Field label={L("الاسم بالإنجليزية", "Name (English)")} className="col-span-2">
                <Input dir="ltr" value={editor.nameEn} onChange={(e) => setEditor({ ...editor, nameEn: e.target.value })} />
              </Field>
              <Field label={L("النوع", "Type")}>
                <Select value={editor.type} onChange={(e) => setEditor({ ...editor, type: e.target.value })}>
                  <option value="functional">{L("وظيفية", "Functional")}</option>
                  <option value="dept">{L("إدارية", "Departmental")}</option>
                  <option value="project">{L("مشروع", "Project")}</option>
                </Select>
              </Field>
              <Field label={L("النطاق", "Scope")}>
                <Input value={editor.scope} onChange={(e) => setEditor({ ...editor, scope: e.target.value })} />
              </Field>
            </div>{" "}
            <Field label={L("الوصف", "Description")}>
              <Input value={editor.desc} onChange={(e) => setEditor({ ...editor, desc: e.target.value })} />
            </Field>{" "}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink-700 dark:text-ink-200">
                  {L("الأعضاء", "Members")} ({editor.members.length})
                </p>
              </div>{" "}
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
                {userList.map((u: DocUser) => (
                  <button
                    key={u.id}
                    type="button"
                    role="checkbox"
                    aria-checked={editor.members.includes(u.id)}
                    onClick={() =>
                      setEditor((e) =>
                        e && e !== "new"
                          ? {
                              ...e,
                              members: e.members.includes(u.id) ? e.members.filter((x) => x !== u.id) : [...e.members, u.id],
                            }
                          : e,
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                      editor.members.includes(u.id)
                        ? "bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                        : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        editor.members.includes(u.id) ? "border-navy-600 bg-navy-600 text-white" : "border-ink-300 dark:border-ink-600",
                      )}
                    >
                      {editor.members.includes(u.id) && <Check className="h-3 w-3" />}
                    </span>
                    <Avatar initials={u.initials} color={u.color} size="xs" />
                    <span className="flex-1 truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            </div>{" "}
          </div>
        ) : null}{" "}
      </Modal>{" "}
      <GroupDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        onEdit={() => {
          setEditor(detail);
          setDetail(null);
        }}
        typeLbl={typeLbl}
        typeCls={typeCls}
        typeGrad={typeGrad}
        memberOf={memberOf}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void doDelete(deleteTarget.id);
        }}
        title={L("حذف المجموعة", "Delete group")}
        message={L(
          `سيتم حذف مجموعة «${deleteTarget?.name ?? ""}» نهائياً. لا تُحذف الوثائق المرتبطة بأعضائها.`,
          `The group "${deleteTarget?.name ?? ""}" will be permanently deleted. Documents belonging to its members are not affected.`,
        )}
        confirmText={t("g.delete")}
        danger
      />
    </div>
  );
}
