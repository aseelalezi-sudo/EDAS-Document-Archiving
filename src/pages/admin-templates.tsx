import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, RotateCcw, Bell, Mail, Check, Info } from "lucide-react";
import type { NotificationChannel, NotificationTemplateDto } from "@edas/shared";
import { useApp } from "../store";
import { Button, Card, Badge, Modal, Field, Input, Select, Textarea, EmptyState, ConfirmDialog } from "../components/ui";
import { PageHeader } from "../components/shared";
import { config } from "../config";
import { usePersistentState } from "../utils/persist";
import { domainApi } from "../lib/domain-api";

type Template = Omit<NotificationTemplateDto, "updatedAt"> & { updatedAt?: string };
type TemplateForm = Omit<Template, "id" | "updatedAt">;

const isSeedTemplate = (template: Template): boolean => template.isDefault ?? template.id.startsWith("nt-");

const SEED_BASE: Template[] = [
  {
    id: "nt-1",
    name: "طلب موافقة",
    nameEn: "Approval request",
    channel: "IN_APP",
    subject: "لديك طلب موافقة جديد",
    subjectEn: "You have a new approval request",
    body: "الوثيقة {DOC_TITLE} بانتظار اعتمادك. الموعد النهائي: {DUE_DATE}.",
    bodyEn: "Document {DOC_TITLE} awaits your approval. Due: {DUE_DATE}.",
  },
  {
    id: "nt-2",
    name: "اعتماد",
    nameEn: "Approved",
    channel: "IN_APP",
    subject: "تم اعتماد الوثيقة {DOC_NO}",
    subjectEn: "Document {DOC_NO} was approved",
    body: "تم اعتماد الوثيقة {DOC_TITLE} من قبل {USER_NAME}.",
    bodyEn: "Document {DOC_TITLE} was approved by {USER_NAME}.",
  },
  {
    id: "nt-3",
    name: "رفض",
    nameEn: "Rejected",
    channel: "IN_APP",
    subject: "تم رفض الوثيقة {DOC_NO}",
    subjectEn: "Document {DOC_NO} was rejected",
    body: "رفض {USER_NAME} الوثيقة {DOC_TITLE}. يرجى مراجعة الملاحظات.",
    bodyEn: "{USER_NAME} rejected document {DOC_TITLE}. Please review the comments.",
  },
  {
    id: "nt-4",
    name: "تنبيه احتفاظ",
    nameEn: "Retention warning",
    channel: "IN_APP",
    subject: "اقترب موعد مراجعة الوثيقة {DOC_NO}",
    subjectEn: "Retention review due for {DOC_NO}",
    body: "ستحين مراجعة الاحتفاظ للوثيقة {DOC_TITLE} في {DUE_DATE}.",
    bodyEn: "The retention review for {DOC_TITLE} is due on {DUE_DATE}.",
  },
  {
    id: "nt-5",
    name: "إعادة تعيين كلمة المرور",
    nameEn: "Password reset",
    channel: "EMAIL",
    subject: "إعادة تعيين كلمة المرور",
    subjectEn: "Reset your password",
    body: "مرحباً {USER_NAME}، استخدم الرابط المرسل لإعادة تعيين كلمة المرور.",
    bodyEn: "Hello {USER_NAME}, use the link in this message to reset your password.",
  },
  {
    id: "nt-6",
    name: "خطأ حرج",
    nameEn: "Critical error",
    channel: "EMAIL",
    subject: "خطأ حرج في النظام",
    subjectEn: "Critical system error",
    body: "حدث خطأ حرج في {DEPARTMENT}. يرجى المراجعة.",
    bodyEn: "A critical error occurred in {DEPARTMENT}. Please investigate.",
  },
];

const SEEDS: Template[] = SEED_BASE.map((template) => ({ ...template, isDefault: true }));

const EMPTY_FORM: TemplateForm = { name: "", nameEn: "", channel: "IN_APP", subject: "", subjectEn: "", body: "", bodyEn: "" };

const VARIABLES = ["{USER_NAME}", "{DOC_TITLE}", "{DOC_NO}", "{DUE_DATE}", "{DEPARTMENT}"];

export function NotificationTemplates() {
  const { t, lang, toast } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const apiMode = config.useApi;
  const [items, setItems] = usePersistentState<Template[]>("notificationTemplates", SEEDS);
  const [loading, setLoading] = useState(apiMode);
  const [editor, setEditor] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: "reset" | "remove"; template: Template } | null>(null);

  const load = useCallback(() => {
    if (!apiMode) return;
    setLoading(true);
    domainApi
      .notificationTemplates()
      .then((result) => setItems(result.items))
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setLoading(false));
  }, [apiMode, t, toast, setItems]);

  useEffect(load, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setEditor(true);
  };

  const openEdit = (template: Template) => {
    setEditId(template.id);
    setForm({
      name: template.name,
      nameEn: template.nameEn,
      channel: template.channel,
      subject: template.subject,
      subjectEn: template.subjectEn,
      body: template.body,
      bodyEn: template.bodyEn,
    });
    setEditor(true);
  };

  const set = (key: keyof TemplateForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = () => {
    if (
      !form.name.trim() ||
      !form.nameEn.trim() ||
      !form.subject.trim() ||
      !form.subjectEn.trim() ||
      !form.body.trim() ||
      !form.bodyEn.trim()
    ) {
      toast({ type: "error", title: L("أكمل جميع الحقول", "Complete all fields") });
      return;
    }
    if (!apiMode) {
      if (editId) {
        setItems((current) => current.map((item) => (item.id === editId ? { ...item, ...form } : item)));
      } else {
        setItems((current) => [...current, { ...form, id: `custom-${current.length + 1}` }]);
      }
      setEditor(false);
      toast({ type: "success", title: t("g.save") });
      return;
    }
    setBusy(true);
    const request = editId ? domainApi.updateNotificationTemplate(editId, form) : domainApi.createNotificationTemplate(form);
    request
      .then(() => {
        load();
        setEditor(false);
        toast({ type: "success", title: t("g.save") });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setBusy(false));
  };

  const reset = (template: Template) => {
    if (!apiMode) {
      const seed = SEEDS.find((entry) => entry.id === template.id);
      if (seed) setItems((current) => current.map((item) => (item.id === seed.id ? seed : item)));
      toast({ type: "info", title: L("تمت استعادة الافتراضي", "Default restored") });
      return;
    }
    setBusy(true);
    domainApi
      .resetNotificationTemplate(template.id)
      .then((updated) => {
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        toast({ type: "info", title: L("تمت استعادة الافتراضي", "Default restored") });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setBusy(false));
  };

  const remove = (template: Template) => {
    if (!apiMode) {
      setItems((current) => current.filter((item) => item.id !== template.id));
      toast({ type: "success", title: t("g.delete") });
      return;
    }
    setBusy(true);
    domainApi
      .deleteNotificationTemplate(template.id)
      .then(() => {
        setItems((current) => current.filter((item) => item.id !== template.id));
        toast({ type: "success", title: t("g.delete") });
      })
      .catch(() => toast({ type: "error", title: t("err.api") }))
      .finally(() => setBusy(false));
  };

  const channelLabel = (channel: NotificationChannel) => (channel === "EMAIL" ? L("بريد إلكتروني", "Email") : L("داخل التطبيق", "In-app"));

  return (
    <div>
      <PageHeader
        title={t("nav.notifications")}
        description={L("قوالب الإشعارات داخل التطبيق والبريد الإلكتروني", "Notification templates for in-app and email")}
        breadcrumbs={[{ label: t("nav.admin") }, { label: t("nav.notifications") }]}
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            {t("g.create")}
          </Button>
        }
      />
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-navy-50 px-4 py-2.5 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {L(
          "قوالب البريد الإلكتروني تُحفظ كمرجع فقط ولا يوجد إرسال بريد فعلي في النظام؛ إشعارات القناة الداخلية تُنشأ داخل التطبيق.",
          "Email templates are stored for reference only and no email is actually sent; in-app channel templates create in-app notifications.",
        )}
      </div>
      {loading ? (
        <Card className="p-6 text-sm text-ink-500">{L("جارٍ التحميل…", "Loading…")}</Card>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title={L("لا توجد قوالب", "No templates")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((template) => {
            const Icon = template.channel === "EMAIL" ? Mail : Bell;
            return (
              <Card key={template.id} className="p-3">
                <button type="button" onClick={() => openEdit(template)} className="flex w-full items-center gap-2 text-start">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-600 dark:bg-navy-900/40">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-700 dark:text-ink-200">
                      {lang === "en" ? template.nameEn : template.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge
                        className={
                          template.channel === "EMAIL"
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30"
                            : "bg-teal-50 text-teal-700 dark:bg-teal-900/30"
                        }
                      >
                        {channelLabel(template.channel)}
                      </Badge>
                      <span className="truncate text-xs text-ink-400">{lang === "en" ? template.subjectEn : template.subject}</span>
                    </span>
                  </span>
                </button>
                <div className="mt-2 flex items-center justify-end gap-1">
                  {isSeedTemplate(template) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      disabled={busy}
                      onClick={() => setConfirmAction({ kind: "reset", template })}
                    >
                      {L("افتراضي", "Default")}
                    </Button>
                  )}
                  {!isSeedTemplate(template) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      disabled={busy}
                      onClick={() => setConfirmAction({ kind: "remove", template })}
                    >
                      {t("g.delete")}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal
        open={editor}
        onClose={() => setEditor(false)}
        title={editId ? L("تحرير القالب", "Edit template") : L("قالب إشعار جديد", "New notification template")}
        size="lg"
        footer={
          <>
            <Button loading={busy} icon={<Check className="h-4 w-4" />} onClick={save}>
              {t("g.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={L("اسم القالب", "Template name")}>
              <Input value={form.name} onChange={set("name")} />
            </Field>
            <Field label={L("القناة", "Channel")}>
              <Select value={form.channel} onChange={set("channel")}>
                <option value="IN_APP">{L("داخل التطبيق", "In-app")}</option>
                <option value="EMAIL">{L("بريد إلكتروني", "Email")}</option>
              </Select>
            </Field>
          </div>
          <Field label={L("الاسم بالإنجليزية", "Template name (English)")}>
            <Input value={form.nameEn} onChange={set("nameEn")} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={L("الموضوع", "Subject")}>
              <Input value={form.subject} onChange={set("subject")} />
            </Field>
            <Field label={L("الموضوع بالإنجليزية", "Subject (English)")}>
              <Input value={form.subjectEn} onChange={set("subjectEn")} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={L("المحتوى", "Content")}>
              <Textarea rows={4} value={form.body} onChange={set("body")} />
            </Field>
            <Field label={L("المحتوى بالإنجليزية", "Content (English)")}>
              <Textarea rows={4} value={form.bodyEn} onChange={set("bodyEn")} />
            </Field>
          </div>
          <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950">
            <p className="mb-1 text-xs font-semibold text-ink-500">{L("المتغيرات المتاحة", "Available variables")}</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((variable) => (
                <code
                  key={variable}
                  className="rounded bg-navy-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-navy-900 dark:text-navy-300"
                >
                  {variable}
                </code>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-800">
            <p className="text-xs font-semibold text-ink-500">{L("معاينة مباشرة", "Live preview")}</p>
            <p className="mt-1 text-sm font-medium text-ink-700 dark:text-ink-200">{lang === "en" ? form.subjectEn : form.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-500">{lang === "en" ? form.bodyEn : form.body}</p>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "reset") reset(confirmAction.template);
          else remove(confirmAction.template);
        }}
        title={confirmAction?.kind === "remove" ? L("حذف القالب", "Delete template") : L("استعادة الافتراضي", "Restore default")}
        message={
          confirmAction?.kind === "remove"
            ? L(
                `سيتم حذف القالب «${lang === "en" ? confirmAction.template.nameEn : confirmAction.template.name}» نهائياً.`,
                `The template "${confirmAction ? (lang === "en" ? confirmAction.template.nameEn : confirmAction.template.name) : ""}" will be permanently deleted.`,
              )
            : L(
                `ستُستعاد القيم الافتراضية للقالب «${confirmAction ? (lang === "en" ? confirmAction.template.nameEn : confirmAction.template.name) : ""}» وستُفقد التعديلات الحالية.`,
                `The template "${confirmAction ? (lang === "en" ? confirmAction.template.nameEn : confirmAction.template.name) : ""}" will be reset to its default values and current edits will be lost.`,
              )
        }
        confirmText={confirmAction?.kind === "remove" ? t("g.delete") : L("استعادة", "Restore")}
        danger={confirmAction?.kind === "remove"}
      />
    </div>
  );
}
