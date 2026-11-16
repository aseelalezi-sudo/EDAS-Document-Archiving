import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { NewDocument } from "./documents-new";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    createDocument: vi.fn().mockResolvedValue("doc-9"),
    sendForApproval: vi.fn().mockResolvedValue(true),
    folders: [
      { id: "root", name: "الجذر", nameEn: "Root" },
      { id: "f-1", name: "عقود", nameEn: "Contracts" },
    ],
    departments: { items: [{ id: "legal", name: "الشؤون القانونية", nameEn: "Legal" }] },
    sections: { items: [{ id: "s-1", name: "العقود", nameEn: "Contracts", deptId: "legal" }] },
    systemSettings: {},
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp() {
  const app = { t, lang: "ar", toast: vi.fn(), user: { name: "أمل السبيعي", department: "legal" } };
  mocks.app.mockReturnValue(app);
  return app;
}

function renderPage(url = "/documents/new") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/documents/new" element={<NewDocument />} />
        <Route path="/documents" element={<div>قائمة الوثائق</div>} />
        <Route path="/documents/:id" element={<div>صفحة الوثيقة</div>} />
        <Route path="/workflow/my-tasks" element={<div>مهامي</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function chooseFile(name = "contract.pdf", type = "application/pdf") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["pdf"], name, { type })] } });
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("new document", () => {
  it("requires a file before saving and returns to the upload step", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: t("doc.saveDraft") }));

    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("doc.fileRequired") }));
    expect(store.createDocument).not.toHaveBeenCalled();
    expect(screen.getAllByText("رفع الملف").length).toBeGreaterThan(0);
  });

  it("requires a title after a file is chosen", () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.change(screen.getByDisplayValue("contract"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: t("doc.saveDraft") }));

    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("doc.titleRequired") }));
    expect(store.createDocument).not.toHaveBeenCalled();
  });

  it("derives the title from the file name and saves a draft", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    chooseFile("contract.pdf");

    expect(screen.getByText("جاهز")).toBeInTheDocument();
    expect(screen.getByText("contract.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("doc.saveDraft") }));

    await waitFor(() => expect(store.createDocument).toHaveBeenCalledWith(expect.objectContaining({ title: "contract", tags: [] })));
    await waitFor(() => expect(screen.getByText("قائمة الوثائق")).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("doc.saveDraft") }));
    expect(store.sendForApproval).not.toHaveBeenCalled();
  });

  it("sends the saved document for approval and opens my tasks", async () => {
    const store = mockStore();
    const app = mockApp();

    renderPage();
    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("doc.sendForApproval") }));

    await waitFor(() => expect(store.sendForApproval).toHaveBeenCalledWith("doc-9"));
    await waitFor(() => expect(screen.getByText("مهامي")).toBeInTheDocument());
    expect(app.toast).toHaveBeenCalledWith(expect.objectContaining({ title: t("doc.sendForApproval") }));
  });

  it("falls back to the document page when submission fails", async () => {
    const store = mockStore({ sendForApproval: vi.fn().mockResolvedValue(false) });
    mockApp();

    renderPage();
    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    fireEvent.click(screen.getByRole("button", { name: t("doc.sendForApproval") }));

    await waitFor(() => expect(screen.getByText("صفحة الوثيقة")).toBeInTheDocument());
    expect(store.createDocument).toHaveBeenCalled();
  });

  it("applies the browser department defaults and the preset folder", () => {
    localStorage.setItem(
      "edas.v1.departmentDefaults.legal",
      JSON.stringify({ classification: "SECRET", retentionYears: "7", folderId: "f-1" }),
    );
    mockStore();
    mockApp();

    renderPage("/documents/new?folder=f-1");
    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));

    expect(screen.getByDisplayValue("مقيد")).toBeInTheDocument();
    expect(screen.getByDisplayValue("عقود")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("g.next") }));
    expect(screen.getByText(/مدة الاحتفاظ المرجعية: 7 سنوات/)).toBeInTheDocument();
  });

  it("keeps Arabic labels for the workflow step and the server notes", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /سير العمل/ })[0]);

    expect(screen.getAllByText("إرسال للموافقة").length).toBeGreaterThan(0);
    expect(screen.getByText(/لا تُجدول تلقائياً من هذا النموذج/)).toBeInTheDocument();
  });
});
