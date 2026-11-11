import { useEffect, useState, type ChangeEvent } from "react";
import { Plus, Check, X, AlertTriangle, Info } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Tabs, Field, Input, Select, cn } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { domainApi } from "../lib/domain-api";

const FEATURES: { key: string; ar: string; en: string; available: boolean; noteAr?: string; noteEn?: string }[] = [
  { key: "preview", ar: "المعاينة داخل المتصفح", en: "In-browser preview", available: true },
  { key: "dragdrop", ar: "السحب والإفلات", en: "Drag & drop", available: true },
  { key: "auditTrail", ar: "سجل التدقيق المتقدم", en: "Advanced audit trail", available: true },
  { key: "bulkOps", ar: "العمليات الجماعية", en: "Bulk operations", available: true },
  {
    key: "autoNumbering",
    ar: "الترقيم التلقائي",
    en: "Auto numbering",
    available: true,
    noteAr: "يُصدر الخادم رقم الوثيقة تلقائياً ولا يتأثر بقالب الترقيم في هذه الشاشة",
    noteEn: "The server issues the document number automatically; the template on this screen is not used",
  },
  {
    key: "signature",
    ar: "التوقيع الإلكتروني",
    en: "Electronic signature",
    available: true,
    noteAr: "متاح عبر واجهة الـAPI فقط حالياً، بلا شاشة في الواجهة",
    noteEn: "Available through the API only; no interface screen yet",
  },
  { key: "fingerprint", ar: "التحقق من البصمة", en: "Fingerprint verification", available: false },
  { key: "virus", ar: "فحص الفيروسات", en: "Virus scanning", available: false },
  { key: "ocr", ar: "التعرف الضوئي (OCR)", en: "OCR", available: false },
  { key: "watermark", ar: "العلامات المائية الديناميكية", en: "Dynamic watermark", available: false },
];

function splitTypes(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function System() {
  const { t, lang, toast, apiMode } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [tab, setTab] = useState("identity");
  const { systemSettings: S, applySystemSettings, summary } = useDocsStore();
  const [draft, setDraft] = useState<Record<string, string>>(S);
  const [types, setTypes] = useState<string[]>(() => splitTypes(S.allowedTypes));
  const [newType, setNewType] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setDraft(S);
    setTypes(splitTypes(S.allowedTypes));
  }, [S, dirty]);

  const set = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setDraft((current) => ({ ...current, [k]: value }));
    setDirty(true);
  };
  const addType = () => {
    const v = newType.trim().toUpperCase();
    if (v && !types.includes(v)) {
      setTypes((p) => [...p, v]);
      setNewType("");
      setDirty(true);
    }
  };
  const removeType = (x: string) => {
    setTypes((p) => p.filter((y) => y !== x));
    setDirty(true);
  };
  const discard = () => {
    setDraft(S);
    setTypes(splitTypes(S.allowedTypes));
    setNewType("");
    setDirty(false);
  };
  const save = async () => {
    const values: Record<string, string> = { ...draft, allowedTypes: types.join(", ") };
    setSaving(true);
    try {
      if (apiMode) {
        const changed = Object.entries(values).filter(([key, value]) => S[key] !== value);
        await Promise.all(changed.map(([key, value]) => domainApi.putSetting(key, value)));
      }
      applySystemSettings(values);
      setDirty(false);
      toast({
        type: "success",
        title: L("تم حفظ الإعدادات", "Settings saved"),
        message: L(
          "حُفظت القيم في إعدادات النظام كمرجع. لا يقرأها الخادم حالياً لفرض الحدود أو الترقيم أو اللغة.",
          "Values were stored as reference settings. The server does not currently read them to enforce limits, numbering or language.",
        ),
      });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setSaving(false);
    }
  };

  const numberingTemplate = draft.numberingTemplate ?? "";
  const numberingSample = numberingTemplate
    .replace(/\{YEAR\}/g, String(new Date().getFullYear()))
    .replace(/\{SEQ:(\d+)\}/g, (_, width: string) => "1".padStart(Number(width), "0"));

  return (
    <div>
      <PageHeader
        title={t("nav.system")}
        description={L("إعدادات النظام العامة وهوية المؤسسة والخصائص والحدود", "System settings, identity, features and limits")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.system") }]}
        actions={
          <Button size="sm" icon={<Check className="h-4 w-4" />} loading={saving} onClick={save} disabled={!dirty}>
            {t("g.save")}
          </Button>
        }
      />
      {dirty && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" /> {L("لديك تغييرات غير محفوظة", "You have unsaved changes")}
          <Button size="sm" variant="ghost" className="ms-auto h-7" onClick={discard}>
            {L("تجاهل", "Discard")}
          </Button>
          <Button size="sm" className="h-7" loading={saving} onClick={save}>
            {t("g.save")}
          </Button>
        </div>
      )}
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-navy-50 px-4 py-2.5 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {L(
          "تُحفظ القيم في إعدادات النظام (Setting) كمرجع إداري. لا يقرأ الخادم هذه القيم حالياً لفرض حدود الرفع أو الترقيم أو التنسيق؛ الضوابط الفعلية تأتي من إعدادات الخادم والتخزين.",
          "Values are stored as reference settings (Setting). The server does not currently read them to enforce upload limits, numbering or formatting; effective controls come from the server and storage configuration.",
        )}
      </div>
      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "identity", label: L("هوية المؤسسة", "Identity") },
              { id: "numbering", label: L("الترقيم", "Numbering") },
              { id: "files", label: L("أنواع الملفات", "File types") },
              { id: "storage", label: L("التخزين", "Storage") },
              { id: "localization", label: L("اللغة والمنطقة", "Localization") },
              { id: "limits", label: L("الحدود", "Limits") },
              { id: "features", label: L("الخصائص", "Features") },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "identity" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("اسم المؤسسة", "Organization name")}>
                  <Input value={draft.orgName ?? ""} onChange={set("orgName")} />
                </Field>
                <Field label={L("الاسم بالإنجليزية", "English name")}>
                  <Input dir="ltr" value={draft.orgNameEn ?? ""} onChange={set("orgNameEn")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("الرمز المختصر", "Short code")}>
                  <Input dir="ltr" value={draft.orgCode ?? ""} onChange={set("orgCode")} />
                </Field>
                <Field label={L("الموقع الإلكتروني", "Website")}>
                  <Input dir="ltr" value={draft.orgWebsite ?? ""} onChange={set("orgWebsite")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("الجهة التابعة", "Parent entity")}>
                  <Input value={draft.orgParent ?? ""} onChange={set("orgParent")} />
                </Field>
                <Field label={L("سجل تجاري / رقم رسمي", "Registration no.")}>
                  <Input dir="ltr" value={draft.orgRegistration ?? ""} onChange={set("orgRegistration")} />
                </Field>
              </div>
              <div className="rounded-xl border border-navy-200 bg-navy-50 p-4 dark:border-navy-800 dark:bg-navy-900/30">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-navy-600 dark:text-navy-300">
                  {L("معاينة الهوية", "Identity preview")}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy-600 to-navy-800">
                    <span className="text-sm font-bold text-white">{(draft.orgName ?? "G").slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{draft.orgName}</p>
                    <p className="text-xs text-ink-400">{draft.orgNameEn}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "numbering" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("قالب الترقيم", "Numbering template")}>
                  <Input dir="ltr" value={draft.numberingTemplate ?? ""} onChange={set("numberingTemplate")} className="font-mono" />
                </Field>
                <Field label={L("بادئة الإدارات", "Department prefix")}>
                  <Input dir="ltr" value={draft.numberingPrefix ?? ""} onChange={set("numberingPrefix")} className="font-mono" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("إعادة الترقيم", "Reset policy")}>
                  <Select value={draft.numberingReset ?? "yearly"} onChange={set("numberingReset")}>
                    <option value="yearly">{L("سنوي", "Yearly")}</option>
                    <option value="never">{L("لا يُعاد", "Never")}</option>
                  </Select>
                </Field>
              </div>
              <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-800">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">{L("معاينة", "Preview")}</p>
                <div className="space-y-1.5 font-mono text-xs">
                  <p>
                    <span className="text-ink-400">{L("قالب", "Template")}:</span>{" "}
                    <span className="font-bold text-navy-700 dark:text-navy-200">{numberingTemplate || "—"}</span>
                  </p>
                  <p>
                    <span className="text-ink-400">{L("مثال", "Sample")}:</span>{" "}
                    <span className="font-bold text-navy-700 dark:text-navy-200">
                      {(draft.numberingPrefix ?? "") + (numberingSample || "—")}
                    </span>
                  </p>
                  <p className="text-ink-400">
                    {L(
                      "الترقيم الفعلي يُصدره الخادم عند إنشاء الوثيقة ولا يتبع هذا القالب.",
                      "The actual number is issued by the server when a document is created and does not follow this template.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          {tab === "files" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("الحد الأقصى للحجم (MB)", "Max size (MB)")}>
                  <Input type="number" value={draft.maxFileSize ?? ""} onChange={set("maxFileSize")} />
                </Field>
                <Field label={L("أيام بقاء المسودة", "Draft days")}>
                  <Input type="number" value={draft.draftDays ?? ""} onChange={set("draftDays")} />
                </Field>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("الأنواع المعتمدة", "Approved types")}</p>
                  <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{types.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {types.map((x) => (
                    <span
                      key={x}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                    >
                      {x}
                      <button
                        onClick={() => removeType(x)}
                        aria-label={L(`إزالة ${x}`, `Remove ${x}`)}
                        className="text-emerald-500 hover:text-rose-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    className="h-9"
                    dir="ltr"
                    placeholder={L("أضف نوعاً (مثال: DWG)", "Add type (e.g. DWG)")}
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addType()}
                  />
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addType} disabled={!newType.trim()}>
                    {L("إضافة", "Add")}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-ink-400">
                  {L(
                    "قائمة مرجعية للأنواع المسموح بها؛ تُقيَّد عملية الرفع أيضاً بقائمة أنواع MIME على الخادم.",
                    "Reference list of allowed types; uploads are additionally restricted by the server MIME allowlist.",
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("أيام بقاء سلة المحذوفات", "Trash days")}>
                  <Input type="number" value={draft.trashDays ?? "30"} onChange={set("trashDays")} />
                </Field>
                <Field label={L("أقصى عدد ملفات للمرة الواحدة", "Max files per upload")}>
                  <Input type="number" value={draft.maxFilesPerUpload ?? "20"} onChange={set("maxFilesPerUpload")} />
                </Field>
              </div>
            </div>
          )}
          {tab === "storage" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("المسار الأساسي", "Primary path")}>
                  <Input dir="ltr" value={draft.primaryPath ?? ""} onChange={set("primaryPath")} className="font-mono text-xs" />
                </Field>
                <Field label={L("التخزين البارد", "Cold storage")}>
                  <Input dir="ltr" value={draft.coldPath ?? ""} onChange={set("coldPath")} className="font-mono text-xs" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("مدة النقل للبارد (يوم)", "Cold move (days)")}>
                  <Input type="number" value={draft.coldMoveDays ?? "365"} onChange={set("coldMoveDays")} />
                </Field>
                <Field label={L("سياسة النسخ", "Backup policy")}>
                  <Select value={draft.backupPolicy ?? "daily"} onChange={set("backupPolicy")}>
                    <option value="daily">{L("يومي", "Daily")}</option>
                    <option value="weekly">{L("أسبوعي", "Weekly")}</option>
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2 rounded-xl border border-ink-200 p-4 text-xs text-ink-500 dark:border-ink-800">
                <Info className="h-4 w-4 shrink-0 text-navy-500" />
                {L(
                  "سعة التخزين الفعلية واستخدامها يُراقبان من صفحة الصيانة ومن أدوات التخزين (MinIO) وليس من هذه الشاشة.",
                  "Actual storage capacity and usage are monitored on the maintenance page and in the storage tooling (MinIO), not on this screen.",
                )}
              </div>
            </div>
          )}
          {tab === "localization" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("اللغة الافتراضية", "Default language")}>
                  <Select value={draft.defaultLang ?? "ar"} onChange={set("defaultLang")}>
                    <option value="ar">{L("العربية", "Arabic")}</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <Field label={L("المنطقة الزمنية", "Timezone")}>
                  <Select value={draft.timezone ?? "Asia/Riyadh"} onChange={set("timezone")}>
                    <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("نوع التقويم", "Calendar")}>
                  <Select value={draft.calendar ?? "hijri"} onChange={set("calendar")}>
                    <option value="hijri">{L("هجري", "Hijri")}</option>
                    <option value="gregorian">{L("ميلادي", "Gregorian")}</option>
                  </Select>
                </Field>
                <Field label={L("صيغة التاريخ", "Date format")}>
                  <Select value={draft.dateFormat ?? "YYYY-MM-DD"} onChange={set("dateFormat")}>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("العملة", "Currency")}>
                  <Select value={draft.currency ?? "SAR"} onChange={set("currency")}>
                    <option value="SAR">{L("ريال سعودي (SAR)", "SAR")}</option>
                    <option value="USD">{L("دولار (USD)", "USD")}</option>
                  </Select>
                </Field>
                <Field label={L("وحدة الحجم", "Size unit")}>
                  <Select value={draft.sizeUnit ?? "auto"} onChange={set("sizeUnit")}>
                    <option value="auto">{L("تلقائي", "Auto")}</option>
                    <option value="MB">MB</option>
                  </Select>
                </Field>
              </div>
              <div className="rounded-xl border border-navy-200 bg-navy-50 p-4 dark:border-navy-800 dark:bg-navy-900/30">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-navy-600 dark:text-navy-300">
                  {L("معاينة", "Preview")}
                </p>
                <p className="font-mono text-sm text-navy-700 dark:text-navy-200">
                  {new Date().toLocaleDateString(draft.defaultLang === "ar" ? "ar-SA" : "en-GB")} ·{" "}
                  {new Date().toLocaleTimeString(draft.defaultLang === "ar" ? "ar-SA" : "en-GB")}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {L(
                    "المعاينة تستخدم لغة المتصفح؛ لا تفرض هذه القيم على الواجهة أو الخادم.",
                    "The preview uses the browser locale; these values are not enforced on the interface or server.",
                  )}
                </p>
              </div>
            </div>
          )}
          {tab === "limits" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("أقصى نتائج بحث", "Max search results")}>
                  <Input type="number" value={draft.maxSearchResults ?? "500"} onChange={set("maxSearchResults")} />
                </Field>
                <Field label={L("مهلة الجلسة (دقيقة)", "Session timeout")}>
                  <Input type="number" value={draft.idleTimeout ?? ""} onChange={set("idleTimeout")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L("أقصى حجم لكل وثيقة (MB)", "Max doc size")}>
                  <Input type="number" value={draft.maxFileSize ?? ""} onChange={set("maxFileSize")} />
                </Field>
                <Field label={L("حد صفوف الجدول", "Table row limit")}>
                  <Input type="number" value={draft.tableRowLimit ?? "50"} onChange={set("tableRowLimit")} />
                </Field>
              </div>
              <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-800">
                <SectionTitle title={L("مؤشرات حقيقية من الخادم", "Live server indicators")} />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {[
                    [L("الوثائق", "Documents"), summary ? String(summary.documents.total) : "—"],
                    [L("المستخدمون", "Users"), summary ? String(summary.users.total) : "—"],
                    [L("مهام مفتوحة", "Open tasks"), summary ? String(summary.tasks.open) : "—"],
                    [L("موافقات معلّقة", "Pending approvals"), summary ? String(summary.approvals.pending) : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-ink-50 p-2.5 dark:bg-ink-950/50">
                      <p className="text-[10px] font-bold uppercase text-ink-400">{label}</p>
                      <p className="text-lg font-extrabold text-ink-800 dark:text-ink-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === "features" && (
            <div className="space-y-2.5">
              {FEATURES.map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-center justify-between rounded-xl border border-ink-200 p-3.5 dark:border-ink-800"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        feature.available
                          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                          : "bg-ink-100 text-ink-400 dark:bg-ink-800",
                      )}
                    >
                      {feature.available ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{L(feature.ar, feature.en)}</p>
                      <p className="text-xs text-ink-400">
                        {feature.available
                          ? lang === "en"
                            ? (feature.noteEn ?? "Available in this release")
                            : (feature.noteAr ?? "متاح في هذه النسخة")
                          : L("غير متوفر", "Not available")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      feature.available
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                    }
                  >
                    {feature.available ? L("مفعّل", "Enabled") : L("معطّل", "Disabled")}
                  </Badge>
                </div>
              ))}
              <p className="px-1 text-xs text-ink-400">
                {L(
                  "تفعيل الخصائص غير المتوفرة يتطلب تغييرات على الخادم والبنية التحتية، ولا يمكن تبديلها من الواجهة.",
                  "Enabling unavailable features requires server and infrastructure changes and cannot be toggled from the interface.",
                )}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
