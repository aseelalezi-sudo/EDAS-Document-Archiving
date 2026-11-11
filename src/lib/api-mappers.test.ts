import { describe, expect, it } from "vitest";
import type {
  AclRuleDto,
  ApprovalChainDto,
  AuditEventDto,
  DocumentDetailDto,
  FolderDto,
  LegalHoldDto,
  NotificationDto,
  OrgDepartmentDto,
  OrgEmployeeDto,
  OrgProjectDto,
  ReportRunDto,
  ReportScheduleDto,
  RetentionItemDto,
  RetentionPolicyDto,
  TaskDto,
  UserSummaryDto,
} from "@edas/shared";
import { CATEGORIES } from "../data";
import {
  dateOnly,
  fileTypeFromMime,
  formatBytes,
  mapAclRules,
  mapApprovalChain,
  mapAuditEvent,
  mapDepartment,
  mapDocument,
  mapEmployee,
  mapFolder,
  mapHold,
  mapNotification,
  mapProject,
  mapPolicy,
  mapReportSchedule,
  mapRetentionItem,
  mapSection,
  mapTask,
  mapTrashItem,
  mapUser,
  mapVersion,
  toAclPayload,
  withFolderCounts,
} from "./api-mappers";

const baseDoc: DocumentDetailDto = {
  id: "doc-1",
  docNo: "EDAS-2026001",
  title: "خطة المشتريات",
  titleEn: "Procurement plan",
  description: "Annual plan",
  category: CATEGORIES[0].id,
  classification: "CONFIDENTIAL",
  status: "IN_REVIEW",
  isRecord: true,
  currentVersion: 2,
  fileType: "application/pdf",
  sizeBytes: 2_621_440,
  tags: ["مشتريات"],
  retentionEnd: "2031-01-01T00:00:00.000Z",
  folderId: "folder-1",
  departmentId: "dept-1",
  sectionId: "section-1",
  projectId: null,
  ownerId: "user-1",
  ownerName: "أحمد البلوي",
  ownerNameEn: "Ahmed Albalawi",
  departmentName: "المالية",
  departmentNameEn: "Finance",
  folderName: "2026",
  checkedOutById: "user-2",
  checkedOutByName: "سارة",
  checkedOutAt: "2026-02-01T10:00:00.000Z",
  signatureStatus: "SIGNED",
  signedById: "user-3",
  signedByName: "المدير",
  signedAt: "2026-02-02T09:30:00.000Z",
  deletedAt: null,
  deletedById: null,
  deletedByName: null,
  createdAt: "2026-01-05T08:00:00.000Z",
  updatedAt: "2026-01-09T12:00:00.000Z",
  versions: [
    {
      id: "v-2",
      version: 2,
      comment: "مراجعة",
      isCurrent: true,
      createdById: "user-1",
      createdByName: "أحمد البلوي",
      createdAt: "2026-01-09T12:00:00.000Z",
      file: {
        id: "file-2",
        originalName: "plan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2_621_440,
        checksumSha256: "abcdef0123456789",
        createdAt: "2026-01-09T12:00:00.000Z",
      },
    },
  ],
};

const baseFolder: FolderDto = {
  id: "folder-1",
  name: "المالية",
  nameEn: "Finance",
  type: "DEPARTMENT",
  scope: "DEPARTMENT",
  path: "/finance",
  parentId: null,
  departmentId: "dept-1",
  projectId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("api mappers", () => {
  it("formats dates, sizes and mime types", () => {
    expect(dateOnly("2026-03-04T10:00:00.000Z")).toBe("2026-03-04");
    expect(dateOnly(null)).toBe("");
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
    expect(formatBytes(2_147_483_648)).toBe("2.00 GB");
    expect(fileTypeFromMime("application/pdf")).toBe("pdf");
    expect(fileTypeFromMime("image/png")).toBe("image");
    expect(fileTypeFromMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("office");
    expect(fileTypeFromMime("application/acad")).toBe("cad");
    expect(fileTypeFromMime(null)).toBe("text");
  });

  it("maps a document dto to the ui model", () => {
    const doc = mapDocument(baseDoc);
    expect(doc.id).toBe("doc-1");
    expect(doc.category).toBe(CATEGORIES[0].name);
    expect(doc.categoryEn).toBe(CATEGORIES[0].nameEn);
    expect(doc.classification).toBe("confidential");
    expect(doc.status).toBe("pending");
    expect(doc.signatureStatus).toBe("signed");
    expect(doc.signedBy).toBe("المدير");
    expect(doc.signedAt).toBe("2026-02-02");
    expect(doc.checkedOutBy).toBe("سارة");
    expect(doc.declaredRecord).toBe(true);
    expect(doc.version).toBe("2.0");
    expect(doc.size).toBe("2.5 MB");
    expect(doc.fileType).toBe("pdf");
    expect(doc.createdAt).toBe("2026-01-05");
    expect(doc.modifiedAt).toBe("2026-01-09");
    expect(doc.retentionEnd).toBe("2031-01-01");
    expect(doc.retentionDays).toBeGreaterThan(0);
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0]).toMatchObject({ v: "2.0", by: "أحمد البلوي", current: true, comment: "مراجعة" });
    expect(doc.versions[0].fingerprint).toBe("SHA-256: abcdef012345");
  });

  it("falls back to classification labels for unknown categories", () => {
    const unknown = mapDocument({ ...baseDoc, category: "custom", classification: "SECRET" });
    expect(unknown.category).toBe("custom");
    expect(unknown.classification).toBe("topsecret");
    const missing = mapDocument({ ...baseDoc, category: null, classification: "PUBLIC" });
    expect(missing.category).toBe("عام");
    expect(missing.categoryEn).toBe("General");
  });

  it("maps version metadata", () => {
    const version = mapVersion(baseDoc.versions[0]);
    expect(version.size).toBe("2.5 MB");
    expect(version.date).toBe("2026-01-09");
    expect(version.current).toBe(true);
  });

  it("maps folder types and scopes and recounts children", () => {
    const folder = mapFolder(baseFolder);
    expect(folder).toMatchObject({ type: "dept", accessScope: "القسم", docs: 0, subfolders: 0, owner: "dept-1" });
    expect(mapFolder({ ...baseFolder, type: "PROJECT" }).type).toBe("project");
    expect(mapFolder({ ...baseFolder, type: "PERSONAL" }).type).toBe("shared");

    const counted = withFolderCounts(
      [folder, { ...mapFolder({ ...baseFolder, id: "folder-2", parentId: "folder-1" }) }],
      [mapDocument(baseDoc)],
    );
    expect(counted[0].docs).toBe(1);
    expect(counted[0].subfolders).toBe(1);
  });

  it("builds trash rows with a 30-day purge window", () => {
    const item = mapTrashItem({ ...baseDoc, deletedAt: "2026-03-01T00:00:00.000Z", deletedByName: "سارة" });
    expect(item.deletedAt).toBe("2026-03-01");
    expect(item.purgeAt).toBe("2026-03-31");
    expect(item.deletedBy).toBe("سارة");
    expect(item.original).toBe("2026");
  });

  it("maps retention items and legal holds", () => {
    const retention: RetentionItemDto = {
      id: "ret-1",
      documentId: "doc-1",
      policyId: "policy-1",
      dueAt: "2026-06-30T00:00:00.000Z",
      action: "DESTROY",
      status: "scheduled",
      executedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      document: {
        id: "doc-1",
        docNo: "EDAS-1",
        title: "خطة",
        status: "APPROVED",
        isRecord: false,
        departmentId: "dept-1",
        retentionEnd: "2026-06-30T00:00:00.000Z",
        folderId: "folder-1",
        ownerId: "user-1",
        owner: { name: "أحمد" },
      },
      policy: { id: "policy-1", name: "سياسة", action: "DESTROY", retentionMonths: 6 },
    };
    const mapped = mapRetentionItem(retention);
    expect(mapped).toMatchObject({
      id: "ret-1",
      documentId: "doc-1",
      policy: "سياسة",
      retentionEnd: "2026-06-30",
      owner: "أحمد",
      proposedAction: "إتلاف",
      proposedActionEn: "Destroy",
      reviewStatus: "pending",
    });
    expect(mapped.daysLeft).toBeGreaterThanOrEqual(0);

    const hold: LegalHoldDto = {
      id: "hold-1",
      caseNo: "CASE-1",
      reason: "نزاع",
      status: "ACTIVE",
      placedById: "user-1",
      placedByName: "أحمد",
      placedAt: "2026-02-01T00:00:00.000Z",
      releasedById: null,
      releasedByName: null,
      releasedAt: null,
      documents: [
        { id: "doc-1", docNo: "EDAS-1", title: "خطة", status: "APPROVED", departmentId: "dept-1", addedAt: "2026-02-01T00:00:00.000Z" },
      ],
    };
    expect(mapHold(hold)).toMatchObject({
      ref: "CASE-1",
      placedBy: "أحمد",
      placedAt: "2026-02-01",
      items: 1,
      status: "active",
    });
    expect(mapHold({ ...hold, status: "RELEASED", releasedByName: "سارة" })).toMatchObject({
      status: "released",
      items: 1,
    });
  });

  it("maps approval chains", () => {
    const chain: ApprovalChainDto = {
      id: "chain-1",
      name: "Contract approval",
      description: "Contracts",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      steps: [
        { id: "step-1", chainId: "chain-1", order: 1, role: "DEPT_MANAGER", name: "Manager" },
        { id: "step-2", chainId: "chain-1", order: 2, role: "SYSTEM_ADMIN", name: null },
      ],
      _count: { instances: 2 },
    };
    const mapped = mapApprovalChain(chain);
    expect(mapped).toMatchObject({
      id: "chain-1",
      name: "Contract approval",
      scope: "Contracts",
      status: "active",
      updated: "2026-02-01",
    });
    expect(mapped.steps).toHaveLength(2);
    expect(mapped.steps[1].assignee).toBeTruthy();
    expect(mapApprovalChain({ ...chain, isActive: false }).status).toBe("inactive");
  });

  it("maps retention policies", () => {
    const policy: RetentionPolicyDto = {
      id: "policy-1",
      name: "سياسة أرشفة",
      description: null,
      category: "إداري",
      legalBasis: null,
      retentionMonths: 12,
      action: "ARCHIVE",
      isActive: true,
      departmentId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      _count: { items: 3 },
    };
    expect(mapPolicy(policy)).toMatchObject({
      id: "policy-1",
      name: "سياسة أرشفة",
      scopeTypeEn: "Category",
      target: "إداري",
      disposalEn: "Archive",
      status: "active",
      updated: "2026-02-01",
      affectedDocs: 3,
    });
    expect(mapPolicy({ ...policy, category: null, isActive: false })).toMatchObject({
      scopeTypeEn: "Global",
      status: "inactive",
      affectedDocs: 3,
    });
  });

  it("maps tasks onto workflow cards", () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const created = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const task: TaskDto = {
      id: "task-1",
      title: "Review document",
      description: "Please review",
      documentId: "doc-1",
      assigneeId: "user-1",
      createdById: "user-2",
      status: "open",
      priority: "high",
      dueAt: past,
      createdAt: created,
      completedAt: null,
    };
    const mapped = mapTask(task, [mapDocument(baseDoc)], [{ id: "user-1", name: "أحمد" }]);
    expect(mapped).toMatchObject({
      id: "task-1",
      docTitle: baseDoc.title,
      docNo: baseDoc.docNo,
      from: "أحمد",
      priority: "high",
      slaStatus: "breached",
      status: "overdue",
      workflow: "task",
    });
    expect(mapped.age).toMatch(/^\d+d$/);

    expect(mapTask({ ...task, status: "completed", priority: "normal", dueAt: null }, [], [])).toMatchObject({
      status: "completed",
      priority: "medium",
      slaStatus: "ontrack",
      docTitle: "Review document",
    });
    expect(mapTask({ ...task, status: "changes_requested", dueAt: null }, [], [])).toMatchObject({
      status: "reassigned",
      workflow: "changes",
    });
  });

  it("converts acl rules both ways", () => {
    const rules: AclRuleDto[] = [
      {
        id: "rule-1",
        folderId: "folder-1",
        principalType: "DEPARTMENT",
        principalId: "dept-1",
        actions: ["VIEW", "EDIT", "DELETE", "EXPORT", "CREATE"],
        effect: "ALLOW",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "rule-2",
        folderId: "folder-1",
        principalType: "ROLE",
        principalId: "employee",
        actions: ["EXPORT"],
        effect: "DENY",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const mapped = mapAclRules(rules);
    expect(mapped[0].principalType).toBe("department");
    expect(mapped[0].permissions).toEqual(["view", "edit", "delete", "download"]);
    expect(mapped[0].effect).toBe("allow");
    expect(mapped[1].effect).toBe("deny");

    const payload = toAclPayload([
      ...mapped,
      { id: "rule-3", principalType: "group", principalId: "grp", principalName: "grp", permissions: ["view"] },
      { id: "rule-4", principalType: "user", principalId: "user-1", principalName: "u", permissions: ["edit", "download"] },
    ]);
    expect(payload.rules).toHaveLength(3);
    expect(payload.rules[0]).toMatchObject({ principalType: "DEPARTMENT", principalId: "dept-1", effect: "ALLOW" });
    expect(payload.rules[1]).toMatchObject({ principalType: "ROLE", principalId: "employee", actions: ["EXPORT"], effect: "DENY" });
    expect(payload.rules[2]).toMatchObject({ principalType: "USER", principalId: "user-1", actions: ["EDIT", "EXPORT"], effect: "ALLOW" });
  });

  it("maps a report schedule with its run history", () => {
    const schedule: ReportScheduleDto = {
      id: "sch-1",
      name: "Monthly documents",
      reportType: "rpt-1",
      cadence: "MONTHLY",
      recipients: ["cfo@edas.sa"],
      filters: { time: "07:30", format: "Excel" },
      isActive: true,
      nextRunAt: "2026-03-01T07:30:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      _count: { runs: 4 },
    };
    const runs: ReportRunDto[] = [
      {
        id: "run-1",
        scheduleId: "sch-1",
        reportType: "rpt-1",
        format: "Excel",
        status: "completed",
        requestedById: "user-1",
        createdAt: "2026-02-01T07:30:00.000Z",
        completedAt: "2026-02-01T07:30:12.000Z",
      },
      {
        id: "run-2",
        scheduleId: "sch-1",
        reportType: "rpt-1",
        format: "Excel",
        status: "failed",
        requestedById: "user-1",
        createdAt: "2026-02-02T07:30:00.000Z",
        completedAt: "2026-02-02T07:30:04.000Z",
      },
      {
        id: "run-3",
        scheduleId: "sch-2",
        reportType: "rpt-1",
        format: "PDF",
        status: "completed",
        requestedById: "user-2",
        createdAt: "2026-02-03T07:30:00.000Z",
        completedAt: "2026-02-03T07:30:08.000Z",
      },
    ];

    expect(mapReportSchedule(schedule, runs)).toMatchObject({
      id: "sch-1",
      reportId: "rpt-1",
      categoryEn: "Documents",
      freq: "MONTHLY",
      freqKey: "monthly",
      time: "07:30",
      format: "Excel",
      status: "active",
      runs: 2,
      successRate: 50,
      lastRun: "2026-02-02",
      nextRun: "2026-03-01 07:30",
    });
    expect(mapReportSchedule({ ...schedule, isActive: false, filters: null }, [])).toMatchObject({
      status: "paused",
      time: "08:00",
      format: "PDF",
      runs: 4,
      successRate: null,
    });
  });

  it("maps notifications and audit events", () => {
    const notification: NotificationDto = {
      id: "n-1",
      userId: null,
      title: "Retention due",
      message: "3 documents are due for review",
      level: "WARNING",
      read: false,
      entityType: "RetentionItem",
      entityId: "ri-1",
      createdAt: "2026-02-03T09:15:00.000Z",
    };
    expect(mapNotification(notification)).toMatchObject({
      id: "n-1",
      type: "warning",
      body: "3 documents are due for review",
      time: "2026-02-03 09:15",
      read: false,
      entityType: "RetentionItem",
      entityId: "ri-1",
    });

    const event: AuditEventDto = {
      id: "aud-1",
      ts: "2026-02-03T10:00:00.000Z",
      actorId: "user-1",
      actorName: null,
      action: "document.update",
      entityType: "Document",
      entityId: "doc-1",
      departmentId: "dept-1",
      ip: "10.0.0.4",
      result: "failure",
      correlationId: null,
      detail: { field: "title" },
      prevHash: null,
      hash: "abc",
    };
    expect(mapAuditEvent(event, [{ id: "user-1", name: "System Admin" }])).toMatchObject({
      id: "aud-1",
      datetime: "2026-02-03 10:00",
      user: "System Admin",
      module: "Document",
      result: "failure",
      correlation: "",
      detail: '{"field":"title"}',
    });
    expect(mapAuditEvent({ ...event, actorName: "Auditor", result: "success", detail: "raw" }).user).toBe("Auditor");
    expect(mapAuditEvent({ ...event, actorName: null, actorId: null, result: "success", detail: null }).user).toBe("—");
  });

  it("maps organization directories", () => {
    const department: OrgDepartmentDto = {
      id: "dept-1",
      code: "FIN",
      name: "Finance",
      nameEn: null,
      manager: "Sara",
      parentId: null,
      sections: [
        {
          id: "sec-1",
          code: "ACC",
          name: "Accounting",
          nameEn: "Accounting",
          manager: "Khaled",
          departmentId: "dept-1",
          _count: { users: 3, employees: 2 },
        },
      ],
      _count: { users: 4, employees: 2, documents: 7 },
    };
    expect(mapDepartment(department)).toMatchObject({
      id: "dept-1",
      nameEn: "Finance",
      manager: "Sara",
      employees: 2,
      docs: 7,
      status: "active",
    });
    expect(mapSection(department.sections[0])).toMatchObject({
      deptId: "dept-1",
      employees: 2,
      head: "Khaled",
    });

    const project: OrgProjectDto = {
      id: "proj-1",
      code: "PRJ-1",
      name: "Archive migration",
      nameEn: null,
      status: "planned",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: null,
      departmentId: "dept-1",
      _count: { documents: 5, folders: 2 },
    };
    expect(mapProject(project)).toMatchObject({
      status: "planned",
      startDate: "2026-01-01",
      endDate: "",
      departments: ["dept-1"],
      docs: 5,
    });

    const employee: OrgEmployeeDto = {
      id: "emp-1",
      empNo: "EMP-1001",
      name: "Sara Ali",
      nameEn: null,
      jobTitle: "Archivist",
      jobTitleEn: null,
      email: "sara@edas.sa",
      phone: null,
      status: "LOCKED",
      departmentId: "dept-1",
      sectionId: "sec-1",
      userId: "user-9",
    };
    expect(mapEmployee(employee)).toMatchObject({
      empNo: "EMP-1001",
      deptId: "dept-1",
      sectionId: "sec-1",
      jobTitleEn: "Archivist",
      userId: "user-9",
      status: "inactive",
      initials: "SA",
    });

    const user: UserSummaryDto = {
      id: "user-9",
      username: "sara",
      name: "Sara Ali",
      nameEn: null,
      email: "sara@edas.sa",
      role: "ARCHIVIST",
      status: "ACTIVE",
      departmentId: "dept-1",
      sectionId: null,
      jobTitle: "Archivist",
      jobTitleEn: null,
      phone: null,
      failedAttempts: 1,
      activeSessions: 2,
      lastLoginAt: "2026-02-01T09:00:00.000Z",
    };
    expect(mapUser(user)).toMatchObject({
      username: "sara",
      empNo: "sara",
      role: "archivist",
      status: "active",
      lastLogin: "2026-02-01",
      failedAttempts: 1,
      activeSessions: 2,
      initials: "SA",
    });
    expect(mapUser({ ...user, role: "DEPT_MANAGER", status: "LOCKED" })).toMatchObject({
      role: "dept_manager",
      status: "locked",
    });
  });
});
