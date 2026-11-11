import type {
  AclAction,
  AclRuleDto,
  ApprovalChainDto,
  AuditEventDto,
  DocumentDetailDto,
  DocumentDto,
  DocumentVersionDto,
  FolderDto,
  LegalHoldDto,
  NotificationDto,
  OrgDepartmentDto,
  OrgEmployeeDto,
  OrgProjectDto,
  OrgSectionDto,
  ReportRunDto,
  ReportScheduleDto,
  RetentionItemDto,
  RetentionPolicyDto,
  TaskCommentDto,
  TaskDto,
  UserSummaryDto,
} from "@edas/shared";
import { CATEGORIES, reportTemplates, roleLabel } from "../data";
import type { TrashItem } from "../store-docs";
import type {
  ACLRule,
  ApprovalChain,
  AuditEntry,
  Classification,
  Department,
  DocStatus,
  DocUser,
  DocVersion,
  Document as UiDocument,
  Employee,
  FileType,
  FolderNode,
  LegalHold,
  Notification,
  Policy,
  Project,
  RetentionItem,
  Section,
  TaskComment,
  TaskItem,
} from "../types";
import { avatarColor, initialsFromName, permsFromAclActions, roleFromApi } from "./role-bridge";

const CLASSIFICATION: Record<DocumentDto["classification"], Classification> = {
  PUBLIC: "public",
  INTERNAL: "internal",
  CONFIDENTIAL: "confidential",
  SECRET: "topsecret",
};

const STATUS: Record<DocumentDto["status"], DocStatus> = {
  DRAFT: "draft",
  IN_REVIEW: "pending",
  APPROVED: "approved",
  PUBLISHED: "approved",
  ARCHIVED: "archived",
  DISPOSED: "destroyed",
};

const SIGNATURE: Record<DocumentDto["signatureStatus"], "none" | "pending" | "signed"> = {
  NONE: "none",
  PENDING: "pending",
  SIGNED: "signed",
};

const CLASSIFICATION_CATEGORY: Record<DocumentDto["classification"], { name: string; nameEn: string }> = {
  PUBLIC: { name: "عام", nameEn: "General" },
  INTERNAL: { name: "داخلي", nameEn: "Internal" },
  CONFIDENTIAL: { name: "سري", nameEn: "Confidential" },
  SECRET: { name: "سري للغاية", nameEn: "Top secret" },
};

const FOLDER_TYPE: Record<FolderDto["type"], FolderNode["type"]> = {
  DEPARTMENT: "dept",
  PROJECT: "project",
  PERSONAL: "shared",
  SYSTEM: "shared",
};

const FOLDER_SCOPE: Record<FolderDto["scope"], string> = {
  PUBLIC: "عام",
  DEPARTMENT: "القسم",
  SECTION: "الشعبة",
  PRIVATE: "خاص",
};

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function dateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function parseSizeBytes(value: string | null | undefined): number {
  const match = /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(value ?? "");
  if (!match) return 0;
  const units: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(Number(match[1]) * (units[match[2].toUpperCase()] ?? 1));
}

export function documentBytes(doc: { sizeBytes?: number; size?: string }): number {
  return doc.sizeBytes ?? parseSizeBytes(doc.size);
}

export function fileTypeFromMime(mime: string | null | undefined): FileType {
  if (!mime) return "text";
  const value = mime.toLowerCase();
  if (value.includes("pdf")) return "pdf";
  if (value.startsWith("image/")) return "image";
  if (/word|excel|powerpoint|officedocument|msword|ms-excel|spreadsheet|presentation/.test(value)) return "office";
  if (/dwg|dxf|acad|cad/.test(value)) return "cad";
  return "text";
}

function categoryFor(dto: DocumentDto): { name: string; nameEn: string } {
  if (dto.category) {
    const known = CATEGORY_BY_ID[dto.category];
    if (known) return { name: known.name, nameEn: known.nameEn };
    return { name: dto.category, nameEn: dto.category };
  }
  return CLASSIFICATION_CATEGORY[dto.classification];
}

function retentionDays(iso: string | null): number {
  if (!iso) return 0;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export function mapVersion(version: DocumentVersionDto): DocVersion {
  return {
    id: version.id,
    fileId: version.file.id,
    mimeType: version.file.mimeType,
    v: version.version.toFixed(1),
    date: dateOnly(version.createdAt),
    by: version.createdByName ?? version.createdById ?? "",
    size: formatBytes(version.file.sizeBytes),
    fingerprint: version.file.checksumSha256 ? `SHA-256: ${version.file.checksumSha256.slice(0, 12)}` : "",
    comment: version.comment ?? "",
    current: version.isCurrent,
  };
}

export function mapDocument(dto: DocumentDto | DocumentDetailDto): UiDocument {
  const category = categoryFor(dto);
  const versions = "versions" in dto && Array.isArray(dto.versions) ? dto.versions.map(mapVersion) : [];

  return {
    id: dto.id,
    docNo: dto.docNo,
    title: dto.title,
    titleEn: dto.titleEn ?? dto.title,
    category: category.name,
    categoryEn: category.nameEn,
    categoryId: dto.category ?? "",
    deptId: dto.departmentId ?? "",
    sectionId: dto.sectionId ?? "",
    projectId: dto.projectId ?? undefined,
    owner: dto.ownerName ?? "",
    ownerEn: dto.ownerNameEn ?? dto.ownerName ?? "",
    version: dto.currentVersion.toFixed(1),
    classification: CLASSIFICATION[dto.classification],
    status: STATUS[dto.status],
    createdAt: dateOnly(dto.createdAt),
    modifiedAt: dateOnly(dto.updatedAt),
    retentionEnd: dateOnly(dto.retentionEnd),
    size: formatBytes(dto.sizeBytes),
    sizeBytes: Number(dto.sizeBytes ?? 0),
    fileType: fileTypeFromMime(dto.fileType),
    folderId: dto.folderId ?? "",
    tags: dto.tags ?? [],
    description: dto.description ?? "",
    descriptionEn: dto.description ?? "",
    content: dto.description ?? undefined,
    checkedOutBy: dto.checkedOutByName ?? undefined,
    signatureStatus: SIGNATURE[dto.signatureStatus],
    signedBy: dto.signedByName ?? undefined,
    signedAt: dto.signedAt ? dateOnly(dto.signedAt) : undefined,
    declaredRecord: dto.isRecord,
    versions,
    activity: [],
    retentionDays: retentionDays(dto.retentionEnd),
  };
}

export function mapFolder(dto: FolderDto): FolderNode {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    parentId: dto.parentId,
    type: FOLDER_TYPE[dto.type],
    projectId: dto.projectId ?? undefined,
    owner: dto.departmentId ?? undefined,
    docs: 0,
    subfolders: 0,
    accessScope: FOLDER_SCOPE[dto.scope],
    starred: false,
  };
}

export function withFolderCounts(folders: FolderNode[], docs: UiDocument[]): FolderNode[] {
  return folders.map((folder) => ({
    ...folder,
    docs: docs.filter((doc) => doc.status !== "destroyed" && doc.folderId === folder.id).length,
    subfolders: folders.filter((child) => child.parentId === folder.id).length,
  }));
}

export function mapTrashItem(dto: DocumentDto): TrashItem {
  const deletedAt = dto.deletedAt ? new Date(dto.deletedAt) : new Date();
  const purgeAt = new Date(deletedAt.getTime() + 30 * 86_400_000);
  return {
    doc: mapDocument(dto),
    deletedBy: dto.deletedByName ?? "",
    deletedAt: dateOnly(deletedAt.toISOString()),
    purgeAt: dateOnly(purgeAt.toISOString()),
    original: dto.folderName ?? "",
  };
}

const RETENTION_ACTION: Record<RetentionItemDto["action"], { ar: string; en: string }> = {
  REVIEW: { ar: "مراجعة", en: "Review" },
  ARCHIVE: { ar: "أرشفة", en: "Archive" },
  DESTROY: { ar: "إتلاف", en: "Destroy" },
};

export function mapRetentionItem(dto: RetentionItemDto): RetentionItem {
  const proposed = RETENTION_ACTION[dto.action] ?? RETENTION_ACTION.REVIEW;
  return {
    id: dto.id,
    documentId: dto.documentId,
    docTitle: dto.document.title,
    docNo: dto.document.docNo,
    policy: dto.policy.name,
    retentionEnd: dateOnly(dto.dueAt),
    deptId: dto.document.departmentId ?? "",
    owner: dto.document.owner?.name ?? "",
    onHold: dto.onHold ?? false,
    proposedAction: proposed.ar,
    proposedActionEn: proposed.en,
    daysLeft: retentionDays(dto.dueAt),
    reviewStatus: dto.status === "executed" ? "reviewed" : "pending",
    action: dto.action,
    executedAt: dto.executedAt,
  };
}

export function mapPolicy(dto: RetentionPolicyDto): Policy {
  const action = RETENTION_ACTION[dto.action] ?? RETENTION_ACTION.REVIEW;
  const months = dto.retentionMonths;
  const years = months / 12;
  const retention = months % 12 !== 0 ? `${months} شهر` : years === 1 ? "سنة" : years === 2 ? "سنتان" : `${years} سنوات`;
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.name,
    scopeType: dto.departmentId ? "إدارة" : dto.category ? "التصنيف" : "عام",
    scopeTypeEn: dto.departmentId ? "Department" : dto.category ? "Category" : "Global",
    target: dto.department?.name ?? dto.category ?? "الكل",
    category: dto.category ?? "",
    departmentId: dto.departmentId ?? undefined,
    retention,
    retentionMonths: months,
    requiresApproval: false,
    disposal: action.ar,
    disposalEn: action.en,
    priority: "medium",
    status: dto.isActive ? "active" : "inactive",
    updated: dateOnly(dto.updatedAt),
    affectedDocs: dto._count?.items ?? 0,
  };
}

export function mapApprovalChain(dto: ApprovalChainDto): ApprovalChain {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.name,
    scope: dto.description ?? "",
    target: dto.description ?? "",
    status: dto.isActive ? "active" : "inactive",
    updated: dateOnly(dto.updatedAt),
    steps: dto.steps.map((step) => {
      const label = step.name ?? roleLabel(roleFromApi(step.role), "en");
      return {
        order: step.order,
        assignee: label,
        assigneeEn: label,
        role: roleLabel(roleFromApi(step.role), "en"),
        roleCode: step.role,
        name: step.name ?? undefined,
        sla: 24,
        type: "sequential" as const,
        requireComment: false,
      };
    }),
  };
}

export function mapHold(dto: LegalHoldDto): LegalHold {
  return {
    id: dto.id,
    ref: dto.caseNo,
    reason: dto.reason,
    placedBy: dto.placedByName ?? "—",
    placedAt: dateOnly(dto.placedAt),
    releasedAt: dto.releasedAt ? dateOnly(dto.releasedAt) : undefined,
    releasedByName: dto.releasedByName ?? undefined,
    caseRef: dto.caseNo,
    items: dto.documents.length,
    documentIds: dto.documents.map((document) => document.id),
    status: dto.status === "RELEASED" ? "released" : "active",
  };
}

export function mapTask(dto: TaskDto, documents: UiDocument[] = [], users: { id: string; name: string }[] = []): TaskItem {
  const doc = dto.documentId ? documents.find((item) => item.id === dto.documentId) : undefined;
  const assignee = dto.assigneeId ? users.find((user) => user.id === dto.assigneeId)?.name : undefined;
  const due = dto.dueAt ? new Date(dto.dueAt) : null;
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86_400_000) : null;
  const completed = dto.status === "completed";
  const overdue = !completed && daysLeft !== null && daysLeft < 0;
  const createdAt = new Date(dto.createdAt);
  const ageDays = Number.isNaN(createdAt.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000));

  return {
    id: dto.id,
    docId: dto.documentId ?? undefined,
    docTitle: doc?.title ?? dto.title,
    docNo: doc?.docNo ?? "",
    workflow: dto.status === "changes_requested" ? "changes" : "task",
    step: dto.description ?? "",
    from: assignee ?? "",
    deptId: doc?.deptId ?? "",
    priority: dto.priority === "high" ? "high" : dto.priority === "low" ? "low" : "medium",
    due: dateOnly(dto.dueAt),
    slaStatus: completed ? "ontrack" : overdue ? "breached" : daysLeft !== null && daysLeft <= 2 ? "warning" : "ontrack",
    age: `${ageDays}d`,
    status: completed
      ? "completed"
      : dto.status === "rejected" || dto.status === "cancelled"
        ? "rejected"
        : overdue
          ? "overdue"
          : dto.status === "changes_requested"
            ? "reassigned"
            : "assigned",
  };
}

export function mapTaskComment(dto: TaskCommentDto): TaskComment {
  return {
    id: dto.id,
    by: dto.authorName ?? "—",
    text: dto.body,
    at: dto.createdAt.slice(0, 16).replace("T", " "),
  };
}

const ORG_STATUS: Record<string, Employee["status"]> = {
  ACTIVE: "active",
  LOCKED: "inactive",
  INACTIVE: "inactive",
};

const PROJECT_STATUS: Record<string, Project["status"]> = {
  planned: "planned",
  active: "active",
  closed: "closed",
};

export function mapDepartment(dto: OrgDepartmentDto): Department {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    code: dto.code,
    parentId: dto.parentId,
    manager: dto.manager ?? "",
    employees: dto._count?.employees ?? dto._count?.users ?? 0,
    docs: dto._count?.documents ?? 0,
    status: "active",
  };
}

export function mapSection(dto: OrgSectionDto): Section {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    code: dto.code,
    deptId: dto.departmentId,
    head: dto.manager ?? "",
    employees: dto._count?.employees ?? dto._count?.users ?? 0,
    status: "active",
  };
}

export function mapProject(dto: OrgProjectDto): Project {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    code: dto.code,
    manager: "",
    status: PROJECT_STATUS[dto.status] ?? "active",
    startDate: dateOnly(dto.startDate),
    endDate: dateOnly(dto.endDate),
    departments: dto.departmentId ? [dto.departmentId] : [],
    members: 0,
    docs: dto._count?.documents ?? 0,
  };
}

export function mapEmployee(dto: OrgEmployeeDto): Employee {
  return {
    id: dto.id,
    empNo: dto.empNo,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    jobTitle: dto.jobTitle ?? "",
    jobTitleEn: dto.jobTitleEn ?? dto.jobTitle ?? "",
    deptId: dto.departmentId ?? "",
    sectionId: dto.sectionId ?? "",
    manager: "",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
    userId: dto.userId ?? undefined,
    status: ORG_STATUS[dto.status] ?? "active",
    initials: initialsFromName(dto.name),
    color: avatarColor(dto.id),
  };
}

export function mapUser(dto: UserSummaryDto): DocUser {
  return {
    id: dto.id,
    name: dto.name,
    nameEn: dto.nameEn ?? dto.name,
    username: dto.username,
    email: dto.email,
    empNo: dto.username,
    jobTitle: dto.jobTitle ?? "",
    jobTitleEn: dto.jobTitleEn ?? dto.jobTitle ?? "",
    deptId: dto.departmentId ?? "",
    role: roleFromApi(dto.role as Parameters<typeof roleFromApi>[0]),
    status: dto.status === "ACTIVE" ? "active" : dto.status === "LOCKED" ? "locked" : "inactive",
    lastLogin: dateOnly(dto.lastLoginAt),
    failedAttempts: dto.failedAttempts ?? 0,
    activeSessions: dto.activeSessions ?? 0,
    initials: initialsFromName(dto.name),
    color: avatarColor(dto.id || dto.username),
  };
}

const NOTIFICATION_TYPE: Record<NotificationDto["level"], Notification["type"]> = {
  INFO: "info",
  SUCCESS: "system",
  WARNING: "warning",
  ERROR: "security",
};

export function mapNotification(dto: NotificationDto): Notification {
  return {
    id: dto.id,
    type: NOTIFICATION_TYPE[dto.level] ?? "info",
    title: dto.title,
    body: dto.message,
    time: dto.createdAt.slice(0, 16).replace("T", " "),
    read: dto.read,
    entityType: dto.entityType ?? undefined,
    entityId: dto.entityId ?? undefined,
  };
}

export function mapAuditEvent(dto: AuditEventDto, users: { id: string; name: string }[] = []): AuditEntry {
  return {
    id: dto.id,
    datetime: dto.ts.slice(0, 16).replace("T", " "),
    user: dto.actorName ?? users.find((user) => user.id === dto.actorId)?.name ?? "—",
    module: dto.entityType,
    action: dto.action,
    entityType: dto.entityType,
    entityId: dto.entityId ?? "",
    deptId: dto.departmentId ?? "",
    ip: dto.ip ?? "—",
    result: dto.result === "failure" ? "failure" : "success",
    correlation: dto.correlationId ?? "",
    detail: dto.detail === null || dto.detail === undefined ? "" : typeof dto.detail === "string" ? dto.detail : JSON.stringify(dto.detail),
  };
}

export interface MappedReportSchedule {
  id: string;
  reportId: string;
  name: string;
  category: string;
  categoryEn: string;
  freq: string;
  freqKey: string;
  time: string;
  recipients: string[];
  format: string;
  lastRun: string;
  nextRun: string;
  status: "active" | "paused";
  runs: number;
  successRate: number | null;
}

export function mapReportSchedule(dto: ReportScheduleDto, runs: ReportRunDto[] = []): MappedReportSchedule {
  const own = runs.filter((run) => run.scheduleId === dto.id);
  const completed = own.filter((run) => run.status === "completed" || run.status === "success").length;
  const last = own
    .map((run) => run.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const template = reportTemplates.find((item) => item.id === dto.reportType);

  return {
    id: dto.id,
    reportId: dto.reportType,
    name: dto.name,
    category: template?.category ?? dto.reportType,
    categoryEn: template?.categoryEn ?? dto.reportType,
    freq: dto.cadence,
    freqKey: dto.cadence.toLowerCase(),
    time: dto.filters?.time ?? "08:00",
    recipients: dto.recipients,
    format: dto.filters?.format ?? "PDF",
    lastRun: last ? dateOnly(last) : "—",
    nextRun: dto.nextRunAt ? dto.nextRunAt.slice(0, 16).replace("T", " ") : "—",
    status: dto.isActive ? "active" : "paused",
    runs: own.length || dto._count?.runs || 0,
    successRate: own.length ? Math.round((completed / own.length) * 100) : null,
  };
}

export function mapAclRules(rules: AclRuleDto[]): ACLRule[] {
  return rules.map((rule) => ({
    id: rule.id,
    principalType:
      rule.principalType.toLowerCase() === "department" ? "department" : rule.principalType.toLowerCase() === "role" ? "role" : "user",
    principalId: rule.principalId,
    principalName: rule.principalId,
    permissions: permsFromAclActions(rule.actions),
    effect: rule.effect === "DENY" ? "deny" : "allow",
  }));
}

export function toAclPayload(rules: ACLRule[]): {
  rules: { principalType: "USER" | "DEPARTMENT" | "ROLE"; principalId: string; actions: AclAction[]; effect: "ALLOW" | "DENY" }[];
} {
  const actionsFor = (permissions: ACLRule["permissions"]): AclAction[] => {
    const actions = new Set<AclAction>();
    for (const permission of permissions) {
      if (permission === "view") actions.add("VIEW");
      else if (permission === "edit") actions.add("EDIT");
      else if (permission === "delete") actions.add("DELETE");
      else if (permission === "download") actions.add("EXPORT");
    }
    return [...actions];
  };

  return {
    rules: rules
      .filter((rule) => rule.principalType !== "group")
      .map((rule) => ({
        principalType: rule.principalType.toUpperCase() as "USER" | "DEPARTMENT" | "ROLE",
        principalId: rule.principalId,
        actions: actionsFor(rule.permissions),
        effect: (rule.effect ?? "allow") === "deny" ? ("DENY" as const) : ("ALLOW" as const),
      })),
  };
}
