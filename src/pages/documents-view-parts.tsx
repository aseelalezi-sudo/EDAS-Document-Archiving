import { useEffect, useState } from "react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { Button, Modal, Field, Input, Select, Textarea } from "../components/ui";
import { domainApi } from "../lib/domain-api";
import { config } from "../config";
import { SignaturePad } from "./document-widgets";
import type { Document } from "../types";

export function PlaceHoldModal({ open, doc, onClose }: { open: boolean; doc: Document | null; onClose: () => void }) {
  const { t, lang, user, toast } = useApp();
  const { addHold } = useDocsStore();
  const [reason, setReason] = useState("");
  const [caseRef, setCaseRef] = useState("");

  const reset = () => {
    setReason("");
    setCaseRef("");
  };

  const submit = async () => {
    if (!doc) return;
    if (!reason.trim()) {
      toast({ type: "error", title: lang === "en" ? "Reason is required" : "السبب مطلوب" });
      return;
    }
    const ok = await addHold({
      ref: caseRef.trim() || doc.docNo,
      reason: reason.trim(),
      caseRef: caseRef.trim() || "—",
      placedBy: user?.name ?? "—",
      placedAt: new Date().toISOString().slice(0, 10),
      items: 1,
      documentIds: [doc.id],
    });
    if (!ok) return;
    toast({
      type: "warning",
      title: lang === "en" ? "Legal hold placed" : "تم وضع الحجز القانوني",
      message: `${doc.docNo} — ${lang === "en" ? "protected from disposition" : "محمية من الإتلاف"}`,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("doc.placeHold")}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t("g.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!doc}>
            {t("g.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {doc && (
          <div className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
            <p className="font-semibold text-ink-800 dark:text-ink-100">{lang === "en" ? doc.titleEn : doc.title}</p>
            <p className="text-xs text-ink-400">{doc.docNo}</p>
          </div>
        )}
        <Field label={lang === "en" ? "Reason" : "السبب"} required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === "en" ? "Reason for the legal hold" : "سبب الحجز القانوني"}
          />
        </Field>
        <Field label={lang === "en" ? "Case reference" : "مرجع القضية"}>
          <Input value={caseRef} onChange={(e) => setCaseRef(e.target.value)} placeholder="1447/ق/302" />
        </Field>
      </div>
    </Modal>
  );
}

export function SignDocumentModal({ open, doc, onClose }: { open: boolean; doc: Document | null; onClose: () => void }) {
  const { lang, user, toast } = useApp();
  const { signDocument } = useDocsStore();
  return (
    <Modal open={open} onClose={onClose} title={lang === "en" ? "Sign document" : "توقيع الوثيقة"} footer={null}>
      <div className="space-y-3">
        {doc && (
          <div className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
            <p className="font-semibold text-ink-800 dark:text-ink-100">{lang === "en" ? doc.titleEn : doc.title}</p>
            <p className="text-xs text-ink-400">{doc.docNo}</p>
          </div>
        )}
        <SignaturePad
          lang={lang}
          onSign={async () => {
            if (!doc) return;
            if (!(await signDocument(doc.id, user?.name ?? ""))) return;
            onClose();
            toast({
              type: "success",
              title: lang === "en" ? "Document signed" : "تم توقيع الوثيقة",
              message: `${user?.name} · ${new Date().toLocaleDateString("ar-SA")} · ${
                lang === "en"
                  ? "signer and date recorded; the drawn ink is not stored"
                  : "حُفظ الموقّع والتاريخ في السجل؛ رسم التوقيع لا يُخزَّن"
              }`,
            });
          }}
        />
      </div>
    </Modal>
  );
}

export function ScheduleRetentionModal({ open, doc, onClose }: { open: boolean; doc: Document | null; onClose: () => void }) {
  const { t, lang, toast } = useApp();
  const { scheduleRetention, policies } = useDocsStore();
  const apiMode = config.useApi;
  const [policyId, setPolicyId] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string; retentionMonths: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPolicyId("");
    if (apiMode) {
      void domainApi
        .retentionPolicies()
        .then((page) =>
          setOptions(
            page.items
              .filter((item) => item.isActive)
              .map((item) => ({ id: item.id, name: item.name, retentionMonths: item.retentionMonths })),
          ),
        )
        .catch(() => toast({ type: "error", title: t("err.api") }));
      return;
    }
    setOptions(
      policies.items
        .filter((item) => item.status === "active")
        .map((item) => ({ id: item.id, name: item.name, retentionMonths: item.retentionMonths ?? 12 })),
    );
  }, [open, apiMode, policies.items, t, toast]);

  const selected = options.find((item) => item.id === policyId);
  const dueDate = selected
    ? (() => {
        const due = new Date(doc?.createdAt || Date.now());
        due.setMonth(due.getMonth() + selected.retentionMonths);
        return due.toISOString().slice(0, 10);
      })()
    : null;

  const submit = async () => {
    if (!doc || !policyId || saving) return;
    setSaving(true);
    const ok = await scheduleRetention(doc.id, policyId);
    setSaving(false);
    if (!ok) return;
    toast({
      type: "success",
      title: lang === "en" ? "Retention scheduled" : "تمت جدولة الاحتفاظ",
      message: `${doc.docNo} — ${selected?.name ?? ""}`,
    });
    setPolicyId("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setPolicyId("");
        onClose();
      }}
      title={lang === "en" ? "Schedule retention" : "جدولة الاحتفاظ"}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              setPolicyId("");
              onClose();
            }}
          >
            {t("g.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!doc || !policyId || saving}>
            {t("g.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {doc && (
          <div className="rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
            <p className="font-semibold text-ink-800 dark:text-ink-100">{lang === "en" ? doc.titleEn : doc.title}</p>
            <p className="text-xs text-ink-400">{doc.docNo}</p>
          </div>
        )}
        <Field
          label={lang === "en" ? "Active policy" : "السياسة المفعّلة"}
          required
          hint={
            options.length === 0 ? (lang === "en" ? "No active retention policy is available." : "لا توجد سياسة احتفاظ مفعّلة.") : undefined
          }
        >
          <Select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            <option value="">{lang === "en" ? "Select…" : "اختر…"}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.retentionMonths} {lang === "en" ? "months" : "شهر"}
              </option>
            ))}
          </Select>
        </Field>
        {dueDate && (
          <div className="rounded-xl border border-navy-200 bg-navy-50 p-3 text-sm text-navy-700 dark:border-navy-800 dark:bg-navy-900/30 dark:text-navy-200">
            {lang === "en" ? "Retention ends on" : "تنتهي مدة الاحتفاظ في"} <strong>{dueDate}</strong>
          </div>
        )}
      </div>
    </Modal>
  );
}
