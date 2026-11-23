import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Upload, Archive, Check, X, ShieldCheck, RotateCcw, CloudUpload, Send, ArrowLeft } from "lucide-react";
import { cn, Button, Card, Input, Select, Field, Badge, Textarea } from "../components/ui";
import { PageHeader, SectionTitle, FileIcon } from "../components/shared";
import { useApp } from "../store";
import { CATEGORIES } from "../data";
import { useDocsStore } from "../store-docs";
import { fileTypeFromMime, formatBytes } from "../lib/api-mappers";
import { domainApi } from "../lib/domain-api";
import { logError } from "../lib/log-error";
import { config } from "../config";
export function NewDocument() {
  const { t, lang, toast, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const presetFolder = new URLSearchParams(location.search).get("folder") ?? "";
  const {
    createDocument,
    sendForApproval,
    folders: allFolders,
    departments: allDepartments,
    sections: allSections,
    systemSettings,
  } = useDocsStore();
  const [section, setSection] = useState("upload");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaded = file !== null;
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("po");
  const [classification, setClassification] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET">("INTERNAL");
  const [folderId, setFolderId] = useState(presetFolder);
  const [departmentId, setDepartmentId] = useState(user?.department ?? "");
  const [sectionId, setSectionId] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [retainYears, setRetainYears] = useState("5");
  const chooseFile = (chosen: File) => {
    setFile(chosen);
    setTitle((current) => current || chosen.name.replace(/\.[^.]+$/, "") || chosen.name);
  };

  useEffect(() => {
    const deptId = user?.department ?? "";
    if (!deptId) return;
    let cancelled = false;
    const apply = (value: unknown) => {
      if (cancelled || !value || typeof value !== "object") return;
      const v = value as Record<string, unknown>;
      if (
        v.classification === "PUBLIC" ||
        v.classification === "INTERNAL" ||
        v.classification === "CONFIDENTIAL" ||
        v.classification === "SECRET"
      ) {
        setClassification(v.classification);
      }
      if (v.retentionYears === "7" || v.retentionYears === "5") setRetainYears(v.retentionYears);
      if (typeof v.folderId === "string" && v.folderId) {
        const fromDefaults = v.folderId;
        setFolderId((current) => current || fromDefaults);
      }
    };
    if (!config.useApi) {
      try {
        const raw = localStorage.getItem(`edas.v1.departmentDefaults.${deptId}`);
        if (raw) apply(JSON.parse(raw));
      } catch {
        /* ignore unreadable local defaults */
      }
      return;
    }
    domainApi
      .departmentDefaults(deptId)
      .then(({ value }) => apply(value))
      .catch((error) => logError("department defaults", error));
    return () => {
      cancelled = true;
    };
  }, [user?.department]);

  const handleSave = async (submit: boolean) => {
    if (!file) {
      toast({ type: "error", title: t("doc.fileRequired") });
      setSection("upload");
      return;
    }
    if (!title.trim()) {
      toast({ type: "error", title: t("doc.titleRequired") });
      setSection("meta");
      return;
    }
    setSaving(true);
    const id = await createDocument({
      title: title.trim(),
      description: description.trim() || undefined,
      categoryId,
      classification,
      folderId: folderId || undefined,
      departmentId: departmentId || undefined,
      sectionId: sectionId || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      file,
    });
    setSaving(false);
    if (!id) return;
    if (submit) {
      const ok = await sendForApproval(id);
      if (!ok) {
        navigate(`/documents/${id}`);
        return;
      }
      toast({
        type: "success",
        title: t("doc.sendForApproval"),
        message: lang === "en" ? "Sent to approval chain — awaiting reviewers" : "أُرسلت لسلسلة الموافقة — بانتظار المراجعين",
      });
      navigate("/workflow/my-tasks");
      return;
    }
    toast({
      type: "success",
      title: t("doc.saveDraft"),
      message: lang === "en" ? "Draft saved — you can continue later" : "تم حفظ المسودة — يمكنك المتابعة لاحقاً",
    });
    navigate("/documents");
  };

  return (
    <div>
      <PageHeader
        title={t("doc.newDoc")}
        description={
          lang === "en"
            ? "Upload a file, fill in its metadata and send it for archiving or approval"
            : "ارفع وثيقة وأدخل بياناتها الوصفية وأرسلها للأرشفة أو الاعتماد"
        }
        breadcrumbs={[{ label: t("nav.documents"), to: "/documents" }, { label: t("doc.newDoc") }]}
        actions={
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate("/documents")}>
            {t("g.back")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <SectionTitle title={lang === "en" ? "Form sections" : "أقسام النموذج"} />
          <div className="space-y-1">
            {[
              ["upload", "1", lang === "en" ? "Upload file" : "رفع الملف", uploaded],
              ["meta", "2", lang === "en" ? "Basic metadata" : "البيانات الأساسية", title.trim().length > 0],
              ["workflow", "3", t("doc.workflow"), false],
            ].map(([id, n, label, done]) => (
              <button
                key={id as string}
                onClick={() => setSection(id as string)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm",
                  section === id
                    ? "bg-navy-50 font-medium text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                    : "text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                    done
                      ? "bg-emerald-500 text-white"
                      : section === id
                        ? "bg-navy-600 text-white"
                        : "bg-ink-200 text-ink-500 dark:bg-ink-700",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          {section === "upload" && (
            <div className="space-y-4">
              <SectionTitle title={lang === "en" ? "File upload" : "رفع الملف"} icon={<CloudUpload className="h-4 w-4 text-navy-500" />} />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) chooseFile(dropped);
                }}
                className={cn(
                  "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                  dragOver ? "border-navy-400 bg-navy-50 dark:bg-navy-900/30" : "border-ink-200 dark:border-ink-700",
                )}
              >
                <CloudUpload className="mx-auto h-10 w-10 text-ink-300" />
                <p className="mt-2 font-medium text-ink-600 dark:text-ink-300">
                  {lang === "en" ? "Drag and drop files here" : "اسحب وأفلت الملفات هنا"}
                </p>
                <p className="text-xs text-ink-400">
                  {(systemSettings.allowedTypes ?? "PDF, DOCX, XLSX, PPTX, PNG, JPG, DWG, TXT")
                    .split(",")
                    .map((type) => type.trim())
                    .filter(Boolean)
                    .join(", ")}
                  {" · "}
                  {lang === "en"
                    ? `limit ${systemSettings.maxFileSize ?? "50"} MB — the server applies its own MIME allow-list and size cap, which may differ from this list`
                    : `الحد ${systemSettings.maxFileSize ?? "50"} ميغابايت — يطبّق الخادم قائمة أنواع وحدّاً من إعداده، وقد يختلفان عن هذه القائمة`}
                </p>
                <input
                  ref={fileInputRef}
                  id="new-document-file"
                  name="new-document-file"
                  type="file"
                  className="hidden"
                  aria-label={lang === "en" ? "Choose file" : "اختيار ملف"}
                  onChange={(event) => {
                    const chosen = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (chosen) chooseFile(chosen);
                  }}
                />
                <Button size="sm" className="mt-3" icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
                  {lang === "en" ? "Choose file" : "اختيار ملف"}
                </Button>
              </div>
              {uploaded && file && (
                <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                  <div className="flex items-center gap-3">
                    <FileIcon type={fileTypeFromMime(file.type)} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-700 dark:text-ink-200">{file.name}</p>
                      <p className="text-xs text-ink-400">
                        {(file.type.split("/")[1] ?? "FILE").toUpperCase()} · {formatBytes(file.size)}
                      </p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" dot="bg-emerald-500">
                      {lang === "en" ? "Ready" : "جاهز"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">{lang === "en" ? "File type" : "نوع الملف"}</span>
                      <span className="font-mono text-ink-500">{file.type || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">{lang === "en" ? "Last modified" : "آخر تعديل للملف"}</span>
                      <span className="text-ink-500">
                        {file.lastModified ? new Date(file.lastModified).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA") : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      {lang === "en"
                        ? "The SHA-256 checksum is computed in the browser before upload and stored with the file. The server does not scan file contents for malware."
                        : "تُحسب بصمة SHA-256 في المتصفح قبل الرفع وتُخزَّن مع الملف. لا يفحص الخادم محتوى الملفات بحثاً عن البرمجيات الخبيثة."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {section === "meta" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={t("doc.title")} required className="md:col-span-2">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label={t("g.description")} className="md:col-span-2">
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <Field label={t("g.category")} required>
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {lang === "en" ? category.nameEn : category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("g.department")}>
                <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                  <option value="">{lang === "en" ? "My department" : "إدارتي"}</option>
                  {allDepartments.items.map((d) => (
                    <option key={d.id} value={d.id}>
                      {lang === "en" ? d.nameEn : d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("g.section")}>
                <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                  <option value="">{lang === "en" ? "No section" : "بدون قسم"}</option>
                  {allSections.items
                    .filter((s) => !departmentId || s.deptId === departmentId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {lang === "en" ? (s.nameEn ?? s.name) : s.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={t("g.owner")}>
                <Input value={user?.name ?? ""} readOnly disabled />
              </Field>
              <Field label={t("doc.classification")}>
                <Select value={classification} onChange={(event) => setClassification(event.target.value as typeof classification)}>
                  <option value="PUBLIC">{t("doc.classification.public")}</option>
                  <option value="INTERNAL">{t("doc.classification.internal")}</option>
                  <option value="CONFIDENTIAL">{t("doc.classification.confidential")}</option>
                  <option value="SECRET">{t("doc.classification.restricted")}</option>
                </Select>
              </Field>
              <Field
                label={t("doc.tags")}
                hint={lang === "en" ? "Separate tags with commas" : "افصل الوسوم بفواصل"}
                className="md:col-span-2"
              >
                <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="financial, 2026" />
              </Field>
              <Field label={t("doc.targetFolder")} className="md:col-span-2">
                <Select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
                  <option value="">{lang === "en" ? "No folder" : "بدون مجلد"}</option>
                  {allFolders
                    .filter((f) => f.id !== "root")
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {lang === "en" ? f.nameEn : f.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-500 md:col-span-2 dark:bg-ink-800/60 dark:text-ink-400">
                {lang === "en"
                  ? "The server does not support custom per-category fields yet, so there are no PO/vendor/amount fields. Record such details in the description or tags."
                  : "لا يدعم الخادم حقولاً مخصصة حسب التصنيف بعد، لذلك لا توجد حقول لرقم أمر الشراء أو المورّد أو القيمة. سجّل هذه التفاصيل في الوصف أو الوسوم."}
              </p>
            </div>
          )}
          {section === "workflow" && (
            <div className="space-y-4">
              <SectionTitle title={t("doc.workflow")} icon={<Send className="h-4 w-4 text-navy-500" />} />
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                  <Send className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" />
                  <div>
                    <p className="text-sm font-medium text-ink-700 dark:text-ink-200">
                      {lang === "en" ? "Send for approval" : "إرسال للموافقة"}
                    </p>
                    <p className="text-xs text-ink-400">
                      {lang === "en"
                        ? 'The "Send for approval" button below saves the document and submits it; the server assigns the first active approval chain under "Approval chains".'
                        : "زر «إرسال للموافقة» أسفل النموذج يحفظ الوثيقة ثم يرسلها، ويُسندها الخادم إلى أول سلسلة موافقة نشطة في «سلاسل الموافقة»."}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                  <Archive className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <div>
                    <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{lang === "en" ? "Save as draft" : "حفظ كمسودة"}</p>
                    <p className="text-xs text-ink-400">
                      {lang === "en"
                        ? 'The "Save as draft" button creates the document as a draft without submitting it; it can be submitted later from the document page.'
                        : "زر «حفظ كمسودة» ينشئ الوثيقة بحالة مسودة دون إرسالها، ويمكن إرسالها لاحقاً من صفحة الوثيقة."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-navy-50 p-3 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {lang === "en"
                  ? `Reference retention period: ${retainYears} years. It is not scheduled from this form; set the retention policy from the document page after saving.`
                  : `مدة الاحتفاظ المرجعية: ${retainYears} سنوات. لا تُجدول تلقائياً من هذا النموذج؛ تُضاف سياسة الاحتفاظ من صفحة الوثيقة بعد الحفظ.`}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4 dark:border-ink-800">
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} loading={saving} onClick={() => void handleSave(false)}>
              {t("doc.saveDraft")}
            </Button>
            <div className="flex gap-2">
              {section !== "upload" && (
                <Button
                  variant="outline"
                  onClick={() => setSection(["upload", "meta", "workflow"][["meta", "workflow", "upload"].indexOf(section)])}
                >
                  {t("g.previous")}
                </Button>
              )}
              {section !== "workflow" ? (
                <Button onClick={() => setSection(["meta", "workflow"][["upload", "meta"].indexOf(section)] ?? "workflow")}>
                  {t("g.next")}
                </Button>
              ) : (
                <Button icon={<Send className="h-4 w-4" />} loading={saving} onClick={() => void handleSave(true)}>
                  {t("doc.sendForApproval")}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
