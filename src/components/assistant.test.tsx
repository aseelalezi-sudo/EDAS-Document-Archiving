import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import { config } from "../config";
import type { Document } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { AIAssistant } from "./assistant";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
    return text;
  };
}

const base = {
  sectionId: "sec-1",
  ownerEn: "Amal",
  tags: [],
  description: "",
  descriptionEn: "",
  versions: [],
  activity: [],
  categoryEn: "Contract",
  categoryId: "contract",
  version: "1.0",
  size: "1.0 MB",
  sizeBytes: 1048576,
  fileType: "pdf" as const,
  folderId: "root",
  retentionEnd: "2031-01-01",
  createdAt: "2026-01-01",
  modifiedAt: "2026-11-01",
};

function doc(id: string, patch: Partial<Document>): Document {
  return {
    ...base,
    id,
    docNo: `EDAS-20260${id.slice(1)}`,
    title: `وثيقة ${id}`,
    titleEn: `Document ${id}`,
    category: "عقد",
    deptId: "legal",
    owner: "أمل العتيبي",
    classification: "internal",
    status: "approved",
    retentionDays: 400,
    ...patch,
  };
}

const docs: Document[] = [
  doc("d1", { title: "عقد التوريد", titleEn: "Supply contract", content: "نص عقد التوريد الكامل", declaredRecord: true }),
  doc("d2", {
    title: "محضر اجتماع",
    titleEn: "Meeting minutes",
    category: "محضر",
    categoryEn: "Minutes",
    deptId: "exec",
    status: "pending",
    owner: "سارة القحطاني",
    ownerEn: "Sara",
    modifiedAt: "2026-10-01",
    retentionDays: 10,
  }),
  doc("d3", {
    title: "مخطط المشروع",
    titleEn: "Project drawing",
    category: "مخطط",
    categoryEn: "Drawing",
    deptId: "eng",
    status: "archived",
    owner: "خالد الدوسري",
    ownerEn: "Khalid",
    createdAt: "2025-05-01",
    checkedOutBy: "خالد",
  }),
  doc("d4", {
    title: "تقرير مالي",
    titleEn: "Finance report",
    category: "تقرير",
    categoryEn: "Report",
    deptId: "fin",
    status: "draft",
    classification: "confidential",
    owner: "منى الشمري",
    modifiedAt: "2026-11-05",
    retentionDays: 12,
  }),
  doc("d5", {
    title: "سياسة المراسلات",
    titleEn: "Correspondence policy",
    category: "مراسل",
    categoryEn: "Mail",
    deptId: "hr",
    status: "approved",
    owner: "نورة السالم",
    signatureStatus: "signed",
    signedBy: "مدير الموارد البشرية",
    modifiedAt: "2026-09-01",
  }),
  doc("d6", {
    title: "مذكرة شراء",
    titleEn: "Purchase memo",
    category: "شراء",
    categoryEn: "Purchase",
    deptId: "legal",
    status: "approved",
    owner: "عبدالله القحطاني",
    classification: "restricted",
    modifiedAt: "2026-11-10",
  }),
];

const tasks = [
  { id: "t1", docTitle: "عقد التوريد", step: "مراجعة", due: "2026-11-01", slaStatus: "breached", status: "assigned" },
  { id: "t2", docTitle: "محضر اجتماع", step: "اعتماد", due: "2026-11-20", slaStatus: "ontrack", status: "assigned" },
];

const auditEntries = [
  { datetime: "2026-11-14 10:00", action: "archive" },
  { datetime: "2026-11-14 09:00", action: "sign" },
];

const trashItems = [
  {
    doc: docs[4],
    deletedBy: "سارة",
    deletedAt: "2026-11-01",
    purgeAt: "2026-12-01",
    original: "المكتبة",
  },
];

const employee = {
  id: "e1",
  empNo: "EMP-001",
  name: "أحمد المطيري",
  jobTitle: "محاسب",
  jobTitleEn: "Accountant",
  deptId: "legal",
  manager: "سارة القحطاني",
  email: "ahmad@edas.sa",
  phone: "0500000000",
};

const department = { id: "legal", name: "الشؤون القانونية", nameEn: "Legal Affairs" };

interface AppOpts {
  lang?: "ar" | "en";
  user?: { name: string } | null;
}

interface DocsOpts {
  rows?: Document[];
  taskRows?: typeof tasks;
  audit?: typeof auditEntries;
  trash?: typeof trashItems;
  deleteDocs?: ReturnType<typeof vi.fn>;
  archiveDocs?: ReturnType<typeof vi.fn>;
  restoreDocs?: ReturnType<typeof vi.fn>;
  signDocument?: ReturnType<typeof vi.fn>;
  declareRecord?: ReturnType<typeof vi.fn>;
  removeTask?: ReturnType<typeof vi.fn>;
}

function setup(app: AppOpts = {}, overrides: DocsOpts = {}) {
  const lang = app.lang ?? "ar";
  const toast = vi.fn();
  const state = {
    scopedDocs: overrides.rows ?? docs,
    tasks: overrides.taskRows ?? tasks,
    auditLog: overrides.audit ?? auditEntries,
    trash: overrides.trash ?? trashItems,
    visibleFolders: [{ id: "f1", name: "مجلد", nameEn: "Folder", parentId: null, type: "dept", owner: "legal" }],
    deleteDocs: overrides.deleteDocs ?? vi.fn((ids: string[], cb: (ok: boolean, done: number) => void) => cb(true, ids.length)),
    archiveDocs: overrides.archiveDocs ?? vi.fn((ids: string[], cb: (ok: boolean, done: number) => void) => cb(true, ids.length)),
    restoreDocs: overrides.restoreDocs ?? vi.fn().mockResolvedValue(true),
    signDocument: overrides.signDocument ?? vi.fn().mockResolvedValue(true),
    declareRecord: overrides.declareRecord ?? vi.fn().mockResolvedValue(true),
    removeTask: overrides.removeTask ?? vi.fn().mockResolvedValue(true),
    employees: { items: [employee] },
    departments: { items: [department] },
  };

  mocks.app.mockReturnValue({
    lang,
    t: translator(lang),
    user: app.user === undefined ? { name: "سارة" } : app.user,
    toast,
  });
  mocks.docs.mockReturnValue(state);

  function Probe() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname}</p>;
  }

  const view = render(
    <MemoryRouter>
      <AIAssistant />
      <Probe />
    </MemoryRouter>,
  );

  return {
    ...view,
    toast,
    state,
    deleteDocs: state.deleteDocs,
    archiveDocs: state.archiveDocs,
    signDocument: state.signDocument,
    declareRecord: state.declareRecord,
    removeTask: state.removeTask,
    restoreDocs: state.restoreDocs,
  };
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "المساعد الذكي" }));
}

function input() {
  return screen.getByRole("textbox") as HTMLInputElement;
}

async function send(text: string, lang: "ar" | "en" = "ar") {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: lang === "en" ? "Send" : "إرسال" }));
  await act(async () => {
    vi.advanceTimersByTime(20000);
    await Promise.resolve();
  });
}

function lastToast(toast: ReturnType<typeof vi.fn>) {
  return toast.mock.calls[toast.mock.calls.length - 1]?.[0] as { title?: string; type?: string; message?: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe("assistant shell", () => {
  it("opens and closes with the launcher", () => {
    setup();
    const launcher = screen.getByRole("button", { name: "المساعد الذكي" });

    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
    fireEvent.click(launcher);
    expect(screen.getByText("جاهز · 8 اقتراحات · صوت")).toBeInTheDocument();
    expect(input()).toHaveFocus();

    fireEvent.click(launcher);
    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
  });

  it("closes from the backdrop", () => {
    setup();
    open();

    const backdrop = document.querySelector("div[aria-hidden='true']") as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
  });

  it("welcomes the user with overdue and nearing counts", () => {
    setup();

    open();

    expect(screen.getByText(/مرحباً سارة/)).toBeInTheDocument();
    expect(screen.getByText("1 مهام متأخرة")).toBeInTheDocument();
    expect(screen.getByText("2 وثائق قاربت على الإتلاف")).toBeInTheDocument();
    expect(screen.getByText("أرني العقود المعلقة")).toBeInTheDocument();
    expect(screen.getByText("تراجع")).toBeInTheDocument();
  });

  it("sends a suggestion from the welcome screen", async () => {
    setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: "تحليل الاتجاهات" }));
    expect(screen.getByText("تحليل الاتجاهات")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText("📊 تحليل اتجاهات مستودعك:")).toBeInTheDocument();
  });

  it("sends a suggestion from the second row", async () => {
    setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: "قارن المالية بالهندسة" }));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText(/^مقارنة الإدارة المالية مع الهندسة:/)).toBeInTheDocument();
  });

  it("sends the overdue call to action", async () => {
    setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: /1 مهام متأخرة/ }));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText(/لديك 1 مهام موافقة معلقة/)).toBeInTheDocument();
  });

  it("sends the nearing-disposal call to action", async () => {
    setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: /2 وثائق قاربت على الإتلاف/ }));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText("2 وثيقة:")).toBeInTheDocument();
  });

  it("ignores blank and repeated sends", async () => {
    setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(screen.queryByText("يفكر…")).toBeNull();

    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(screen.queryByText("يفكر…")).toBeNull();

    fireEvent.change(input(), { target: { value: "مهامي" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByText("يفكر…")).toBeInTheDocument();

    fireEvent.change(input(), { target: { value: "كم وثيقة" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.queryByText("كم وثيقة")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText(/لديك 2 مهام موافقة معلقة/)).toBeInTheDocument();
  });

  it("clears the conversation from the header", async () => {
    setup();
    open();
    await send("كم وثيقة");

    expect(screen.getByText(/6 وثيقة مطابقة/)).toBeInTheDocument();

    const reset = within(screen.getByRole("tooltip", { name: "محادثة جديدة" }).parentElement as HTMLElement).getByRole("button");
    fireEvent.click(reset);

    expect(screen.queryByText(/6 وثيقة مطابقة/)).toBeNull();
    expect(screen.getByText(/مرحباً سارة/)).toBeInTheDocument();
  });
});

describe("voice input", () => {
  it("explains when the browser has no speech API", () => {
    const { toast } = setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: "إدخال صوتي" }));

    expect(lastToast(toast)).toMatchObject({ title: "المتصفح لا يدعم الإدخال الصوتي", message: "جرّب Chrome أو Edge" });
  });

  it("starts and stops listening with recognition support", () => {
    class FakeRec {
      static last: FakeRec | null = null;
      lang = "";
      continuous = true;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        FakeRec.last = this;
      }
    }
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec;
    const { toast } = setup();
    open();

    fireEvent.click(screen.getByRole("button", { name: "إدخال صوتي" }));

    expect(FakeRec.last?.lang).toBe("ar-SA");
    expect(FakeRec.last?.continuous).toBe(false);
    expect(FakeRec.last?.interimResults).toBe(true);
    expect(FakeRec.last?.start).toHaveBeenCalled();
    expect(lastToast(toast)).toMatchObject({ title: "🎙️ أتحدث الآن…" });

    fireEvent.click(screen.getByRole("button", { name: "إدخال صوتي" }));
    expect(FakeRec.last?.stop).toHaveBeenCalled();
  });

  it("fills the input from an interim transcript and sends the final one", async () => {
    class FakeRec {
      static last: FakeRec | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        FakeRec.last = this;
      }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    const { toast } = setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: "إدخال صوتي" }));

    act(() => {
      FakeRec.last!.onresult?.({
        results: { length: 1, 0: { length: 1, isFinal: false, 0: { transcript: "كم وثيقة" } } },
      });
    });
    expect(input()).toHaveValue("كم وثيقة");

    act(() => {
      FakeRec.last!.onresult?.({
        results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript: "كم وثيقة" } } },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText(/6 وثيقة مطابقة/)).toBeInTheDocument();
    expect(lastToast(toast)).toBeTruthy();

    act(() => {
      FakeRec.last!.onend?.();
    });
    act(() => {
      FakeRec.last!.onerror?.();
    });
  });

  it("uses English speech settings", () => {
    class FakeRec {
      static last: FakeRec | null = null;
      lang = "";
      start = vi.fn();
      stop = vi.fn();
      onresult: unknown = null;
      onend: unknown = null;
      onerror: unknown = null;
      constructor() {
        FakeRec.last = this;
      }
    }
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec;
    setup({ lang: "en" });
    fireEvent.click(screen.getByRole("button", { name: "AI Assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));

    expect(FakeRec.last?.lang).toBe("en-US");
  });
});

describe("answers from the repository", () => {
  it("counts every document and charts the statuses", async () => {
    setup();
    open();

    await send("كم وثيقة لدي؟");

    expect(screen.getByText("6 وثيقة مطابقة.")).toBeInTheDocument();
    expect(screen.getByText("معتمدة")).toBeInTheDocument();
  });

  it("counts a filtered subset and names the scope", async () => {
    setup();
    open();

    await send("كم وثيقة مسودة في المالية؟");

    expect(screen.getByText("1 وثيقة مطابقة — الإدارة المالية · مسودة (من أصل 6 متاحة لك).")).toBeInTheDocument();
  });

  it("answers an empty count with the scope", async () => {
    setup();
    open();

    await send("كم وثيقة معلقة في الهندسة؟");

    expect(screen.getByText("لا توجد وثائق مطابقة — الهندسة · معلقة في نطاق صلاحياتك.")).toBeInTheDocument();
  });

  it("carries the previous filters into a follow-up", async () => {
    setup();
    open();

    await send("وثائق المالية");
    await send("المسودة منها");

    expect(screen.getByText("1 وثيقة — الإدارة المالية · مسودة:")).toBeInTheDocument();
  });

  it("narrows a category context with a department", async () => {
    setup();
    open();

    await send("عقد");
    await send("المالية");

    expect(screen.getByText(/^لم أجد نتائج لـ«الإدارة المالية · عقد»/)).toBeInTheDocument();
  });

  it("narrows a category context with a status", async () => {
    setup();
    open();

    await send("عقد");
    await send("المعتمدة");

    expect(screen.getByText("1 وثيقة — معتمدة · عقد:")).toBeInTheDocument();
  });

  it("reuses the last filters for a bare count", async () => {
    setup();
    open();

    await send("وثائق المالية");
    await send("كم؟");

    expect(screen.getByText("1 وثيقة مطابقة — الإدارة المالية (من أصل 6 متاحة لك).")).toBeInTheDocument();
  });

  it("lists the most recent documents", async () => {
    setup();
    open();

    await send("أحدث الوثائق");

    expect(screen.getByText("أحدث 5 وثيقة — مرتبة بآخر تعديل:")).toBeInTheDocument();
    expect(screen.getByText("مذكرة شراء")).toBeInTheDocument();
  });

  it("lists the documents checked out for editing", async () => {
    setup();
    open();

    await send("المحجوزة");

    expect(screen.getByText("1 وثيقة — محجوزة للتحرير:")).toBeInTheDocument();
  });

  it("lists the documents nearing disposal and the signed ones", async () => {
    setup();
    open();

    await send("وثائق قاربت على الإتلاف");
    expect(screen.getByText("2 وثيقة:")).toBeInTheDocument();

    await send("توقيع");
    expect(screen.getAllByText("1 وثيقة:")).toHaveLength(1);
  });

  it("filters by signature when the question only says signature", async () => {
    setup();
    open();

    await send("توقيع");

    expect(screen.getByText("1 وثيقة:")).toBeInTheDocument();
  });

  it("searches inside the document content", async () => {
    setup();
    open();

    await send("ابحث عن توريد");

    expect(screen.getByText("1 وثيقة تحتوي «توريد» في المحتوى:")).toBeInTheDocument();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
  });

  it("reports content that is not there", async () => {
    setup();
    open();

    await send("ابحث عن زئبق");

    expect(screen.getByText("لم أجد «زئبق» في محتوى أي وثيقة ضمن صلاحياتك.")).toBeInTheDocument();
  });

  it("falls back to a title search for a short content term", async () => {
    setup();
    open();

    await send("ابحث عن ab");

    expect(screen.getByText(/^لم أجد نتائج لـ«ابحث عن ab»/)).toBeInTheDocument();
  });

  it("explains when nothing matches", async () => {
    setup();
    open();

    await send("زئبق");

    expect(screen.getByText(/^لم أجد نتائج لـ«زئبق»/)).toBeInTheDocument();
  });

  it("filters by year, classification, person, category and records", async () => {
    setup();
    open();

    await send("وثائق 2026");
    expect(screen.getByText("6 وثيقة — 2026:")).toBeInTheDocument();

    await send("سري للغاية");
    expect(screen.getAllByText("1 وثيقة:")).toHaveLength(1);

    await send("مقيد");
    expect(screen.getAllByText("1 وثيقة:")).toHaveLength(2);

    await send("وثائق أمل");
    expect(screen.getByText("1 وثيقة — أمل العتيبي:")).toBeInTheDocument();
    await send("عقد");
    expect(screen.getByText("1 وثيقة — عقد:")).toBeInTheDocument();

    await send("official record");
    expect(screen.getByText("1 وثيقة — سجل رسمي:")).toBeInTheDocument();
  });

  it("ignores the classification for an emphasised secret term", async () => {
    setup();
    open();

    await send("شديد");

    expect(screen.getByText(/^لم أجد نتائج لـ«شديد»/)).toBeInTheDocument();
  });

  it("lists the archived documents, the purchase paperwork, the minutes and the drawings", async () => {
    setup();
    open();

    await send("المؤرشفة");
    expect(screen.getByText("1 وثيقة — مؤرشفة:")).toBeInTheDocument();

    await send("purchase");
    expect(screen.getByText("1 وثيقة — شراء:")).toBeInTheDocument();

    await send("محضر");
    expect(screen.getByText("1 وثيقة — محضر:")).toBeInTheDocument();

    await send("المخططات");
    expect(screen.getByText("1 وثيقة — مخطط:")).toBeInTheDocument();
  });

  it("reports a signed scope with no documents", async () => {
    setup({}, { rows: [] });
    open();

    await send("موقعة");

    expect(screen.getByText(/^لم أجد نتائج لـ«موقعة»/)).toBeInTheDocument();
  });

  it("shares the signed document when the filter names it", async () => {
    setup();
    open();

    await send("شارك الموقعة");

    expect(screen.getByText(/^الصلاحيات لا تُمنح من المحادثة\. افتح «سياسة المراسلات»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^فتح الوثيقة/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d5");
  });

  it("lists the approval tasks with their items", async () => {
    setup();
    open();

    await send("مهامي");

    expect(screen.getByText("لديك 2 مهام موافقة معلقة:")).toBeInTheDocument();
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("متجاوزة")).toBeInTheDocument();

    fireEvent.click(screen.getByText("عقد التوريد"));
    expect(screen.getByTestId("location")).toHaveTextContent("/workflow/t1");
    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
  });

  it("narrows the tasks to the overdue ones", async () => {
    setup();
    open();

    await send("المهام المتأخرة");

    expect(screen.getByText("لديك 1 مهام موافقة معلقة (متجاوزة SLA):")).toBeInTheDocument();
  });

  it("celebrates an empty task list", async () => {
    setup({}, { taskRows: [] });
    open();

    await send("مهامي");

    expect(screen.getByText("لا توجد مهام معلقة. عمل رائع! 🎉")).toBeInTheDocument();
  });

  it("lists the audit trail and names the demo storage", async () => {
    setup();
    open();

    await send("سجل عملياتي");

    expect(screen.getByText(/آخر 2 عمليات من جلستك \(محفوظة في هذا المتصفح في وضع العرض\):/)).toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("names the API trail when the API is configured", async () => {
    config.useApi = true;
    try {
      setup();
      open();

      await send("سجل عملياتي");

      expect(screen.getByText(/والسجل الرسمي غير القابل للتعديل في شاشة سجل التدقيق/)).toBeInTheDocument();
    } finally {
      config.useApi = false;
    }
  });

  it("explains an empty audit trail", async () => {
    setup({}, { audit: [] });
    open();

    await send("سجل عملياتي");

    expect(screen.getByText(/لا توجد عمليات مسجلة في هذه الجلسة بعد/)).toBeInTheDocument();
  });

  it("describes a colleague from the directory", async () => {
    setup();
    open();

    await send("من هو أحمد؟");

    expect(screen.getByText("أحمد المطيري — محاسب (EMP-001)")).toBeInTheDocument();
    expect(screen.getByText("الشؤون القانونية")).toBeInTheDocument();
  });

  it("reports a person outside the directory", async () => {
    setup();
    open();

    await send("من هو مجهول؟");

    expect(screen.getByText("لم أجد هذا الشخص في دليل الموظفين.")).toBeInTheDocument();
  });

  it("shows the trash and opens it", async () => {
    setup();
    open();

    await send("المحذوفات");

    expect(screen.getByText("1 عنصر في سلة المحذوفات (قابل للاستعادة قبل الحذف النهائي):")).toBeInTheDocument();
    fireEvent.click(screen.getByText("سياسة المراسلات"));
    expect(screen.getByTestId("location")).toHaveTextContent("/trash");
  });

  it("explains an empty trash", async () => {
    setup({}, { trash: [] });
    open();

    await send("السلة");

    expect(screen.getByText("السلة فارغة حالياً.")).toBeInTheDocument();
  });

  it("summarises a department", async () => {
    setup();
    open();

    await send("أخبرني عن المالية");

    expect(screen.getByText("الإدارة المالية — نبذة سريعة:")).toBeInTheDocument();
    expect(screen.getByText("المجلدات")).toBeInTheDocument();
  });

  it("has no overview without a department", async () => {
    setup();
    open();

    await send("أخبرني عن شيء");

    expect(screen.getByText(/^لم أجد نتائج لـ«أخبرني عن شيء»/)).toBeInTheDocument();
  });

  it("compares two departments", async () => {
    setup();
    open();

    await send("قارن المالية بالهندسة");

    expect(screen.getByText(/^مقارنة الإدارة المالية مع الهندسة:/)).toBeInTheDocument();
    expect(screen.getAllByText("الوثائق")).toHaveLength(2);
  });

  it("needs two departments for a comparison", async () => {
    setup();
    open();

    await send("قارن");

    expect(screen.getByText(/^لم أجد نتائج لـ«قارن»/)).toBeInTheDocument();
  });

  it("summarises the first document with its signature", async () => {
    setup();
    open();

    await send("لخص وثيقة");
    expect(screen.getByText("📋 ملخص الوثيقة:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^معاينة/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1/preview");
    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
  });

  it("summarises a signed document on its own", async () => {
    setup();
    open();

    await send("لخص سياسة المراسلات");

    expect(screen.getByText(/موقّعة إلكترونياً بواسطة/)).toBeInTheDocument();
    expect(screen.getByText(/مدير الموارد البشرية/)).toBeInTheDocument();
  });

  it("summarises a document from the filter without a signature", async () => {
    setup();
    open();

    await send("لخص تقرير المالية");

    expect(screen.getByText("📋 ملخص الوثيقة:")).toBeInTheDocument();
    expect(screen.queryByText(/موقّعة إلكترونياً بواسطة/)).toBeNull();
    expect(screen.getByText("📁 التصنيف")).toBeInTheDocument();
  });

  it("summarises the first result of the previous answer", async () => {
    setup();
    open();

    await send("وثائق القانون");
    await send("لخص الأولى");

    expect(screen.getByText("📄 العنوان")).toBeInTheDocument();
    expect(screen.getAllByText("عقد التوريد").length).toBeGreaterThan(0);
  });

  it("answers the three date ranges", async () => {
    setup();
    open();

    await send("وثائق آخر أسبوع");
    expect(screen.getByText(/1 وثيقة خلال آخر أسبوع \(عدّلت بعد/)).toBeInTheDocument();

    await send("وثائق آخر شهر");
    expect(screen.getByText(/4 وثيقة خلال آخر 30 يوم \(عدّلت بعد/)).toBeInTheDocument();

    await send("وثائق آخر ربع");
    expect(screen.getByText(/6 وثيقة خلال آخر ربع \(عدّلت بعد/)).toBeInTheDocument();
  });

  it("prepares a CSV export of the whole scope", async () => {
    const { toast } = setup();
    open();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await send("صدّر");

    expect(screen.getByText(/جاهز لتصدير 6 وثيقة إلى CSV/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^تنزيل CSV/ }));

    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    expect(lastToast(toast)).toMatchObject({ title: "تم تنزيل CSV", message: "6 صف" });
    click.mockRestore();
    create.mockRestore();
    revoke.mockRestore();
  });

  it("refuses to export an empty scope", async () => {
    setup({}, { rows: [] });
    open();

    await send("تصدير");

    expect(screen.getByText("لا توجد وثائق في نطاقك لتصديرها.")).toBeInTheDocument();
  });

  it("points sharing to the document page", async () => {
    setup();
    open();

    await send("شارك");

    expect(screen.getByText(/الصلاحيات لا تُمنح من المحادثة/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^فتح الوثيقة/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
  });

  it("asks for a document to share when the scope is empty", async () => {
    setup({}, { rows: [] });
    open();

    await send("شارك");

    expect(screen.getByText(/لم أحدد وثيقة للمشاركة/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^فتح الوثيقة/ })).toBeNull();
  });

  it("answers help with the capability list", async () => {
    setup();
    open();

    await send("ماذا تستطيع؟");

    expect(screen.getByText(/أستطيع الإجابة عن وثائقك/)).toBeInTheDocument();
    expect(screen.getByText("مركّب")).toBeInTheDocument();
  });
});

async function execute(lang: "ar" | "en" = "ar") {
  const label = lang === "en" ? "Execute" : "تنفيذ";
  const buttons = screen.getAllByRole("button", { name: label });
  fireEvent.click(buttons[buttons.length - 1]);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("action engine", () => {
  it("archives every approved document after a confirmation", async () => {
    const { archiveDocs, toast } = setup();
    open();

    await send("أرشف المعتمدة");

    expect(screen.getByText("📦 سأقوم بـأرشفة «3 وثيقة». اضغط للتأكيد.")).toBeInTheDocument();
    expect(screen.getByText("بانتظار التأكيد")).toBeInTheDocument();

    await execute();

    expect(archiveDocs).toHaveBeenCalledWith(["d1", "d5", "d6"], expect.any(Function));
    expect(lastToast(toast)).toMatchObject({ title: "تمت أرشفة 3" });
    expect(screen.getByText("تم التنفيذ بنجاح")).toBeInTheDocument();
  });

  it("asks twice before deleting and reports a full delete", async () => {
    const { deleteDocs, toast } = setup();
    open();

    await send("احذف عقد التوريد");

    expect(screen.getByText(/^🗑️ هل أنت متأكد من حذف «عقد التوريد»؟/)).toBeInTheDocument();

    await execute();

    expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function));
    expect(lastToast(toast)).toMatchObject({
      title: "تم نقل 1 إلى السلة",
      message: "الاسترجاع من سلة المحذوفات خلال 30 يوماً",
    });
  });

  it("deletes everything and reports a partial delete", async () => {
    const { toast } = setup({}, { deleteDocs: vi.fn((_ids: string[], cb: (ok: boolean, done: number) => void) => cb(true, 1)) });
    open();

    await send("احذف كل");

    expect(screen.getByText(/^🗑️ هل أنت متأكد من حذف «6 وثيقة»؟/)).toBeInTheDocument();

    await execute();

    expect(lastToast(toast)).toMatchObject({ title: "نُقل 1 من 6 إلى السلة" });
  });

  it("keeps the confirmation when nothing was deleted", async () => {
    const { toast } = setup({}, { deleteDocs: vi.fn((_ids: string[], cb: (ok: boolean, done: number) => void) => cb(false, 0)) });
    open();

    await send("احذف كل");
    await execute();

    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("بانتظار التأكيد")).toBeInTheDocument();
  });

  it("keeps the archive card open when nothing was archived", async () => {
    const { toast } = setup({}, { archiveDocs: vi.fn((_ids: string[], cb: (ok: boolean, done: number) => void) => cb(false, 0)) });
    open();

    await send("أرشف المعتمدة");
    await execute();

    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("بانتظار التأكيد")).toBeInTheDocument();
  });

  it("signs a named document with the current user", async () => {
    const { signDocument, toast } = setup();
    open();

    await send("وقّع عقد التوريد");

    expect(screen.getByText("✍️ سأقوم بـتوقيع «عقد التوريد». اضغط للتأكيد.")).toBeInTheDocument();

    await execute();

    expect(signDocument).toHaveBeenCalledWith("d1", "سارة");
    expect(lastToast(toast)).toMatchObject({ title: "تم توقيع 1", message: "سارة" });
  });

  it("leaves the sign card open when the signature is refused", async () => {
    const { toast } = setup({}, { signDocument: vi.fn().mockResolvedValue(false) });
    open();

    await send("وقّع عقد التوريد");
    await execute();

    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("بانتظار التأكيد")).toBeInTheDocument();
  });

  it("declares a document as an official record", async () => {
    const { declareRecord, toast } = setup();
    open();

    await send("أعلن عقد التوريد");

    expect(screen.getByText(/^📜 هل أنت متأكد من إعلان سجل «عقد التوريد»؟/)).toBeInTheDocument();

    await execute();

    expect(declareRecord).toHaveBeenCalledWith("d1");
    expect(lastToast(toast)).toMatchObject({ title: "تم إعلان 1 كسجل رسمي" });
  });

  it("approves every pending task at once", async () => {
    const { removeTask, toast } = setup();
    open();

    await send("وافق على كل المهام");

    expect(screen.getByText("2 مهام — سأوافق عليها كلها دفعة واحدة:")).toBeInTheDocument();

    await execute();

    expect(removeTask).toHaveBeenCalledTimes(2);
    expect(lastToast(toast)).toMatchObject({ title: "تمت الموافقة على 2 مهام" });
  });

  it("refuses to approve when no task is open", async () => {
    setup({}, { taskRows: [] });
    open();

    await send("وافق على كل المهام");

    expect(screen.getByText("لا توجد مهام للموافقة عليها.")).toBeInTheDocument();
  });

  it("marks the card as executed when the confirmation is cancelled", async () => {
    const { archiveDocs, toast } = setup();
    open();

    await send("أرشف المعتمدة");
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));

    expect(archiveDocs).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("تم التنفيذ بنجاح")).toBeInTheDocument();
  });

  it("targets the first result of the previous answer", async () => {
    setup();
    open();

    await send("أحدث الوثائق");
    await send("أرشف الأولى");

    expect(screen.getByText("📦 سأقوم بـأرشفة «مذكرة شراء». اضغط للتأكيد.")).toBeInTheDocument();
  });

  it("targets the documents shown in the previous answer", async () => {
    setup();
    open();

    await send("أحدث الوثائق");
    await send("أرشف هذه");

    expect(screen.getByText(/^📦 سأقوم بـأرشفة «5 وثيقة»/)).toBeInTheDocument();
  });

  it("falls back to the first filtered documents when nothing is named", async () => {
    setup();
    open();

    await send("احذف");

    expect(screen.getByText(/^🗑️ هل أنت متأكد من حذف «6 وثيقة»؟/)).toBeInTheDocument();
  });
});

describe("undo", () => {
  it("says there is nothing to undo before any action", async () => {
    setup();
    open();

    await send("تراجع");

    expect(screen.getByText("لا توجد عملية حديثة للتراجع عنها.")).toBeInTheDocument();
  });

  it("restores the deleted documents and links to them", async () => {
    const { restoreDocs } = setup();
    open();

    await send("احذف عقد التوريد");
    await execute();
    await send("تراجع");

    expect(restoreDocs).toHaveBeenCalledWith(["d1"]);
    expect(screen.getByText("تم استرجاع الوثائق من السلة.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^فتح الوثائق/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents");
  });

  it("points to the trash when the restore fails", async () => {
    setup({}, { restoreDocs: vi.fn().mockResolvedValue(false) });
    open();

    await send("احذف عقد التوريد");
    await execute();
    await send("تراجع");

    expect(screen.getByText(/تعذّر الاسترجاع/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^فتح السلة/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/trash");
  });

  it("explains that archiving cannot be undone", async () => {
    setup();
    open();

    await send("أرشف عقد التوريد");
    await execute();
    await send("تراجع");

    expect(screen.getByText(/^آخر عملية: عقد التوريد\. لا يوفّر التطبيق إعادة فتح من الواجهة/)).toBeInTheDocument();
  });
});

describe("message chrome", () => {
  it("rates an answer and stores the feedback", async () => {
    const { toast } = setup();
    open();

    await send("مهامي");

    fireEvent.click(screen.getByRole("button", { name: "تقييم إيجابي" }));
    expect(screen.getByRole("button", { name: "تقييم إيجابي" })).toHaveAttribute("aria-pressed", "true");
    expect(lastToast(toast)).toMatchObject({ title: "شكراً لتقييمك" });
    const stored = JSON.parse(localStorage.getItem("edas.v1.assistantFeedback") ?? "{}");
    expect(Object.values(stored)).toContain(1);

    fireEvent.click(screen.getByRole("button", { name: "تقييم سلبي" }));
    expect(screen.getByRole("button", { name: "تقييم سلبي" })).toHaveAttribute("aria-pressed", "true");
    expect(lastToast(toast)).toMatchObject({ title: "سنسجل ملاحظتك لتحسين الإجابات" });
  });

  it("survives corrupt feedback storage", async () => {
    localStorage.setItem("edas.v1.assistantFeedback", "{not json");
    setup();
    open();

    await send("مهامي");

    expect(screen.getByRole("button", { name: "تقييم إيجابي" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the rating after the panel is reopened", async () => {
    setup();
    open();

    await send("مهامي");
    fireEvent.click(screen.getByRole("button", { name: "تقييم إيجابي" }));

    fireEvent.click(screen.getByRole("button", { name: "المساعد الذكي" }));
    fireEvent.click(screen.getByRole("button", { name: "المساعد الذكي" }));

    expect(screen.getByRole("button", { name: "تقييم إيجابي" })).toHaveAttribute("aria-pressed", "true");
  });

  it("copies an answer to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = setup();
    open();

    await send("مهامي");

    const copy = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-copy")) as HTMLElement;
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("لديك 2 مهام موافقة معلقة"));
    expect(lastToast(toast)).toMatchObject({ title: "تم النسخ" });
  });

  it("expands and collapses a long result list", async () => {
    setup();
    open();

    await send("وثائق 2026");

    fireEvent.click(screen.getByRole("button", { name: /^عرض الكل \(6\) ▼/ }));
    expect(screen.getByText("مذكرة شراء")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^عرض أقل ▲/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^عرض أقل ▲/ }));
    expect(screen.queryByText("مذكرة شراء")).toBeNull();
  });

  it("ignores keys other than Enter in the composer", async () => {
    setup();
    open();

    fireEvent.change(input(), { target: { value: "مهامي" } });
    fireEvent.keyDown(input(), { key: "Escape" });

    expect(screen.queryByText("يفكر…")).toBeNull();
  });

  it("ignores a refused single-document action", async () => {
    setup({}, { archiveDocs: vi.fn((_ids: string[], cb: (ok: boolean, done: number) => void) => cb(false, 0)) });
    open();

    await send("وثائق 2026");
    const row = screen.getByText("عقد التوريد").closest("button")!.parentElement as HTMLElement;
    const buttons = within(row).getAllByRole("button");

    fireEvent.click(buttons[1]);

    expect(screen.queryByText("تمت الأرشفة")).toBeNull();
  });

  it("archives, signs and deletes a single document from the answer", async () => {
    const { archiveDocs, signDocument, deleteDocs, toast } = setup();
    open();

    await send("وثائق 2026");
    const row = screen.getByText("عقد التوريد").closest("button")!.parentElement as HTMLElement;
    const buttons = within(row).getAllByRole("button");

    fireEvent.click(buttons[1]);
    expect(archiveDocs).toHaveBeenCalledWith(["d1"], expect.any(Function));
    expect(lastToast(toast)).toMatchObject({ title: "تمت الأرشفة", message: "عقد التوريد" });

    fireEvent.click(buttons[2]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(signDocument).toHaveBeenCalledWith("d1", "سارة");
    expect(lastToast(toast)).toMatchObject({ title: "تم التوقيع" });

    fireEvent.click(buttons[3]);
    expect(deleteDocs).toHaveBeenCalledWith(["d1"], expect.any(Function));
    expect(lastToast(toast)).toMatchObject({ title: "نقل إلى السلة" });
  });

  it("opens a document from the answer and closes the panel", async () => {
    setup();
    open();

    await send("وثائق 2026");
    fireEvent.click(screen.getByText("عقد التوريد"));

    expect(screen.getByTestId("location")).toHaveTextContent("/documents/d1");
    expect(screen.queryByText("جاهز · 8 اقتراحات · صوت")).toBeNull();
  });

  it("shows the send time of every message", async () => {
    setup();
    open();

    await send("مهامي");

    expect(screen.getAllByText(/[٠-٩]{2}:[٠-٩]{2} [صم]$/).length).toBeGreaterThanOrEqual(2);
  });

  it("follows a follow-up suggestion", async () => {
    setup();
    open();

    await send("وثائق المالية");
    fireEvent.click(screen.getByRole("button", { name: /^المعلقة منها/ }));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText(/^لم أجد نتائج لـ«الإدارة المالية · معلقة»/)).toBeInTheDocument();
  });
});

describe("English assistant", () => {
  it("welcomes and answers in English", async () => {
    setup({ lang: "en" });
    fireEvent.click(screen.getByRole("button", { name: "AI Assistant" }));

    expect(screen.getByText("Ready · 8 suggestions · voice")).toBeInTheDocument();
    expect(screen.getByText(/Hello سارة/)).toBeInTheDocument();
    expect(screen.getByText("1 overdue tasks")).toBeInTheDocument();

    await send("How many documents?", "en");

    expect(screen.getByText("6 documents match.")).toBeInTheDocument();
  });

  it("labels a named sign target in English", async () => {
    setup({ lang: "en" });
    fireEvent.click(screen.getByRole("button", { name: "AI Assistant" }));

    await send("sign Supply contract", "en");

    expect(screen.getByText(/I'll sign "Supply contract"/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Execute" })).toBeInTheDocument();
  });
});
