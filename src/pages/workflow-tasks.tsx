import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare,
  Eye,
  Check,
  X,
  RotateCcw,
  MessageSquareText,
  Clock,
  Network,
  AlertTriangle,
  Zap,
  CheckCheck,
  FileText,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Tabs, Modal, Textarea, Field, EmptyState, Tooltip, ConfirmDialog } from "../components/ui";
import { PageHeader, RowMenu } from "../components/shared";
import { deptName, roleLabel } from "../data";
import { roleFromApi } from "../lib/role-bridge";
import { useDocsStore } from "../store-docs";
import { logError } from "../lib/log-error";
import { ReviewTaskPanel } from "./workflow-tasks-parts";
import type { TaskItem } from "../types";
import type { ApprovalInstanceDto } from "@edas/shared";
export function MyTasks() {
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("assigned");
  const [review, setReview] = useState<TaskItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [approvalReject, setApprovalReject] = useState<ApprovalInstanceDto | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const {
    tasks: taskList,
    removeTask,
    rejectTask,
    reassignTask,
    requestChanges,
    users: usersStore,
    pendingApprovals,
    approvalsReady,
    decideApproval,
    refetchApprovals,
  } = useDocsStore();
  const assignableUsers = usersStore.items.filter((user) => user.status === "active" && user.name);

  useEffect(() => {
    void refetchApprovals().catch((error) => logError("approval refresh", error));
  }, [refetchApprovals]);

  const tabs = [
    { id: "assigned", label: t("wf.tabAssigned"), count: taskList.filter((x) => x.status === "assigned").length },
    { id: "sent", label: t("wf.tabSent"), count: taskList.filter((x) => x.status === "sent").length },
    { id: "completed", label: t("wf.tabCompleted"), count: taskList.filter((x) => x.status === "completed").length },
    { id: "overdue", label: t("wf.tabOverdue"), count: taskList.filter((x) => x.slaStatus === "breached").length },
    { id: "reassigned", label: t("wf.tabReassigned"), count: taskList.filter((x) => x.status === "reassigned").length },
  ];
  const prioLabel = (p: string) =>
    p === "high"
      ? lang === "en"
        ? "High"
        : "عالية"
      : p === "medium"
        ? lang === "en"
          ? "Medium"
          : "متوسطة"
        : lang === "en"
          ? "Low"
          : "منخفضة";
  const slaLabel = (s: string) => (s === "breached" ? t("wf.slaBreach") : s === "warning" ? t("wf.slaWarn") : t("wf.slaOk"));
  const prioCls = (p: string) =>
    p === "high"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : p === "medium"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-ink-100 text-ink-600 dark:bg-ink-800";
  const slaCls = (s: string) =>
    s === "breached"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : s === "warning"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  const slaPct = (r: TaskItem) => (r.slaStatus === "breached" ? 100 : r.slaStatus === "warning" ? 72 : 35);

  const visible = taskList.filter((x) =>
    tab === "assigned"
      ? x.status === "assigned"
      : tab === "overdue"
        ? x.slaStatus === "breached"
        : tab === "reassigned"
          ? x.status === "reassigned"
          : tab === "completed"
            ? x.status === "completed"
            : tab === "sent"
              ? x.status === "sent"
              : true,
  );
  const stats = [
    {
      label: t("wf.tabAssigned"),
      value: taskList.filter((x) => x.status === "assigned").length,
      icon: CheckSquare,
      color: "from-navy-400 to-navy-600",
    },
    {
      label: t("wf.tabOverdue"),
      value: taskList.filter((x) => x.slaStatus === "breached").length,
      icon: AlertTriangle,
      color: "from-rose-400 to-rose-600",
    },
    {
      label: t("g.priority"),
      value: taskList.filter((x) => x.priority === "high").length,
      icon: Zap,
      color: "from-amber-400 to-amber-600",
    },
    { label: t("wf.age"), value: taskList.length, icon: Clock, color: "from-teal-400 to-teal-600" },
  ];

  const approveAll = async () => {
    const targets = taskList.filter((x) => x.status === "assigned");
    const results = await Promise.all(targets.map((task) => removeTask(task.id)));
    const approved = results.filter(Boolean).length;
    const failed = targets.length - approved;
    toast({
      type: failed > 0 ? "error" : "success",
      title: lang === "en" ? `Approved ${approved} of ${targets.length}` : `تمت الموافقة على ${approved} من ${targets.length}`,
      message: failed > 0 ? t("err.api") : lang === "en" ? "Batch approval completed" : "اكتملت الموافقة الجماعية",
    });
  };

  return (
    <div>
      <PageHeader
        title={t("nav.myTasks")}
        description={t("wf.tasksDesc")}
        breadcrumbs={[{ label: t("nav.myTasks") }]}
        actions={
          <>
            {taskList.filter((x) => x.status === "assigned").length > 1 && (
              <Button size="sm" variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={() => setApproveAllOpen(true)}>
                {lang === "en" ? "Approve all" : "موافقة على الكل"}
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<Network className="h-4 w-4" />} onClick={() => navigate("/workflow/chains")}>
              {t("nav.approvalChains")}
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", s.color)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-extrabold text-ink-900 dark:text-white">{s.value}</p>
              <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Pending approval instances (real DB approvals submitted from a document) */}
      <Card pad={false} className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
          <div>
            <p className="text-sm font-bold text-ink-800 dark:text-ink-100">
              {lang === "en" ? "Approvals awaiting my decision" : "طلبات اعتماد بانتظار قراري"}
            </p>
            <p className="text-xs text-ink-400">
              {lang === "en"
                ? "Documents submitted for approval land here; your decision advances the chain and updates the document status."
                : "تظهر هنا الوثائق المُرسَلة للاعتماد؛ قرارك يحرّك سلسلة الاعتماد ويحدّث حالة الوثيقة."}
            </p>
          </div>
          <Badge className="bg-navy-100 text-navy-700 dark:bg-navy-900/40 dark:text-navy-200">
            {pendingApprovals.length} {lang === "en" ? "pending" : "معلق"}
          </Badge>
        </div>
        {!approvalsReady ? (
          <p className="px-4 py-4 text-sm text-ink-400">{t("g.loading")}</p>
        ) : pendingApprovals.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-400">
            {lang === "en" ? "No approval requests are waiting for your role right now." : "لا توجد طلبات اعتماد بانتظار دورك حالياً."}
          </p>
        ) : (
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {pendingApprovals.map((approval) => {
              const busy = approvalBusy;
              return (
                <div key={approval.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => navigate(`/documents/${approval.documentId}`)}
                      className="truncate text-[15px] font-bold text-navy-700 hover:underline dark:text-navy-200"
                    >
                      {approval.document.title}
                    </button>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                      <span className="font-mono">{approval.document.docNo}</span>
                      {approval.chainName && <span>· {approval.chainName}</span>}
                      {approval.currentStep && (
                        <span>
                          ·{" "}
                          <span className="font-semibold text-navy-600 dark:text-navy-300">
                            {roleLabel(roleFromApi(approval.currentStep.role), lang)}
                          </span>
                        </span>
                      )}
                      <span>· {new Date(approval.startedAt).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA")}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      icon={<Check className="h-4 w-4" />}
                      onClick={() => {
                        setApprovalBusy(true);
                        void decideApproval(approval.id, "APPROVED").then((ok) => {
                          setApprovalBusy(false);
                          if (!ok) return;
                          toast({
                            type: "success",
                            title: t("wf.approved"),
                            message: approval.document.title,
                          });
                        });
                      }}
                    >
                      {t("doc.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800"
                      icon={<X className="h-4 w-4" />}
                      onClick={() => {
                        setApprovalReason("");
                        setApprovalReject(approval);
                      }}
                    >
                      {t("doc.reject")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-2">
          <Tabs active={tab} onChange={setTab} tabs={tabs} />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            variant="success"
            title={lang === "en" ? "No tasks in this view" : "لا توجد مهام في هذا العرض"}
            description={
              lang === "en"
                ? "You're all caught up! New approval tasks will appear here."
                : "لا مهام معلقة! ستظهر مهام الموافقة الجديدة هنا."
            }
            action={
              <Button size="sm" variant="outline" icon={<Network className="h-4 w-4" />} onClick={() => navigate("/workflow/chains")}>
                {t("nav.approvalChains")}
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {visible.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "group/task px-4 py-3.5 transition-colors hover:bg-navy-50/40 dark:hover:bg-navy-500/5",
                  r.slaStatus === "breached" && "bg-rose-50/40 dark:bg-rose-500/5",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  {/* SLA indicator */}
                  <span
                    className={cn(
                      "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      r.slaStatus === "breached"
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15"
                        : r.slaStatus === "warning"
                          ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15"
                          : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
                    )}
                  >
                    {r.slaStatus === "breached" ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setReview(r)}
                        className="truncate text-[15px] font-bold text-navy-700 hover:underline dark:text-navy-200"
                      >
                        {r.docTitle}
                      </button>
                      <Badge className={prioCls(r.priority)}>{prioLabel(r.priority)}</Badge>
                      <Badge className={slaCls(r.slaStatus)}>{slaLabel(r.slaStatus)}</Badge>
                      {r.status === "reassigned" && (
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                          {lang === "en" ? "Reassigned" : "معاد تعيينها"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                      <span className="font-mono">{r.docNo}</span>
                      <span>· {r.workflow}</span>
                      <span>
                        · <span className="font-semibold text-navy-600 dark:text-navy-300">{r.step}</span>
                      </span>
                      <span>
                        · {lang === "en" ? "from" : "من"} {r.from}
                      </span>
                      <span>· {deptName(r.deptId, lang)}</span>
                    </p>
                    {/* SLA progress */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            r.slaStatus === "breached" ? "bg-rose-500" : r.slaStatus === "warning" ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${slaPct(r)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-ink-400">{r.age}</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip label={t("doc.approve")}>
                      <Button
                        size="icon"
                        className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700"
                        icon={<Check className="h-4 w-4" />}
                        onClick={() => {
                          void removeTask(r.id).then((ok) => {
                            if (!ok) return;
                            toast({ type: "success", title: t("wf.approved"), message: r.docTitle });
                          });
                        }}
                        aria-label={t("doc.approve")}
                      />
                    </Tooltip>
                    <Tooltip label={t("doc.reject")}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800"
                        icon={<X className="h-4 w-4" />}
                        onClick={() => {
                          setReview(r);
                          setRejectOpen(true);
                        }}
                        aria-label={t("doc.reject")}
                      />
                    </Tooltip>
                    <Tooltip label={t("wf.reviewApprove")}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() => setReview(r)}
                        aria-label={t("wf.reviewApprove")}
                      />
                    </Tooltip>
                    <RowMenu
                      items={[
                        {
                          label: t("wf.processDetails"),
                          icon: <Network className="h-4 w-4" />,
                          onClick: () => navigate(`/workflow/${r.id}`),
                        },
                        {
                          label: t("doc.reassign"),
                          icon: <RotateCcw className="h-4 w-4" />,
                          onClick: () => {
                            setReview(r);
                            setReassignTo("");
                            setReassignOpen(true);
                          },
                        },
                        {
                          label: t("doc.requestChanges"),
                          icon: <MessageSquareText className="h-4 w-4" />,
                          onClick: () => {
                            setReview(r);
                            setChangesNote("");
                            setChangesOpen(true);
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ReviewTaskPanel
        review={review}
        onClose={() => setReview(null)}
        onReject={() => setRejectOpen(true)}
        onReassign={() => {
          setReassignTo("");
          setReassignOpen(true);
        }}
        onRequestChanges={() => {
          setChangesNote("");
          setChangesOpen(true);
        }}
        prioCls={prioCls}
        prioLabel={prioLabel}
        slaCls={slaCls}
        slaLabel={slaLabel}
      />

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t("doc.reject")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={!reason}
              onClick={() => {
                if (!review) return;
                void rejectTask(review.id, reason).then((ok) => {
                  if (!ok) return;
                  setReason("");
                  setRejectOpen(false);
                  setReview(null);
                  toast({ type: "info", title: t("doc.reject"), message: review.docTitle });
                });
              }}
            >
              {t("doc.reject")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t("wf.rejectHint")}</div>
          <Field label={t("wf.rejectReason")} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("wf.rejectPlaceholder")} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title={t("doc.reassign")}
        footer={
          <>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button
              disabled={!reassignTo}
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                if (!review) return;
                void reassignTask(review.id, reassignTo).then((ok) => {
                  if (!ok) return;
                  setReassignOpen(false);
                  setReview(null);
                  toast({ type: "info", title: t("doc.reassign"), message: `${review.docTitle} → ${reassignTo}` });
                });
              }}
            >
              {t("doc.reassign")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            {lang === "en" ? "Select the new assignee for this task:" : "اختر المعيّن الجديد لهذه المهمة:"}
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
            {assignableUsers.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-400">
                {lang === "en" ? "No active users available to assign." : "لا يوجد مستخدمون نشطون للإسناد."}
              </p>
            )}
            {assignableUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setReassignTo(u.name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                  reassignTo === u.name
                    ? "bg-navy-50 font-semibold text-navy-700 dark:bg-navy-900/40 dark:text-navy-200"
                    : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[10px] font-bold text-navy-700 dark:bg-navy-900 dark:text-navy-300">
                  {u.name.slice(0, 2)}
                </span>
                <span className="flex-1">{u.name}</span>
                <span className="text-[10px] text-ink-400">{roleLabel(u.role, lang)}</span>
                {reassignTo === u.name && <Check className="h-4 w-4 text-navy-600" />}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={changesOpen}
        onClose={() => setChangesOpen(false)}
        title={t("doc.requestChanges")}
        footer={
          <>
            <Button variant="outline" onClick={() => setChangesOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button
              disabled={!changesNote.trim()}
              icon={<MessageSquareText className="h-4 w-4" />}
              onClick={() => {
                if (!review) return;
                void requestChanges(review.id, changesNote).then((ok) => {
                  if (!ok) return;
                  setChangesOpen(false);
                  setReview(null);
                  toast({
                    type: "warning",
                    title: t("doc.requestChanges"),
                    message: lang === "en" ? "Sent back to author" : "أُعيدت للمُعِدّ",
                  });
                });
              }}
            >
              {lang === "en" ? "Send request" : "إرسال الطلب"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {lang === "en" ? "The author will be notified with your change requests." : "سيتم إخطار المُعِدّ بطلبات التعديل."}
          </div>
          <Field label={lang === "en" ? "Requested changes" : "التعديلات المطلوبة"} required>
            <Textarea
              value={changesNote}
              onChange={(e) => setChangesNote(e.target.value)}
              placeholder={
                lang === "en" ? "e.g. Please update the budget figures in section 3…" : "مثال: يرجى تحديث أرقام الميزانية في القسم ٣…"
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={approvalReject !== null}
        onClose={() => setApprovalReject(null)}
        title={t("doc.reject")}
        footer={
          <>
            <Button variant="outline" onClick={() => setApprovalReject(null)}>
              {t("g.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={!approvalReason.trim() || approvalBusy}
              onClick={() => {
                const target = approvalReject;
                if (!target) return;
                setApprovalBusy(true);
                void decideApproval(target.id, "REJECTED", approvalReason.trim()).then((ok) => {
                  setApprovalBusy(false);
                  if (!ok) return;
                  setApprovalReject(null);
                  setApprovalReason("");
                  toast({ type: "info", title: t("doc.reject"), message: target.document.title });
                });
              }}
            >
              {t("doc.reject")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {lang === "en"
              ? "Rejecting returns the document to draft and notifies the requester."
              : "الرفض يعيد الوثيقة إلى مسودة ويُخطر مقدّم الطلب."}
          </div>
          <Field label={t("wf.rejectReason")} required>
            <Textarea value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} placeholder={t("wf.rejectPlaceholder")} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={approveAllOpen}
        onClose={() => setApproveAllOpen(false)}
        onConfirm={() => void approveAll()}
        title={lang === "en" ? "Approve all assigned tasks?" : "الموافقة على جميع المهام المسندة؟"}
        message={
          lang === "en"
            ? `All ${taskList.filter((x) => x.status === "assigned").length} assigned task(s) will be approved in one step. This advances each document's workflow and is recorded in the audit trail.`
            : `ستتم الموافقة على ${taskList.filter((x) => x.status === "assigned").length} مهمة مسندة دفعة واحدة. سيؤدي ذلك إلى تقديم سير عمل كل وثيقة، وسيُسجَّل الإجراء في سجل التدقيق.`
        }
        confirmText={lang === "en" ? "Approve all" : "موافقة على الكل"}
      />
    </div>
  );
}
