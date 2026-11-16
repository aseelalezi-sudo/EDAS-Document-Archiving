import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Department, Document, Employee, FolderNode, Project } from "../types";

const mocks = vi.hoisted(() => ({ app: vi.fn(), docs: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { ProjectDetails } from "./org-project-details";

const AR = translations.ar as Record<string, string>;

function t(key: string) {
  return AR[key] ?? key;
}

const legal: Department = {
  id: "legal",
  name: "الشؤون القانونية",
  nameEn: "Legal Affairs",
  code: "LEG",
  parentId: null,
  manager: "أ. سارة المطيري",
  employees: 19,
  docs: 980,
  status: "active",
};

const itDept: Department = {
  id: "it",
  name: "تقنية المعلومات",
  nameEn: "Information Technology",
  code: "IT",
  parentId: "exec",
  manager: "م. فهد الدوسري",
  employees: 52,
  docs: 2340,
  status: "active",
};

const project: Project = {
  id: "p-alpha",
  name: "مشروع ألفا",
  nameEn: "Project Alpha",
  code: "PRJ-A",
  manager: "أمل السبيعي",
  status: "active",
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  departments: ["legal", "it"],
  members: 24,
  docs: 412,
};

const amal: Employee = {
  id: "emp-1",
  empNo: "EMP-1024",
  name: "أمل السبيعي",
  nameEn: "Amal Al-Subaie",
  jobTitle: "مسؤولة أرشفة",
  jobTitleEn: "Archiving Officer",
  deptId: "legal",
  sectionId: "",
  manager: "",
  email: "amal@edas.gov",
  phone: "",
  status: "active",
  initials: "أم",
  color: "bg-navy-600",
};

const fahad: Employee = {
  ...amal,
  id: "emp-2",
  empNo: "EMP-1025",
  name: "فهد الدوسري",
  nameEn: "Fahad Al-Dosari",
  jobTitle: "مدير تقنية المعلومات",
  jobTitleEn: "IT Director",
  deptId: "it",
  initials: "فه",
};

const outsider: Employee = {
  ...amal,
  id: "emp-3",
  empNo: "EMP-1026",
  name: "خالد العتيبي",
  nameEn: "Khalid Al-Otaibi",
  deptId: "exec",
  initials: "خا",
};

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    docNo: "EDAS-2026001",
    title: "عقد التوريد",
    titleEn: "Supply contract",
    category: "عقود",
    categoryEn: "Contracts",
    categoryId: "po",
    deptId: "legal",
    sectionId: "",
    owner: "أمل السبيعي",
    ownerEn: "Amal",
    version: "1.0",
    classification: "internal",
    status: "archived",
    createdAt: "2026-01-01",
    modifiedAt: "2026-01-02",
    retentionEnd: "2031-01-01",
    size: "1.2 MB",
    fileType: "pdf",
    folderId: "f-1",
    projectId: "p-alpha",
    tags: [],
    description: "",
    descriptionEn: "",
    versions: [],
    activity: [],
    retentionDays: 1825,
    ...overrides,
  };
}

const folder: FolderNode = {
  id: "f-proj",
  name: "مجلد المشروع",
  nameEn: "Project folder",
  parentId: null,
  type: "project",
  projectId: "p-alpha",
  docs: 12,
  subfolders: 1,
  accessScope: "قسم",
};

function mockStore(overrides: Record<string, unknown> = {}) {
  const store = {
    projects: { items: [project] },
    departments: { items: [legal, itDept] },
    employees: { items: [amal, fahad, outsider] },
    scopedDocs: [doc(), doc({ id: "doc-2", docNo: "EDAS-2026002", title: "محضر اجتماع" })],
    folders: [folder, { ...folder, id: "f-other", type: "dept", projectId: undefined }],
    docsReady: true,
    ...overrides,
  };
  mocks.docs.mockReturnValue(store);
  return store;
}

function mockApp(role: "system_admin" | "employee" = "system_admin") {
  const app = { t, lang: "ar", role, user: { id: "u-1", name: "أمل السبيعي", department: "legal" } };
  mocks.app.mockReturnValue(app);
  return app;
}

function LocationProbe({ prefix }: { prefix: string }) {
  const location = useLocation();
  const state = location.state as Record<string, unknown> | null;
  return <div>{`${prefix}:${location.pathname}:${String(state?.editProjectId ?? "")}`}</div>;
}

function renderPage(url = "/org/projects/p-alpha") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/org/projects/:id" element={<ProjectDetails />} />
        <Route path="/org/projects" element={<LocationProbe prefix="projects" />} />
        <Route path="/org/employees/:id" element={<LocationProbe prefix="employee" />} />
        <Route path="/documents/:id" element={<LocationProbe prefix="document" />} />
        <Route path="/documents/new" element={<LocationProbe prefix="new" />} />
        <Route path="/library/folders/:id" element={<LocationProbe prefix="folder" />} />
        <Route path="/library" element={<LocationProbe prefix="library" />} />
        <Route path="/reports" element={<LocationProbe prefix="reports" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("project details", () => {
  it("shows a loading shell until documents and projects are ready", () => {
    mockStore({ projects: { items: [] }, docsReady: false });
    mockApp();

    renderPage();

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("explains when the project does not exist", () => {
    mockStore({ projects: { items: [] } });
    mockApp();

    renderPage();

    expect(screen.getByText("لم يتم العثور على المشروع")).toBeInTheDocument();
  });

  it("renders the counters, metadata and the edit action for an authorized role", () => {
    mockStore();
    mockApp("system_admin");

    renderPage();

    expect(screen.getAllByText("الأعضاء").length).toBeGreaterThan(0);
    expect(screen.getAllByText("الوثائق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PRJ-A").length).toBeGreaterThan(0);
    expect(screen.getByText("2025-09-01")).toBeInTheDocument();
    expect(screen.getByText("الشؤون القانونية، تقنية المعلومات")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("g.edit") }));
    expect(screen.getByText(/^projects:\/org\/projects:p-alpha$/)).toBeInTheDocument();
  });

  it("hides the edit action for a role without org write access", () => {
    mockStore();
    mockApp("employee");

    renderPage();

    expect(screen.queryByRole("button", { name: t("g.edit") })).not.toBeInTheDocument();
  });

  it("lists the project members and opens an employee profile", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الأعضاء" }));

    expect(screen.getByText("فهد الدوسري")).toBeInTheDocument();
    expect(screen.queryByText("خالد العتيبي")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /أمل السبيعي/ }));

    expect(screen.getByText(/^employee:\/org\/employees\/emp-1:/)).toBeInTheDocument();
  });

  it("lists the linked documents and opens the selected one", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الوثائق" }));
    fireEvent.click(screen.getByText("محضر اجتماع"));

    expect(screen.getByText(/^document:\/documents\/doc-2:/)).toBeInTheDocument();
  });

  it("lists project folders and opens the selected folder", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "هيكل المجلدات" }));

    expect(screen.getByText("مجلد المشروع")).toBeInTheDocument();
    expect(screen.queryByText("f-other")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /مجلد المشروع/ }));

    expect(screen.getByText(/^folder:\/library\/folders\/f-proj:/)).toBeInTheDocument();
  });

  it("points to the reports centre", () => {
    mockStore();
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "التقارير" }));
    fireEvent.click(screen.getByRole("button", { name: "فتح التقارير" }));

    expect(screen.getByText(/^reports:\/reports:/)).toBeInTheDocument();
  });

  it("renders the empty states for members, documents and folders", () => {
    mockStore({
      projects: {
        items: [{ ...project, departments: [], manager: "" }],
      },
      employees: { items: [] },
      scopedDocs: [],
      folders: [],
    });
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "الأعضاء" }));
    expect(screen.getByText("لا أعضاء مرتبطون")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "الوثائق" }));
    expect(screen.getByText("لا وثائق مرتبطة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "وثيقة جديدة" }));
    expect(screen.getByText(/^new:\/documents\/new:/)).toBeInTheDocument();
  });

  it("renders the empty folder state with a link to the library", () => {
    mockStore({ folders: [] });
    mockApp();

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "هيكل المجلدات" }));
    expect(screen.getByText("لا مجلدات مشاريع")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "فتح المكتبة" }));
    expect(screen.getByText(/^library:\/library:/)).toBeInTheDocument();
  });
});
