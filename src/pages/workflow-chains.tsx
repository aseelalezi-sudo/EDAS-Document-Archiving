import { useEffect, useRef, useState } from "react";
import { Plus, Copy, GripVertical, Trash2, Network, ChevronLeft } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Modal, Field, Input, Select, Toggle, Checkbox } from "../components/ui";
import { PageHeader, SectionTitle } from "../components/shared";
import { approvalChains, roleLabel } from "../data";
import { config } from "../config";
import { serverReason } from "../lib/api-client";
import { domainApi } from "../lib/domain-api";
import { mapApprovalChain } from "../lib/api-mappers";
import { roleFromApi } from "../lib/role-bridge";
import type { ApprovalChain } from "../types";
import type { UserRole } from "@edas/shared";
export function ApprovalChains() {
  const { t, lang, toast } = useApp();
  const apiMode = config.useApi;
  const [apiChains, setApiChains] = useState<ApprovalChain[]>([]);
  const [localChains, setLocalChains] = useState<ApprovalChain[]>(approvalChains);
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => {
    void domainApi
      .approvalChains()
      .then((page) => setApiChains(page.items.map(mapApprovalChain)))
      .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
  };
  useEffect(() => {
    if (apiMode) reloadRef.current();
  }, [apiMode]);
  const allChains = apiMode ? apiChains : localChains;
  const [editor, setEditor] = useState<ApprovalChain | null>(null);
  const [steps, setSteps] = useState<ApprovalChain["steps"]>([]);
  const [chainName, setChainName] = useState("");
  const [chainDescription, setChainDescription] = useState("");
  const [chainActive, setChainActive] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const API_ROLES: UserRole[] = ["EMPLOYEE", "SUPERVISOR", "DEPT_MANAGER", "ARCHIVIST", "AUDITOR", "SYSTEM_ADMIN"];
  const apiRoleLabel = (role: UserRole) => (role === "SUPERVISOR" ? t("role.supervisor") : roleLabel(roleFromApi(role), lang));
  const roleForLabel = (label: string): UserRole =>
    API_ROLES.find((role) => apiRoleLabel(role) === label || roleLabel(roleFromApi(role), "en") === label) ?? "DEPT_MANAGER";

  const openEditor = (c: ApprovalChain) => {
    setEditor(c);
    setSteps(c.steps);
    setChainName(c.name);
    setChainDescription(c.scope);
    setChainActive(c.status === "active");
  };
  const newChain = (): ApprovalChain => ({
    id: "new",
    name: "",
    nameEn: "",
    scope: "",
    target: "",
    status: "active",
    updated: new Date().toISOString().slice(0, 10),
    steps: [
      {
        order: 1,
        assignee: apiRoleLabel("DEPT_MANAGER"),
        assigneeEn: roleLabel(roleFromApi("DEPT_MANAGER"), "en"),
        role: roleLabel(roleFromApi("DEPT_MANAGER"), "en"),
        roleCode: "DEPT_MANAGER",
        sla: 24,
        type: "sequential" as const,
        requireComment: false,
      },
    ],
  });
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
    toast({
      type: "info",
      title: lang === "en" ? "Order changed — save the chain to apply" : "تم تعديل الترتيب — احفظ السلسلة لتثبيت التغيير",
    });
  };
  const removeStep = (i: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, ni) => ({ ...s, order: ni + 1 })));
    toast({ type: "info", title: lang === "en" ? "Step removed — save the chain to apply" : "حُذفت الخطوة — احفظ السلسلة لتثبيت التغيير" });
  };
  const duplicateChain = (c: ApprovalChain) => {
    const name = `${c.name} (${lang === "en" ? "copy" : "نسخة"})`;
    if (apiMode) {
      void domainApi
        .createApprovalChain({
          name,
          description: c.scope || undefined,
          steps: c.steps.map((s, i) => ({ order: i + 1, role: s.roleCode ?? roleForLabel(s.role), name: s.assignee })),
        })
        .then(() => {
          reloadRef.current();
          toast({ type: "info", title: t("g.duplicate"), message: c.name });
        })
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      return;
    }
    setLocalChains((prev) => [
      { ...c, id: `chain-${Date.now()}`, name, nameEn: `${c.nameEn} (copy)`, updated: new Date().toISOString().slice(0, 10) },
      ...prev,
    ]);
    toast({ type: "info", title: t("g.duplicate"), message: c.name });
  };
  const saveChain = () => {
    const name = chainName.trim() || (lang === "en" ? "New approval chain" : "سلسلة موافقة جديدة");
    if (apiMode) {
      const payload = {
        name,
        description: chainDescription.trim() || undefined,
        steps: steps.map((s, i) => ({ order: i + 1, role: s.roleCode ?? roleForLabel(s.role), name: s.assignee })),
      };
      const request =
        editor?.id === "new"
          ? domainApi.createApprovalChain(payload)
          : domainApi.updateApprovalChain(editor?.id ?? "", { ...payload, isActive: chainActive });
      void request
        .then(() => {
          reloadRef.current();
          setEditor(null);
          toast({ type: "success", title: t("g.save"), message: `${steps.length} ${t("wf.stepsCount")}` });
        })
        .catch((error) => toast({ type: "error", title: t("err.api"), message: serverReason(error) }));
      return;
    }
    if (!editor) return;
    const next: ApprovalChain = {
      ...editor,
      id: editor.id === "new" ? `chain-${Date.now()}` : editor.id,
      name,
      nameEn: name,
      scope: chainDescription.trim(),
      status: chainActive ? "active" : "inactive",
      updated: new Date().toISOString().slice(0, 10),
      steps,
    };
    setLocalChains((prev) => (editor.id === "new" ? [next, ...prev] : prev.map((chain) => (chain.id === next.id ? next : chain))));
    setEditor(null);
    toast({ type: "success", title: t("g.save"), message: `${steps.length} ${t("wf.stepsCount")}` });
  };
  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        order: prev.length + 1,
        assignee: apiRoleLabel("DEPT_MANAGER"),
        assigneeEn: roleLabel(roleFromApi("DEPT_MANAGER"), "en"),
        role: roleLabel(roleFromApi("DEPT_MANAGER"), "en"),
        roleCode: "DEPT_MANAGER",
        sla: 24,
        type: "sequential",
        requireComment: false,
      },
    ]);
    toast({ type: "info", title: t("wf.addStep") });
  };
  return (
    <div>
      <PageHeader
        title={t("nav.approvalChains")}
        description={t("wf.chainsDesc")}
        breadcrumbs={[{ label: t("nav.approvalChains") }]}
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openEditor(newChain())}>
            {t("g.create")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {allChains.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100">{lang === "en" ? c.nameEn : c.name}</p>
                <p className="text-xs text-ink-400">{c.scope}</p>
              </div>
              <Badge
                className={
                  c.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-ink-100 text-ink-500"
                }
              >
                {c.status === "active" ? t("g.active") : t("g.inactive")}
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
              {c.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 dark:border-ink-800 dark:bg-ink-950">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-ink-700 dark:text-ink-200">{s.assignee}</p>
                    </div>
                  </span>
                  {i < c.steps.length - 1 && <ChevronLeft className="h-3 w-3 shrink-0 text-ink-300 flip-x" />}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={() => duplicateChain(c)}>
                {t("g.duplicate")}
              </Button>
              <Button size="sm" variant="outline" icon={<Network className="h-4 w-4" />} onClick={() => openEditor(c)}>
                {t("g.edit")}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={lang === "en" ? "Approval chain editor" : "محرر سلسلة الموافقة"}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditor(null)}>
              {t("g.cancel")}
            </Button>
            <Button onClick={saveChain}>{t("g.save")}</Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("wf.chainName")}>
                <Input value={chainName} onChange={(e) => setChainName(e.target.value)} />
              </Field>
              <Field label={t("wf.scope")}>
                <Input
                  value={chainDescription}
                  onChange={(e) => setChainDescription(e.target.value)}
                  placeholder={lang === "en" ? "e.g. Purchase orders above 50,000" : "مثال: أوامر الشراء فوق ٥٠٠٠٠"}
                />
              </Field>
            </div>
            {editor.id !== "new" && (
              <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                <Toggle checked={chainActive} onChange={() => setChainActive((prev) => !prev)} />
                {lang === "en" ? "Active (available for new approvals)" : "فعّالة (متاحة لطلبات الاعتماد الجديدة)"}
              </label>
            )}
            <SectionTitle
              title={`${t("doc.workflow")} (${steps.length}) — ${t("wf.stepsDrag")}`}
              icon={<GripVertical className="h-4 w-4 text-ink-400" />}
            />
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverIndex(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, i);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-xl border bg-ink-50/50 p-2 transition-all dark:bg-ink-950",
                    dragIndex === i ? "opacity-40 border-dashed border-navy-400" : "border-ink-200 dark:border-ink-800",
                    overIndex === i && dragIndex !== null && dragIndex !== i && "border-navy-400 ring-2 ring-navy-500/20",
                  )}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-ink-400" />
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <Input
                    className="w-44"
                    value={s.assignee}
                    placeholder={t("wf.stepName")}
                    aria-label={t("wf.stepName")}
                    onChange={(e) => {
                      const name = e.target.value;
                      setSteps((prev) => prev.map((step, idx) => (idx === i ? { ...step, assignee: name, assigneeEn: name } : step)));
                    }}
                  />
                  <Select
                    className="w-40"
                    value={s.roleCode ?? roleForLabel(s.role)}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setSteps((prev) =>
                        prev.map((step, idx) => (idx === i ? { ...step, roleCode: role, role: roleLabel(roleFromApi(role), "en") } : step)),
                      );
                    }}
                    aria-label={t("wf.stepRole")}
                  >
                    {API_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {apiRoleLabel(role)}
                      </option>
                    ))}
                  </Select>
                  <label className={`flex items-center gap-1 text-[11px] font-medium text-ink-500 ${apiMode ? "opacity-50" : ""}`}>
                    SLA
                    <Input
                      type="number"
                      min={1}
                      className="w-16"
                      value={s.sla}
                      aria-label={lang === "en" ? "SLA hours" : "ساعات الاستجابة"}
                      disabled={apiMode}
                      onChange={(e) => {
                        const sla = Number(e.target.value);
                        setSteps((prev) => prev.map((step, idx) => (idx === i ? { ...step, sla: Number.isFinite(sla) ? sla : 1 } : step)));
                      }}
                    />
                    h
                  </label>
                  <Select
                    className={`w-28 ${apiMode ? "opacity-50" : ""}`}
                    value={s.type}
                    aria-label={lang === "en" ? "Step type" : "نوع الخطوة"}
                    disabled={apiMode}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((step, idx) =>
                          idx === i ? { ...step, type: e.target.value === "parallel" ? "parallel" : "sequential" } : step,
                        ),
                      )
                    }
                  >
                    <option value="sequential">{lang === "en" ? "Sequential" : "تتابعي"}</option>
                    <option value="parallel">{lang === "en" ? "Parallel" : "متوازٍ"}</option>
                  </Select>
                  {!apiMode && (
                    <label className="flex items-center gap-1 text-[11px] font-medium text-ink-500">
                      <Checkbox
                        checked={s.requireComment}
                        onChange={(v) => setSteps((prev) => prev.map((step, idx) => (idx === i ? { ...step, requireComment: v } : step)))}
                      />
                      {lang === "en" ? "Comment required" : "تعليق إلزامي"}
                    </label>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 ms-auto" onClick={() => removeStep(i)} aria-label={t("g.delete")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addStep}>
              {t("wf.addStep")}
            </Button>
            {apiMode && (
              <p className="text-[11px] text-ink-400">
                {lang === "en"
                  ? "The server saves the role, order, and name of each step only; SLA, step type, and required comment are local to this device."
                  : "يحفظ الخادم لكل خطوة الدور والترتيب والاسم فقط؛ SLA ونوع الخطوة والتعليق الإلزامي محلية في هذا الجهاز."}
              </p>
            )}
            <div className="rounded-lg bg-navy-50 p-3 dark:bg-navy-900/30">
              <SectionTitle title={lang === "en" ? "Workflow preview" : "معاينة سير العمل"} />
              {steps.length === 0 ? (
                <p className="text-xs text-ink-400">{lang === "en" ? "Add at least one step." : "أضف خطوة واحدة على الأقل."}</p>
              ) : (
                <ol className="mt-2 flex flex-wrap items-center gap-1.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-2 py-1 text-[11px] font-semibold text-navy-700 dark:border-navy-700 dark:bg-ink-900 dark:text-navy-200">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-navy-600 text-[9px] text-white">
                          {i + 1}
                        </span>
                        {s.assignee}
                        <span className="text-[9px] font-normal text-ink-400">
                          {s.sla}h ·{" "}
                          {s.type === "parallel" ? (lang === "en" ? "parallel" : "متوازٍ") : lang === "en" ? "sequential" : "تتابعي"}
                        </span>
                      </span>
                      {i < steps.length - 1 && <ChevronLeft className="h-3 w-3 text-ink-300 flip-x" />}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
