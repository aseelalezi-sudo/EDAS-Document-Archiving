import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Lock, ArrowLeft, ShieldAlert } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Input, Select, Field, ConfirmDialog, Textarea, EmptyState } from "../components/ui";
import { PageHeader, SectionTitle, MetaGrid, FileIcon } from "../components/shared";
import { CATEGORIES, deptName } from "../data";
import { useDocsStore } from "../store-docs";
import type { Document } from "../types";

type ApiClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";

const API_CLASSIFICATION: Record<Document["classification"], ApiClassification> = {
  public: "PUBLIC",
  internal: "INTERNAL",
  confidential: "CONFIDENTIAL",
  restricted: "SECRET",
  topsecret: "SECRET",
};

interface EditForm {
  title: string;
  description: string;
  categoryId: string;
  classification: ApiClassification;
  tags: string;
}

function formFrom(doc: Document | undefined, lang: "ar" | "en"): EditForm {
  if (!doc) return { title: "", description: "", categoryId: "", classification: "INTERNAL", tags: "" };
  const category =
    CATEGORIES.find((c) => c.id === doc.categoryId) ?? CATEGORIES.find((c) => c.name === doc.category || c.nameEn === doc.categoryEn);
  return {
    title: lang === "en" ? doc.titleEn : doc.title,
    description: doc.description,
    categoryId: category?.id ?? "",
    classification: API_CLASSIFICATION[doc.classification],
    tags: doc.tags.join(", "),
  };
}

/* ---------------- Edit Document ---------------- */
export function EditDocument() {
  const { id } = useParams();
  const { t, lang, toast, user } = useApp();
  const navigate = useNavigate();
  const { docs: storeDocs, updateDocument, docsReady, loadDocument } = useDocsStore();
  const doc = storeDocs.find((d) => d.id === id);
  const [form, setForm] = useState<EditForm>(() => formFrom(doc, lang));
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const locked = Boolean(doc?.checkedOutBy && doc.checkedOutBy !== user?.name);

  const leave = (path: string) => {
    if (dirty) setPendingPath(path);
    else navigate(path);
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: MouseEvent) => {
      const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
      if (!href || !href.startsWith("#/") || href === location.hash) return;
      event.preventDefault();
      setPendingPath(href.slice(1));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [dirty]);

  useEffect(() => {
    if (id && docsReady && !doc) void loadDocument(id);
  }, [id, doc, docsReady, loadDocument]);

  useEffect(() => {
    if (!doc || dirty) return;
    setForm(formFrom(doc, lang));
  }, [doc, lang, dirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    if (!doc || locked) return;
    setSaving(true);
    const ok = await updateDocument(doc.id, {
      ...(lang === "en" ? { titleEn: form.title.trim() } : { title: form.title.trim() }),
      description: form.description.trim(),
      category: form.categoryId || undefined,
      classification: form.classification,
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      reason: reason.trim(),
    });
    setSaving(false);
    if (!ok) return;
    setDirty(false);
    setReason("");
    toast({ type: "success", title: lang === "en" ? "Changes saved" : "تم حفظ التعديلات", message: form.title });
    navigate(`/documents/${doc.id}`);
  };

  if (!doc) {
    if (!docsReady) {
      return (
        <div aria-busy="true">
          <PageHeader
            title={t("g.edit")}
            breadcrumbs={[{ label: t("nav.documents"), to: "/documents" }, { label: t("g.edit") }]}
            actions={
              <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate("/documents")}>
                {t("g.back")}
              </Button>
            }
          />
          <Card>
            <div className="h-40 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
            <div className="mt-3 h-72 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
            <span className="sr-only">{lang === "en" ? "Loading document…" : "جارٍ تحميل الوثيقة…"}</span>
          </Card>
        </div>
      );
    }
    return (
      <div>
        <PageHeader
          title={t("g.edit")}
          breadcrumbs={[{ label: t("nav.documents"), to: "/documents" }, { label: t("g.edit") }]}
          actions={
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate("/documents")}>
              {t("g.back")}
            </Button>
          }
        />
        <Card>
          <EmptyState
            title={lang === "en" ? "Document not found" : "الوثيقة غير موجودة"}
            description={
              lang === "en"
                ? "It may have been deleted or you may not have access to it."
                : "قد تكون محذوفة أو لا تملك صلاحية الوصول إليها."
            }
            action={
              <Button size="sm" onClick={() => navigate("/documents")}>
                {lang === "en" ? "Back to documents" : "العودة إلى الوثائق"}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${t("g.edit")} — ${lang === "en" ? doc.titleEn : doc.title}`}
        description={
          lang === "en" ? "Protected fields are read-only. Change reason is mandatory." : "الحقول المحمية للقراءة فقط. سبب التعديل إلزامي."
        }
        breadcrumbs={[
          { label: t("nav.documents"), to: "/documents" },
          { label: lang === "en" ? doc.titleEn : doc.title, to: `/documents/${doc.id}` },
          { label: t("g.edit") },
        ]}
        actions={
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => leave(`/documents/${doc.id}`)}>
            {t("g.back")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div>
            {doc.checkedOutBy && doc.checkedOutBy !== user?.name ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <Lock className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  {lang === "en" ? "This document is checked out by" : "هذه الوثيقة محجوزة للتحرير بواسطة"}{" "}
                  <strong>{doc.checkedOutBy}</strong>
                  {lang === "en" ? " — you cannot edit it until it is checked in." : " — لا يمكنك تعديلها حتى يتم تحريرها (Check-in)."}
                </span>
                <Button size="sm" variant="outline" onClick={() => leave(`/documents/${doc.id}`)}>
                  {t("g.back")}
                </Button>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />{" "}
                {dirty
                  ? lang === "en"
                    ? "You have unsaved changes. Every edit is recorded in the audit trail."
                    : "لديك تغييرات غير محفوظة. سيتم تسجيل كل تعديل في سجل التدقيق."
                  : lang === "en"
                    ? "No changes yet. Any change will be recorded in the audit trail."
                    : "لم تقم بأي تعديل بعد. أي تغيير سيُسجّل في سجل التدقيق."}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={t("doc.title")} required className="md:col-span-2">
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} disabled={locked} />
              </Field>
              <Field label={t("g.description")} className="md:col-span-2">
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} disabled={locked} />
              </Field>
              <Field label={t("g.category")}>
                <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} disabled={locked}>
                  <option value="">{lang === "en" ? "No category" : "بدون تصنيف"}</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {lang === "en" ? category.nameEn : category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("doc.classification")}>
                <Select
                  value={form.classification}
                  onChange={(e) => set("classification", e.target.value as ApiClassification)}
                  disabled={locked}
                >
                  <option value="PUBLIC">{t("doc.classification.public")}</option>
                  <option value="INTERNAL">{t("doc.classification.internal")}</option>
                  <option value="CONFIDENTIAL">{t("doc.classification.confidential")}</option>
                  <option value="SECRET">{t("doc.classification.restricted")}</option>
                </Select>
              </Field>
              <Field label={t("doc.tags")} className="md:col-span-2">
                <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} disabled={locked} />
              </Field>
              <Field label={t("doc.docNo")} hint={lang === "en" ? "Protected field" : "حقل محمي"}>
                <Input defaultValue={doc.docNo} disabled />
              </Field>
              <Field label={t("g.owner")} hint={lang === "en" ? "Protected field" : "حقل محمي"}>
                <Input defaultValue={doc.owner} disabled />
              </Field>
            </div>
            <Field
              label={lang === "en" ? "Change reason" : "سبب التعديل"}
              required={!locked}
              className="mt-3"
              hint={lang === "en" ? "Recorded with the edit in the audit trail" : "يُسجَّل مع التعديل في سجل التدقيق"}
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={lang === "en" ? "Explain the reason for this change (mandatory)" : "اشرح سبب التعديل (إلزامي)"}
                disabled={locked}
              />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => leave(`/documents/${doc.id}`)}>
                {t("g.cancel")}
              </Button>
              <Button
                disabled={locked || !reason.trim() || !form.title.trim() || saving}
                icon={<Check className="h-4 w-4" />}
                onClick={save}
              >
                {saving ? (lang === "en" ? "Saving…" : "جارٍ الحفظ…") : t("g.save")}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title={lang === "en" ? "Current summary" : "الملخص الحالي"} />
          <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-gradient-to-br from-ink-50 to-ink-100 dark:from-ink-950 dark:to-ink-800">
            <FileIcon type={doc.fileType} size="lg" />
          </div>
          <MetaGrid
            items={[
              { label: t("g.version"), value: doc.version },
              { label: t("g.size"), value: doc.size },
              { label: t("g.dateCreated"), value: doc.createdAt },
              { label: t("g.department"), value: deptName(doc.deptId, lang) },
            ]}
          />
        </Card>
      </div>
      <ConfirmDialog
        open={pendingPath !== null}
        onClose={() => setPendingPath(null)}
        onConfirm={() => {
          const path = pendingPath;
          setPendingPath(null);
          setDirty(false);
          if (path) navigate(path);
        }}
        title={t("topbar.unsavedChanges")}
        message={
          lang === "en"
            ? "You have unsaved changes to this document. If you leave now the changes will be lost."
            : "لديك تعديلات غير محفوظة على هذه الوثيقة. إذا خرجت الآن ستفقد التغييرات."
        }
        confirmText={t("topbar.discard")}
      />
    </div>
  );
}
