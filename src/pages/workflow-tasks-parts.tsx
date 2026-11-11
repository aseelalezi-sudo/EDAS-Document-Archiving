import { useNavigate } from "react-router-dom";
import { Check, Clock, Eye, FileText, MessageSquareText, Network, RotateCcw, X } from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { deptName } from "../data";
import { Badge, Button, Card, Modal } from "../components/ui";
import { MetaGrid, SectionTitle, Timeline } from "../components/shared";
import type { TaskItem } from "../types";

export function ReviewTaskPanel({
  review,
  onClose,
  onReject,
  onReassign,
  onRequestChanges,
  prioCls,
  prioLabel,
  slaCls,
  slaLabel,
}: {
  review: TaskItem | null;
  onClose: () => void;
  onReject: () => void;
  onReassign: () => void;
  onRequestChanges: () => void;
  prioCls: (p: string) => string;
  prioLabel: (p: string) => string;
  slaCls: (s: string) => string;
  slaLabel: (s: string) => string;
}) {
  const { t, lang, toast } = useApp();
  const { removeTask } = useDocsStore();
  const navigate = useNavigate();
  return (
    <Modal open={!!review} onClose={onClose} title={t("wf.reviewApprove")} size="xl" footer={null}>
      {review && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {/* Document preview card */}
            <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-800">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-2.5 dark:border-ink-800 dark:bg-ink-950/50">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">
                  {lang === "en" ? "Document preview" : "معاينة الوثيقة"}
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge className={prioCls(review.priority)}>{prioLabel(review.priority)}</Badge>
                  <Badge className={slaCls(review.slaStatus)}>
                    <Clock className="h-3 w-3" /> {slaLabel(review.slaStatus)}
                  </Badge>
                </div>
              </div>
              <div className="flex h-60 flex-col items-start justify-center gap-4 bg-gradient-to-b from-ink-50 to-white p-8 dark:from-ink-950 dark:to-ink-900">
                <FileText className="h-12 w-12 text-ink-300" />
                <div className="w-full space-y-2">
                  <p className="font-mono text-xs text-ink-400">{review.docNo || "—"}</p>
                  <p className="text-lg font-bold text-ink-800 dark:text-ink-100">{review.docTitle}</p>
                  <p className="text-sm text-ink-500 dark:text-ink-400">
                    {review.step || review.workflow} · {deptName(review.deptId, lang)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    icon={<Eye className="h-3.5 w-3.5" />}
                    disabled={!review.docId}
                    onClick={() => {
                      onClose();
                      if (review.docId) navigate(`/documents/${review.docId}/preview`);
                    }}
                  >
                    {lang === "en" ? "Open the document" : "فتح الوثيقة"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Network className="h-3.5 w-3.5" />}
                    onClick={() => {
                      onClose();
                      navigate(`/workflow/${review.id}`);
                    }}
                  >
                    {t("wf.processDetails")}
                  </Button>
                </div>
              </div>
            </div>
            {/* Metadata */}
            <Card pad={false}>
              <div className="px-3 pt-3">
                <SectionTitle title={t("doc.metadata")} />
              </div>
              <div className="p-3">
                <MetaGrid
                  items={[
                    { label: t("doc.docNo"), value: review.docNo },
                    { label: t("doc.workflow"), value: review.workflow },
                    { label: t("wf.step"), value: review.step },
                    { label: t("wf.sender"), value: review.from },
                    { label: t("g.department"), value: deptName(review.deptId, lang) },
                    { label: t("wf.due"), value: review.due },
                    { label: t("wf.age"), value: review.age },
                    { label: t("g.priority"), value: prioLabel(review.priority) },
                  ]}
                />
              </div>
            </Card>
            {/* Comments */}
            <Card pad={false}>
              <div className="px-3 pt-3">
                <SectionTitle title={t("wf.comments")} icon={<MessageSquareText className="h-4 w-4 text-navy-500" />} />
              </div>
              <div className="space-y-2 p-3">
                <p className="text-sm text-ink-400">
                  {lang === "en"
                    ? "Review comments are stored on the task description by the server; no threaded comments are available in this release."
                    : "تُخزَّن ملاحظات المراجعة في وصف المهمة على الخادم؛ لا تتوفر تعليقات مترابطة في هذه النسخة."}
                </p>
              </div>
            </Card>
          </div>
          <div className="space-y-3">
            <Card pad={false}>
              <div className="px-3 pt-3">
                <SectionTitle title={t("doc.workflow")} />
              </div>
              <div className="p-3">
                <Timeline
                  items={[
                    { id: "1", title: t("wf.sentStep"), subtitle: review.from || "—", time: review.due || "—", done: true },
                    { id: "2", title: review.step || review.workflow, subtitle: t("wf.you"), time: t("wf.now"), current: true },
                  ]}
                />
              </div>
            </Card>
            <div className="space-y-2">
              <Button
                className="h-11 w-full text-base"
                icon={<Check className="h-5 w-5" />}
                onClick={() => {
                  void removeTask(review.id).then((ok) => {
                    if (!ok) return;
                    onClose();
                    toast({ type: "success", title: t("wf.approved"), message: review.docTitle });
                  });
                }}
              >
                {t("doc.approve")}
              </Button>
              <Button className="h-11 w-full text-base" variant="danger" icon={<X className="h-5 w-5" />} onClick={() => onReject()}>
                {t("doc.reject")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => {
                    onReassign();
                  }}
                >
                  {t("doc.reassign")}
                </Button>
                <Button
                  variant="outline"
                  icon={<MessageSquareText className="h-4 w-4" />}
                  onClick={() => {
                    onRequestChanges();
                  }}
                >
                  {t("doc.requestChanges")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
