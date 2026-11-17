import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document, Policy } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  api: vi.fn(),
  config: { useApi: false },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: mocks.config }));
vi.mock("../lib/domain-api", () => ({
  domainApi: {
    retentionPolicies: (...args: unknown[]) => mocks.api("retentionPolicies", ...args),
    createRetentionPolicy: (...args: unknown[]) => mocks.api("createRetentionPolicy", ...args),
    updateRetentionPolicy: (...args: unknown[]) => mocks.api("updateRetentionPolicy", ...args),
  },
}));

import { PolicyEditor } from "./policies-editor";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    docNo: "EDAS-2026001",
    title: "عقد",
    titleEn: "Contract",
    category: "أوامر الشراء",
    categoryEn: "Purchase orders",
    categoryId: "po",
    deptId: "legal",
    sectionId: "sec-1",
    owner: "أمل",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "draft",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1 MB",
    fileType: "pdf",
    folderId: "f-1",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  };
}

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: "pol-1",
    name: "سياسة العقود",
    nameEn: "Contracts policy",
    scopeType: "إدارة",
    scopeTypeEn: "Department",
    target: "الشؤون القانونية",
    category: "",
    departmentId: "legal",
    retention: "5 سنوات",
    retentionMonths: 60,
    requiresApproval: false,
    disposal: "حذف آمن",
    disposalEn: "Secure delete",
    priority: "medium",
    status: "active",
    updated: "2026-01-01",
    affectedDocs: 2,
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    policies: { items: [] as Policy[], add: vi.fn(), update: vi.fn() },
    scopedDocs: [doc(), doc({ id: "doc-2", categoryId: "hr", deptId: "hr" })],
    departments: { items: [{ id: "legal", name: "الشؤون القانونية", nameEn: "Legal" }] },
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(lang: "ar" | "en" = "ar") {
  const dict = (lang === "en" ? translations.en : translations.ar) as Record<string, string>;
  const app = { t: (key: string) => dict[key] ?? key, lang, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(url = "/policies/new") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/policies/:id" element={<PolicyEditor />} />
        <Route path="/policies" element={<div>قائمة السياسات</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.api.mockReset();
  mocks.config.useApi = false;
});

describe("policy editor", () => {
  it("gates the first step on a policy name", () => {
    mockStore();
    mockApp();

    renderPage();

    expect(screen.getByRole("button", { name: t("g.next") })).toBeDisabled();
    expect(screen.getByText(/الاسم مطلوب للمتابعة/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: "سياسة العقود" } });

    expect(screen.getByRole("button", { name: t("g.next") })).toBeEnabled();
  });

  it("walks all four steps and activates the policy", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: "سياسة العقود" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    fireEvent.click(screen.getByRole("button", { name: "إدارة" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "legal" } });
    expect(screen.getByText(/ستخضع لهذه السياسة/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    fireEvent.click(screen.getByRole("button", { name: /نقل إلى تخزين بارد/ }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    expect(screen.getByText("ملخص السياسة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "سياسة العقود",
        scopeType: "إدارة",
        target: "الشؤون القانونية",
        retention: "5 سنوات",
        retentionMonths: 60,
        disposal: "نقل إلى تخزين بارد",
        status: "active",
        affectedDocs: 1,
      }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تفعيل السياسة" }));
    expect(screen.getByText("قائمة السياسات")).toBeInTheDocument();
  });

  it("saves the policy as inactive without activating it", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: "سياسة عامة" } });
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "حفظ كغير مفعّلة" }));

    expect(store.policies.add).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive", scopeType: "عام" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حفظ السياسة كغير مفعّلة" }));
  });

  it("keeps activation disabled until the scope and name are complete", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);

    expect(screen.getByRole("button", { name: "تفعيل السياسة" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "حفظ كغير مفعّلة" })).toBeDisabled();
    expect(screen.getByText(/الاسم مطلوب قبل التفعيل/)).toBeInTheDocument();
  });

  it("loads an existing policy into the wizard and saves the changes", () => {
    const store = mockStore({ policies: { items: [policy()], add: vi.fn(), update: vi.fn() } });
    const app = mockApp();

    renderPage("/policies/pol-1");

    expect(screen.getByDisplayValue("سياسة العقود")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("سياسة العقود"), { target: { value: "سياسة العقود المعدّلة" } });
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    expect(store.policies.update).toHaveBeenCalledWith(
      "pol-1",
      expect.objectContaining({
        name: "سياسة العقود المعدّلة",
        target: "الشؤون القانونية",
        scopeType: "إدارة",
        category: "",
        affectedDocs: 1,
      }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تفعيل السياسة" }));
  });

  it("reports a policy that is no longer available and returns to the list", () => {
    mockStore();
    const app = mockApp();

    renderPage("/policies/missing");

    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "السياسة غير موجودة" }));
    expect(screen.getByText("قائمة السياسات")).toBeInTheDocument();
  });

  it("shows the retention months for a months-based policy", () => {
    mockStore({ policies: { items: [policy({ retention: "18 شهراً", retentionMonths: 18 })], add: vi.fn(), update: vi.fn() } });
    mockApp();

    renderPage("/policies/pol-1");
    fireEvent.click(screen.getAllByRole("button", { name: /الاحتفاظ والإتلاف/ })[0]);

    expect(screen.getByDisplayValue("18")).toBeInTheDocument();
    expect(screen.getByText("18 شهر")).toBeInTheDocument();
  });
});

describe("policy editor scopes", () => {
  function name(name = "سياسة العقود") {
    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: name } });
  }

  it("scopes the policy to a category and saves the target", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    name();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: "تصنيف وثيقة" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "po" } });

    expect(screen.getByText(/ستخضع لهذه السياسة/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    expect(screen.getByText("تصنيف وثيقة: أمر شراء")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: "تصنيف وثيقة", target: "أمر شراء", category: "po", affectedDocs: 1 }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تفعيل السياسة" }));
  });

  it("blocks the review step until an incomplete scope picks a target", () => {
    mockStore();
    mockApp();

    renderPage();
    name();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: "تصنيف وثيقة" }));
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);

    expect(screen.getByText(/اختر نطاق السياسة قبل التفعيل/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تفعيل السياسة" })).toBeDisabled();
  });

  it("switches the retention unit and recalculates the months", () => {
    mockStore();
    mockApp();

    renderPage();
    name();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "months" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "18" } });
    expect(screen.getByText("18 شهر")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "years" } });
    expect(screen.getByText("216 شهر")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    expect(screen.getByText("36 شهر")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    expect(screen.getByText("3 سنوات")).toBeInTheDocument();
  });

  it("returns to an earlier step and jumps through the step tabs", () => {
    mockStore();
    mockApp();

    renderPage();
    name();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    expect(screen.getByRole("button", { name: t("g.previous") })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: t("g.previous") }));
    expect(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("g.previous") })).toBeDisabled();

    fireEvent.click(screen.getAllByRole("button", { name: /الاحتفاظ والإتلاف/ })[0]);
    expect(screen.getByText("حذف آمن")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    expect(screen.getByText("ملخص السياسة")).toBeInTheDocument();
  });

  it("maps a category policy with manual review disposal when editing", () => {
    mockStore({
      policies: {
        items: [policy({ scopeType: "نطاق", departmentId: undefined, category: "po", retention: "60", disposal: "مراجعة يدوية" })],
        add: vi.fn(),
        update: vi.fn(),
      },
    });
    mockApp();

    renderPage("/policies/pol-1");
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);

    expect(screen.getByText("تصنيف وثيقة: أمر شراء")).toBeInTheDocument();
    expect(screen.getByText("مراجعة يدوية")).toBeInTheDocument();
    expect(screen.getByText("محفوظة")).toBeInTheDocument();
  });

  it("maps a cold storage policy to the archive action", () => {
    mockStore({
      policies: {
        items: [policy({ disposal: "نقل إلى تخزين بارد", disposalEn: "Cold storage" })],
        add: vi.fn(),
        update: vi.fn(),
      },
    });
    mockApp();

    renderPage("/policies/pol-1");
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);

    expect(screen.getByText("نقل إلى تخزين بارد")).toBeInTheDocument();
  });
});

describe("policy editor in English", () => {
  it("renders the create wizard and saves an inactive policy", () => {
    const store = mockStore();
    const app = mockApp("en");

    renderPage();

    expect(screen.getByRole("heading", { name: "Create archive policy" })).toBeInTheDocument();
    expect(screen.getByText("General info")).toBeInTheDocument();
    expect(screen.getByText("Retention & disposal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Contract retention"), { target: { value: "Contracts" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Review & activate/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save as inactive" }));

    expect(store.policies.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Contracts", scopeType: "Global", status: "inactive" }),
    );
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Policy saved as inactive" }));
  });
});

describe("policy editor over the API", () => {
  function api(overrides: Record<string, unknown> = {}) {
    const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {
      retentionPolicies: () => Promise.resolve({ items: [policy()] }),
      createRetentionPolicy: () => Promise.resolve(undefined),
      updateRetentionPolicy: () => Promise.resolve(undefined),
      ...overrides,
    };
    mocks.api.mockImplementation((method: string, ...args: unknown[]) => handlers[method]?.(args[0]));
  }

  it("creates a policy through the API", async () => {
    mocks.config.useApi = true;
    api();
    mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: "سياسة العقود" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "createRetentionPolicy",
        expect.objectContaining({ name: "سياسة العقود", retentionMonths: 60, action: "DESTROY", isActive: true }),
      ),
    );
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تفعيل السياسة" })));
    expect(await screen.findByText("قائمة السياسات")).toBeInTheDocument();
  });

  it("loads an edit form from the API and updates the policy", async () => {
    mocks.config.useApi = true;
    api();
    mockStore();
    const app = mockApp();

    renderPage("/policies/pol-1");
    expect(screen.getByText("جارٍ تحميل السياسة…")).toBeInTheDocument();

    expect(await screen.findByDisplayValue("سياسة العقود")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /المراجعة والتفعيل/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "updateRetentionPolicy",
        "pol-1",
        expect.objectContaining({ name: "سياسة العقود", departmentId: "legal", category: null }),
      ),
    );
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم تفعيل السياسة" })));
  });

  it("reports API load failures and missing policies", async () => {
    mocks.config.useApi = true;
    api({ retentionPolicies: () => Promise.reject(new Error("offline")) });
    mockStore();
    const app = mockApp();
    const view = renderPage("/policies/pol-1");

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByRole("heading", { name: /تعديل — سياسة/ })).toBeInTheDocument();

    view.unmount();
    api({ retentionPolicies: () => Promise.resolve({ items: [] }) });
    renderPage("/policies/pol-1");

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "السياسة غير موجودة" })));
    expect(await screen.findByText("قائمة السياسات")).toBeInTheDocument();
  });

  it("keeps the form open when the API refuses the save", async () => {
    mocks.config.useApi = true;
    api({ createRetentionPolicy: () => Promise.reject(new Error("conflict")) });
    mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: الاحتفاظ بالعقود"), { target: { value: "سياسة العقود" } });
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: "تفعيل السياسة" }));

    await waitFor(() => expect(app.toast).toHaveBeenCalledWith({ type: "error", title: t("err.api") }));
    expect(screen.getByText("ملخص السياسة")).toBeInTheDocument();
    expect(screen.queryByText("قائمة السياسات")).toBeNull();
  });
});
