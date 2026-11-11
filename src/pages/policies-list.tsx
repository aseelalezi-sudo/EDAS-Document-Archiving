import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, ShieldCheck, Check, Trash2, Eye, Archive, FileClock, Search, X } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Field, Input, Select, Modal, Textarea, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader, DataTable, RowMenu, ExportMenu } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";
import { mapPolicy } from "../lib/api-mappers";
import { config } from "../config";
import { CATEGORIES } from "../data";
import type { RetentionActionDto } from "@edas/shared";
import type { Policy } from "../types";

export function Policies() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const { policies: polStore } = useDocsStore();
  const apiMode = config.useApi;
  const [apiPolicies, setApiPolicies] = useState<Policy[]>([]);
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => {
    void domainApi
      .retentionPolicies()
      .then((page) => setApiPolicies(page.items.map(mapPolicy)))
      .catch(() => toast({ type: "error", title: t("err.api") }));
  };
  useEffect(() => {
    if (apiMode) reloadRef.current();
  }, [apiMode]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [form, setForm] = useState({
    name: "",
    description: "",
    retention: "5",
    category: "",
    disposal: L("حذف آمن", "Secure delete"),
  });
  const allPolicies: Policy[] = apiMode ? apiPolicies : polStore.items;

  const filtered = allPolicies.filter((p) => {
    const ql = q.toLowerCase();
    if (q && !(p.name.includes(q) || (p.nameEn ?? "").toLowerCase().includes(ql) || (p.target ?? "").includes(q))) return false;
    if (fStatus !== "all" && p.status !== fStatus) return false;
    return true;
  });

  const stats = [
    { label: L("إجمالي السياسات", "Total policies"), value: allPolicies.length, icon: ShieldCheck, color: "from-navy-400 to-navy-600" },
    {
      label: t("g.active"),
      value: allPolicies.filter((p) => p.status === "active").length,
      icon: Check,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: t("g.inactive"),
      value: allPolicies.filter((p) => p.status !== "active").length,
      icon: FileClock,
      color: "from-amber-400 to-amber-600",
    },
    {
      label: L("عناصر احتفاظ مرتبطة", "Linked retention items"),
      value: allPolicies.reduce((total, policy) => total + (policy.affectedDocs ?? 0), 0),
      icon: Archive,
      color: "from-teal-400 to-teal-600",
    },
    {
      label: L("تصنيفات مرجعية", "Referenced categories"),
      value: new Set(allPolicies.map((policy) => policy.category).filter(Boolean)).size,
      icon: ShieldCheck,
      color: "from-purple-400 to-purple-600",
    },
  ];

  const actionFor = (disposal: string): RetentionActionDto =>
    disposal === L("نقل للتخزين البارد", "Cold storage") || disposal === L("أرشفة", "Archive")
      ? "ARCHIVE"
      : disposal === L("مراجعة يدوية", "Manual review") || disposal === L("مراجعة", "Review")
        ? "REVIEW"
        : "DESTROY";

  const categoryLabel = (value: string) => {
    const category = CATEGORIES.find((item) => item.id === value);
    return category ? (lang === "en" ? category.nameEn : category.name) : value;
  };

  const submit = async () => {
    if (!form.name.trim() || saving) return;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category.trim() || undefined,
      retentionMonths: Math.max(1, Math.round((Number(form.retention) || 1) * 12)),
      action: actionFor(form.disposal),
    };
    if (apiMode) {
      setSaving(true);
      try {
        await domainApi.createRetentionPolicy(payload);
        reloadRef.current();
        setAddOpen(false);
        setForm({ name: "", description: "", retention: "5", category: "", disposal: L("حذف آمن", "Secure delete") });
        toast({ type: "success", title: L("تم إنشاء السياسة", "Policy created"), message: payload.name });
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setSaving(false);
      }
      return;
    }
    polStore.add({
      name: payload.name,
      nameEn: payload.name,
      scopeType: payload.category ? L("تصنيف وثيقة", "Category") : L("عام", "Global"),
      scopeTypeEn: payload.category ? "Category" : "Global",
      target: payload.category ? categoryLabel(payload.category) : L("الكل", "All"),
      category: payload.category ?? "",
      retention: `${form.retention} ${L("سنوات", "years")}`,
      retentionMonths: payload.retentionMonths,
      requiresApproval: false,
      disposal: form.disposal,
      disposalEn: "Secure delete",
      priority: "medium",
      status: "draft",
      updated: new Date().toISOString().slice(0, 10),
      affectedDocs: 0,
    });
    setAddOpen(false);
    setForm({ name: "", description: "", retention: "5", category: "", disposal: L("حذف آمن", "Secure delete") });
    toast({ type: "success", title: L("تم إنشاء السياسة", "Policy created"), message: payload.name });
  };

  const deletePolicies = async (ids: string[]) => {
    if (ids.length === 0 || deleting) return;
    setDeleting(true);
    try {
      if (apiMode) {
        await Promise.all(ids.map((id) => domainApi.deleteRetentionPolicy(id)));
        reloadRef.current();
      } else {
        ids.forEach((id) => polStore.remove(id));
      }
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      toast({
        type: "success",
        title: ids.length > 1 ? L(`تم حذف ${ids.length} سياسات`, `Deleted ${ids.length} policies`) : L("تم حذف السياسة", "Policy deleted"),
        message: ids.length === 1 ? allPolicies.find((policy) => policy.id === ids[0])?.name : undefined,
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
      if (apiMode) reloadRef.current();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const statusCls = (s: string) =>
    s === "active"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : s === "draft"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-ink-100 text-ink-500 dark:bg-ink-800";
  const statusLbl = (s: string) => (s === "active" ? t("g.active") : s === "draft" ? t("doc.status.draft") : t("g.inactive"));
  const disposalIcon = (d: string) =>
    d.includes("بارد") || d.includes("Cold") ? (
      <Archive className="h-3.5 w-3.5" />
    ) : d.includes("مراجعة") || d.includes("Manual") ? (
      <Eye className="h-3.5 w-3.5" />
    ) : (
      <Trash2 className="h-3.5 w-3.5" />
    );

  return (
    <div>
      <PageHeader
        title={t("nav.policies")}
        description={L("قواعد الاحتفاظ والإتلاف والأرشفة المعتمدة", "Approved retention, disposal, and archiving rules")}
        breadcrumbs={[{ label: t("nav.policies") }]}
        actions={
          <>
            <ExportMenu
              rows={filtered.map((p) => ({
                name: p.name,
                scope: p.scopeType,
                target: p.target,
                retention: p.retention,
                disposal: p.disposal,
                status: p.status,
                linkedItems: p.affectedDocs,
              }))}
              filename="edas-policies"
            />
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
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
              aria-label={L("مسح البحث", "Clear search")}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Input
            className="h-8 px-9 text-xs"
            placeholder={L("ابحث في السياسات…", "Search policies…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="h-8 w-36 text-xs" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">
            {t("g.all")} — {t("g.status")}
          </option>
          <option value="active">{t("g.active")}</option>
          <option value="draft">{t("doc.status.draft")}</option>
          <option value="inactive">{t("g.inactive")}</option>
        </Select>
        <span className="ms-auto text-xs font-medium text-ink-400">
          {filtered.length} {L("من", "of")} {allPolicies.length}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-200 bg-navy-50 px-3.5 py-2.5 dark:border-navy-800 dark:bg-navy-900/30">
          <p className="text-xs font-semibold text-navy-700 dark:text-navy-200">
            {selected.length} {L("سياسة محددة", "selected")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected([])}>
              {L("إلغاء التحديد", "Clear selection")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={deleting}
              onClick={() => setPendingDelete(selected)}
            >
              {L("حذف المحدد", "Delete selected")}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إنشاء سياسة", "Create policy")}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={submit} disabled={!form.name.trim() || saving}>
              {t("g.create")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("اسم السياسة", "Policy name")} required className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={L("سياسة جديدة", "New policy")}
            />
          </Field>
          <Field label={t("g.description")} className="col-span-2">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={L("مدة الاحتفاظ (سنوات)", "Retention (years)")}>
            <Input type="number" min={1} value={form.retention} onChange={(e) => setForm({ ...form, retention: e.target.value })} />
          </Field>
          <Field label={L("إجراء الإتلاف", "Disposal action")}>
            <Select value={form.disposal} onChange={(e) => setForm({ ...form, disposal: e.target.value })}>
              <option>{L("حذف آمن", "Secure delete")}</option>
              <option>{L("نقل للتخزين البارد", "Cold storage")}</option>
              <option>{L("مراجعة يدوية", "Manual review")}</option>
            </Select>
          </Field>
          <Field
            label={L("التصنيف (اختياري)", "Category (optional)")}
            className="col-span-2"
            hint={L("اتركه فارغاً لتطبيق السياسة على كل الوثائق", "Leave empty to apply the policy to every document")}
          >
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">{L("كل التصنيفات", "All categories")}</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {lang === "en" ? category.nameEn : category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <DataTable
        rows={filtered}
        empty={
          <Card>
            <EmptyState
              variant="search"
              title={L("لا توجد سياسات مطابقة", "No matching policies")}
              description={L(
                "جرّب تعديل البحث أو الفلاتر، أو أنشئ سياسة جديدة.",
                "Try adjusting search or filters, or create a new policy.",
              )}
              action={
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
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
            key: "name",
            header: L("اسم السياسة", "Policy name"),
            sortValue: (r: Policy) => r.name,
            render: (r: Policy) => (
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    r.status === "active"
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                      : r.status === "draft"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15"
                        : "bg-ink-100 text-ink-400 dark:bg-ink-800",
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <button
                    onClick={() => navigate(`/policies/${r.id}`)}
                    className="truncate font-bold text-navy-700 hover:underline dark:text-navy-200"
                  >
                    {lang === "en" ? r.nameEn : r.name}
                  </button>
                  <p className="truncate text-[11px] text-ink-400">
                    {r.scopeTypeEn === "Category" ? categoryLabel(r.target) : r.target} · {L("آخر تحديث", "updated")} {r.updated}
                  </p>
                </div>
              </div>
            ),
          },
          {
            key: "scope",
            header: t("wf.scope"),
            sortValue: (r: Policy) => r.scopeType,
            render: (r: Policy) => (
              <Badge className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                {lang === "en" ? r.scopeTypeEn : r.scopeType}
              </Badge>
            ),
          },
          {
            key: "ret",
            header: L("مدة الاحتفاظ", "Retention"),
            sortValue: (r: Policy) => r.retentionMonths,
            render: (r: Policy) => <span className="font-bold text-ink-700 dark:text-ink-200">{r.retention}</span>,
          },
          {
            key: "disp",
            header: L("الإتلاف", "Disposal"),
            render: (r: Policy) => (
              <span className="flex items-center gap-1.5 text-xs text-ink-500">
                {disposalIcon(r.disposal)} {lang === "en" ? r.disposalEn : r.disposal}
              </span>
            ),
          },
          {
            key: "affected",
            header: L("عناصر مرتبطة", "Linked items"),
            sortValue: (r: Policy) => r.affectedDocs,
            render: (r: Policy) => (
              <Badge
                className={cn(
                  "font-bold",
                  (r.affectedDocs ?? 0) > 500
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    : "bg-ink-100 text-ink-600 dark:bg-ink-800",
                )}
              >
                {r.affectedDocs ?? 0}
              </Badge>
            ),
          },
          {
            key: "status",
            header: t("g.status"),
            sortValue: (r: Policy) => r.status,
            render: (r: Policy) => (
              <Badge className={statusCls(r.status)} dot={r.status === "active" ? "bg-emerald-500" : undefined}>
                {statusLbl(r.status)}
              </Badge>
            ),
          },
        ]}
        rowActions={(r: Policy) => (
          <RowMenu
            items={[
              { label: t("g.edit"), icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/policies/${r.id}`) },
              {
                label: L("الوثائق المتأثرة", "Affected documents"),
                icon: <Archive className="h-4 w-4" />,
                onClick: () => {
                  if (r.departmentId && (r.scopeType === "إدارة" || r.scopeTypeEn === "Department")) {
                    navigate(`/documents?dept=${encodeURIComponent(r.departmentId)}`);
                    return;
                  }
                  navigate(r.category ? `/documents?category=${encodeURIComponent(r.category)}` : "/documents");
                },
              },
              {
                label: t("g.duplicate"),
                icon: <Copy className="h-4 w-4" />,
                onClick: () => {
                  if (apiMode) {
                    void domainApi
                      .retentionPolicies()
                      .then((page) => page.items.find((item) => item.id === r.id))
                      .then((source) =>
                        domainApi.createRetentionPolicy({
                          name: `${r.name} (${L("نسخة", "copy")})`,
                          description: source?.description ?? undefined,
                          legalBasis: source?.legalBasis ?? undefined,
                          category: source?.category ?? undefined,
                          departmentId: source?.departmentId ?? undefined,
                          retentionMonths: Math.max(1, source?.retentionMonths ?? r.retentionMonths ?? 1),
                          action: source?.action ?? actionFor(r.disposal),
                          isActive: false,
                        }),
                      )
                      .then(() => {
                        reloadRef.current();
                        toast({ type: "info", title: L("تم النسخ", "Duplicated"), message: r.name });
                      })
                      .catch(() => toast({ type: "error", title: t("err.api") }));
                    return;
                  }
                  polStore.add({ ...r, id: undefined, name: `${r.name} (${L("نسخة", "copy")})`, status: "draft" });
                  toast({ type: "info", title: L("تم النسخ", "Duplicated"), message: r.name });
                },
              },
              {
                label: r.status === "active" ? L("إيقاف", "Deactivate") : L("تفعيل", "Activate"),
                icon: <ShieldCheck className="h-4 w-4" />,
                onClick: () => {
                  if (apiMode) {
                    void domainApi
                      .updateRetentionPolicy(r.id, { isActive: r.status !== "active" })
                      .then(() => {
                        reloadRef.current();
                        toast({
                          type: "success",
                          title: r.status === "active" ? L("تم الإيقاف", "Deactivated") : L("تم التفعيل", "Activated"),
                          message: r.name,
                        });
                      })
                      .catch(() => toast({ type: "error", title: t("err.api") }));
                    return;
                  }
                  polStore.update(r.id, { status: r.status === "active" ? "inactive" : "active" });
                  toast({
                    type: "success",
                    title: r.status === "active" ? L("تم الإيقاف", "Deactivated") : L("تم التفعيل", "Activated"),
                    message: r.name,
                  });
                },
              },
              {
                label: t("g.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onClick: () => setPendingDelete([r.id]),
              },
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void deletePolicies(pendingDelete ?? [])}
        title={L("حذف السياسة", "Delete policy")}
        danger
        message={
          (pendingDelete?.length ?? 0) > 1
            ? L(
                `سيتم حذف ${pendingDelete?.length} سياسة نهائياً. لن تتأثر الوثائق المرتبطة، لكن لن تُطبق عليها هذه السياسات بعد الآن.`,
                `${pendingDelete?.length} policies will be permanently deleted. Linked documents are not removed, but these policies will no longer apply.`,
              )
            : L(
                "سيتم حذف هذه السياسة نهائياً. لن تتأثر الوثائق المرتبطة، لكن لن تُطبق عليها هذه السياسة بعد الآن.",
                "This policy will be permanently deleted. Linked documents are not removed, but the policy will no longer apply.",
              )
        }
        confirmText={t("g.delete")}
      />
    </div>
  );
}
