import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document, Policy } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../config", () => ({ config: { useApi: false } }));

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

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn() };
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
