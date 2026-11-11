import { Check } from "lucide-react";
import { useApp } from "../store";
import { Button, Modal, Field, Input, Select } from "../components/ui";
import { MetaGrid } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { DocUser, Employee } from "../types";
import { config } from "../config";

export function EmployeeEditModal({
  editOpen,
  onChange,
  onClose,
  onSave,
}: {
  editOpen: Employee | null;
  onChange: (patch: Partial<Employee>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { users: userStore, departments: deptStore, sections: sectionStore } = useDocsStore();
  const apiMode = config.useApi;
  const sections = sectionStore.items.filter((section) => !editOpen?.deptId || section.deptId === editOpen.deptId);
  return (
    <Modal
      open={!!editOpen}
      onClose={onClose}
      title={`${t("g.edit")} — ${editOpen?.name ?? ""}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("g.cancel")}
          </Button>
          <Button icon={<Check className="h-4 w-4" />} onClick={onSave} disabled={!editOpen?.name?.trim()}>
            {t("g.save")}
          </Button>
        </>
      }
    >
      {editOpen && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("الاسم الكامل", "Full name")} required className="col-span-2">
            <Input value={editOpen.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label={L("المسمى الوظيفي", "Job title")}>
            <Input value={editOpen.jobTitle} onChange={(e) => onChange({ jobTitle: e.target.value })} />
          </Field>
          <Field label={t("g.department")}>
            <Select value={editOpen.deptId} onChange={(e) => onChange({ deptId: e.target.value, sectionId: "" })}>
              <option value="">{L("بدون إدارة", "No department")}</option>
              {deptStore.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === "en" ? (d.nameEn ?? d.name) : d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("g.section")}>
            <Select value={editOpen.sectionId} onChange={(e) => onChange({ sectionId: e.target.value })}>
              <option value="">{L("— بدون قسم —", "— No section —")}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {lang === "en" ? (section.nameEn ?? section.name) : section.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={L("البريد", "Email")}>
            <Input value={editOpen.email} onChange={(e) => onChange({ email: e.target.value })} dir="ltr" />
          </Field>
          <Field label={L("الهاتف", "Phone")}>
            <Input value={editOpen.phone} onChange={(e) => onChange({ phone: e.target.value })} dir="ltr" />
          </Field>
          <Field label={L("الحالة الوظيفية", "Employment status")} className="col-span-2">
            <Select value={editOpen.status} onChange={(e) => onChange({ status: e.target.value as Employee["status"] })}>
              <option value="active">{t("g.active")}</option>
              {!apiMode && <option value="leave">{L("إجازة", "On leave")}</option>}
              <option value="inactive">{t("g.inactive")}</option>
            </Select>
          </Field>
          <div className="col-span-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
            <MetaGrid
              items={[
                { label: L("الرقم الوظيفي", "Emp no."), value: editOpen.empNo },
                { label: L("المدير المباشر", "Manager"), value: editOpen.manager || "—" },
                {
                  label: L("قسم الموظف", "Employee section"),
                  value: sectionStore.items.find((s) => s.id === editOpen.sectionId)?.name ?? "—",
                },
                {
                  label: L("حساب المستخدم", "User account"),
                  value: editOpen.userId
                    ? (userStore.items.find((u: DocUser) => u.id === editOpen.userId)?.username ?? editOpen.userId)
                    : L("غير مرتبط", "Not linked"),
                },
              ]}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
