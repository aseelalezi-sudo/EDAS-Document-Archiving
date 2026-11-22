import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AclRuleDto,
  ApprovalInstanceDto,
  AuditEventDto,
  DestructionCertificateDto,
  DocumentDetailDto,
  DocumentDto,
  DocumentVersionDto,
  FolderDto,
  LegalHoldDto,
  NotificationDto,
  OrgDepartmentDto,
  OrgEmployeeDto,
  OrgProjectDto,
  ProfileDto,
  ReportSummaryDto,
  ReportTemplateDto,
  RetentionItemDto,
  SettingDto,
  TaskDto,
  UserSummaryDto,
} from "@edas/shared";
import { ApiError } from "./lib/api-client";
import type { FolderNode } from "./types";

const mocks = vi.hoisted(() => ({
  docs: {
    foldersTree: vi.fn(),
    folderAcls: vi.fn(),
    folderAcl: vi.fn(),
    putFolderAcl: vi.fn(),
    listDocuments: vi.fn(),
    trashDocuments: vi.fn(),
    getDocument: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    restoreDocument: vi.fn(),
    purgeDocument: vi.fn(),
    addVersion: vi.fn(),
    restoreVersion: vi.fn(),
    checkout: vi.fn(),
    checkin: vi.fn(),
    requestSignature: vi.fn(),
    sign: vi.fn(),
    declareRecord: vi.fn(),
    downloadUrl: vi.fn(),
    versions: vi.fn(),
    uploadToStorage: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
  domain: {
    retentionItems: vi.fn(),
    holds: vi.fn(),
    createHold: vi.fn(),
    releaseHold: vi.fn(),
    tasks: vi.fn(),
    completeTask: vi.fn(),
    updateTask: vi.fn(),
    pendingApprovals: vi.fn(),
    submitApproval: vi.fn(),
    decideApproval: vi.fn(),
    users: vi.fn(),
    settings: vi.fn(),
    putSetting: vi.fn(),
    auditEvents: vi.fn(),
    notifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    orgTree: vi.fn(),
    orgProjects: vi.fn(),
    orgEmployees: vi.fn(),
    reportSummary: vi.fn(),
    reportTemplates: vi.fn(),
    scheduleRetention: vi.fn(),
    extendRetention: vi.fn(),
    executeRetention: vi.fn(),
    retentionCertificate: vi.fn(),
  },
  session: { restoreSession: vi.fn(), clearSession: vi.fn(), beginLogin: vi.fn(), endSession: vi.fn() },
  openDownload: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./config", () => ({ config: { useApi: true } }));
vi.mock("./lib/session", () => mocks.session);
vi.mock("./lib/docs-api", () => ({ docsApi: mocks.docs }));
vi.mock("./lib/domain-api", () => ({ domainApi: mocks.domain }));
vi.mock("./lib/download", () => ({ openDownload: mocks.openDownload }));
vi.mock("./lib/log-error", () => ({ logError: mocks.logError }));

import { AppProvider, useApp } from "./store";
import { DocsProvider, useDocsStore } from "./store-docs";

const API_ERROR_TITLE = "تعذّر تنفيذ العملية على الخادم. حاول مرة أخرى.";

function profile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    id: "u-1",
    username: "amal",
    name: "أمل السبيعي",
    nameEn: "Amal",
    email: "amal@edas.gov",
    role: "SYSTEM_ADMIN",
    status: "ACTIVE",
    departmentId: "legal",
    sectionId: null,
    jobTitle: "مديرة",
    jobTitleEn: "Manager",
    phone: null,
    isNew: false,
    ...overrides,
  };
}

function folderDto(overrides: Partial<FolderDto> = {}): FolderDto {
  return {
    id: "f-api",
    name: "عقود",
    nameEn: null,
    type: "DEPARTMENT",
    scope: "DEPARTMENT",
    path: "/legal",
    parentId: null,
    departmentId: "legal",
    projectId: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function versionDto(overrides: Partial<DocumentVersionDto> = {}): DocumentVersionDto {
  return {
    id: "v-2",
    version: 2,
    comment: null,
    isCurrent: true,
    createdById: "u-1",
    createdByName: "أمل السبيعي",
    createdAt: "2026-02-01T00:00:00Z",
    file: {
      id: "file-1",
      originalName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      checksumSha256: "abcdef1234567890",
      createdAt: "2026-02-01T00:00:00Z",
    },
    ...overrides,
  };
}

function docDto(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "doc-api-1",
    docNo: "EDAS-2026001",
    title: "عقد API",
    titleEn: null,
    description: null,
    category: "contract",
    classification: "INTERNAL",
    status: "APPROVED",
    isRecord: false,
    currentVersion: 2,
    fileType: "application/pdf",
    sizeBytes: 2048,
    tags: [],
    retentionEnd: null,
    folderId: "f-api",
    departmentId: "legal",
    sectionId: "legal-1",
    projectId: null,
    ownerId: "u-1",
    ownerName: "أمل السبيعي",
    ownerNameEn: null,
    departmentName: null,
    departmentNameEn: null,
    folderName: null,
    checkedOutById: null,
    checkedOutByName: null,
    checkedOutAt: null,
    signatureStatus: "NONE",
    signedById: null,
    signedByName: null,
    signedAt: null,
    deletedAt: null,
    deletedById: null,
    deletedByName: null,
    createdAt: "2026-01-01T09:00:00Z",
    updatedAt: "2026-01-02T09:00:00Z",
    ...overrides,
  };
}

function detailDto(overrides: Partial<DocumentDetailDto> = {}): DocumentDetailDto {
  return { ...docDto(), versions: [versionDto()], ...overrides };
}

function trashDto(): DocumentDto {
  return docDto({ deletedAt: "2026-11-01T00:00:00Z", deletedByName: "أحمد البلوي", folderName: "عقود" });
}

function retentionDto(): RetentionItemDto {
  return {
    id: "ret-1",
    documentId: "doc-api-1",
    policyId: "p-1",
    dueAt: "2027-01-01T00:00:00Z",
    action: "REVIEW",
    status: "pending",
    executedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    document: {
      id: "doc-api-1",
      docNo: "EDAS-2026001",
      title: "عقد API",
      status: "APPROVED",
      isRecord: false,
      departmentId: "legal",
      retentionEnd: "2027-01-01T00:00:00Z",
      folderId: "f-api",
      ownerId: "u-1",
      owner: { name: "أمل السبيعي" },
    },
    policy: { id: "p-1", name: "سياسة الاحتفاظ", action: "REVIEW", retentionMonths: 12 },
  };
}

function holdDto(): LegalHoldDto {
  return {
    id: "h-1",
    caseNo: "CASE-1",
    reason: "قضية قائمة",
    status: "ACTIVE",
    placedById: "u-1",
    placedByName: "أمل السبيعي",
    placedAt: "2026-03-01T00:00:00Z",
    releasedById: null,
    releasedByName: null,
    releasedAt: null,
    documents: [
      {
        id: "doc-api-1",
        docNo: "EDAS-2026001",
        title: "عقد API",
        status: "APPROVED",
        departmentId: "legal",
        addedAt: "2026-03-01T00:00:00Z",
      },
    ],
  };
}

function taskDto(): TaskDto {
  return {
    id: "t-1",
    title: "مراجعة العقد",
    description: "خطوة المراجعة",
    documentId: "doc-api-1",
    assigneeId: "u-2",
    createdById: "u-1",
    status: "in_progress",
    priority: "high",
    dueAt: "2026-12-01T00:00:00Z",
    createdAt: "2026-11-01T00:00:00Z",
    completedAt: null,
  };
}

function approvalDto(): ApprovalInstanceDto {
  return {
    id: "ap-1",
    documentId: "doc-api-1",
    document: { id: "doc-api-1", docNo: "EDAS-2026001", title: "عقد API", departmentId: "legal", status: "IN_REVIEW" },
    chainId: "chain-1",
    chainName: "سلسلة العقود",
    status: "PENDING",
    startedById: "u-1",
    startedAt: "2026-11-01T00:00:00Z",
    completedAt: null,
    steps: [{ order: 1, name: "مراجعة", role: "DEPT_MANAGER", decided: false }],
    currentStep: { order: 1, role: "DEPT_MANAGER" },
    decisions: [],
  };
}

function userDto(): UserSummaryDto {
  return {
    id: "u-2",
    username: "noura",
    name: "نورة السالم",
    nameEn: null,
    email: "noura@edas.gov",
    role: "EMPLOYEE",
    status: "ACTIVE",
    departmentId: "legal",
    sectionId: null,
    jobTitle: "موظفة",
    jobTitleEn: null,
    phone: null,
    failedAttempts: 0,
    activeSessions: 0,
    lastLoginAt: "2026-01-01T00:00:00Z",
  };
}

function settingsDto(): { items: SettingDto[]; meta: { total: number } } {
  return {
    items: [
      { key: "orgName", value: "هيئة الاختبار" },
      { key: "maxFileSize", value: 25 },
      { key: "featureFlag", value: true },
      { key: "routing", value: { mode: "strict" } },
      { key: "emptySetting", value: null },
    ],
    meta: { total: 5 },
  };
}

function auditDto(): AuditEventDto {
  return {
    id: "a-1",
    ts: "2026-11-05T08:15:00Z",
    actorId: "u-2",
    actorName: null,
    action: "document.update",
    entityType: "Document",
    entityId: "doc-api-1",
    departmentId: "legal",
    ip: "10.0.0.1",
    result: "failure",
    correlationId: "corr-1",
    detail: { field: "title" },
    prevHash: null,
    hash: "hash-1",
  };
}

function notificationDto(): NotificationDto {
  return {
    id: "n-1",
    userId: "u-1",
    title: "إشعار",
    message: "رسالة",
    level: "WARNING",
    read: false,
    entityType: "Document",
    entityId: "doc-api-1",
    createdAt: "2026-11-05T08:00:00Z",
  };
}

function orgTreeDto(): OrgDepartmentDto {
  return {
    id: "legal",
    code: "LEG",
    name: "الشؤون القانونية",
    nameEn: null,
    manager: "مدير الإدارة",
    parentId: null,
    sections: [
      {
        id: "legal-1",
        code: "LEG-1",
        name: "العقود",
        nameEn: null,
        manager: null,
        departmentId: "legal",
        _count: { users: 2, employees: 2 },
      },
    ],
    _count: { users: 3, employees: 3, documents: 1 },
  };
}

function projectDto(): OrgProjectDto {
  return {
    id: "prj-1",
    code: "PRJ-1",
    name: "مشروع",
    nameEn: null,
    status: "active",
    startDate: "2026-01-01",
    endDate: null,
    departmentId: "legal",
    _count: { documents: 1, folders: 1 },
  };
}

function employeeDto(): OrgEmployeeDto {
  return {
    id: "emp-1",
    empNo: "EMP-1",
    name: "موظف",
    nameEn: null,
    jobTitle: "أخصائي",
    jobTitleEn: null,
    email: "emp@edas.gov",
    phone: null,
    status: "ACTIVE",
    departmentId: "legal",
    sectionId: "legal-1",
    userId: "u-2",
  };
}

function summaryDto(): ReportSummaryDto {
  return {
    documents: { total: 12, byStatus: { APPROVED: 10 }, byClassification: { INTERNAL: 12 } },
    approvals: { pending: 2 },
    retention: { overdue: 1 },
    legalHolds: { active: 1 },
    users: { total: 9 },
    tasks: { open: 3 },
    trend: [{ month: "2026-10", uploaded: 5, archived: 2 }],
  };
}

function templateDto(): ReportTemplateDto {
  return {
    id: "tpl-api",
    name: "تقرير API",
    nameEn: "API report",
    category: "تقارير",
    categoryEn: "Reports",
    desc: "وصف",
    descEn: "Description",
    icon: "file",
    favorite: true,
    schedule: "DAILY",
    lastRun: null,
  };
}

function aclRuleDto(): AclRuleDto {
  return {
    id: "acl-1",
    folderId: "f-api",
    principalType: "USER",
    principalId: "u-2",
    actions: ["VIEW"],
    effect: "ALLOW",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function certificateDto(): DestructionCertificateDto {
  return {
    certificateRef: "DES-RET-1-2026",
    auditEventId: "a-1",
    auditHash: null,
    destroyedAt: "2026-11-01T00:00:00Z",
    performedById: "u-1",
    performedBy: "أمل السبيعي",
    retentionItemId: "ret-1",
    document: { id: "doc-api-1", docNo: "EDAS-2026001", title: "عقد API" },
    policy: { id: "p-1", name: "سياسة الاحتفاظ", retentionMonths: 12, legalBasis: null },
    dueAt: "2027-01-01T00:00:00Z",
    note: null,
    files: [],
    fileCount: 0,
    totalBytes: 0,
    storageErrors: 0,
  };
}

function newFolder(): FolderNode {
  return {
    id: "f-new",
    name: "مجلد جديد",
    nameEn: "New folder",
    parentId: "f-api",
    type: "dept",
    docs: 0,
    subfolders: 0,
    accessScope: "عام",
    starred: false,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider>
    <DocsProvider>{children}</DocsProvider>
  </AppProvider>
);

function renderApi() {
  return renderHook(() => ({ app: useApp(), docs: useDocsStore() }), { wrapper });
}

async function booted() {
  const view = renderApi();
  await waitFor(() => expect(view.result.current.docs.docsReady).toBe(true));
  return view;
}

function page<T>(items: T[], total = items.length, pageNo = 1) {
  return Promise.resolve({ items, meta: { page: pageNo, pageSize: 100, total } });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();

  mocks.session.restoreSession.mockResolvedValue(profile());
  mocks.session.clearSession.mockReset();
  mocks.session.beginLogin.mockReset();
  mocks.session.endSession.mockResolvedValue(null);
  mocks.openDownload.mockReset();
  mocks.logError.mockReset();

  mocks.docs.foldersTree.mockResolvedValue({ items: [folderDto()] });
  mocks.docs.folderAcls.mockResolvedValue([aclRuleDto()]);
  mocks.docs.folderAcl.mockResolvedValue([aclRuleDto()]);
  mocks.docs.putFolderAcl.mockResolvedValue([aclRuleDto()]);
  mocks.docs.listDocuments.mockImplementation((query: { page?: number } = {}) =>
    (query.page ?? 1) === 1 ? page([docDto()], 2, 1) : page([docDto({ id: "doc-api-2", docNo: "EDAS-2026002", title: "عقد ثانٍ" })], 2, 2),
  );
  mocks.docs.trashDocuments.mockImplementation(() => page([trashDto()], 1));
  mocks.docs.getDocument.mockResolvedValue(detailDto());
  mocks.docs.createDocument.mockResolvedValue(docDto({ id: "doc-new", title: "وثيقة جديدة" }));
  mocks.docs.updateDocument.mockImplementation((_id: string, body: { transition?: string; title?: string }) =>
    Promise.resolve(docDto({ title: body.title ?? "عقد API", status: body.transition === "ARCHIVE" ? "ARCHIVED" : "APPROVED" })),
  );
  mocks.docs.deleteDocument.mockResolvedValue({ id: "doc-api-1", deleted: true });
  mocks.docs.restoreDocument.mockResolvedValue(docDto());
  mocks.docs.purgeDocument.mockResolvedValue({ id: "doc-api-1", deleted: true, purged: true });
  mocks.docs.addVersion.mockResolvedValue({ documentId: "doc-api-1", version: 3, fileId: "file-3", isCurrent: true });
  mocks.docs.restoreVersion.mockResolvedValue(detailDto());
  mocks.docs.checkout.mockResolvedValue(docDto({ checkedOutById: "u-1", checkedOutByName: "أمل السبيعي" }));
  mocks.docs.checkin.mockResolvedValue(docDto());
  mocks.docs.requestSignature.mockResolvedValue(docDto({ signatureStatus: "PENDING" }));
  mocks.docs.sign.mockResolvedValue(docDto({ signatureStatus: "SIGNED", signedByName: "أمل السبيعي", signedAt: "2026-11-05T00:00:00Z" }));
  mocks.docs.declareRecord.mockResolvedValue(docDto({ isRecord: true }));
  mocks.docs.downloadUrl.mockResolvedValue({ url: "https://files.test/contract.pdf" });
  mocks.docs.versions.mockResolvedValue([versionDto()]);
  mocks.docs.uploadToStorage.mockResolvedValue({ id: "file-new" });
  mocks.docs.createFolder.mockResolvedValue(folderDto({ id: "f-new", name: "مجلد جديد" }));
  mocks.docs.updateFolder.mockResolvedValue(folderDto({ name: "مجلد جديد" }));
  mocks.docs.deleteFolder.mockResolvedValue({ id: "f-api", deleted: true });

  mocks.domain.retentionItems.mockImplementation(() => page([retentionDto()], 1));
  mocks.domain.holds.mockResolvedValue({ items: [holdDto()], meta: { page: 1, pageSize: 100, total: 1 } });
  mocks.domain.createHold.mockResolvedValue(holdDto());
  mocks.domain.releaseHold.mockResolvedValue({ ...holdDto(), status: "RELEASED" });
  mocks.domain.tasks.mockResolvedValue({ items: [taskDto()], meta: { page: 1, pageSize: 100, total: 1 } });
  mocks.domain.completeTask.mockResolvedValue(taskDto());
  mocks.domain.updateTask.mockResolvedValue(taskDto());
  mocks.domain.pendingApprovals.mockResolvedValue({ items: [approvalDto()], meta: { total: 1 } });
  mocks.domain.submitApproval.mockResolvedValue({ id: "ap-1" });
  mocks.domain.decideApproval.mockResolvedValue({ id: "ap-1" });
  mocks.domain.users.mockResolvedValue({ items: [userDto()], meta: { page: 1, pageSize: 100, total: 1 } });
  mocks.domain.settings.mockResolvedValue(settingsDto());
  mocks.domain.putSetting.mockResolvedValue({ key: "orgName", value: "قيمة" });
  mocks.domain.auditEvents.mockResolvedValue({
    items: [auditDto()],
    meta: { page: 1, pageSize: 200, total: 1, success: 0, failure: 1, entityTypes: ["Document"] },
  });
  mocks.domain.notifications.mockResolvedValue({ items: [notificationDto()], meta: { page: 1, pageSize: 50, total: 1, unread: 1 } });
  mocks.domain.markNotificationRead.mockResolvedValue({ id: "n-1", read: true });
  mocks.domain.markAllNotificationsRead.mockResolvedValue({ updated: 1 });
  mocks.domain.orgTree.mockResolvedValue({ items: [orgTreeDto()] });
  mocks.domain.orgProjects.mockResolvedValue({ items: [projectDto()], meta: { total: 1 } });
  mocks.domain.orgEmployees.mockImplementation(() => page([employeeDto()], 1));
  mocks.domain.reportSummary.mockResolvedValue(summaryDto());
  mocks.domain.reportTemplates.mockResolvedValue({ items: [templateDto()], meta: { total: 1 } });
  mocks.domain.scheduleRetention.mockResolvedValue(retentionDto());
  mocks.domain.extendRetention.mockResolvedValue(retentionDto());
  mocks.domain.executeRetention.mockResolvedValue(retentionDto());
  mocks.domain.retentionCertificate.mockResolvedValue(certificateDto());
});

describe("documents store boot over the API", () => {
  it("discards legacy business data and keeps connected documents in the current session", async () => {
    localStorage.setItem("edas.v1.docs", JSON.stringify([{ id: "previous-account-doc" }]));
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    const { result } = renderApi();
    expect(result.current.docs.docs.some((doc) => doc.id === "previous-account-doc")).toBe(false);
    await waitFor(() => expect(result.current.docs.docs[0]?.id).toBe("doc-api-1"));
    for (const key of ["docs", "trash", "acls", "auditLog", "user", "role"]) {
      expect(localStorage.getItem("edas.v1." + key)).toBeNull();
    }
    expect(localStorage.getItem("edas.v1.lang")).toBe('"en"');
    act(() => window.dispatchEvent(new Event("edas:unauthorized")));
    await waitFor(() => expect(result.current.app.user).toBeNull());
    expect(result.current.docs.docs.some((doc) => doc.id === "doc-api-1")).toBe(false);
  });

  it("hydrates every remote collection after the session is restored", async () => {
    const { result } = await booted();

    expect(result.current.docs.docs.map((doc) => doc.id)).toEqual(["doc-api-1"]);
    expect(result.current.docs.docsMeta).toEqual({ loaded: 1, total: 2 });
    expect(result.current.docs.docs[0]).toMatchObject({ category: "عقد", folderId: "f-api", owner: "أمل السبيعي", version: "2.0" });
    expect(result.current.docs.folders[0]).toMatchObject({ id: "f-api", docs: 1, name: "عقود" });
    expect(result.current.docs.trash).toHaveLength(1);
    expect(result.current.docs.retention[0]).toMatchObject({ id: "ret-1", onHold: true, policy: "سياسة الاحتفاظ" });
    expect(result.current.docs.holds.items[0]).toMatchObject({ id: "h-1", items: 1, status: "active" });
    expect(result.current.docs.acls["f-api"]).toHaveLength(1);
    expect(result.current.docs.aclFailedFolders).toEqual([]);
    expect(result.current.docs.users.items[0]).toMatchObject({ id: "u-2", username: "noura" });
    expect(result.current.docs.templates[0]).toMatchObject({ id: "tpl-api", name: "تقرير API" });
    expect(result.current.docs.departments.items[0]).toMatchObject({ id: "legal", employees: 3, docs: 1 });
    expect(result.current.docs.sections.items[0]).toMatchObject({ id: "legal-1", employees: 2 });
    expect(result.current.docs.projects.items[0]).toMatchObject({ id: "prj-1", status: "active" });
    expect(result.current.docs.employees.items[0]).toMatchObject({ id: "emp-1", userId: "u-2" });
    expect(result.current.docs.tasks[0]).toMatchObject({ id: "t-1", docTitle: "عقد API", priority: "high" });
    expect(result.current.docs.pendingApprovals.map((item) => item.id)).toEqual(["ap-1"]);
    expect(result.current.docs.approvalsReady).toBe(true);
    expect(result.current.docs.auditLog[0]).toMatchObject({ id: "a-1", user: "نورة السالم", result: "failure" });
    expect(result.current.docs.notifications[0]).toMatchObject({ id: "n-1", read: false, type: "warning" });
    expect(result.current.docs.summary?.documents.total).toBe(12);
    expect(result.current.docs.systemSettings).toMatchObject({
      orgName: "هيئة الاختبار",
      maxFileSize: "25",
      featureFlag: "true",
      routing: '{"mode":"strict"}',
    });
    expect(result.current.docs.systemSettings.emptySetting).toBeUndefined();
  });

  it("flags the folders whose ACL snapshot could not be fetched", async () => {
    mocks.docs.folderAcls.mockRejectedValue(new Error("acl down"));

    const { result } = await booted();

    expect(result.current.docs.aclFailedFolders).toEqual(["f-api"]);
  });

  it("tolerates every optional endpoint failing", async () => {
    mocks.domain.tasks.mockRejectedValue(new Error("tasks down"));
    mocks.domain.pendingApprovals.mockRejectedValue(new Error("approvals down"));
    mocks.domain.users.mockRejectedValue(new Error("users down"));
    mocks.domain.settings.mockRejectedValue(new Error("settings down"));
    mocks.domain.auditEvents.mockRejectedValue(new Error("audit down"));
    mocks.domain.notifications.mockRejectedValue(new Error("notifications down"));
    mocks.domain.orgTree.mockRejectedValue(new Error("org down"));
    mocks.domain.orgProjects.mockRejectedValue(new Error("projects down"));
    mocks.domain.orgEmployees.mockRejectedValue(new Error("employees down"));
    mocks.domain.reportSummary.mockRejectedValue(new Error("summary down"));
    mocks.domain.reportTemplates.mockRejectedValue(new Error("templates down"));

    const { result } = await booted();

    expect(result.current.docs.docs).toHaveLength(1);
    expect(result.current.docs.tasks[0].docTitle).toBe("عقد تطوير البنية التحتية للشبكة");
    expect(result.current.docs.pendingApprovals).toEqual([]);
    expect(result.current.docs.auditLog).toEqual([]);
    expect(result.current.docs.notifications).toEqual([]);
    expect(result.current.docs.summary).toBeNull();
    expect(result.current.docs.templates[0].id).not.toBe("tpl-api");
    expect(result.current.docs.systemSettings.orgName).toBe("هيئة المؤسسات الحكومية");
    expect(result.current.docs.docsReady).toBe(true);
  });

  it("reports a failed boot and still marks the store ready", async () => {
    mocks.docs.foldersTree.mockRejectedValue(new Error("boom"));

    const { result } = await booted();

    await waitFor(() => expect(result.current.app.toasts.some((toast) => toast.title === API_ERROR_TITLE)).toBe(true));
    expect(result.current.app.toasts.find((toast) => toast.title === API_ERROR_TITLE)?.message).toBeUndefined();
  });
});

describe("documents store actions over the API", () => {
  it("loads a detail snapshot and keeps its versions across a refetch", async () => {
    const { result } = await booted();

    await act(async () => {
      await result.current.docs.loadDocument("doc-api-1");
    });
    expect(result.current.docs.docs[0].versions).toHaveLength(1);

    let outcome: [boolean, number] | null = null;
    await act(async () => {
      result.current.docs.archiveDocs(["doc-api-1"], (ok, done) => {
        outcome = [ok, done];
      });
    });

    await waitFor(() => expect(outcome).toEqual([true, 1]));
    expect(result.current.docs.docs[0].versions).toHaveLength(1);
  });

  it("keeps the list snapshot when the detail request fails", async () => {
    mocks.docs.getDocument.mockRejectedValue(new Error("detail down"));
    const { result } = await booted();

    await act(async () => {
      await result.current.docs.loadDocument("doc-api-1");
    });

    expect(result.current.docs.docs[0].versions).toEqual([]);
  });

  it("creates a document through the storage upload and refetches", async () => {
    const { result } = await booted();
    const file = new File(["contract"], "contract.pdf", { type: "application/pdf" });

    let created: string | null = null;
    await act(async () => {
      created = await result.current.docs.createDocument({ title: "وثيقة جديدة", folderId: "f-api", classification: "PUBLIC", file });
    });

    expect(created).toBe("doc-new");
    expect(mocks.docs.uploadToStorage).toHaveBeenCalledWith(file);
    expect(mocks.docs.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ title: "وثيقة جديدة", classification: "PUBLIC", fileId: "file-new", folderId: "f-api" }),
    );
    expect(mocks.docs.listDocuments.mock.calls.length).toBeGreaterThan(1);
  });

  it("surfaces an upload rejection with the server reason", async () => {
    mocks.docs.uploadToStorage.mockRejectedValue(new ApiError(409, "CONFLICT", "Conflict", undefined, null, "اسم الملف مستخدم"));
    const { result } = await booted();

    let created: string | null = "pending";
    await act(async () => {
      created = await result.current.docs.createDocument({ title: "مكرر", file: new File(["x"], "x.pdf", { type: "application/pdf" }) });
    });

    expect(created).toBeNull();
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain("الرفع مرفوض");
    expect(result.current.app.toasts.find((toast) => toast.title === API_ERROR_TITLE)?.message).toBe("اسم الملف مستخدم");
  });

  it("updates a document and reports a failed update", async () => {
    const { result } = await booted();

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.updateDocument("doc-api-1", { title: "عنوان محدث" });
    });
    expect(ok).toBe(true);
    expect(result.current.docs.docs[0].title).toBe("عنوان محدث");

    mocks.docs.updateDocument.mockRejectedValue(new Error("update down"));
    await act(async () => {
      ok = await result.current.docs.updateDocument("doc-api-1", { title: "فشل" });
    });
    expect(ok).toBe(false);
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("downloads the current version and explains missing files", async () => {
    const { result } = await booted();

    await act(async () => {
      await result.current.docs.downloadDocument("doc-api-1");
    });
    expect(mocks.docs.downloadUrl).toHaveBeenCalledWith("file-1");
    expect(mocks.openDownload).toHaveBeenCalledWith("https://files.test/contract.pdf");

    mocks.docs.versions.mockResolvedValue([]);
    await act(async () => {
      await result.current.docs.downloadDocument("doc-api-1");
    });
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain("لا يوجد ملف مرتبط بهذه الوثيقة.");

    mocks.docs.versions.mockRejectedValue(new Error("versions down"));
    await act(async () => {
      await result.current.docs.downloadDocument("doc-api-1");
    });
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("moves, checks out and checks in documents", async () => {
    const { result } = await booted();
    let moved = false;
    await act(async () => {
      result.current.docs.moveDocs(["doc-api-1"], "f-api", (ok) => {
        moved = ok;
      });
    });
    await waitFor(() => expect(moved).toBe(true));
    expect(mocks.docs.updateDocument).toHaveBeenCalledWith("doc-api-1", { folderId: "f-api" });

    let checkedOut = false;
    act(() => {
      result.current.docs.checkOut("doc-api-1", "أمل السبيعي", (ok) => {
        checkedOut = ok;
      });
    });
    await waitFor(() => expect(checkedOut).toBe(true));
    expect(result.current.docs.docs[0].checkedOutBy).toBe("أمل السبيعي");

    let checkedIn = false;
    act(() => {
      result.current.docs.checkIn("doc-api-1", (ok) => {
        checkedIn = ok;
      });
    });
    await waitFor(() => expect(checkedIn).toBe(true));
    expect(result.current.docs.docs[0].checkedOutBy).toBeUndefined();
  });

  it("reports a failed move and a failed check-out", async () => {
    const { result } = await booted();
    mocks.docs.updateDocument.mockRejectedValue(new Error("move down"));
    let moved = true;
    await act(async () => {
      result.current.docs.moveDocs(["doc-api-1"], "f-api", (ok) => {
        moved = ok;
      });
    });
    await waitFor(() => expect(moved).toBe(false));

    mocks.docs.checkout.mockRejectedValue(new Error("lock down"));
    let checkedOut = true;
    act(() => {
      result.current.docs.checkOut("doc-api-1", "أمل السبيعي", (ok) => {
        checkedOut = ok;
      });
    });
    await waitFor(() => expect(checkedOut).toBe(false));
    expect(result.current.app.toasts.filter((toast) => toast.title === API_ERROR_TITLE).length).toBeGreaterThanOrEqual(1);
  });

  it("deletes documents and reports partially failed batches", async () => {
    const { result } = await booted();
    mocks.docs.deleteDocument.mockResolvedValueOnce({ id: "doc-api-1", deleted: true }).mockRejectedValueOnce(new Error("delete down"));

    let outcome: [boolean, number] | null = null;
    await act(async () => {
      result.current.docs.deleteDocs(["doc-api-1", "doc-api-2"], (ok, done) => {
        outcome = [ok, done];
      });
    });

    await waitFor(() => expect(outcome).toEqual([false, 1]));
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("warns about partial storage cleanup after a committed purge or disposal", async () => {
    const { result } = await booted();
    mocks.docs.purgeDocument.mockResolvedValueOnce({ deleted: true, purged: true, storageErrors: 1 });
    mocks.domain.executeRetention.mockResolvedValueOnce({ certificate: { storageErrors: 2 } });
    await act(async () => {
      expect(await result.current.docs.purgeDocs(["doc-api-1"])).toBe(false);
      expect(await result.current.docs.removeRetention("ret-1", { action: "DESTROY" })).toBe(false);
    });
    expect(result.current.app.toasts.filter((entry) => entry.type === "warning")).toHaveLength(2);
  });

  it("restores, purges and empties the trash", async () => {
    const { result } = await booted();

    let restored = false;
    await act(async () => {
      restored = await result.current.docs.restoreDocs(["doc-api-1"]);
    });
    expect(restored).toBe(true);

    let purged = false;
    await act(async () => {
      purged = await result.current.docs.purgeDocs(["doc-api-1"]);
    });
    expect(purged).toBe(true);

    mocks.docs.purgeDocument.mockRejectedValue(new Error("purge down"));
    let emptied = true;
    await act(async () => {
      emptied = await result.current.docs.emptyTrash();
    });
    expect(emptied).toBe(false);
  });

  it("completes, rejects, reassigns and returns tasks for changes", async () => {
    const { result } = await booted();

    let completed = false;
    await act(async () => {
      completed = await result.current.docs.removeTask("t-1");
    });
    expect(completed).toBe(true);

    let rejected = false;
    await act(async () => {
      rejected = await result.current.docs.rejectTask("t-1", "ملاحظة");
    });
    expect(rejected).toBe(true);
    expect(mocks.domain.updateTask).toHaveBeenCalledWith("t-1", { status: "rejected", description: "خطوة المراجعة — ملاحظة" });

    let reassigned = false;
    await act(async () => {
      reassigned = await result.current.docs.reassignTask("t-1", "نورة السالم");
    });
    expect(reassigned).toBe(true);
    expect(mocks.domain.updateTask).toHaveBeenCalledWith("t-1", { assigneeId: "u-2" });

    await act(async () => {
      reassigned = await result.current.docs.reassignTask("t-1", "مستخدم مجهول");
    });
    expect(reassigned).toBe(false);

    let changed = false;
    await act(async () => {
      changed = await result.current.docs.requestChanges("t-1", "عدّل البند");
    });
    expect(changed).toBe(true);
    expect(mocks.domain.updateTask).toHaveBeenCalledWith("t-1", { status: "changes_requested", description: "عدّل البند" });
  });

  it("adds, renames and deletes folders", async () => {
    const { result } = await booted();

    let added = false;
    await act(async () => {
      added = await result.current.docs.addFolder(newFolder());
    });
    expect(added).toBe(true);
    expect(mocks.docs.createFolder).toHaveBeenCalledWith({
      name: "مجلد جديد",
      nameEn: "New folder",
      type: "DEPARTMENT",
      scope: "PUBLIC",
      parentId: "f-api",
    });
    expect(result.current.docs.folders.some((folder) => folder.id === "f-new")).toBe(true);

    let renamed = false;
    await act(async () => {
      renamed = await result.current.docs.renameFolder("f-api", { name: "مجلد جديد", accessScope: "خاص" });
    });
    expect(renamed).toBe(true);
    expect(mocks.docs.updateFolder).toHaveBeenCalledWith("f-api", { name: "مجلد جديد", nameEn: "مجلد جديد", scope: "PRIVATE" });

    let deleted = false;
    await act(async () => {
      deleted = await result.current.docs.deleteFolder("f-api");
    });
    expect(deleted).toBe(true);
    expect(result.current.docs.folders.some((folder) => folder.id === "f-api")).toBe(false);
  });

  it("reports failed folder operations and missing folders", async () => {
    const { result } = await booted();
    mocks.docs.createFolder.mockRejectedValue(new Error("create down"));

    let added = true;
    await act(async () => {
      added = await result.current.docs.addFolder(newFolder());
    });
    expect(added).toBe(false);

    mocks.docs.deleteFolder.mockRejectedValue(new Error("delete down"));
    let deleted = true;
    await act(async () => {
      deleted = await result.current.docs.deleteFolder("f-api");
    });
    expect(deleted).toBe(false);

    let renamed = true;
    await act(async () => {
      renamed = await result.current.docs.renameFolder("missing-folder", { name: "x" });
    });
    expect(renamed).toBe(false);
    expect(mocks.docs.foldersTree.mock.calls.length).toBeGreaterThan(1);
  });

  it("schedules, extends and executes retention items", async () => {
    const { result } = await booted();

    let scheduled = false;
    await act(async () => {
      scheduled = await result.current.docs.scheduleRetention("doc-api-1", "p-1");
    });
    expect(scheduled).toBe(true);
    expect(mocks.domain.scheduleRetention).toHaveBeenCalledWith("doc-api-1", "p-1");

    let extended = false;
    await act(async () => {
      extended = await result.current.docs.removeRetention("ret-1", { dueAt: "2028-01-01" });
    });
    expect(extended).toBe(true);
    expect(mocks.domain.extendRetention).toHaveBeenCalledWith("ret-1", "2028-01-01");

    let executed = false;
    await act(async () => {
      executed = await result.current.docs.removeRetention("ret-1", { action: "DESTROY" });
    });
    expect(executed).toBe(true);
    expect(mocks.domain.executeRetention).toHaveBeenCalledWith("ret-1", "DESTROY");

    mocks.domain.extendRetention.mockRejectedValue(new Error("extend down"));
    await act(async () => {
      extended = await result.current.docs.removeRetention("ret-1", { dueAt: "2029-01-01" });
    });
    expect(extended).toBe(false);
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("reads destruction certificates and explains failures", async () => {
    const { result } = await booted();

    const certificate = await act(async () => result.current.docs.retentionCertificate("ret-1"));
    expect(certificate?.certificateRef).toBe("DES-RET-1-2026");

    mocks.domain.retentionCertificate.mockRejectedValue(new Error("certificate down"));
    const missing = await act(async () => result.current.docs.retentionCertificate("ret-1"));
    expect(missing).toBeNull();
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("places and releases legal holds", async () => {
    const { result } = await booted();

    let placed = false;
    await act(async () => {
      placed = await result.current.docs.addHold({
        ref: "HOLD-2",
        reason: "قضية جديدة",
        caseRef: "—",
        placedBy: "أمل السبيعي",
        placedAt: "2026-11-01",
        items: 1,
        documentIds: ["doc-api-1"],
      });
    });
    expect(placed).toBe(true);
    expect(mocks.domain.createHold).toHaveBeenCalledWith({ caseNo: "HOLD-2", reason: "قضية جديدة", documentIds: ["doc-api-1"] });

    let released = false;
    await act(async () => {
      released = await result.current.docs.releaseHold("h-1");
    });
    expect(released).toBe(true);
    expect(mocks.domain.releaseHold).toHaveBeenCalledWith("h-1");

    mocks.domain.createHold.mockRejectedValue(new Error("hold down"));
    await act(async () => {
      placed = await result.current.docs.addHold({
        ref: "HOLD-3",
        reason: "فشل",
        caseRef: "CASE-3",
        placedBy: "أمل السبيعي",
        placedAt: "2026-11-02",
        items: 0,
      });
    });
    expect(placed).toBe(false);
  });

  it("marks one or all notifications read and rolls back failures", async () => {
    const { result } = await booted();
    mocks.domain.markNotificationRead.mockRejectedValue(new Error("read down"));

    let readOne: boolean | null = null;
    await act(async () => {
      result.current.docs.markNotificationRead("n-1", (ok) => {
        readOne = ok;
      });
    });
    await waitFor(() => expect(readOne).toBe(false));
    expect(result.current.docs.notifications[0].read).toBe(false);

    mocks.domain.markNotificationRead.mockResolvedValue({ id: "n-1", read: true });
    await act(async () => {
      result.current.docs.markNotificationRead("n-1", (ok) => {
        readOne = ok;
      });
    });
    await waitFor(() => expect(readOne).toBe(true));
    expect(result.current.docs.notifications[0].read).toBe(true);

    mocks.domain.markAllNotificationsRead.mockRejectedValue(new Error("read all down"));
    let readAll: boolean | null = null;
    await act(async () => {
      result.current.docs.markAllNotificationsRead((ok) => {
        readAll = ok;
      });
    });
    await waitFor(() => expect(readAll).toBe(false));
    expect(result.current.docs.notifications[0].read).toBe(true);
  });

  it("decides approvals and recovers from a failed decision", async () => {
    const { result } = await booted();

    let decided = false;
    await act(async () => {
      decided = await result.current.docs.decideApproval("ap-1", "APPROVED", "موافق");
    });
    expect(decided).toBe(true);
    expect(mocks.domain.decideApproval).toHaveBeenCalledWith("ap-1", { decision: "APPROVED", comment: "موافق" });

    mocks.domain.decideApproval.mockRejectedValue(new Error("decision down"));
    await act(async () => {
      decided = await result.current.docs.decideApproval("ap-1", "REJECTED");
    });
    expect(decided).toBe(false);
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("writes ACL changes, rolls them back and retries flagged folders", async () => {
    const { result } = await booted();

    act(() => {
      result.current.docs.addACLRule("f-api", {
        principalId: "u-3",
        principalName: "مستخدم",
        principalType: "user",
        permissions: ["view"],
      });
    });
    expect(result.current.docs.acls["f-api"]).toHaveLength(2);
    expect(mocks.docs.putFolderAcl).toHaveBeenCalledWith("f-api", [
      { principalType: "USER", principalId: "u-2", actions: ["VIEW"], effect: "ALLOW" },
      { principalType: "USER", principalId: "u-3", actions: ["VIEW"], effect: "ALLOW" },
    ]);

    act(() => {
      result.current.docs.toggleRulePermission("f-api", "acl-1", "view");
    });
    expect(result.current.docs.acls["f-api"][0].permissions).toEqual([]);

    act(() => {
      result.current.docs.toggleRuleEffect("f-api", "acl-1");
    });
    expect(result.current.docs.acls["f-api"][0].effect).toBe("deny");

    act(() => {
      result.current.docs.removeACLRule("f-api", "acl-1");
    });
    expect(result.current.docs.acls["f-api"].map((rule) => rule.id)).not.toContain("acl-1");

    mocks.docs.putFolderAcl.mockRejectedValue(new Error("acl write down"));
    act(() => {
      result.current.docs.addACLRule("f-api", { principalId: "u-4", principalName: "آخر", principalType: "user", permissions: ["edit"] });
    });
    await waitFor(() => expect(mocks.docs.folderAcl).toHaveBeenCalledWith("f-api"));
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);

    let retried = false;
    await act(async () => {
      retried = await result.current.docs.retryFolderAcl("f-api");
    });
    expect(retried).toBe(true);

    mocks.docs.folderAcl.mockRejectedValue(new Error("acl read down"));
    await act(async () => {
      retried = await result.current.docs.retryFolderAcl("f-api");
    });
    expect(retried).toBe(false);
  });

  it("refreshes the organization directory and the user list", async () => {
    const { result } = await booted();

    await act(async () => {
      await result.current.docs.refreshOrgDirectory();
    });
    expect(result.current.docs.departments.items.map((item) => item.id)).toEqual(["legal"]);
    expect(result.current.docs.sections.items.map((item) => item.id)).toEqual(["legal-1"]);
    expect(result.current.docs.projects.items.map((item) => item.id)).toEqual(["prj-1"]);
    expect(result.current.docs.employees.items.map((item) => item.id)).toEqual(["emp-1"]);

    await act(async () => {
      await result.current.docs.refreshUsers();
    });
    expect(result.current.docs.users.items.map((item) => item.id)).toEqual(["u-2"]);
  });

  it("persists a system setting after the debounce and skips user-scoped keys", async () => {
    const { result } = await booted();

    act(() => {
      result.current.docs.setSystemSetting("orgName", "قيمة جديدة");
    });
    expect(result.current.docs.systemSettings.orgName).toBe("قيمة جديدة");
    await waitFor(() => expect(mocks.domain.putSetting).toHaveBeenCalledWith("orgName", "قيمة جديدة"), { timeout: 2000 });

    act(() => {
      result.current.docs.setSystemSetting("userTheme", "dark");
    });
    expect(mocks.domain.putSetting).toHaveBeenCalledTimes(1);
  });

  it("loads the next page of documents and reports a failed page", async () => {
    const { result } = await booted();

    await act(async () => {
      await result.current.docs.loadMoreDocuments();
    });
    expect(result.current.docs.docs).toHaveLength(2);
    expect(result.current.docs.docsMeta).toEqual({ loaded: 2, total: 2 });
    expect(mocks.docs.listDocuments).toHaveBeenCalledWith({ page: 2, pageSize: 100 });

    mocks.docs.listDocuments.mockImplementation((query: { page?: number } = {}) =>
      (query.page ?? 1) === 1 ? page([docDto()], 2, 1) : Promise.reject(new Error("page down")),
    );
    await act(async () => {
      await result.current.docs.loadMoreDocuments();
    });
    expect(result.current.docs.docsLoadingMore).toBe(false);
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain(API_ERROR_TITLE);
  });

  it("sends a document for approval and reports a failed submission", async () => {
    const { result } = await booted();

    let sent = false;
    await act(async () => {
      sent = await result.current.docs.sendForApproval("doc-api-1");
    });
    expect(sent).toBe(true);
    expect(mocks.domain.submitApproval).toHaveBeenCalledWith({ documentId: "doc-api-1" });

    mocks.domain.submitApproval.mockRejectedValue(new Error("submit down"));
    await act(async () => {
      sent = await result.current.docs.sendForApproval("doc-api-1");
    });
    expect(sent).toBe(false);
  });

  it("uploads a new version and requires a file", async () => {
    const { result } = await booted();

    let uploaded = true;
    await act(async () => {
      uploaded = await result.current.docs.uploadNewVersion("doc-api-1", "أمل السبيعي");
    });
    expect(uploaded).toBe(false);
    expect(result.current.app.toasts.map((toast) => toast.title)).toContain("اختر ملفاً قبل رفع إصدار جديد.");

    const file = new File(["v3"], "contract-v3.pdf", { type: "application/pdf" });
    await act(async () => {
      uploaded = await result.current.docs.uploadNewVersion("doc-api-1", "أمل السبيعي", file);
    });
    expect(uploaded).toBe(true);
    expect(mocks.docs.addVersion).toHaveBeenCalledWith("doc-api-1", { fileId: "file-new", comment: "contract-v3.pdf" });
    expect(result.current.docs.docs[0].version).toBe("2.0");
  });

  it("restores an earlier version and rejects unknown versions", async () => {
    const { result } = await booted();

    let restored = false;
    await act(async () => {
      restored = await result.current.docs.restoreVersion("doc-api-1", "2.0");
    });
    expect(restored).toBe(true);
    expect(mocks.docs.restoreVersion).toHaveBeenCalledWith("doc-api-1", "v-2");

    await act(async () => {
      restored = await result.current.docs.restoreVersion("doc-api-1", "9.9");
    });
    expect(restored).toBe(false);
  });

  it("saves a draft, requests a signature, signs and declares a record", async () => {
    const { result } = await booted();

    act(() => {
      result.current.docs.saveDraft("doc-api-1");
    });
    expect(mocks.docs.updateDocument).toHaveBeenCalledWith("doc-api-1", { transition: "REOPEN" });

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.requestSignature("doc-api-1");
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.docs.docs[0].signatureStatus).toBe("pending"));

    await act(async () => {
      ok = await result.current.docs.signDocument("doc-api-1", "أمل السبيعي");
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.docs.docs[0].signatureStatus).toBe("signed"));

    await act(async () => {
      ok = await result.current.docs.declareRecord("doc-api-1");
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.docs.docs[0].declaredRecord).toBe(true));
  });
});
