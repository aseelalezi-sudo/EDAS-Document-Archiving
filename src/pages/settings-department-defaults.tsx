import { useEffect, useState } from "react";
import { Building2, Check, Save } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Field, Select, EmptyState } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";

type ClassificationValue = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";

interface DepartmentDefaultsValue {
  classification: ClassificationValue;
  retentionYears: "5" | "7";
  folderId: string;
}

const FALLBACK: DepartmentDefaultsValue = { classification: "INTERNAL", retentionYears: "5", folderId: "" };

function parseDefaults(value: unknown): DepartmentDefaultsValue {
  if (!value || typeof value !== "object") return FALLBACK;
  const v = value as Record<string, unknown>;
  return {
    classification: typeof v.classification === "string" ? (v.classification as ClassificationValue) : FALLBACK.classification,
    retentionYears: v.retentionYears === "7" ? "7" : "5",
    folderId: typeof v.folderId === "string" ? v.folderId : "",
  };
}

export function DepartmentDefaults() {
  const { t, lang, toast, apiMode, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { employees, departments, folders, systemSettings } = useDocsStore();
  const employee = employees.items.find((e) => e.userId === user?.id || (user?.email && e.email === user.email));
  const deptId = employee?.deptId ?? user?.department ?? "";
  const dept = departments.items.find((d) => d.id === deptId);
  const deptLabel = dept ? (lang === "en" ? (dept.nameEn ?? dept.name) : dept.name) : "";
  const storageKey = `edas.v1.departmentDefaults.${deptId}`;
  const [defaults, setDefaults] = useState<DepartmentDefaultsValue>(FALLBACK);
  const [loading, setLoading] = useState(Boolean(apiMode && deptId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    if (!apiMode) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw && !cancelled) setDefaults(parseDefaults(JSON.parse(raw)));
      } catch {
        /* ignore unreadable local defaults */
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    domainApi
      .departmentDefaults(deptId)
      .then(({ value }) => {
        if (!cancelled) setDefaults(parseDefaults(value));
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
  }, [apiMode, deptId, storageKey, t, toast]);

  const save = async () => {
    if (!deptId) return;
    if (!apiMode) {
      localStorage.setItem(storageKey, JSON.stringify(defaults));
      toast({ type: "success", title: L("تم حفظ القيم الافتراضية", "Defaults saved") });
      return;
    }
    setSaving(true);
    try {
      await domainApi.putDepartmentDefaults(deptId, defaults);
      toast({
        type: "success",
        title: L("تم حفظ القيم الافتراضية", "Defaults saved"),
        message: L(
          "سيُستخدم المجلد والتصنيف في الوثائق الجديدة، وتُحفظ مدة الاحتفاظ كقيمة مرجعية.",
          "The folder and classification will be used for new documents; the retention period is stored as a reference value.",
        ),
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setSaving(false);
    }
  };

  const folderOptions = folders.filter((f) => f.type === "dept" || f.type === "project");

  if (!deptId) {
    return (
      <div>
        <PageHeader
          title={t("nav.deptDefaults")}
          description={L("القيم الافتراضية لإدارتك", "Default values for your department")}
          breadcrumbs={[{ label: t("nav.settings") }, { label: t("nav.deptDefaults") }]}
        />
        <Card>
          <EmptyState
            title={L("لا إدارة مرتبطة بحسابك", "No department linked to your account")}
            description={L(
              "تحتاج إلى ربط حسابك بإدارة قبل ضبط القيم الافتراضية.",
              "Your account must be linked to a department before defaults can be configured.",
            )}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("nav.deptDefaults")}
        description={L("القيم الافتراضية لإدارتك", "Default values for your department")}
        breadcrumbs={[{ label: t("nav.settings") }, { label: t("nav.deptDefaults") }]}
        actions={
          <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={save} disabled={loading || saving}>
            {t("g.save")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={L("القيم الافتراضية", "Default values")} icon={<Building2 className="h-4 w-4 text-navy-500" />} />
          <div className="space-y-3">
            <Field label={t("g.department")}>
              <Select value={deptId} disabled>
                <option value={deptId}>{deptLabel || deptId}</option>
              </Select>
            </Field>
            <Field label={L("قالب المجلد الافتراضي", "Default folder")}>
              <Select value={defaults.folderId} onChange={(e) => setDefaults({ ...defaults, folderId: e.target.value })}>
                <option value="">{L("بدون مجلد افتراضي", "No default folder")}</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {lang === "en" ? folder.nameEn : folder.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("doc.classification")}>
              <Select
                value={defaults.classification}
                onChange={(e) => setDefaults({ ...defaults, classification: e.target.value as ClassificationValue })}
              >
                <option value="PUBLIC">{t("doc.classification.public")}</option>
                <option value="INTERNAL">{t("doc.classification.internal")}</option>
                <option value="CONFIDENTIAL">{t("doc.classification.confidential")}</option>
                <option value="SECRET">{t("doc.classification.restricted")}</option>
              </Select>
            </Field>
            <Field label={L("مدة الاحتفاظ المرجعية", "Reference retention period")}>
              <Select
                value={defaults.retentionYears}
                onChange={(e) => setDefaults({ ...defaults, retentionYears: e.target.value === "7" ? "7" : "5" })}
              >
                <option value="5">{L("5 سنوات", "5 years")}</option>
                <option value="7">{L("7 سنوات", "7 years")}</option>
              </Select>
            </Field>
            <p className="text-xs text-ink-400">
              {L(
                "يُستخدم المجلد والتصنيف مسبقاً عند إنشاء وثيقة جديدة في شاشة «وثيقة جديدة»، ويمكن تعديلهما لكل وثيقة. أما مدة الاحتفاظ فتُحفظ كقيمة مرجعية ولا تُجدول تلقائياً؛ تُضاف سياسة الاحتفاظ من صفحة الوثيقة بعد الحفظ.",
                'The folder and classification are pre-filled on the "New document" screen and can be overridden per document. The retention period is stored as a reference value and is not scheduled automatically; set the retention policy from the document page after saving.',
              )}
            </p>
          </div>
        </Card>
        <Card>
          <SectionTitle title={L("حقول الوثيقة وأنواع الملفات", "Document fields & file types")} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-500">{L("يفرضها الخادم عند الإنشاء:", "Enforced by the server on create:")}</p>
            {[t("doc.title"), L("الملف", "File")].map((field) => (
              <div
                key={field}
                className="flex items-center gap-2 rounded-lg border border-ink-200 p-2.5 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300"
              >
                <Check className="h-3.5 w-3.5 text-emerald-500" /> {field}
              </div>
            ))}
            <p className="mt-3 text-sm font-medium text-ink-500">
              {L("قيم افتراضية مقترحة (غير مفروضة):", "Suggested defaults (not enforced):")}
            </p>
            {[t("g.category"), t("doc.classification"), t("g.owner")].map((field) => (
              <div
                key={field}
                className="flex items-center gap-2 rounded-lg border border-dashed border-ink-200 p-2.5 text-sm text-ink-500 dark:border-ink-800 dark:text-ink-400"
              >
                <Check className="h-3.5 w-3.5 text-ink-300" /> {field}
              </div>
            ))}
            <p className="mt-3 text-sm font-medium text-ink-500">
              {L("أنواع الملفات في إعدادات النظام:", "File types in system settings:")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(systemSettings.allowedTypes ?? "PDF, DOCX, XLSX, PPTX, PNG, JPG, DWG, TXT")
                .split(",")
                .map((type) => type.trim())
                .filter(Boolean)
                .map((type) => (
                  <span key={type} className="rounded-md bg-ink-100 px-2 py-1 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                    {type}
                  </span>
                ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              {L(
                "العنوان والملف فقط يفرضهما الخادم. أنواع الملفات والحد الأقصى للحجم قيم مرجعية في إعدادات النظام لا يفرضها الخادم حالياً؛ تُعرض هنا للإرشاد.",
                "Only the title and the file are enforced by the server. Allowed file types and the size limit are reference values in system settings that the server does not enforce yet; they are shown here as guidance.",
              )}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
