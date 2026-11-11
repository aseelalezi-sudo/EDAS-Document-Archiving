import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckSquare, Check, X, MessageSquareText, Clock, FileText, ScrollText, ArrowLeft, Activity, History, Network } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, Badge, Tabs, Textarea, Avatar, EmptyState, Modal, Field } from "../components/ui";
import { PageHeader, DataTable, SectionTitle, Timeline, MetaGrid } from "../components/shared";
import { deptName } from "../data";
import { useDocsStore } from "../store-docs";
import { config } from "../config";
import { domainApi } from "../lib/domain-api";
import { mapTaskComment } from "../lib/api-mappers";
import { usePersistentState } from "../utils/persist";
import type { TaskComment } from "../types";

type SlaRow = { id: string; step: string; age: string; due: string; status: string };

/* ---------------- Workflow Process Details ---------------- */
export function WorkflowDetails() {
  const { id } = useParams();
  const { t, lang, toast, user } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("timeline");
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(config.useApi);
  const [commentBusy, setCommentBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { tasks: taskList, removeTask, rejectTask, logAction, auditLog } = useDocsStore();
  const [demoComments, setDemoComments] = usePersistentState<Record<string, TaskComment[]>>("taskComments", {});
  const task = taskList.find((x) => x.id === id);

  useEffect(() => {
    if (!config.useApi || !id) {
      setComments(id ? (demoComments[id] ?? []) : []);
      setCommentsLoading(false);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    domainApi
      .taskComments(id)
      .then((page) => {
        if (!cancelled) setComments(page.items.map(mapTaskComment));
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, demoComments]);

  if (!task) {
    return (
      <div>
        <PageHeader
          title={t("nav.myTasks")}
          breadcrumbs={[{ label: t("nav.myTasks"), to: "/workflow/my-tasks" }, { label: lang === "en" ? "Task" : "مهمة" }]}
        />
        <EmptyState
          title={lang === "en" ? "Task not found" : "المهمة غير موجودة"}
          description={
            lang === "en"
              ? "This task may have been completed, rejected, or reassigned to another user."
              : "ربما اكتملت هذه المهمة أو رُفضت أو أُعيد تعيينها لمستخدم آخر."
          }
          action={
            <Button size="sm" onClick={() => navigate("/workflow/my-tasks")}>
              {lang === "en" ? "Back to my tasks" : "العودة إلى مهامي"}
            </Button>
          }
        />
      </div>
    );
  }

  const submitComment = async () => {
    const text = newComment.trim();
    if (!text || !task) return;
    if (!config.useApi) {
      const entry = {
        id: `local-${Date.now()}`,
        by: user?.name ?? "—",
        text,
        at: new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "ar-SA", { hour: "2-digit", minute: "2-digit" }),
      };
      setDemoComments((prev) => ({ ...prev, [task.id]: [...(prev[task.id] ?? []), entry] }));
      setComments((prev) => [...prev, entry]);
      setNewComment("");
      toast({
        type: "success",
        title: lang === "en" ? "Comment added" : "تمت إضافة التعليق",
        message: lang === "en" ? "Saved in this browser only (demo mode)" : "محفوظ في هذا المتصفح فقط (وضع العرض)",
      });
      return;
    }
    setCommentBusy(true);
    try {
      const created = await domainApi.addTaskComment(task.id, text);
      setComments((prev) => [...prev, mapTaskComment(created)]);
      setNewComment("");
      logAction(
        lang === "en" ? `Add comment: "${text}"` : `إضافة تعليق: «${text}»`,
        lang === "en" ? "Task" : "مهمة",
        task.id,
        lang === "en" ? "Workflow" : "سير العمل",
      );
      toast({ type: "success", title: lang === "en" ? "Comment sent" : "تم إرسال التعليق" });
    } catch {
      toast({ type: "error", title: t("err.api") });
    } finally {
      setCommentBusy(false);
    }
  };

  const taskAudit = auditLog.filter((entry) => entry.entityId === task.id);
  const decisions = taskAudit.filter((entry) => /موافقة|رفض|اعتماد|approve|reject/i.test(entry.action));
  const priorityLabel =
    task.priority === "high"
      ? lang === "en"
        ? "High"
        : "عالية"
      : task.priority === "medium"
        ? lang === "en"
          ? "Medium"
          : "متوسطة"
        : lang === "en"
          ? "Low"
          : "منخفضة";
  const slaStatusLabel = task.slaStatus === "breached" ? t("wf.slaBreach") : task.slaStatus === "warning" ? t("wf.slaWarn") : t("wf.slaOk");
  const slaRows: SlaRow[] = [{ id: task.id, step: task.step, age: task.age, due: task.due, status: slaStatusLabel }];

  const timelineItems =
    taskAudit.length > 0
      ? taskAudit.map((entry) => ({
          id: entry.id,
          title: entry.action,
          subtitle: entry.user,
          time: entry.datetime,
          done: entry.result === "success",
        }))
      : [
          {
            id: "sent",
            title: t("wf.sentForApproval"),
            subtitle: `${task.from} · ${deptName(task.deptId, lang)}`,
            time: "—",
            done: true,
          },
          { id: "current", title: `${t("wf.reviewing")}: ${task.step}`, subtitle: t("wf.you"), time: t("wf.now"), current: true },
        ];

  return (
    <div>
      <PageHeader
        title={task.workflow}
        description={`${task.docTitle} · ${task.docNo}`}
        breadcrumbs={[{ label: t("nav.myTasks"), to: "/workflow/my-tasks" }, { label: task.workflow }]}
        actions={
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4 flip-x" />} onClick={() => navigate("/workflow/my-tasks")}>
            {t("g.back")}
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <p className="font-bold text-ink-800 dark:text-ink-100">{task.docTitle}</p>
              <p className="text-xs text-ink-400">
                {task.docNo} · {deptName(task.deptId, lang)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
              {t("wf.awaiting")}: {task.step}
            </Badge>
            <Badge
              className={
                task.slaStatus === "breached"
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
              }
            >
              <Clock className="h-3 w-3" /> SLA: {task.slaStatus === "breached" ? `${t("wf.slaBreach")} (${task.age})` : t("wf.slaOk")}
            </Badge>
            <Button
              size="sm"
              icon={<Check className="h-4 w-4" />}
              onClick={() => {
                void removeTask(task.id).then((ok) => {
                  if (!ok) return;
                  toast({ type: "success", title: t("wf.approved"), message: task.docTitle });
                  navigate("/workflow/my-tasks");
                });
              }}
            >
              {t("doc.approve")}
            </Button>
            <Button size="sm" variant="danger" icon={<X className="h-4 w-4" />} onClick={() => setRejectOpen(true)}>
              {t("doc.reject")}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card pad={false}>
            <div className="px-2">
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { id: "timeline", label: t("wf.timeline") },
                  { id: "approvers", label: t("wf.approvers") },
                  { id: "comments", label: t("doc.workflow"), count: comments.length || undefined },
                  { id: "sla", label: t("wf.slaEvents") },
                  { id: "audit", label: t("wf.auditLog") },
                ]}
              />
            </div>
            <div className="p-4">
              {tab === "timeline" && <Timeline items={timelineItems} />}
              {tab === "approvers" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-navy-500 to-navy-700 text-xs font-bold text-white">
                      1
                    </span>
                    <Avatar initials={task.from.slice(0, 2)} color="bg-navy-600" size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{task.from}</p>
                      <p className="text-xs text-ink-400">{t("wf.sender")}</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Check className="h-3 w-3" /> {t("wf.done")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-navy-500 to-navy-700 text-xs font-bold text-white">
                      2
                    </span>
                    <Avatar initials={(user?.name ?? "").slice(0, 2)} color="bg-teal-600" size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{task.step}</p>
                      <p className="text-xs text-ink-400">
                        {user?.name ?? "—"} · {t("wf.due")} {task.due}
                      </p>
                    </div>
                    <Badge className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
                      {t("wf.current")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-xs text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
                    <span>
                      {lang === "en"
                        ? "Further steps are defined by the approval chain assigned to this workflow."
                        : "الخطوات التالية يحددها سلسلة الموافقة المرتبطة بهذا المسار."}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Network className="h-3.5 w-3.5" />}
                      onClick={() => navigate("/workflow/chains")}
                    >
                      {t("nav.approvalChains")}
                    </Button>
                  </div>
                </div>
              )}
              {tab === "comments" && (
                <div className="space-y-3">
                  {commentsLoading && <p className="text-xs text-ink-400">{t("g.loading")}</p>}
                  {!commentsLoading && comments.length === 0 && (
                    <p className="text-sm text-ink-400">
                      {config.useApi
                        ? lang === "en"
                          ? "No comments yet. Comments added here are stored with the task and written to the audit trail."
                          : "لا توجد تعليقات بعد. تُحفظ التعليقات مع المهمة وتُسجَّل في سجل التدقيق."
                        : lang === "en"
                          ? "No comments yet. In demo mode comments stay in this browser and are not written to the server audit trail."
                          : "لا توجد تعليقات بعد. في وضع العرض تُحفظ التعليقات في هذا المتصفح فقط ولا تُكتب في سجل تدقيق الخادم."}
                    </p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <Avatar initials={c.by.slice(0, 2)} color="bg-navy-600" size="sm" />
                      <div className="flex-1 rounded-xl rounded-ss-sm border border-navy-100 bg-navy-50/50 p-3 dark:border-navy-800 dark:bg-navy-900/20">
                        <p className="text-xs font-semibold text-navy-600 dark:text-navy-300">
                          {c.by} · {c.at}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-700 dark:text-ink-200">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={lang === "en" ? "Add a comment…" : "أضف تعليقاً…"}
                  />
                  <Button
                    size="sm"
                    disabled={!newComment.trim() || commentBusy}
                    icon={<MessageSquareText className="h-4 w-4" />}
                    onClick={() => void submitComment()}
                  >
                    {lang === "en" ? "Send" : "إرسال"}
                  </Button>
                </div>
              )}
              {tab === "sla" && (
                <DataTable<SlaRow>
                  rows={slaRows}
                  columns={[
                    { key: "step", header: t("wf.step"), render: (r) => r.step },
                    { key: "age", header: t("wf.elapsed"), render: (r) => r.age },
                    { key: "due", header: t("wf.due"), render: (r) => r.due },
                    {
                      key: "status",
                      header: t("g.status"),
                      render: (r) => (
                        <Badge
                          className={
                            r.status === t("wf.slaBreach")
                              ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300"
                              : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
                          }
                        >
                          {r.status}
                        </Badge>
                      ),
                    },
                  ]}
                />
              )}
              {tab === "audit" &&
                (taskAudit.length === 0 ? (
                  <EmptyState
                    title={lang === "en" ? "No audit events for this task" : "لا توجد أحداث تدقيق لهذه المهمة"}
                    description={
                      lang === "en"
                        ? "Audit events recorded on the server appear here once the task is acted on."
                        : "تظهر هنا أحداث التدقيق المسجّلة على الخادم بعد تنفيذ إجراء على المهمة."
                    }
                  />
                ) : (
                  <div className="space-y-2 text-sm">
                    {taskAudit.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-ink-100 p-2.5 dark:border-ink-800">
                        <ScrollText className="h-4 w-4 text-navy-400" />
                        <div className="flex-1">
                          <p className="font-medium text-ink-700 dark:text-ink-200">{entry.action}</p>
                          <p className="text-xs text-ink-400">
                            {entry.user} · {entry.datetime}
                          </p>
                        </div>
                        <Badge
                          className={
                            entry.result === "success"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300"
                          }
                        >
                          {entry.result === "success" ? t("g.active") : t("wf.slaWarn")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle title={t("wf.processSummary")} icon={<Activity className="h-4 w-4 text-navy-500" />} />
            <MetaGrid
              items={[
                { label: t("doc.workflow"), value: task.workflow },
                { label: t("wf.step"), value: task.step },
                { label: t("wf.sender"), value: task.from },
                { label: t("wf.sentStep"), value: task.due },
                { label: t("wf.age"), value: task.age },
                { label: t("g.priority"), value: priorityLabel },
              ]}
            />
          </Card>
          <Card>
            <SectionTitle title={t("wf.decisionsLog")} icon={<History className="h-4 w-4 text-navy-500" />} />
            {decisions.length === 0 ? (
              <p className="text-sm text-ink-400">
                {lang === "en"
                  ? "No approval decisions have been recorded for this task yet."
                  : "لم تُسجَّل قرارات اعتماد على هذه المهمة بعد."}
              </p>
            ) : (
              <Timeline
                items={decisions.map((entry) => ({
                  id: entry.id,
                  title: entry.action,
                  subtitle: entry.user,
                  time: entry.datetime,
                  done: entry.result === "success",
                }))}
              />
            )}
          </Card>
        </div>
      </div>

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
              disabled={!rejectReason.trim()}
              onClick={() => {
                void rejectTask(task.id, rejectReason.trim()).then((ok) => {
                  if (!ok) return;
                  setRejectOpen(false);
                  toast({ type: "error", title: t("doc.reject"), message: task.docTitle });
                  navigate("/workflow/my-tasks");
                });
              }}
            >
              {t("doc.reject")}
            </Button>
          </>
        }
      >
        <Field label={lang === "en" ? "Rejection reason" : "سبب الرفض"} required>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={lang === "en" ? "Explain why this task is rejected" : "اذكر سبب رفض المهمة"}
          />
        </Field>
      </Modal>
    </div>
  );
}

export { CheckSquare };
