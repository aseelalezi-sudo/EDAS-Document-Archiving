import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck, Check, AlertTriangle, Trash2, Eye, Archive, FileClock } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { PageHeader, SectionTitle, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";
import { config } from "../config";
import { CATEGORIES } from "../data";
import type { RetentionActionDto } from "@edas/shared";
import type { Policy } from "../types";

type Scope = "global" | "category" | "department";

export function PolicyEditor() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id && id !== "new");
  const apiMode = config.useApi;
  const { policies: polStore, scopedDocs, departments: deptStore } = useDocsStore();
  const [loading, setLoading] = useState(isEdit && apiMode);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    description: "",
    legalBasis: "",
    scope: "global" as Scope,
    scopeTarget: "",
    retentionNum: 5,
    retentionUnit: "years" as "years" | "months",
    action: "DESTROY" as RetentionActionDto,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const steps = [
    L("المعلومات العامة", "General info"),
    t("wf.scope"),
    L("الاحتفاظ والإتلاف", "Retention & disposal"),
    L("المراجعة والتفعيل", "Review & activate"),
  ];

  const scopeLabel = (scope: Scope) =>
    scope === "category" ? L("تصنيف وثيقة", "Category") : scope === "department" ? L("إدارة", "Department") : L("عام", "Global");
  const actionLabel = (action: RetentionActionDto) =>
    action === "ARCHIVE"
      ? L("نقل إلى تخزين بارد", "Move to cold storage")
      : action === "DESTROY"
        ? L("حذف آمن", "Secure delete")
        : L("مراجعة يدوية", "Manual review");

  useEffect(() => {
    if (!isEdit || !id) return;
    if (!apiMode) {
      const policy = polStore.items.find((item) => item.id === id) as Policy | undefined;
      if (!policy) {
        toast({ type: "error", title: lang === "en" ? "Policy not found" : "السياسة غير موجودة" });
        navigate("/policies");
        return;
      }
      const useYears = /سن|year/i.test(policy.retention) || policy.retentionMonths % 12 === 0;
      const amount = policy.retentionMonths
        ? useYears
          ? policy.retentionMonths / 12
          : policy.retentionMonths
        : Number.parseInt(policy.retention, 10) || 5;
      const scope: Scope =
        policy.scopeType === "إدارة" || policy.scopeType === "Department" ? "department" : policy.category ? "category" : "global";
      setForm((prev) => ({
        ...prev,
        name: policy.name,
        scope,
        scopeTarget: scope === "category" ? policy.category || policy.target : scope === "department" ? (policy.departmentId ?? "") : "",
        retentionNum: amount,
        retentionUnit: useYears ? "years" : "months",
        action:
          policy.disposal.includes("بارد") || policy.disposal.includes("Cold")
            ? "ARCHIVE"
            : policy.disposal.includes("مراجعة") || policy.disposal.includes("Manual")
              ? "REVIEW"
              : "DESTROY",
      }));
      return;
    }
    let cancelled = false;
    setLoading(true);
    void domainApi
      .retentionPolicies()
      .then((page) => {
        if (cancelled) return;
        const policy = page.items.find((item) => item.id === id);
        if (!policy) {
          toast({ type: "error", title: lang === "en" ? "Policy not found" : "السياسة غير موجودة" });
          navigate("/policies");
          return;
        }
        const useYears = policy.retentionMonths % 12 === 0;
        setForm((prev) => ({
          ...prev,
          name: policy.name,
          description: policy.description ?? "",
          legalBasis: policy.legalBasis ?? "",
          scope: policy.departmentId ? "department" : policy.category ? "category" : "global",
          scopeTarget: policy.departmentId ?? policy.category ?? "",
          retentionNum: useYears ? policy.retentionMonths / 12 : policy.retentionMonths,
          retentionUnit: useYears ? "years" : "months",
          action: policy.action,
        }));
      })
      .catch(() => {
        if (!cancelled) toast({ type: "error", title: t("err.api") });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, apiMode, lang, navigate, polStore.items, t, toast]);

  const affectedDocs = scopedDocs.filter((doc) =>
    form.scope === "global" ? true : form.scope === "category" ? doc.categoryId === form.scopeTarget : doc.deptId === form.scopeTarget,
  );
  const affected = form.scope === "global" || form.scopeTarget ? affectedDocs.length : 0;
  const retentionMonths = Math.max(1, Math.round(form.retentionUnit === "years" ? form.retentionNum * 12 : form.retentionNum));
  const retentionLabel = `${form.retentionNum} ${form.retentionUnit === "years" ? L("سنوات", "years") : L("أشهر", "months")}`;
  const categoryLabel = (value: string) => {
    const category = CATEGORIES.find((item) => item.id === value);
    return category ? (lang === "en" ? category.nameEn : category.name) : value;
  };
  const targetLabel =
    form.scope === "department"
      ? (() => {
          const department = deptStore.items.find((item) => item.id === form.scopeTarget);
          return department ? (lang === "en" ? (department.nameEn ?? department.name) : department.name) : form.scopeTarget;
        })()
      : form.scope === "category"
        ? categoryLabel(form.scopeTarget)
        : form.scopeTarget;
  const scopeSummary = `${scopeLabel(form.scope)}${targetLabel ? `: ${targetLabel}` : ""}`;
  const scopeComplete = form.scope === "global" || Boolean(form.scopeTarget);
  const isComplete = form.name.trim().length > 2 && scopeComplete;
  const canAdvance = step === 0 ? form.name.trim().length > 2 : step === 1 ? scopeComplete : true;
  const categories = CATEGORIES.filter((category) => scopedDocs.some((doc) => doc.categoryId === category.id));

  const save = async (activate: boolean) => {
    if (!isComplete || saving) return;
    const base = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      legalBasis: form.legalBasis.trim() || undefined,
      retentionMonths,
      action: form.action,
      isActive: activate,
    };
    const category = form.scope === "category" ? form.scopeTarget || null : null;
    const departmentId = form.scope === "department" ? form.scopeTarget || null : null;
    if (apiMode) {
      setSaving(true);
      try {
        if (isEdit && id) {
          await domainApi.updateRetentionPolicy(id, { ...base, description: form.description.trim() || undefined, category, departmentId });
        } else {
          await domainApi.createRetentionPolicy({
            ...base,
            category: category ?? undefined,
            departmentId: departmentId ?? undefined,
          });
        }
        toast({
          type: activate ? "success" : "info",
          title: activate ? L("تم تفعيل السياسة", "Policy activated") : L("تم حفظ السياسة كغير مفعّلة", "Policy saved as inactive"),
          message: base.name,
        });
        navigate("/policies");
      } catch {
        toast({ type: "error", title: t("err.api") });
      } finally {
        setSaving(false);
      }
      return;
    }
    const fields = {
      name: base.name,
      nameEn: base.name,
      scopeType: scopeLabel(form.scope),
      scopeTypeEn: form.scope === "category" ? "Category" : form.scope === "department" ? "Department" : "Global",
      target: form.scope === "global" ? L("الكل", "All") : targetLabel,
      category: form.scope === "category" ? form.scopeTarget : "",
      retention: retentionLabel,
      retentionMonths,
      requiresApproval: false,
      disposal: actionLabel(form.action),
      disposalEn: form.action === "ARCHIVE" ? "Cold storage" : form.action === "REVIEW" ? "Manual review" : "Secure delete",
      priority: "medium" as const,
      status: activate ? ("active" as const) : ("inactive" as const),
      updated: new Date().toISOString().slice(0, 10),
      affectedDocs: affected,
    };
    if (isEdit && id) polStore.update(id, fields);
    else polStore.add(fields);
    toast({
      type: activate ? "success" : "info",
      title: activate ? L("تم تفعيل السياسة", "Policy activated") : L("تم حفظ السياسة كغير مفعّلة", "Policy saved as inactive"),
      message: base.name,
    });
    navigate("/policies");
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={t("g.edit")} breadcrumbs={[{ label: t("nav.policies"), to: "/policies" }, { label: L("المحرر", "Editor") }]} />
        <Card>
          <p className="py-10 text-center text-sm text-ink-500">{L("جارٍ تحميل السياسة…", "Loading policy…")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          id === "new" || !id ? L("إنشاء سياسة أرشفة", "Create archive policy") : `${t("g.edit")} — ${form.name || L("سياسة", "policy")}`
        }
        description={L("أربع خطوات لضبط نطاق الاحتفاظ وإجراء الإتلاف", "Four steps to set the retention scope and disposal action")}
        breadcrumbs={[{ label: t("nav.policies"), to: "/policies" }, { label: L("المحرر", "Editor") }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/policies")}>
            {t("g.back")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-white p-1 shadow-soft dark:border-ink-800 dark:bg-ink-900">
            {steps.map((label, index) => (
              <button
                key={label}
                onClick={() => setStep(index)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
                  index === step ? "bg-navy-600 text-white" : index < step ? "text-emerald-600" : "text-ink-500",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    index === step ? "bg-white/20" : index < step ? "bg-emerald-100" : "bg-ink-100 dark:bg-ink-800",
                  )}
                >
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <Card className="flex items-center gap-3 py-2.5">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
              isComplete ? "from-emerald-400 to-emerald-600" : "from-amber-400 to-amber-600",
            )}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-ink-900 dark:text-white">{affected}</p>
            <p className="truncate text-[10px] font-semibold text-ink-500">{L("وثيقة داخل النطاق", "documents in scope")}</p>
          </div>
        </Card>
      </div>

      <Card className="min-h-64">
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={L("اسم السياسة", "Policy name")} required className="md:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={L("مثال: الاحتفاظ بالعقود", "e.g. Contract retention")}
                />
              </Field>
              <Field
                label={t("g.description")}
                className="md:col-span-2"
                hint={L("وصف مختصر لغرض السياسة", "A brief description of the policy purpose")}
              >
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
              </Field>
              <Field
                label={L("الأساس النظامي", "Legal basis")}
                className="md:col-span-2"
                hint={L("المرجع التنظيمي أو النظامي للاحتفاظ", "Regulatory or legal reference for the retention")}
              >
                <Textarea value={form.legalBasis} onChange={(e) => set("legalBasis", e.target.value)} rows={2} />
              </Field>
            </div>
            {!form.name.trim() && (
              <p className="text-xs font-semibold text-amber-600">{L("⚠ الاسم مطلوب للمتابعة", "⚠ Name is required to continue")}</p>
            )}
          </div>
        )}
        {step === 1 && (
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["global", "department", "category"] as Scope[]).map((scope) => (
                <button
                  key={scope}
                  onClick={() => setForm((prev) => ({ ...prev, scope, scopeTarget: "" }))}
                  className={cn(
                    "group flex flex-col items-center rounded-2xl border-2 p-4 transition-all hover:-translate-y-0.5",
                    form.scope === scope
                      ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                      : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-transform",
                      form.scope === scope ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-400 group-hover:scale-110 dark:bg-ink-800",
                    )}
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <p className="mt-2 text-xs font-bold text-ink-700 dark:text-ink-200">{scopeLabel(scope)}</p>
                </button>
              ))}
            </div>
            {form.scope === "category" && (
              <div className="mt-4">
                <Field label={L("اختر التصنيف", "Select category")} required>
                  <Select value={form.scopeTarget} onChange={(e) => set("scopeTarget", e.target.value)}>
                    <option value="">{L("اختر…", "Select…")}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {lang === "en" ? category.nameEn : category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {form.scope === "department" && (
              <div className="mt-4">
                <Field label={L("اختر الإدارة", "Select department")} required>
                  <Select value={form.scopeTarget} onChange={(e) => set("scopeTarget", e.target.value)}>
                    <option value="">{L("اختر…", "Select…")}</option>
                    {deptStore.items.map((department) => (
                      <option key={department.id} value={department.id}>
                        {lang === "en" ? (department.nameEn ?? department.name) : department.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-navy-200 bg-navy-50 p-3.5 dark:border-navy-800 dark:bg-navy-900/30">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-700 dark:text-navy-200">
                <Archive className="h-4 w-4" /> {L("معاينة التأثير", "Impact preview")}
              </p>
              <p className="mt-1 text-sm text-navy-600 dark:text-navy-300">
                <strong>{affected}</strong> {L("وثيقة من أصل", "documents out of")} {scopedDocs.length}{" "}
                {L("ستخضع لهذه السياسة", "will be governed by this policy")}
              </p>
            </div>
            {!scopeComplete && (
              <p className="mt-2 text-xs font-semibold text-amber-600">
                {L("⚠ اختر نطاق السياسة للمتابعة", "⚠ Select a scope target to continue")}
              </p>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={L("مدة الاحتفاظ", "Retention period")}>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={form.retentionNum}
                    onChange={(e) => set("retentionNum", Number(e.target.value))}
                    className="w-24"
                  />
                  <Select
                    value={form.retentionUnit}
                    onChange={(e) => set("retentionUnit", e.target.value as "years" | "months")}
                    className="flex-1"
                  >
                    <option value="years">{L("سنوات", "years")}</option>
                    <option value="months">{L("أشهر", "months")}</option>
                  </Select>
                </div>
              </Field>
              <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 dark:border-ink-800 dark:bg-ink-950">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("المدة المحفوظة", "Saved duration")}</p>
                <p className="mt-1 text-lg font-extrabold text-ink-800 dark:text-ink-100">
                  {retentionMonths} {L("شهر", "months")}
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                [
                  L("حذف آمن", "Secure delete"),
                  L("إتلاف نهائي بعد انتهاء الاحتفاظ", "Permanent disposal after retention ends"),
                  Trash2,
                  "rose",
                ],
                [
                  L("نقل إلى تخزين بارد", "Move to cold storage"),
                  L("نقل للطبقة الباردة مع بقاء المرجع", "Move to cold tier, reference preserved"),
                  Archive,
                  "navy",
                ],
                [
                  L("مراجعة يدوية", "Manual review"),
                  L("تحويل الوثيقة للمراجعة قبل أي إجراء", "Route the document for review before any action"),
                  Eye,
                  "amber",
                ],
              ].map(([label, description, Icon, color]) => {
                const action: RetentionActionDto =
                  label === L("نقل إلى تخزين بارد", "Move to cold storage")
                    ? "ARCHIVE"
                    : label === L("مراجعة يدوية", "Manual review")
                      ? "REVIEW"
                      : "DESTROY";
                return (
                  <button
                    key={label as string}
                    onClick={() => set("action", action)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-start transition-all",
                      form.action === action
                        ? "border-navy-600 bg-navy-50 shadow-card dark:bg-navy-900/40"
                        : "border-ink-200 hover:border-navy-300 dark:border-ink-700",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        form.action === action
                          ? "bg-navy-600 text-white"
                          : color === "rose"
                            ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15"
                            : color === "navy"
                              ? "bg-navy-100 text-navy-600 dark:bg-navy-500/15"
                              : "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
                      )}
                    >
                      {(() => {
                        const ActionIcon = Icon as typeof Trash2;
                        return <ActionIcon className="h-5 w-5" />;
                      })()}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{label as string}</p>
                      <p className="mt-0.5 text-xs text-ink-400">{description as string}</p>
                    </div>
                    {form.action === action && <Check className="h-5 w-5 shrink-0 text-navy-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-navy-200 bg-navy-50/50 p-5 dark:border-navy-800 dark:bg-navy-900/20">
              <SectionTitle title={L("ملخص السياسة", "Policy summary")} icon={<ShieldCheck className="h-4 w-4 text-navy-500" />} />
              <div className="mt-3">
                <MetaGrid
                  items={[
                    { label: t("g.name"), value: form.name || "—" },
                    { label: t("wf.scope"), value: form.scope === "global" ? scopeLabel("global") : scopeSummary },
                    { label: L("الاحتفاظ", "Retention"), value: retentionLabel },
                    { label: L("الإتلاف", "Disposal"), value: actionLabel(form.action) },
                    { label: L("الوثائق المتأثرة", "Affected"), value: `${affected}` },
                    { label: t("g.status"), value: isEdit ? L("محفوظة", "Saved") : L("جديدة", "New") },
                  ]}
                />
              </div>
            </div>
            {!isComplete && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />{" "}
                  {!scopeComplete
                    ? L("اختر نطاق السياسة قبل التفعيل", "Select a scope target before activation")
                    : L("الاسم مطلوب قبل التفعيل", "Name is required before activation")}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          {t("g.previous")}
        </Button>
        <div className="flex gap-2">
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
              {t("g.next")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                icon={<FileClock className="h-4 w-4" />}
                disabled={!isComplete || saving}
                onClick={() => void save(false)}
              >
                {L("حفظ كغير مفعّلة", "Save as inactive")}
              </Button>
              <Button icon={<Check className="h-4 w-4" />} disabled={!isComplete || saving} onClick={() => void save(true)}>
                {L("تفعيل السياسة", "Activate policy")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
