import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DestructionCertificateDto } from "@edas/shared";
import type { RetentionItem } from "../types";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { RetentionQueue } from "./policies-retention";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const TODAY = new Date().toISOString().slice(0, 10);

function item(id: string, overrides: Partial<RetentionItem> = {}): RetentionItem {
  return {
    id,
    docTitle: `وثيقة ${id}`,
    docNo: `EDAS-${id}`,
    policy: "سياسة الاحتفاظ العامة",
    retentionEnd: "2026-06-15",
    deptId: "legal",
    owner: "أمل السبيعي",
    onHold: false,
    proposedAction: "مراجعة",
    proposedActionEn: "Review",
    daysLeft: 40,
    reviewStatus: "pending",
    ...overrides,
  };
}

const ITEMS: RetentionItem[] = [
  item("ret-1", {
    docTitle: "عقد التوريد",
    docNo: "EDAS-1",
    policy: "سياسة العقود",
    retentionEnd: "2026-02-01",
    documentId: "doc-1",
    daysLeft: -3,
    proposedAction: "إتلاف",
    proposedActionEn: "Dispose",
  }),
  item("ret-2", {
    docTitle: "ملحق العقد",
    docNo: "EDAS-2",
    policy: "سياسة العقود",
    retentionEnd: "2026-04-10",
    daysLeft: 0,
    onHold: true,
    proposedAction: "أرشفة نهائية",
    proposedActionEn: "Final Archive",
  }),
  item("ret-3", { docTitle: "محضر اجتماع", docNo: "EDAS-3", daysLeft: 5, proposedAction: "تمديد", proposedActionEn: "Extend" }),
  item("ret-4", { docTitle: "تقرير مالي", docNo: "EDAS-4", daysLeft: 20 }),
  item("ret-5", { docTitle: "خطاب رسمي", docNo: "EDAS-5", daysLeft: 60 }),
  item("ret-6", {
    docTitle: "وثيقة متلفة",
    docNo: "EDAS-6",
    retentionEnd: "2025-12-01",
    reviewStatus: "reviewed",
    action: "DESTROY",
    executedAt: "2026-03-05T10:00:00.000Z",
    daysLeft: -90,
  }),
  item("ret-7", { docTitle: "وثيقة معفاة", docNo: "EDAS-7", reviewStatus: "exempt" }),
];

function certificate(): DestructionCertificateDto {
  return {
    certificateRef: "DES-RET-1-2026",
    auditEventId: "evt-1",
    auditHash: null,
    destroyedAt: "2026-03-05T10:00:00.000Z",
    performedById: null,
    performedBy: "أمل السبيعي",
    retentionItemId: "ret-1",
    document: { id: "doc-1", docNo: "EDAS-1", title: "عقد التوريد" },
    policy: { id: "pol-1", name: "سياسة العقود", retentionMonths: 60, legalBasis: null },
    dueAt: "2026-02-01",
    note: null,
    files: [],
    fileCount: 0,
    totalBytes: 0,
    storageErrors: 0,
  };
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = {
    t: (key: string) => dict[key] ?? key,
    lang,
    density: "comfortable",
    user: { name: "أمل السبيعي" },
    toast: vi.fn(),
  };
  mocks.app.mockReturnValue(app);
  return app;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    retention: ITEMS,
    removeRetention: vi.fn().mockResolvedValue(true),
    addHold: vi.fn().mockResolvedValue(true),
    retentionCertificate: vi.fn().mockResolvedValue(certificate()),
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/policies/retention"]}>
      <Routes>
        <Route
          path="/policies/retention"
          element={
            <>
              <RetentionQueue />
              <LocationProbe />
            </>
          }
        />
        <Route path="/documents/:id/preview" element={<LocationProbe />} />
        <Route path="/policies" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openRowMenu(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: t("g.rowOptions") })[index]);
  return screen.getByRole("menu");
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("retention queue", () => {
  it("renders pending items, the maturity strip and the disposed log", () => {
    mockStore();
    mockApp();
    renderPage();

    expect(screen.getAllByText(t("nav.retentionQueue")).length).toBeGreaterThan(0);
    expect(screen.getByText("عقد التوريد")).toBeInTheDocument();
    expect(screen.getByText("ملحق العقد")).toBeInTheDocument();
    expect(screen.queryByText("وثيقة معفاة")).toBeNull();
    expect(screen.getByText("توزيع الاستحقاق")).toBeInTheDocument();
    expect(screen.getByText("سجل الإتلافات المنفّذة (1)")).toBeInTheDocument();
    expect(screen.getByText("وثيقة متلفة")).toBeInTheDocument();
    expect(screen.getAllByText("محجوزة").length).toBeGreaterThan(0);
    expect(screen.getByText("متأخرة 3 ي")).toBeInTheDocument();
    expect(screen.getByText("اليوم")).toBeInTheDocument();
    expect(screen.getByText("5 يوم")).toBeInTheDocument();
    expect(screen.getAllByText("إتلاف").length).toBeGreaterThan(0);
  });

  it("filters by urgency stat and resets when the stat is clicked again", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /مستحقة الآن/ }));
    expect(screen.getByText("2 من 5")).toBeInTheDocument();
    expect(screen.queryByText("محضر اجتماع")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /مستحقة الآن/ }));
    expect(screen.getByText("5 من 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /هذا الأسبوع/ }));
    expect(screen.getByText("1 من 5")).toBeInTheDocument();
    expect(screen.getByText("محضر اجتماع")).toBeInTheDocument();
    expect(screen.queryByText("عقد التوريد")).toBeNull();
  });

  it("searches by number and clears the term", () => {
    mockStore();
    mockApp();
    renderPage();

    const search = screen.getByRole("textbox", { name: "بحث في قائمة الاحتفاظ" });
    fireEvent.change(search, { target: { value: "EDAS-2" } });
    expect(screen.getByText("1 من 5")).toBeInTheDocument();
    expect(screen.getByText("ملحق العقد")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث" }));
    expect(screen.getByText("5 من 5")).toBeInTheDocument();
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("filters held items and offers a clear-filters empty state", () => {
    mockStore();
    mockApp();
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الحجز القانوني" }), { target: { value: "held" } });
    expect(screen.getByText("1 من 5")).toBeInTheDocument();
    expect(screen.getByText("ملحق العقد")).toBeInTheDocument();
    expect(screen.queryByText("عقد التوريد")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الحجز القانوني" }), { target: { value: "free" } });
    expect(screen.getByText("4 من 5")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حسب الحجز القانوني" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("textbox", { name: "بحث في قائمة الاحتفاظ" }), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد عناصر")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    expect(screen.getByText("5 من 5")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is pending", () => {
    mockStore({ retention: [ITEMS[5], ITEMS[6]] });
    mockApp();
    renderPage();

    expect(screen.getByText("لا توجد عناصر")).toBeInTheDocument();
    expect(screen.queryByText("توزيع الاستحقاق")).toBeNull();
    expect(screen.getByText("سجل الإتلافات المنفّذة (1)")).toBeInTheDocument();
  });

  it("reviews a linked document and reports items without one", () => {
    mockStore();
    const app = mockApp();
    const view = renderPage();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "مراجعة" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/documents/doc-1/preview");

    view.unmount();
    renderPage();
    fireEvent.click(within(openRowMenu(1)).getByRole("menuitem", { name: "مراجعة" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "لا توجد وثيقة مرتبطة", message: "ملحق العقد" });
  });

  it("extends retention by a chosen number of years", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "تمديد الاحتفاظ" }));
    const dialog = screen.getByRole("dialog", { name: "تمديد مدة الاحتفاظ" });
    expect(within(dialog).getByText("عقد التوريد")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("2").closest("button")!);
    expect(within(dialog).getByText("+2 سنة إضافية")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "تمديد" }));
    await waitFor(() => expect(store.removeRetention).toHaveBeenCalledWith("ret-1", { dueAt: expect.stringContaining("2028-02-01") }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تمديد الاحتفاظ", message: "عقد التوريد — +2 سنة" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تمديد مدة الاحتفاظ" })).toBeNull());
  });

  it("places a legal hold from the row menu", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "وضع حجز قانوني" }));
    await waitFor(() =>
      expect(store.addHold).toHaveBeenCalledWith({
        ref: "LEGAL-HOLD-EDAS-1",
        reason: "حجز قانوني على وثيقة قاربت نهاية الاحتفاظ",
        caseRef: "CASE-EDAS-1",
        placedBy: "أمل السبيعي",
        placedAt: TODAY,
        items: 1,
        documentIds: ["doc-1"],
      }),
    );
    expect(app.toast).toHaveBeenCalledWith({
      type: "warning",
      title: "تم وضع الحجز القانوني",
      message: "عقد التوريد — محفوظة من الإتلاف",
    });
  });

  it("disposes a single item and opens its certificate", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "إتلاف" }));
    const dialog = screen.getByRole("dialog", { name: "تأكيد الإتلاف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إتلاف نهائي" }));

    await waitFor(() => expect(store.removeRetention).toHaveBeenCalledWith("ret-1", { action: "DESTROY" }));
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم الإتلاف الآمن", message: "عقد التوريد" });
    expect(await screen.findByRole("dialog", { name: "شهادة إتلاف رسمية" })).toBeInTheDocument();
    expect(screen.getByText(/DES-RET-1-2026/)).toBeInTheDocument();
  });

  it("keeps the item when disposal fails", async () => {
    const store = mockStore({ removeRetention: vi.fn().mockResolvedValue(false) });
    const app = mockApp();
    renderPage();

    fireEvent.click(within(openRowMenu(0)).getByRole("menuitem", { name: "إتلاف" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "تأكيد الإتلاف" })).getByRole("button", { name: "إتلاف نهائي" }));

    await waitFor(() => expect(store.removeRetention).toHaveBeenCalled());
    expect(app.toast).not.toHaveBeenCalled();
    expect(store.retentionCertificate).not.toHaveBeenCalled();
  });

  it("warns when the server has no destruction certificate", async () => {
    const store = mockStore({ retentionCertificate: vi.fn().mockResolvedValue(null) });
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "شهادة الإتلاف" }));
    await waitFor(() => expect(store.retentionCertificate).toHaveBeenCalledWith("ret-6"));
    expect(app.toast).toHaveBeenCalledWith({
      type: "error",
      title: "تعذّر استخراج شهادة الإتلاف",
      message: "لم يُعثر على سجل إتلاف خادمي لهذا العنصر.",
    });
    expect(screen.queryByRole("dialog", { name: "شهادة إتلاف رسمية" })).toBeNull();
  });

  it("bulk extends every selected item and clears the selection", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("5 عنصر محدد")).toBeInTheDocument();
    expect(screen.getByText(/1 محجوزة ستُتخطى عند الإتلاف/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تمديد سنة" }));
    await waitFor(() => expect(store.removeRetention).toHaveBeenCalledTimes(5));
    store.removeRetention.mock.calls.forEach((call) => {
      const [id, payload] = call as [string, { dueAt?: string }];
      expect(payload).toEqual({ dueAt: expect.any(String) });
      expect(ITEMS.some((row) => row.id === id)).toBe(true);
    });
    expect(app.toast).toHaveBeenCalledWith({ type: "success", title: "تم تمديد 5 عنصراً", message: "سنة واحدة لكل عنصر" });
    expect(screen.queryByText("5 عنصر محدد")).toBeNull();
  });

  it("bulk disposes non-held items and reports the skipped holds", async () => {
    const store = mockStore();
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "إتلاف المحدد" }));
    const dialog = screen.getByRole("dialog", { name: "تأكيد إتلاف المحدد" });
    expect(within(dialog).getByText(/سيتم تخطي 1 وثيقة محجوزة قانونياً\./)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "إتلاف نهائي" }));
    await waitFor(() => expect(store.removeRetention).toHaveBeenCalledTimes(4));
    store.removeRetention.mock.calls.forEach((call) => {
      const [id, payload] = call as [string, { action?: string }];
      expect(id).not.toBe("ret-2");
      expect(payload).toEqual({ action: "DESTROY" });
    });
    expect(app.toast).toHaveBeenCalledWith({
      type: "success",
      title: "تم إتلاف 4 وثيقة",
      message: "تم تخطي 1 محجوزة قانونياً · شهادات الإتلاف متاحة من سجل الإتلافات المنفّذة",
    });
  });

  it("reports a failed bulk extension and allows clearing the selection", async () => {
    const store = mockStore({ removeRetention: vi.fn().mockResolvedValue(false) });
    const app = mockApp();
    renderPage();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(screen.queryByText(/عنصر محدد/)).toBeNull();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "تمديد سنة" }));
    await waitFor(() => expect(store.removeRetention).toHaveBeenCalledTimes(5));
    expect(app.toast).toHaveBeenCalledWith({ type: "error", title: "تم تمديد 0 عنصراً", message: "سنة واحدة لكل عنصر" });
  });

  it("renders the English labels and actions", () => {
    mockStore();
    mockApp("en");
    renderPage();

    expect(screen.getAllByText("Retention Queue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Due now").length).toBeGreaterThan(0);
    expect(screen.getByText("Maturity distribution")).toBeInTheDocument();
    expect(screen.getByText("Executed disposals (1)")).toBeInTheDocument();
    expect(screen.getByText("Overdue 3d")).toBeInTheDocument();
    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.getByText("60 days")).toBeInTheDocument();
    expect(screen.getByText("Dispose")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by legal hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Certificate" })).toBeInTheDocument();
  });
});
