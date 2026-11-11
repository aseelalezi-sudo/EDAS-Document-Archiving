import { useEffect, useState } from "react";
import { Building2, ExternalLink, KeyRound, Save, ShieldCheck } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Field, Input, Avatar, Badge } from "../components/ui";
import { PageHeader, SectionTitle, MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import { roleLabel } from "../data";
import { domainApi } from "../lib/domain-api";
import { initialsFromName } from "../lib/role-bridge";
import { config } from "../config";

export function Profile() {
  const { t, lang, user, toast, apiMode, login, refreshUser } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { employees, departments, sections } = useDocsStore();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(apiMode);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    nameEn: apiMode ? "" : (user?.nameEn ?? ""),
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    jobTitle: user?.jobTitle ?? "",
    jobTitleEn: user?.jobTitleEn ?? "",
  });

  useEffect(() => {
    let cancelled = false;
    const fieldsFrom = (source: {
      name?: string | null;
      nameEn?: string | null;
      email?: string | null;
      phone?: string | null;
      jobTitle?: string | null;
      jobTitleEn?: string | null;
    }) => ({
      name: source.name ?? "",
      nameEn: source.nameEn ?? "",
      email: source.email ?? "",
      phone: source.phone ?? "",
      jobTitle: source.jobTitle ?? "",
      jobTitleEn: source.jobTitleEn ?? "",
    });
    if (!apiMode) {
      setForm(fieldsFrom(user ?? {}));
      setLoading(false);
      return;
    }
    setLoading(true);
    domainApi
      .me()
      .then((profile) => {
        if (!cancelled) setForm(fieldsFrom(profile));
      })
      .catch(() => {
        if (!cancelled) setForm(fieldsFrom(user ?? {}));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, user]);

  const employee = employees.items.find((e) => e.userId === user?.id || (user?.email && e.email === user.email));
  const deptId = employee?.deptId ?? user?.department ?? "";
  const sectionId = employee?.sectionId ?? user?.section ?? "";
  const dept = departments.items.find((d) => d.id === deptId);
  const section = sections.items.find((s) => s.id === sectionId);
  const deptLabel = dept ? (lang === "en" ? (dept.nameEn ?? dept.name) : dept.name) : deptId || "—";
  const sectionLabel = section ? (lang === "en" ? (section.nameEn ?? section.name) : section.name) : sectionId || "—";
  const accountConsoleUrl = config.oidc.issuer ? `${config.oidc.issuer.replace(/\/$/, "")}/account` : "";

  const save = async () => {
    if (!form.name.trim()) {
      toast({ type: "warning", title: L("الاسم مطلوب", "Name is required") });
      return;
    }
    if (!apiMode) {
      if (user) login({ ...user, ...form, initials: initialsFromName(form.name) });
      toast({
        type: "success",
        title: L("تم حفظ بياناتك", "Profile saved"),
        message: L("تم تحديث بياناتك الشخصية بنجاح", "Your personal data was updated successfully"),
      });
      return;
    }
    setSaving(true);
    try {
      await domainApi.updateMyProfile({
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        jobTitleEn: form.jobTitleEn.trim() || undefined,
      });
      await refreshUser();
      toast({
        type: "success",
        title: L("تم حفظ بياناتك", "Profile saved"),
        message: L("تم تحديث بياناتك الشخصية بنجاح", "Your personal data was updated successfully"),
      });
    } catch {
      toast({ type: "error", title: t("err.api"), message: L("تعذّر حفظ التعديلات", "Could not save changes") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("nav.profile")}
        description={L("بياناتك الشخصية وتفضيلاتك", "Your personal data and preferences")}
        breadcrumbs={[{ label: t("nav.settings") }, { label: t("nav.profile") }]}
        actions={
          <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={save} disabled={saving || loading}>
            {t("g.save")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card className="text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-navy-100 dark:bg-navy-900/40">
              <Avatar initials={user?.initials ?? "؟"} color={user?.color} size="lg" />
            </div>
            <p className="mt-3 font-semibold text-ink-800 dark:text-ink-100">{user?.name ?? "—"}</p>
            <p className="text-sm text-ink-400">{(lang === "en" ? user?.jobTitleEn : user?.jobTitle) || "—"}</p>
            <Badge className="mt-2 bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
              <ShieldCheck className="me-1 h-3.5 w-3.5" />
              {user ? roleLabel(user.role, lang) : "—"}
            </Badge>
            <p className="mt-3 text-xs text-ink-400">
              {L(
                "تُعرَض الأحرف الأولى من الاسم كصورة رمزية؛ لا يوجد رفع صور شخصية في النظام.",
                "Initials are shown as your avatar; personal photo upload is not supported.",
              )}
            </p>
          </Card>
          <Card>
            <SectionTitle title={L("بيانات الحساب", "Account details")} icon={<Building2 className="h-4 w-4 text-navy-500" />} />
            <MetaGrid
              items={[
                { label: L("اسم المستخدم", "Username"), value: user?.username ?? "—" },
                { label: L("الرقم الوظيفي", "Employee no."), value: employee?.empNo ?? "—" },
                { label: t("g.department"), value: deptLabel },
                { label: t("g.section"), value: sectionLabel },
              ]}
            />
            <p className="mt-3 text-xs text-ink-400">
              {L("لتغيير الإدارة أو القسم تواصل مع مدير النظام.", "Contact a system administrator to change your department or section.")}
            </p>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle title={L("البيانات الشخصية", "Personal data")} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={L("الاسم الكامل", "Full name")} required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={L("الاسم بالإنجليزية", "Name (English)")}>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} dir="ltr" />
              </Field>
              <Field label={L("المسمى الوظيفي", "Job title")}>
                <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </Field>
              <Field label={L("المسمى بالإنجليزية", "Job title (English)")}>
                <Input value={form.jobTitleEn} onChange={(e) => setForm({ ...form, jobTitleEn: e.target.value })} dir="ltr" />
              </Field>
              <Field label={L("البريد", "Email")}>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" type="email" />
              </Field>
              <Field label={L("الهاتف", "Phone")}>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
              </Field>
            </div>
          </Card>
          <Card>
            <SectionTitle title={t("auth.password")} icon={<KeyRound className="h-4 w-4 text-navy-500" />} />
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {L(
                "كلمة المرور تُدار من بوابة الهوية (Keycloak). استخدم الرابط أدناه لتغييرها أو تفعيل التحقق بخطوتين.",
                "Your password is managed by the identity provider (Keycloak). Use the link below to change it or enable two-factor authentication.",
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              icon={<ExternalLink className="h-4 w-4" />}
              disabled={!apiMode || !accountConsoleUrl}
              onClick={() => accountConsoleUrl && window.open(accountConsoleUrl, "_blank", "noopener,noreferrer")}
            >
              {L("فتح بوابة الحساب", "Open account console")}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
