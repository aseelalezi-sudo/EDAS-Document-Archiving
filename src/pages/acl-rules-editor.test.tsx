import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { ACLRule } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { ACLRulesEditor } from "./acl-rules-editor";

function rule(overrides: Partial<ACLRule> = {}): ACLRule {
  return {
    id: "rule-1",
    principalType: "department",
    principalId: "legal",
    principalName: "الشؤون القانونية",
    permissions: ["view", "download"],
    effect: "allow",
    ...overrides,
  };
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    acls: { "f-1": [rule()] },
    aclFailedFolders: [] as string[],
    retryFolderAcl: vi.fn().mockResolvedValue(true),
    addACLRule: vi.fn(),
    removeACLRule: vi.fn(),
    toggleRulePermission: vi.fn(),
    toggleRuleEffect: vi.fn(),
    getInheritedRules: vi.fn().mockReturnValue([]),
    propagateRule: vi.fn().mockReturnValue(2),
    getChildrenIds: vi.fn().mockReturnValue([]),
    departments: { items: [{ id: "legal", name: "الشؤون القانونية", nameEn: "Legal" }] },
    users: { items: [{ id: "u-1", name: "خالد العمري", status: "active" }] },
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role = "archivist") {
  const app = { t: (key: string) => (translations.ar as Record<string, string>)[key] ?? key, lang: "ar", role, toast: vi.fn() };
  mocks.app.mockReturnValue(app);
  return app;
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("ACL rules editor", () => {
  it("lists the folder rules and toggles a permission and an effect", () => {
    const store = mockStore();
    mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    expect(screen.getByText("قواعد خاصة بهذا المجلد (1)")).toBeInTheDocument();
    expect(screen.getAllByText("الشؤون القانونية").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(store.toggleRulePermission).toHaveBeenCalledWith("f-1", "rule-1", "edit");

    fireEvent.click(screen.getByRole("button", { name: "سماح" }));
    expect(store.toggleRuleEffect).toHaveBeenCalledWith("f-1", "rule-1");
  });

  it("adds a rule for the selected principal and clears the selection", () => {
    const store = mockStore();
    const app = mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    const [typeSelect, principalSelect] = screen.getAllByRole("combobox");
    expect(typeSelect).toHaveValue("department");
    fireEvent.change(principalSelect, { target: { value: "legal" } });
    fireEvent.click(screen.getByRole("button", { name: /إضافة قاعدة/ }));

    expect(store.addACLRule).toHaveBeenCalledWith("f-1", {
      principalType: "department",
      principalId: "legal",
      principalName: "الشؤون القانونية",
      permissions: ["view", "download"],
      effect: "allow",
    });
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تمت إضافة القاعدة", message: "الشؤون القانونية" }));
    expect(principalSelect).toHaveValue("");
  });

  it("propagates a new rule to the subfolders when requested", () => {
    const store = mockStore({ getChildrenIds: vi.fn().mockReturnValue(["c-1", "c-2"]) });
    const app = mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    const [typeSelect, principalSelect] = screen.getAllByRole("combobox");
    fireEvent.change(typeSelect, { target: { value: "user" } });
    fireEvent.change(principalSelect, { target: { value: "u-1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /تعميم على 2 مجلد فرعي/ }));
    fireEvent.click(screen.getByRole("button", { name: /إضافة قاعدة/ }));

    expect(store.propagateRule).toHaveBeenCalledWith("f-1", expect.objectContaining({ principalType: "user" }));
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ message: "خالد العمري — + تعميم على 2 مجلد فرعي" }));
  });

  it("removes a rule after confirmation", () => {
    const store = mockStore();
    const app = mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    fireEvent.click(screen.getByRole("button", { name: "حذف القاعدة" }));
    const dialog = screen.getByRole("dialog", { name: "حذف قاعدة الصلاحيات؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف" }));

    expect(store.removeACLRule).toHaveBeenCalledWith("f-1", "rule-1");
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تم حذف القاعدة" }));
  });

  it("shows a read-only view for roles without management rights", () => {
    mockStore();
    mockApp("employee");

    render(<ACLRulesEditor folderId="f-1" />);

    expect(screen.getByText(/لديك صلاحية عرض فقط/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /إضافة قاعدة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حذف القاعدة" })).not.toBeInTheDocument();
  });

  it("hides the rules and offers a retry when the folder fetch failed", async () => {
    const store = mockStore({ aclFailedFolders: ["f-1"], retryFolderAcl: vi.fn().mockResolvedValue(false) });
    const app = mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    expect(screen.getByText("تعذر تحميل القواعد من الخادم")).toBeInTheDocument();
    expect(screen.queryByText("الشؤون القانونية")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    await waitFor(() => expect(store.retryFolderAcl).toHaveBeenCalledWith("f-1"));
    await waitFor(() => expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "تعذر تحميل القواعد" })));
  });

  it("shows the inherited rules and lets the user hide them", () => {
    mockStore({
      getInheritedRules: vi.fn().mockReturnValue([{ rule: rule({ id: "inh-1" }), fromFolderName: "المجلد الأب" }]),
    });
    mockApp();

    render(<ACLRulesEditor folderId="f-1" />);

    expect(screen.getByText("1 قاعدة موروثة من المجلدات الأب")).toBeInTheDocument();
    expect(screen.getByText("المجلد الأب")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إخفاء" }));
    expect(screen.queryByText("المجلد الأب")).not.toBeInTheDocument();
  });
});
