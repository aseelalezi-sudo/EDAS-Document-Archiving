import { useEffect, useRef, useState } from "react";
import { Bot, Sparkles, X } from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { deptName } from "../data";
import { config } from "../config";
import { cn } from "./ui";
import type { Document } from "../types";
import { AssistantComposer, AssistantHeader, AssistantMessage, AssistantWelcome } from "./assistant-parts";
import type { AIActionCard, AIMsg, Filters } from "./assistant-types";

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}

interface SpeechResultEvent {
  results: SpeechResultList;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export function AIAssistant() {
  const { lang, user, toast, t } = useApp();
  const {
    scopedDocs,
    tasks,
    auditLog,
    trash,
    visibleFolders,
    deleteDocs,
    archiveDocs,
    restoreDocs,
    signDocument,
    declareRecord,
    removeTask,
    employees: empStore,
    departments: deptStore,
  } = useDocsStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<AIMsg[]>([]);
  const [lastFilters, setLastFilters] = useState<Filters | null>(null);
  const [lastResults, setLastResults] = useState<Document[]>([]);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set());
  const [listening, setListening] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: string; ids: string[]; label: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  /* ---------- Voice input (Web Speech API) ---------- */
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as unknown as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        type: "warning",
        title: L("المتصفح لا يدعم الإدخال الصوتي", "Browser doesn't support voice input"),
        message: L("جرّب Chrome أو Edge", "Try Chrome or Edge"),
      });
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = lang === "ar" ? "ar-SA" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        send(transcript);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    toast({ type: "info", title: L("🎙️ أتحدث الآن…", "🎙️ Listening…") });
  };
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const now = () => new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "ar-SA", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, open]);

  const openTasks = tasks.filter((x) => x.status === "assigned" || x.status === "overdue");
  const overdueCount = openTasks.filter((x) => x.slaStatus === "breached").length;
  const nearingCount = scopedDocs.filter((d) => d.retentionDays < 30).length;

  const suggestions = [
    L("أرني العقود المعلقة", "Show pending contracts"),
    L("وافق على كل المهام", "Approve all tasks"),
    L("تحليل الاتجاهات", "Trend analysis"),
    L("أرشف المعتمدة", "Archive approved"),
    L("قارن المالية بالهندسة", "Compare Finance vs Engineering"),
    L("لخص وثيقة", "Summarize a document"),
    L("وثائق آخر أسبوع", "Documents from last week"),
    L("تراجع", "Undo last action"),
  ];

  /* ---------- Action engine (AI Agent) ---------- */
  const ACTION_VERBS: { keys: string[]; type: AIActionCard["type"]; label: string; icon: string }[] = [
    { keys: ["احذف", "حذف", "delete", "remove"], type: "delete", label: L("حذف", "Delete"), icon: "🗑️" },
    { keys: ["أرشف", "أرشفة", "ارشف", "archive"], type: "archive", label: L("أرشفة", "Archive"), icon: "📦" },
    { keys: ["وقّع", "وقع", "sign"], type: "sign", label: L("توقيع", "Sign"), icon: "✍️" },
    { keys: ["وافق", "موافقة", "approve"], type: "approve", label: L("موافقة", "Approve"), icon: "✅" },
    { keys: ["أعلن", "سجل رسمي", "declare"], type: "declare", label: L("إعلان سجل", "Declare record"), icon: "📜" },
  ];

  const parseActionTarget = (ql: string): { action: AIActionCard["type"]; targetDocs: Document[]; targetLabel: string } | null => {
    for (const verb of ACTION_VERBS) {
      if (verb.keys.some((k) => ql.includes(k))) {
        // Determine target from context
        const f = extractFilters(ql);
        let targetDocs: Document[];

        // "كل" = all filtered results
        if (ql.includes("كل") || ql.includes("all")) {
          targetDocs = fHas(f) ? applyFilters(f) : scopedDocs;
        }
        // "الأولى" / "الأول" = first from last results
        else if (ql.includes("الأولى") || ql.includes("الأول") || ql.includes("first")) {
          targetDocs = lastResults.slice(0, 1);
        }
        // "المعروضة" / "هذه" = last results
        else if (ql.includes("المعروضة") || ql.includes("هذه") || ql.includes("these") || ql.includes("shown")) {
          targetDocs = lastResults;
        }
        // Named document
        else {
          targetDocs = scopedDocs.filter((d) => d.title.includes(ql.replace(verb.keys[0], "").trim()) || ql.includes(d.title.slice(0, 8)));
          if (targetDocs.length === 0) targetDocs = applyFilters(f).slice(0, 5);
        }

        if (targetDocs.length > 0) {
          return {
            action: verb.type,
            targetDocs,
            targetLabel:
              targetDocs.length === 1
                ? lang === "en"
                  ? targetDocs[0].titleEn
                  : targetDocs[0].title
                : `${targetDocs.length} ${L("وثيقة", "documents")}`,
          };
        }
      }
    }
    return null;
  };

  const executeAction = async (card: AIActionCard, msgIdx: number) => {
    const ids = card.targetIds;
    setLastAction({ type: card.type, ids, label: card.targetLabel });
    const markExecuted = () =>
      setMessages((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, actionCard: { ...card, executed: true } } : m)));
    const runAll = (fn: (id: string) => Promise<boolean>) => Promise.all(ids.map((id) => fn(id))).then((oks) => oks.filter(Boolean).length);
    switch (card.type) {
      case "delete":
        deleteDocs(ids, (_ok, done) => {
          if (done === 0) return;
          toast({
            type: "warning",
            title:
              done === ids.length
                ? L(`تم نقل ${done} إلى السلة`, `Moved ${done} to trash`)
                : L(`نُقل ${done} من ${ids.length} إلى السلة`, `Moved ${done} of ${ids.length} to trash`),
            message: L("الاسترجاع من سلة المحذوفات خلال 30 يوماً", "Restore from the trash within 30 days"),
          });
          markExecuted();
        });
        break;
      case "archive":
        archiveDocs(ids, (_ok, done) => {
          if (done === 0) return;
          toast({
            type: "success",
            title:
              done === ids.length
                ? L(`تمت أرشفة ${done}`, `Archived ${done}`)
                : L(`أُرشفت ${done} من ${ids.length}`, `Archived ${done} of ${ids.length}`),
          });
          markExecuted();
        });
        break;
      case "sign": {
        const done = await runAll((id) => signDocument(id, user?.name ?? ""));
        if (done > 0) {
          toast({ type: "success", title: L(`تم توقيع ${done}`, `Signed ${done}`), message: user?.name });
          markExecuted();
        }
        break;
      }
      case "declare": {
        const done = await runAll((id) => declareRecord(id));
        if (done > 0) {
          toast({ type: "warning", title: L(`تم إعلان ${done} كسجل رسمي`, `Declared ${done} as official records`) });
          markExecuted();
        }
        break;
      }
      case "approve": {
        const done = await runAll((id) => removeTask(id));
        if (done > 0) {
          toast({ type: "success", title: L(`تمت الموافقة على ${done} مهام`, `Approved ${done} tasks`) });
          markExecuted();
        }
        break;
      }
    }
  };

  /* ---------- Date range filter ---------- */
  const parseDateRange = (ql: string): Filters["dateRange"] | undefined => {
    if (ql.includes("أسبوع") || ql.includes("week")) return "week";
    if (ql.includes("شهر") || ql.includes("month")) return "month";
    if (ql.includes("ربع") || ql.includes("quarter")) return "quarter";
    return undefined;
  };

  /* ---------- Compare departments ---------- */
  const isCompare = (ql: string) => ql.includes("قارن") || ql.includes("compare") || ql.includes("مقارنة");

  /* ---------- Summarize ---------- */
  const isSummarize = (ql: string) => ql.includes("لخص") || ql.includes("summarize") || ql.includes("ملخص");

  const statusLabel = (s: string) =>
    s === "pending"
      ? L("معلقة", "pending")
      : s === "draft"
        ? L("مسودة", "drafts")
        : s === "approved"
          ? L("معتمدة", "approved")
          : s === "archived"
            ? L("مؤرشفة", "archived")
            : s === "hold"
              ? L("محجوزة", "on hold")
              : s;

  const fHas = (f: Filters | null) =>
    !!f && !!(f.depts?.length || f.status || f.categories?.length || f.person || f.classification || f.sig || f.record || f.year);

  const extractFilters = (ql: string): Filters => {
    const f: Filters = {};
    const deptMap: [string[], string][] = [
      [["المالي", "fin"], "fin"],
      [["الهندس", "هندسي", "eng"], "eng"],
      [["البشري", "hr"], "hr"],
      [["تقنية", "it"], "it"],
      [["القانون", "legal"], "legal"],
      [["المشتريات", "شراء", "proc"], "proc"],
      [["التنفيذ", "exec"], "exec"],
      [["المشاريع", "pmo"], "pmo"],
    ];
    const depts: string[] = [];
    for (const [keys, id] of deptMap) if (keys.some((k) => ql.includes(k))) depts.push(id);
    if (depts.length) f.depts = depts;
    if (ql.includes("معلق") || ql.includes("pending")) f.status = "pending";
    else if (ql.includes("مسود") || ql.includes("draft")) f.status = "draft";
    else if (ql.includes("معتمد") || ql.includes("approved")) f.status = "approved";
    else if (ql.includes("مؤرشف") || ql.includes("archived")) f.status = "archived";
    const cats: string[] = [];
    if (ql.includes("عقد") || ql.includes("contract")) cats.push("عقد");
    if (ql.includes("تقرير") || ql.includes("report")) cats.push("تقرير");
    if (ql.includes("شراء") || ql.includes("purchase")) cats.push("شراء");
    if (ql.includes("مخطط") || ql.includes("drawing")) cats.push("مخطط");
    if (ql.includes("مراسل") || ql.includes("mail")) cats.push("مراسل");
    if (ql.includes("محضر") || ql.includes("minutes")) cats.push("محضر");
    if (ql.includes("سياس") || ql.includes("policy")) cats.push("سياسة");
    if (cats.length) f.categories = cats;
    if ((ql.includes("سري") && !ql.includes("شديد")) || ql.includes("confidential")) f.classification = "confidential";
    if (ql.includes("مقيد") || ql.includes("restricted")) f.classification = "restricted";
    if (ql.includes("موقعة") || ql.includes("موقّعة") || ql.includes("signed")) f.sig = true;
    if (ql.includes("سجل رسمي") || ql.includes("official record")) f.record = true;
    const yearMatch = ql.match(/(20\d{2})/);
    if (yearMatch) f.year = yearMatch[1];
    const owners = new Set(scopedDocs.map((d) => d.owner));
    for (const o of owners)
      if (ql.includes(o) || (o.split(" ")[0].length > 2 && ql.includes(o.split(" ")[0]))) {
        f.person = o;
        break;
      }
    return f;
  };

  const clean = (o: Filters): Filters =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v && (!Array.isArray(v) || v.length))) as Filters;

  const applyFilters = (f: Filters) => {
    let list = scopedDocs;
    if (f.depts) list = list.filter((d) => f.depts!.includes(d.deptId));
    if (f.status) list = list.filter((d) => d.status === f.status);
    if (f.categories)
      list = list.filter((d) => f.categories!.some((c) => d.category.includes(c) || d.categoryEn.toLowerCase().includes(c.toLowerCase())));
    if (f.classification) list = list.filter((d) => d.classification === f.classification);
    if (f.person) list = list.filter((d) => d.owner === f.person);
    if (f.sig) list = list.filter((d) => d.signatureStatus === "signed");
    if (f.record) list = list.filter((d) => d.declaredRecord);
    if (f.year) list = list.filter((d) => d.docNo.includes(f.year!) || d.createdAt.includes(f.year!) || d.retentionEnd.includes(f.year!));
    return list;
  };

  const answer = (q: string): Omit<AIMsg, "role" | "time"> => {
    const ql = q.toLowerCase();
    const isCount = ql.includes("كم") || ql.includes("عدد") || ql.includes("how many");
    const isGenericTotal =
      ql.includes("كم وثيقة") || ql.includes("how many documents") || ql.includes("إجمالي") || ql.includes("total") || ql.includes("الكل");
    const isTasks = ql.includes("مهام") || ql.includes("task");
    const isAudit =
      ql.includes("تدقيق") || ql.includes("audit") || ql.includes("ماذا فعلت") || ql.includes("سجل عمليات") || ql.includes("recent action");
    const isHelp = ql.includes("مساعدة") || ql.includes("help") || ql.includes("ماذا تستطيع") || ql.includes("what can you");
    const isTrash = ql.includes("المحذوفات") || ql.includes("السلة") || ql.includes("trash");
    const isLocked = ql.includes("محجوز") || ql.includes("مقفل") || ql.includes("checked out") || ql.includes("locked");
    const isDeptInfo = ql.includes("أخبرني عن") || ql.includes("نبذة") || ql.includes("tell me about");
    const isWho = ql.includes("من هو") || ql.includes("من هي") || ql.includes("who is");
    const isRecent = ql.includes("أحدث") || ql.includes("حديث") || ql.includes("recent") || ql.includes("latest");

    /* ---- Batch task approval ---- */
    const isBatchApprove =
      (ql.includes("وافق") || ql.includes("approve")) &&
      (ql.includes("كل") || ql.includes("all")) &&
      (ql.includes("مهام") || ql.includes("task"));
    if (isBatchApprove) {
      const myTasks = openTasks;
      if (myTasks.length === 0)
        return { text: L("لا توجد مهام للموافقة عليها.", "No tasks to approve."), followUps: suggestions.slice(0, 3) };
      return {
        text: L(`${myTasks.length} مهام — سأوافق عليها كلها دفعة واحدة:`, `${myTasks.length} tasks — I'll approve them all at once:`),
        actionCard: { type: "approve", targetIds: myTasks.map((x) => x.id), targetLabel: `${myTasks.length} ${L("مهام", "tasks")}` },
        taskItems: myTasks.slice(0, 4).map((x) => ({ id: x.id, docTitle: x.docTitle, step: x.step, due: x.due, sla: x.slaStatus })),
        followUps: [L("المهام المتأخرة", "Overdue tasks"), L("كم وثيقة لدي؟", "How many documents?")],
      };
    }

    /* ---- Undo last action ---- */
    if (ql.includes("تراجع") || ql.includes("undo") || ql.includes("استرجع")) {
      if (lastAction) {
        if (lastAction.type === "delete") {
          return {
            text: L(`أسترجع ${lastAction.label} من سلة المحذوفات الآن…`, `Restoring ${lastAction.label} from the trash now…`),
            undoIds: lastAction.ids,
            followUps: [L("المحذوفات", "Trash"), L("مهامي", "My tasks")],
          };
        }
        return {
          text: L(
            `آخر عملية: ${lastAction.label}. لا يوفّر التطبيق إعادة فتح من الواجهة — الأرشيف حالة نهائية في الشاشات الحالية.`,
            `Last action: ${lastAction.label}. The app has no reopen control; archiving is final in the current screens.`,
          ),
          followUps: suggestions.slice(0, 3),
        };
      }
      return { text: L("لا توجد عملية حديثة للتراجع عنها.", "No recent action to undo."), followUps: suggestions.slice(0, 3) };
    }

    /* ---- Content search (inside documents) ---- */
    if (ql.includes("ابحث عن") || ql.includes("في المحتوى") || ql.includes("في النص") || ql.includes("content")) {
      const searchTerm = ql.replace(/ابحث عن|في المحتوى|في النص|content|search for/gi, "").trim();
      if (searchTerm.length > 2) {
        const matched = scopedDocs.filter((d) => (d.content ?? "").includes(searchTerm) || d.description.includes(searchTerm));
        return {
          text: matched.length
            ? L(
                `${matched.length} وثيقة تحتوي «${searchTerm}» في المحتوى:`,
                `${matched.length} documents containing "${searchTerm}" in content:`,
              )
            : L(
                `لم أجد «${searchTerm}» في محتوى أي وثيقة ضمن صلاحياتك.`,
                `Couldn't find "${searchTerm}" in any document content within your scope.`,
              ),
          docs: matched.slice(0, 5),
          followUps: [L("لخص الأولى", "Summarize first"), L("كم العدد؟", "How many?")],
        };
      }
    }

    /* ---- Trend analysis ---- */
    if (ql.includes("اتجاه") || ql.includes("trend") || ql.includes("تحليل") || ql.includes("نمو") || ql.includes("growth")) {
      const total = scopedDocs.length;
      const pending = scopedDocs.filter((d) => d.status === "pending").length;
      const approved = scopedDocs.filter((d) => d.status === "approved").length;
      const archived = scopedDocs.filter((d) => d.status === "archived").length;
      const signed = scopedDocs.filter((d) => d.signatureStatus === "signed").length;
      const nearing = scopedDocs.filter((d) => d.retentionDays < 30).length;
      const approveRate = total > 0 ? Math.round((approved / total) * 100) : 0;
      const signRate = total > 0 ? Math.round((signed / total) * 100) : 0;
      return {
        text: L("📊 تحليل اتجاهات مستودعك:", "📊 Repository trend analysis:"),
        stats: [
          { label: L("نسبة الاعتماد", "Approval rate"), value: `${approveRate}%` },
          { label: L("نسبة التوقيع", "Signature rate"), value: `${signRate}%` },
          { label: L("معلقة", "Pending"), value: pending },
          { label: L("مؤرشفة", "Archived"), value: archived },
          { label: L("قرب الإتلاف", "Nearing disposal"), value: nearing },
          { label: L("الإجمالي", "Total"), value: total },
        ],
        chart: [
          { label: L("معتمدة", "Approved"), value: approved, max: total },
          { label: L("معلقة", "Pending"), value: pending, max: total },
          { label: L("مؤرشفة", "Archived"), value: archived, max: total },
          { label: L("موقعة", "Signed"), value: signed, max: total },
        ],
        followUps: [L("أرشف المعتمدة", "Archive approved"), L("وافق على كل المهام", "Approve all tasks")],
      };
    }

    /* ---- Export from chat: a real CSV of the current result set ---- */
    if (ql.includes("صدّر") || ql.includes("export") || ql.includes("تصدير")) {
      const exportDocs = lastResults.length ? lastResults : scopedDocs;
      if (!exportDocs.length) {
        return {
          text: L("لا توجد وثائق في نطاقك لتصديرها.", "There are no documents in your scope to export."),
          followUps: suggestions.slice(0, 3),
        };
      }
      const rows = exportDocs.map((d) => ({
        docNo: d.docNo,
        title: lang === "en" ? d.titleEn : d.title,
        category: lang === "en" ? d.categoryEn : d.category,
        department: deptName(d.deptId, lang),
        owner: lang === "en" ? d.ownerEn : d.owner,
        version: d.version,
        status: d.status,
        size: d.size,
        created: d.createdAt,
        modified: d.modifiedAt,
      }));
      return {
        text: L(
          `📤 جاهز لتصدير ${rows.length} وثيقة إلى CSV. تصدير PDF وExcel متاح لتقارير الخادم من مركز التقارير.`,
          `📤 Ready to export ${rows.length} documents to CSV. PDF and Excel export is available for server reports in the reports center.`,
        ),
        actions: [{ label: L("تنزيل CSV", "Download CSV"), download: { filename: "edas-documents", rows } }],
        followUps: [L("أرني النتائج", "Show results"), L("مهامي", "My tasks")],
      };
    }

    /* ---- Sharing is set on the document page, not from chat ---- */
    if (ql.includes("شارك") || ql.includes("مشاركة") || ql.includes("share")) {
      const f = extractFilters(ql);
      const pool = fHas(f) ? applyFilters(f) : lastResults.length ? lastResults : scopedDocs;
      const target = pool[0];
      return {
        text: target
          ? L(
              `الصلاحيات لا تُمنح من المحادثة. افتح «${target.title}» واضبط الوصول من لوحة الصلاحيات في صفحة الوثيقة.`,
              `Permissions are not granted from chat. Open "${target.titleEn}" and set access in the permissions panel on the document page.`,
            )
          : L(
              "لم أحدد وثيقة للمشاركة — اذكر عنوانها أو ابحث عنها أولاً.",
              "I could not identify a document to share — name one or search first.",
            ),
        actions: target ? [{ label: L("فتح الوثيقة", "Open document"), to: `/documents/${target.id}` }] : [],
        followUps: [L("مهامي", "My tasks"), L("أرني النتائج", "Show results")],
      };
    }

    /* ---- AI AGENT: Action commands (delete/archive/sign/approve/declare) ---- */
    const actionTarget = parseActionTarget(ql);
    if (actionTarget) {
      const verb = ACTION_VERBS.find((v) => v.type === actionTarget.action)!;
      const needsConfirm = actionTarget.action === "delete" || actionTarget.action === "declare";
      return {
        text: needsConfirm
          ? L(
              `${verb.icon} هل أنت متأكد من ${verb.label} «${actionTarget.targetLabel}»؟ لا يمكن التراجع بسهولة.`,
              `${verb.icon} Are you sure you want to ${verb.label.toLowerCase()} "${actionTarget.targetLabel}"? This is hard to undo.`,
            )
          : L(
              `${verb.icon} سأقوم بـ${verb.label} «${actionTarget.targetLabel}». اضغط للتأكيد.`,
              `${verb.icon} I'll ${verb.label.toLowerCase()} "${actionTarget.targetLabel}". Tap to confirm.`,
            ),
        actionCard: {
          type: actionTarget.action,
          targetIds: actionTarget.targetDocs.map((d) => d.id),
          targetLabel: actionTarget.targetLabel,
        },
        docs: actionTarget.targetDocs.slice(0, 3),
        followUps: [L("أرني النتائج", "Show results"), L("مهامي", "My tasks")],
      };
    }

    /* ---- Compare departments ---- */
    if (isCompare(ql)) {
      const f = extractFilters(ql);
      const deptsFound = f.depts ?? [];
      if (deptsFound.length >= 2) {
        const [d1, d2] = deptsFound;
        const l1 = scopedDocs.filter((d) => d.deptId === d1);
        const l2 = scopedDocs.filter((d) => d.deptId === d2);
        const statFor = (list: Document[]) => [
          { label: L("الوثائق", "Docs"), value: list.length },
          { label: L("معلقة", "Pending"), value: list.filter((d) => d.status === "pending").length },
          { label: L("معتمدة", "Approved"), value: list.filter((d) => d.status === "approved").length },
          { label: L("مؤرشفة", "Archived"), value: list.filter((d) => d.status === "archived").length },
        ];
        return {
          text: L(`مقارنة ${deptName(d1, lang)} مع ${deptName(d2, lang)}:`, `Comparing ${deptName(d1, lang)} vs ${deptName(d2, lang)}:`),
          compare: { left: deptName(d1, lang), right: deptName(d2, lang), leftStats: statFor(l1), rightStats: statFor(l2) },
          followUps: [L(`وثائق ${deptName(d1, lang)}`, `${deptName(d1, lang)} documents`), L("كم وثيقة لدي؟", "How many?")],
        };
      }
    }

    /* ---- Summarize ---- */
    if (isSummarize(ql)) {
      // Find target: from context or first result
      let target: Document | undefined;
      if (ql.includes("الأولى") || ql.includes("الأول") || lastResults.length > 0) {
        target = lastResults[0];
      } else {
        const f = extractFilters(ql);
        target = fHas(f) ? applyFilters(f)[0] : scopedDocs[0];
      }
      if (target) {
        const summaryPoints = [
          L(`📄 العنوان: ${lang === "en" ? target.titleEn : target.title}`, `📄 Title: ${lang === "en" ? target.titleEn : target.title}`),
          L(
            `📁 التصنيف: ${target.category} | القسم: ${deptName(target.deptId, lang)}`,
            `📁 Category: ${target.categoryEn} | Dept: ${deptName(target.deptId, lang)}`,
          ),
          L(`👤 المالك: ${target.owner} | الإصدار: ${target.version}`, `👤 Owner: ${target.ownerEn} | Version: ${target.version}`),
          L(
            `📅 الإنشاء: ${target.createdAt} | آخر تعديل: ${target.modifiedAt}`,
            `📅 Created: ${target.createdAt} | Modified: ${target.modifiedAt}`,
          ),
          L(
            `🔐 السرية: ${t(`doc.classification.${target.classification}`)} | الحالة: ${statusLabel(target.status)}`,
            `🔐 Classification: ${target.classification} | Status: ${target.status}`,
          ),
          L(
            `💾 الحجم: ${target.size} | الاحتفاظ ينتهي: ${target.retentionEnd} (${target.retentionDays} ${L("يوم", "days")})`,
            `💾 Size: ${target.size} | Retention ends: ${target.retentionEnd} (${target.retentionDays} days)`,
          ),
          target.signatureStatus === "signed"
            ? L(`✍️ موقّعة إلكترونياً بواسطة ${target.signedBy}`, `✍️ E-signed by ${target.signedBy}`)
            : "",
        ].filter(Boolean);
        return {
          text: L(`📋 ملخص الوثيقة:`, `📋 Document summary:`),
          stats: summaryPoints.map((s) => ({ label: s.split(":")[0], value: s.split(":").slice(1).join(":").trim() })),
          docs: [target],
          actions: [
            { label: L("فتح التفاصيل", "Open details"), to: `/documents/${target.id}` },
            { label: L("معاينة", "Preview"), to: `/documents/${target.id}/preview` },
          ],
          followUps: [L("أرشف هذه الوثيقة", "Archive this document"), L("وقّع هذه الوثيقة", "Sign this document")],
        };
      }
    }

    /* ---- Date range ---- */
    const dateRange = parseDateRange(ql);
    if (dateRange) {
      const days = dateRange === "week" ? 7 : dateRange === "month" ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      const matched = scopedDocs.filter((d) => d.modifiedAt >= cutoffStr);
      return {
        text: L(
          `${matched.length} وثيقة ${dateRange === "week" ? "خلال آخر أسبوع" : dateRange === "month" ? "خلال آخر 30 يوم" : "خلال آخر ربع"} (عدّلت بعد ${cutoffStr}):`,
          `${matched.length} documents ${dateRange === "week" ? "in the last week" : dateRange === "month" ? "in the last 30 days" : "in the last quarter"} (modified after ${cutoffStr}):`,
        ),
        docs: matched.slice(0, 5),
        followUps: [L("كم العدد؟", "How many?"), L("أحدث الوثائق", "Recent documents")],
      };
    }

    if (isHelp) {
      return {
        text: L(
          "أستطيع الإجابة عن وثائقك ومهامك وزملائك ونشاطك — من بياناتك الفعلية، وأتذكر سياق محادثتنا. جرّب:",
          "I can answer about your documents, tasks, colleagues, and activity — from your actual data, and I remember our conversation. Try:",
        ),
        stats: [
          { label: L("مركّب", "Compound"), value: L("«عقود وتقارير المالية»", "“Finance contracts & reports”") },
          { label: L("المتابعة", "Follow-up"), value: L("«المعتمدة منها؟»", "“Approved ones?”") },
          { label: L("بالسنة", "By year"), value: L("«عقود 2026»", "“2026 contracts”") },
          { label: L("الأشخاص", "People"), value: L("«من هو أحمد؟»", "“Who is Ahmad?”") },
          { label: L("الأحدث", "Recent"), value: L("«أحدث الوثائق»", "“Recent documents”") },
          { label: L("النشاط", "Activity"), value: L("«سجل عملياتي»", "“My recent actions”") },
        ],
        followUps: [L("مهامي", "My tasks"), L("أحدث الوثائق", "Recent documents")],
      };
    }

    if (isTasks) {
      const filtered = ql.includes("متأخر") || ql.includes("overdue") ? openTasks.filter((x) => x.slaStatus === "breached") : openTasks;
      return {
        text: filtered.length
          ? L(
              `لديك ${filtered.length} مهام موافقة معلقة${ql.includes("متأخر") || ql.includes("overdue") ? " (متجاوزة SLA)" : ""}:`,
              `You have ${filtered.length} pending approval tasks${ql.includes("overdue") ? " (SLA breached)" : ""}:`,
            )
          : L("لا توجد مهام معلقة. عمل رائع! 🎉", "No pending tasks. Great job! 🎉"),
        taskItems: filtered.slice(0, 4).map((x) => ({ id: x.id, docTitle: x.docTitle, step: x.step, due: x.due, sla: x.slaStatus })),
        actions: [{ label: L("فتح المهام", "Open tasks"), to: "/workflow/my-tasks" }],
        followUps: [L("المتأخرة فقط", "Overdue only"), L("كم وثيقة لدي؟", "How many documents?")],
      };
    }

    if (isAudit) {
      const recent = auditLog.slice(0, 6);
      const trailNote = config.useApi
        ? L("والسجل الرسمي غير القابل للتعديل في شاشة سجل التدقيق", "the immutable trail is on the audit-trail screen")
        : L("محفوظة في هذا المتصفح في وضع العرض", "kept in this browser in demo mode");
      return {
        text: recent.length
          ? L(
              `آخر ${recent.length} عمليات من جلستك (${trailNote}):`,
              `Your last ${recent.length} actions from this session (${trailNote}):`,
            )
          : L(
              "لا توجد عمليات مسجلة في هذه الجلسة بعد. جرّب أرشفة أو توقيع وثيقة ثم اسألني.",
              "No actions recorded in this session yet. Try archiving or signing a document first.",
            ),
        stats: recent.map((a) => ({ label: a.datetime.slice(-5), value: a.action })),
        actions: [{ label: L("فتح سجل التدقيق", "Open audit trail"), to: "/reports/audit-trail" }],
        followUps: [L("مهامي", "My tasks"), L("وثائق قاربت على الإتلاف", "Nearing disposal")],
      };
    }

    if (isWho) {
      const emp = empStore.items.find((e) => ql.includes(e.name) || (e.name.split(" ")[0].length > 2 && ql.includes(e.name.split(" ")[0])));
      if (emp) {
        return {
          text: `${emp.name} — ${lang === "en" ? emp.jobTitleEn : emp.jobTitle} (${emp.empNo})`,
          stats: [
            { label: L("القسم", "Department"), value: deptStore.items.find((d) => d.id === emp.deptId)?.name ?? "—" },
            { label: L("المدير المباشر", "Manager"), value: emp.manager },
            { label: L("البريد", "Email"), value: emp.email },
            { label: L("الهاتف", "Phone"), value: emp.phone },
          ],
          actions: [{ label: L("الملف الكامل", "Full profile"), to: `/org/employees/${emp.id}` }],
          followUps: [L(`وثائق ${emp.name.split(" ")[0]}`, `${emp.name.split(" ")[0]}'s documents`), L("مهامي", "My tasks")],
        };
      }
      return {
        text: L("لم أجد هذا الشخص في دليل الموظفين.", "I couldn't find this person in the employee directory."),
        followUps: suggestions.slice(0, 3),
      };
    }

    if (isTrash) {
      return {
        text: trash.length
          ? L(
              `${trash.length} عنصر في سلة المحذوفات (قابل للاستعادة قبل الحذف النهائي):`,
              `${trash.length} items in the trash (restorable before permanent deletion):`,
            )
          : L("السلة فارغة حالياً.", "The trash is currently empty."),
        trashItems: trash.slice(0, 4).map((x) => ({ id: x.doc.id, title: x.doc.title, deletedBy: x.deletedBy, purgeAt: x.purgeAt })),
        actions: [{ label: L("فتح السلة", "Open trash"), to: "/trash" }],
        followUps: [L("سجل عملياتي", "My recent actions"), L("مهامي", "My tasks")],
      };
    }

    if (isDeptInfo) {
      const deptId = extractFilters(ql).depts?.[0];
      if (deptId) {
        const dd = scopedDocs.filter((d) => d.deptId === deptId);
        const foldersN = visibleFolders.filter((f) => f.owner === deptId).length;
        return {
          text: `${deptName(deptId, lang)} — ${L("نبذة سريعة:", "quick overview:")}`,
          stats: [
            { label: L("الوثائق", "Documents"), value: dd.length },
            { label: L("المجلدات", "Folders"), value: foldersN },
            { label: L("معلقة", "Pending"), value: dd.filter((d) => d.status === "pending").length },
            { label: L("مؤرشفة", "Archived"), value: dd.filter((d) => d.status === "archived").length },
          ],
          actions: [{ label: L("استعراض المكتبة", "Browse library"), to: "/library" }],
          followUps: [L(`وثائق ${deptName(deptId, lang)}`, `${deptName(deptId, lang)} documents`), L("كم وثيقة لدي؟", "How many?")],
        };
      }
    }

    const extracted = extractFilters(ql);
    const isFollowUpPattern = ql.includes("منها") || ql.includes("منهم") || ql.includes("of them");
    const onlyDept =
      (extracted.depts?.length ?? 0) === 1 &&
      !extracted.status &&
      !extracted.categories &&
      !extracted.person &&
      !extracted.sig &&
      !extracted.record &&
      !extracted.year;
    const onlyStatus =
      !!extracted.status && !extracted.depts && !extracted.categories && !extracted.person && !extracted.sig && !extracted.year;
    const hasCtx = !!(lastFilters?.categories?.length || lastFilters?.person || lastFilters?.depts?.length);

    let f = extracted;
    if (isFollowUpPattern && lastFilters) f = { ...lastFilters, ...clean(extracted) };
    else if (onlyDept && hasCtx) f = { ...lastFilters!, depts: extracted.depts };
    else if (onlyStatus && hasCtx) f = { ...lastFilters!, status: extracted.status };
    else if (isCount && !isGenericTotal && !fHas(extracted) && !isFollowUpPattern && lastFilters) f = lastFilters;

    if (fHas(f)) setLastFilters(f);
    const hasFilters = fHas(f);
    let matched = hasFilters ? applyFilters(f) : [];

    if (isRecent) {
      const sorted = [...(hasFilters ? matched : scopedDocs)].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      return {
        text: L(
          `أحدث ${Math.min(5, sorted.length)} وثيقة${hasFilters ? " (حسب سياق محادثتك)" : ""} — مرتبة بآخر تعديل:`,
          `Most recent ${Math.min(5, sorted.length)} documents${hasFilters ? " (per your context)" : ""} — by last modified:`,
        ),
        docs: sorted.slice(0, 5),
        followUps: [L("كم العدد؟", "How many?"), L("مهامي", "My tasks")],
      };
    }

    if (isLocked) matched = (hasFilters ? matched : scopedDocs).filter((d) => d.checkedOutBy);

    if (isGenericTotal && !hasFilters) matched = scopedDocs;
    else if (!hasFilters && !isLocked) {
      if (ql.includes("احتفاظ") || ql.includes("إتلاف") || ql.includes("retention") || ql.includes("disposal"))
        matched = scopedDocs.filter((d) => d.retentionDays < 30);
      else if (ql.includes("توقيع") || ql.includes("sign")) matched = scopedDocs.filter((d) => d.signatureStatus === "signed");
      else
        matched = scopedDocs
          .filter((d) => d.title.includes(q) || d.titleEn.toLowerCase().includes(ql) || (d.content ?? "").includes(q))
          .slice(0, 8);
    }

    const scopeDesc = [
      f.depts?.length ? f.depts.map((d) => deptName(d, lang)).join(" · ") : null,
      f.status ? statusLabel(f.status) : null,
      f.categories?.length ? f.categories.join(" · ") : null,
      f.person ?? null,
      f.year ?? null,
      f.sig ? L("موقعة", "signed") : null,
      f.record ? L("سجل رسمي", "official record") : null,
      isLocked ? L("محجوزة للتحرير", "checked out") : null,
    ]
      .filter(Boolean)
      .join(" · ");

    if (isCount) {
      const byStatus: Record<string, number> = {};
      matched.forEach((d) => {
        byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      });
      const entries = Object.entries(byStatus);
      const max = Math.max(...entries.map(([, v]) => v), 1);
      return {
        text: matched.length
          ? L(
              `${matched.length} وثيقة مطابقة${scopeDesc ? ` — ${scopeDesc}` : ""}${matched.length < scopedDocs.length ? ` (من أصل ${scopedDocs.length} متاحة لك)` : ""}.`,
              `${matched.length} documents match${scopeDesc ? ` — ${scopeDesc}` : ""}${matched.length < scopedDocs.length ? ` (of ${scopedDocs.length} available to you)` : ""}.`,
            )
          : L(
              `لا توجد وثائق مطابقة${scopeDesc ? ` — ${scopeDesc}` : ""} في نطاق صلاحياتك.`,
              `No documents match${scopeDesc ? ` — ${scopeDesc}` : ""} within your permission scope.`,
            ),
        chart: entries.map(([k, v]) => ({ label: statusLabel(k), value: v, max })),
        followUps: matched.length > 0 ? [L("أرني المعلقة منها", "Show pending ones"), L("مهامي", "My tasks")] : suggestions.slice(0, 3),
      };
    }

    if (matched.length === 0) {
      return {
        text: L(
          `لم أجد نتائج${scopeDesc ? ` لـ«${scopeDesc}»` : ` لـ«${q}»`}. جرّب: عقود، معلقة، المالية، أحدث، المحذوفات، أو مهامي.`,
          `No results${scopeDesc ? ` for “${scopeDesc}”` : ` for “${q}”`}. Try: contracts, pending, Finance, recent, trash, or my tasks.`,
        ),
        followUps: suggestions.slice(0, 3),
      };
    }

    return {
      text: L(
        `${matched.length} وثيقة${scopeDesc ? ` — ${scopeDesc}` : ""}:`,
        `${matched.length} documents${scopeDesc ? ` — ${scopeDesc}` : ""}:`,
      ),
      docs: matched.slice(0, 10),
      followUps: [
        f.status === "pending" ? L("المعتمدة منها", "Approved ones") : L("المعلقة منها", "Pending ones"),
        L("كم العدد؟", "How many?"),
      ],
    };
  };

  const send = (q?: string) => {
    const query = (q ?? input).trim();
    if (!query || thinking) return;
    setMessages((prev) => [...prev, { role: "user", text: query, time: now() }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      const res = answer(query);
      setThinking(false);
      // Track last results for action context
      if (res.docs && res.docs.length > 0) setLastResults(res.docs);
      setMessages((prev) => [...prev, { role: "ai", text: "", time: now(), streaming: true }]);
      const words = res.text.split(" ");
      let i = 0;
      const timer = window.setInterval(() => {
        i++;
        const partial = words.slice(0, i).join(" ");
        setMessages((prev) => prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, text: partial } : m)));
        if (i >= words.length) {
          window.clearInterval(timer);
          setMessages((prev) =>
            prev.map((m, idx) =>
              idx === prev.length - 1
                ? {
                    ...m,
                    docs: res.docs,
                    taskItems: res.taskItems,
                    trashItems: res.trashItems,
                    stats: res.stats,
                    chart: res.chart,
                    followUps: res.followUps,
                    actions: res.actions,
                    actionCard: res.actionCard,
                    compare: res.compare,
                    streaming: false,
                  }
                : m,
            ),
          );
          if (res.undoIds?.length) {
            void restoreDocs(res.undoIds).then((ok) => {
              if (ok) setLastAction(null);
              setMessages((prev) => [
                ...prev,
                {
                  role: "ai",
                  text: ok
                    ? L("تم استرجاع الوثائق من السلة.", "Restored the documents from the trash.")
                    : L(
                        "تعذّر الاسترجاع؛ قد تكون الوثائق عادت أو حُذفت نهائياً. افتح السلة للتحقق.",
                        "Restore failed; the documents may already be back or permanently removed. Open the trash to check.",
                      ),
                  actions: ok
                    ? [{ label: L("فتح الوثائق", "Open documents"), to: "/documents" }]
                    : [{ label: L("فتح السلة", "Open trash"), to: "/trash" }],
                  time: now(),
                },
              ]);
            });
          }
        }
      }, 35);
    }, 700);
  };

  const toggleExpand = (idx: number) =>
    setExpandedMsgs((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-500 via-navy-600 to-navy-700 text-white shadow-glow transition-all hover:scale-105 active:scale-95",
          open && "rotate-90",
        )}
        aria-label={L("المساعد الذكي", "AI Assistant")}
        title={L("المساعد الذكي", "AI Assistant")}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-6 w-6" />}
      </button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-[45] bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside
            className="assistant-in fixed bottom-24 end-5 z-[46] flex max-h-[min(70vh,640px)] w-[min(26rem,92vw)] flex-col overflow-hidden rounded-3xl border border-ink-200/80 bg-white shadow-float dark:border-ink-700/80 dark:bg-ink-900"
            style={{ top: "auto" }}
          >
            <AssistantHeader
              hasMessages={messages.length > 0}
              onReset={() => {
                setMessages([]);
                setLastFilters(null);
                setLastResults([]);
                setExpandedMsgs(new Set());
              }}
            />
            <div className="flex-1 space-y-3 overflow-y-auto bg-ink-50/50 p-4 dark:bg-ink-950/30">
              {messages.length === 0 && (
                <AssistantWelcome overdueCount={overdueCount} nearingCount={nearingCount} suggestions={suggestions} onSend={send} />
              )}
              {messages.map((m, i) => (
                <AssistantMessage
                  key={i}
                  m={m}
                  i={i}
                  expanded={expandedMsgs.has(i)}
                  onToggleExpand={toggleExpand}
                  onExecute={executeAction}
                  onCancel={(idx) =>
                    setMessages((prev) =>
                      prev.map((mm, ii) => (ii === idx ? { ...mm, actionCard: { ...mm.actionCard!, executed: true } } : mm)),
                    )
                  }
                  onSend={send}
                  onClose={() => setOpen(false)}
                />
              ))}
              {thinking && (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-navy-100 to-navy-50 text-navy-500 shadow-soft dark:from-navy-900 dark:to-navy-800">
                    <Bot className="h-4 w-4 animate-pulse" />
                  </span>
                  <div className="flex items-center gap-1 rounded-2xl rounded-ss-md border border-ink-100 bg-white px-4 py-2.5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-navy-400 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-navy-400 [animation-delay:240ms]" />
                    <span className="ms-1 text-xs text-ink-400">{L("يفكر…", "Thinking…")}</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <AssistantComposer
              listening={listening}
              thinking={thinking}
              value={input}
              inputRef={inputRef}
              onChange={setInput}
              onToggleVoice={toggleVoice}
              onSend={() => send()}
            />
          </aside>
        </>
      )}
    </>
  );
}
