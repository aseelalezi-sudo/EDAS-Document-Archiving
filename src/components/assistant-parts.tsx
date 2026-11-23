import { useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Bot,
  Check,
  ChevronLeft,
  Clock,
  Copy,
  Mic,
  PenLine,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { deptName } from "../data";
import { cn, Button, Badge, StatusBadge, Tooltip } from "./ui";
import { FileIcon, downloadCsv } from "./shared";
import type { AIMsg } from "./assistant-types";

export function AssistantHeader({ hasMessages, onReset }: { hasMessages: boolean; onReset: () => void }) {
  const { lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="relative flex items-center gap-3 border-b border-ink-100 bg-gradient-to-l from-navy-700 via-navy-800 to-navy-900 px-5 py-4 dark:border-ink-800">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(60% 100% at 100% 0%, rgba(20,168,156,0.3) 0%, transparent 60%)" }}
      />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
        <Bot className="h-5 w-5 text-teal-300" />
        <span className="absolute -end-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-navy-800">
          <span className="h-1 w-1 rounded-full bg-white" />
        </span>
      </div>
      <div className="relative flex-1">
        <p className="text-sm font-bold text-white">{L("المساعد الذكي", "AI Assistant")}</p>
        <p className="flex items-center gap-1 text-[10px] text-navy-100/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {L("جاهز · 8 اقتراحات · صوت", "Ready · 8 suggestions · voice")}
        </p>
      </div>
      {hasMessages && (
        <Tooltip label={L("محادثة جديدة", "New chat")}>
          <button
            onClick={() => {
              onReset();
            }}
            className="relative rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function AssistantWelcome({
  overdueCount,
  nearingCount,
  suggestions,
  onSend,
}: {
  overdueCount: number;
  nearingCount: number;
  suggestions: string[];
  onSend: (q?: string) => void;
}) {
  const { lang, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="space-y-3 py-1">
      {(overdueCount > 0 || nearingCount > 0) && (
        <div className="space-y-2">
          {overdueCount > 0 && (
            <button
              onClick={() => onSend(L("المهام المتأخرة", "Overdue tasks"))}
              className="group flex w-full items-center gap-3 rounded-2xl border border-rose-200/80 bg-white p-3 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-rose-500/20 dark:bg-ink-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15">
                <Clock className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  {L(`${overdueCount} مهام متأخرة`, `${overdueCount} overdue tasks`)}
                </p>
                <p className="text-[10px] text-rose-500/70">{L("اضغط للعرض الفوري", "Tap to view instantly")}</p>
              </div>
              <ChevronLeft className="h-4 w-4 text-rose-300 transition-transform group-hover:-translate-x-0.5 flip-x" />
            </button>
          )}
          {nearingCount > 0 && (
            <button
              onClick={() => onSend(L("وثائق قاربت على الإتلاف", "Nearing disposal"))}
              className="group flex w-full items-center gap-3 rounded-2xl border border-amber-200/80 bg-white p-3 text-start shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-amber-500/20 dark:bg-ink-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {L(`${nearingCount} وثائق قاربت على الإتلاف`, `${nearingCount} docs nearing disposal`)}
                </p>
                <p className="text-[10px] text-amber-600/70">{L("اضغط للمراجعة", "Tap to review")}</p>
              </div>
              <ChevronLeft className="h-4 w-4 text-amber-300 transition-transform group-hover:-translate-x-0.5 flip-x" />
            </button>
          )}
        </div>
      )}
      <div className="py-1 text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-100 to-navy-50 dark:from-navy-900 dark:to-navy-800">
          <Sparkles className="h-7 w-7 text-navy-500" />
          <span className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-400 text-[8px] font-bold text-white">
            AI
          </span>
        </div>
        <p className="mt-3 text-sm font-bold text-ink-700 dark:text-ink-200">
          {L("مرحباً", "Hello")} {user?.name} 👋
        </p>
        <p className="mx-auto mt-1 max-w-60 text-xs leading-relaxed text-ink-400">
          {L(
            "اسألني عن وثائقك، أو أعطني أمراً — أنفّذه فعلياً مع تأكيد:",
            "Ask me anything, or give me a command — I'll execute it with confirmation:",
          )}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="rounded-full border border-navy-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-navy-800 dark:bg-ink-900 dark:text-navy-200"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {suggestions.slice(4).map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="rounded-full border border-ink-200 bg-white px-3 py-1 text-[11px] font-semibold text-ink-500 transition-all hover:border-navy-300 hover:text-navy-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AssistantMessage({
  m,
  i,
  expanded,
  onToggleExpand,
  onExecute,
  onCancel,
  onSend,
  onClose,
}: {
  m: AIMsg;
  i: number;
  expanded: boolean;
  onToggleExpand: (i: number) => void;
  onExecute: (card: NonNullable<AIMsg["actionCard"]>, i: number) => void;
  onCancel: (i: number) => void;
  onSend: (q?: string) => void;
  onClose: () => void;
}) {
  const { lang, user, toast } = useApp();
  const { archiveDocs, signDocument, deleteDocs } = useDocsStore();
  const navigate = useNavigate();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast({ type: "success", title: L("تم النسخ", "Copied") });
  };
  const feedbackStorageKey = "edas.v1.assistantFeedback";
  const feedbackId = `${m.time}-${m.text.slice(0, 24)}`;
  const [rating, setRating] = useState<0 | 1 | -1>(() => {
    try {
      const raw = localStorage.getItem(feedbackStorageKey);
      if (!raw) return 0;
      const stored = JSON.parse(raw) as Record<string, number>;
      return stored[feedbackId] === 1 || stored[feedbackId] === -1 ? (stored[feedbackId] as 1 | -1) : 0;
    } catch {
      return 0;
    }
  });
  const rate = (value: 1 | -1) => {
    setRating(value);
    try {
      const raw = localStorage.getItem(feedbackStorageKey);
      const stored = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      stored[feedbackId] = value;
      localStorage.setItem(feedbackStorageKey, JSON.stringify(stored));
    } catch {
      /* ignore storage errors */
    }
    toast({
      type: "success",
      title: value === 1 ? L("شكراً لتقييمك", "Thanks for the feedback") : L("سنسجل ملاحظتك لتحسين الإجابات", "Noted — we'll improve"),
    });
  };
  return (
    <div className={cn("group/msg flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
      {m.role === "ai" && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-100 to-navy-50 text-navy-600 shadow-soft dark:from-navy-900 dark:to-navy-800 dark:text-navy-300">
          <Bot className="h-4 w-4" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] space-y-2 shadow-soft",
          m.role === "user"
            ? "rounded-2xl rounded-ee-md bg-gradient-to-br from-navy-500 to-navy-600 px-4 py-2.5 text-sm font-medium text-white"
            : "rounded-2xl rounded-ss-md border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200",
        )}
      >
        <p className={cn(m.streaming && "after:content-['▌'] after:animate-pulse after:text-navy-400")}>{m.text}</p>
        {m.stats && m.stats.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {m.stats.map((s, idx) => (
              <div key={idx} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 dark:border-ink-800 dark:bg-ink-900">
                <p className="text-[10px] font-semibold uppercase text-ink-400">{s.label}</p>
                <p className="truncate text-xs font-bold text-ink-800 dark:text-ink-100">{s.value}</p>
              </div>
            ))}
          </div>
        )}
        {m.chart && m.chart.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {m.chart.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-14 shrink-0 truncate text-[10px] font-semibold text-ink-500">{c.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-navy-500 to-teal-500 transition-all"
                    style={{ width: `${(c.value / c.max) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-end text-[10px] font-bold text-ink-700 dark:text-ink-200">{c.value}</span>
              </div>
            ))}
          </div>
        )}
        {m.taskItems && m.taskItems.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {m.taskItems.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  navigate(`/workflow/${x.id}`);
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white p-2.5 text-start transition-colors hover:border-navy-300 dark:border-ink-800 dark:bg-ink-900"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    x.sla === "breached"
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15"
                      : "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
                  )}
                >
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink-800 dark:text-ink-100">{x.docTitle}</p>
                  <p className="text-[10px] text-ink-400">
                    {x.step} · {x.due}
                  </p>
                </div>
                {x.sla === "breached" && (
                  <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{L("متجاوزة", "Breached")}</Badge>
                )}
              </button>
            ))}
          </div>
        )}
        {m.trashItems && m.trashItems.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {m.trashItems.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  navigate("/trash");
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white p-2.5 text-start transition-colors hover:border-navy-300 dark:border-ink-800 dark:bg-ink-900"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500 dark:bg-ink-800">
                  <Trash2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink-800 dark:text-ink-100">{x.title}</p>
                  <p className="text-[10px] text-ink-400">
                    {L("حذف نهائي:", "Purge:")} {x.purgeAt} · {x.deletedBy}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        {m.docs && m.docs.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {m.docs.slice(0, expanded ? m.docs.length : Math.min(4, m.docs.length)).map((d) => (
              <div
                key={d.id}
                className="group/doc flex items-center gap-2 rounded-xl border border-ink-200 bg-white p-2.5 transition-colors hover:border-navy-300 dark:border-ink-800 dark:bg-ink-900"
              >
                <FileIcon type={d.fileType} size="sm" />
                <button
                  onClick={() => {
                    navigate(`/documents/${d.id}`);
                    onClose();
                  }}
                  className="min-w-0 flex-1 text-start"
                >
                  <p className="truncate text-xs font-bold text-ink-800 dark:text-ink-100">{lang === "en" ? d.titleEn : d.title}</p>
                  <p className="text-[10px] text-ink-400">
                    {d.docNo} · {deptName(d.deptId, lang)}
                  </p>
                </button>
                <StatusBadge status={d.status} />
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/doc:opacity-100">
                  <Tooltip label={L("أرشفة", "Archive")}>
                    <button
                      onClick={() => {
                        archiveDocs([d.id], (ok) => {
                          if (ok) toast({ type: "success", title: L("تمت الأرشفة", "Archived"), message: d.title });
                        });
                      }}
                      className="rounded p-1 text-ink-400 hover:bg-navy-50 hover:text-navy-600 dark:hover:bg-navy-900"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                  </Tooltip>
                  <Tooltip label={L("توقيع", "Sign")}>
                    <button
                      onClick={async () => {
                        if (await signDocument(d.id, user?.name ?? ""))
                          toast({ type: "success", title: L("تم التوقيع", "Signed"), message: d.title });
                      }}
                      className="rounded p-1 text-ink-400 hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-900"
                    >
                      <PenLine className="h-3 w-3" />
                    </button>
                  </Tooltip>
                  <Tooltip label={L("حذف", "Delete")}>
                    <button
                      onClick={() => {
                        deleteDocs([d.id], (ok) => {
                          if (ok) toast({ type: "warning", title: L("نقل إلى السلة", "Moved to trash"), message: d.title });
                        });
                      }}
                      className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
            {m.docs.length > 4 && (
              <button
                onClick={() => onToggleExpand(i)}
                className="w-full rounded-lg border border-dashed border-ink-300 py-1.5 text-[11px] font-bold text-navy-600 transition-colors hover:bg-navy-50 dark:border-ink-600 dark:text-navy-300 dark:hover:bg-navy-900/40"
              >
                {expanded ? L("عرض أقل ▲", "Show less ▲") : L(`عرض الكل (${m.docs.length}) ▼`, `Show all (${m.docs.length}) ▼`)}
              </button>
            )}
          </div>
        )}
        {m.actions && m.actions.length > 0 && !m.streaming && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {m.actions.map((a, index) => (
              <button
                key={`${a.label}-${index}`}
                onClick={() => {
                  if (a.download) {
                    downloadCsv(a.download.filename, a.download.rows);
                    toast({
                      type: "success",
                      title: L("تم تنزيل CSV", "CSV downloaded"),
                      message: `${a.download.rows.length} ${L("صف", "rows")}`,
                    });
                    return;
                  }
                  if (a.to) navigate(a.to);
                  onClose();
                }}
                className="rounded-lg bg-navy-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-navy-700"
              >
                {a.label} ←
              </button>
            ))}
          </div>
        )}
        {m.actionCard && !m.streaming && (
          <div
            className={cn(
              "rounded-xl border p-3",
              m.actionCard.executed
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
            )}
          >
            {m.actionCard.executed ? (
              <p className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Check className="h-4 w-4" /> {L("تم التنفيذ بنجاح", "Executed successfully")}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">{L("بانتظار التأكيد", "Awaiting confirmation")}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="danger" className="h-7" onClick={() => onExecute(m.actionCard!, i)}>
                    {L("تنفيذ", "Execute")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => onCancel(i)}>
                    {L("إلغاء", "Cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {m.compare && !m.streaming && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { name: m.compare.left, stats: m.compare.leftStats },
              { name: m.compare.right, stats: m.compare.rightStats },
            ].map((side) => (
              <div key={side.name} className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
                <p className="mb-2 text-center text-xs font-extrabold text-navy-700 dark:text-navy-300">{side.name}</p>
                <div className="space-y-1.5">
                  {side.stats.map((s) => (
                    <div key={s.label} className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">{s.label}</span>
                      <span className="font-bold text-ink-800 dark:text-ink-100">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {m.followUps && !m.streaming && m.followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {m.followUps.map((fu) => (
              <button
                key={fu}
                onClick={() => onSend(fu)}
                className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-700 transition-colors hover:bg-navy-100 dark:border-navy-800 dark:bg-navy-900/40 dark:text-navy-200"
              >
                {fu} ←
              </button>
            ))}
          </div>
        )}
        {m.role === "ai" && !m.streaming && (
          <div className="flex items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
            <button
              onClick={() => rate(1)}
              aria-pressed={rating === 1}
              aria-label={L("تقييم إيجابي", "Helpful")}
              className={cn(
                "rounded p-1 transition-colors hover:bg-ink-100 hover:text-emerald-600 dark:hover:bg-ink-800",
                rating === 1 ? "text-emerald-600" : "text-ink-400",
              )}
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => rate(-1)}
              aria-pressed={rating === -1}
              aria-label={L("تقييم سلبي", "Not helpful")}
              className={cn(
                "rounded p-1 transition-colors hover:bg-ink-100 hover:text-rose-600 dark:hover:bg-ink-800",
                rating === -1 ? "text-rose-600" : "text-ink-400",
              )}
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
            <button
              onClick={() => copyText(m.text)}
              className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-navy-600 dark:hover:bg-ink-800"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
        <p className="pt-0.5 text-end text-[9px] text-ink-400/70">{m.time}</p>
      </div>
    </div>
  );
}

export function AssistantComposer({
  listening,
  thinking,
  value,
  inputRef,
  onChange,
  onToggleVoice,
  onSend,
}: {
  listening: boolean;
  thinking: boolean;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  onToggleVoice: () => void;
  onSend: () => void;
}) {
  const { lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <div className="relative border-t border-ink-100 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-l from-transparent via-navy-300 to-transparent dark:via-navy-700" />
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-2xl border-2 bg-ink-50 p-1 transition-all",
          listening
            ? "border-rose-300 shadow-[0_0_0_4px_rgba(244,63,94,0.08)]"
            : "border-ink-200 focus-within:border-navy-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.08)] dark:border-ink-700 dark:focus-within:border-navy-500 dark:focus-within:bg-ink-950",
        )}
      >
        <button
          onClick={onToggleVoice}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
            listening ? "bg-rose-500 text-white animate-pulse" : "text-ink-400 hover:bg-ink-100 hover:text-navy-600 dark:hover:bg-ink-800",
          )}
          aria-label={L("إدخال صوتي", "Voice input")}
          title={L("إدخال صوتي", "Voice input")}
        >
          {listening ? (
            <span className="flex h-3 w-3 items-center justify-center">
              <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white/60" />
              <span className="absolute h-2 w-2 rounded-full bg-white" />
            </span>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <input
          ref={inputRef}
          id="assistant-command"
          name="assistant-command"
          aria-label={L("أمر المساعد", "Assistant command")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder={listening ? L("🎙️ أتحدث…", "🎙️ Listening…") : L("اسأل أو أمِر…", "Ask or command…")}
          className="h-9 flex-1 bg-transparent text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none dark:text-ink-100"
        />
        <button
          onClick={() => onSend()}
          disabled={(!value.trim() && !listening) || thinking}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
            value.trim() && !thinking
              ? "bg-navy-600 text-white shadow-md shadow-navy-600/20 hover:bg-navy-700 active:scale-95"
              : "bg-ink-200 text-ink-400 dark:bg-ink-800",
          )}
          aria-label={L("إرسال", "Send")}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] text-ink-400/70">
        {L(
          "اكتب أو انطق 🎙️ — أفهم الأوامر: أرشف، احذف، وقّع، وافق، تراجع",
          "Type or speak 🎙️ — I understand: archive, delete, sign, approve, undo",
        )}
      </p>
    </div>
  );
}
