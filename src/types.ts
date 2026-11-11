import type { UserRole } from "@edas/shared";
import type { Role } from "./store";

export type DocStatus = "draft" | "pending" | "approved" | "rejected" | "archived" | "retention" | "destroyed" | "hold";

export type Classification = "public" | "internal" | "confidential" | "restricted" | "topsecret";

export type FileType = "pdf" | "image" | "office" | "cad" | "text";

/* Folder-level access control */
export type PermAction = "view" | "edit" | "delete" | "download";

export interface ACLRule {
  id: string;
  principalType: "user" | "group" | "department" | "role";
  principalId: string;
  principalName: string;
  permissions: PermAction[];
  /** `deny` blocks the listed actions even when the role or another rule grants them. */
  effect?: "allow" | "deny";
}

export interface Department {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  parentId: string | null;
  manager: string;
  employees: number;
  docs: number;
  status: "active" | "inactive";
}

export interface Section {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  deptId: string;
  head: string;
  employees: number;
  status: "active" | "inactive";
}

export interface Employee {
  id: string;
  empNo: string;
  name: string;
  nameEn: string;
  jobTitle: string;
  jobTitleEn: string;
  deptId: string;
  sectionId: string;
  manager: string;
  email: string;
  phone: string;
  userId?: string;
  status: "active" | "leave" | "inactive";
  initials: string;
  color: string;
}

export interface DocUser {
  id: string;
  name: string;
  nameEn: string;
  username: string;
  email: string;
  empNo: string;
  jobTitle: string;
  jobTitleEn: string;
  deptId: string;
  role: Role;
  status: "active" | "inactive" | "locked";
  lastLogin: string;
  failedAttempts: number;
  activeSessions: number;
  initials: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  manager: string;
  status: "planned" | "active" | "closed";
  startDate: string;
  endDate: string;
  departments: string[];
  members: number;
  docs: number;
}

export interface FolderNode {
  id: string;
  name: string;
  nameEn: string;
  parentId: string | null;
  type: "dept" | "project" | "shared" | "archive" | "favorite" | "recent";
  projectId?: string;
  owner?: string;
  docs: number;
  subfolders: number;
  accessScope: string;
  starred?: boolean;
}

export interface DocVersion {
  id?: string;
  fileId?: string;
  mimeType?: string;
  v: string;
  date: string;
  by: string;
  size: string;
  fingerprint: string;
  comment: string;
  current?: boolean;
}

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  actionEn: string;
  target: string;
  date: string;
  icon: string;
}

export interface Document {
  id: string;
  docNo: string;
  title: string;
  titleEn: string;
  category: string;
  categoryEn: string;
  categoryId: string;
  deptId: string;
  sectionId: string;
  projectId?: string;
  owner: string;
  ownerEn: string;
  version: string;
  classification: Classification;
  status: DocStatus;
  createdAt: string;
  modifiedAt: string;
  retentionEnd: string;
  size: string;
  sizeBytes?: number;
  fileType: FileType;
  folderId: string;
  tags: string[];
  description: string;
  descriptionEn: string;
  content?: string;
  checkedOutBy?: string;
  signatureStatus?: "none" | "pending" | "signed";
  signedBy?: string;
  signedAt?: string;
  declaredRecord?: boolean;
  versions: DocVersion[];
  activity: ActivityItem[];
  retentionDays: number;
}

export interface Policy {
  id: string;
  name: string;
  nameEn: string;
  scopeType: string;
  scopeTypeEn: string;
  target: string;
  category: string;
  departmentId?: string;
  retention: string;
  retentionMonths: number;
  requiresApproval: boolean;
  disposal: string;
  disposalEn: string;
  priority: "high" | "medium" | "low";
  status: "active" | "draft" | "inactive";
  updated: string;
  affectedDocs: number;
}

export interface ApprovalStep {
  order: number;
  assignee: string;
  assigneeEn: string;
  role: string;
  roleCode?: UserRole;
  name?: string;
  sla: number;
  type: "sequential" | "parallel";
  requireComment: boolean;
}

export interface ApprovalChain {
  id: string;
  name: string;
  nameEn: string;
  scope: string;
  target: string;
  steps: ApprovalStep[];
  status: "active" | "inactive";
  updated: string;
}

export interface TaskItem {
  id: string;
  docId?: string;
  docTitle: string;
  docNo: string;
  workflow: string;
  step: string;
  from: string;
  deptId: string;
  priority: "high" | "medium" | "low";
  due: string;
  slaStatus: "ontrack" | "warning" | "breached";
  age: string;
  status: "assigned" | "sent" | "completed" | "overdue" | "reassigned" | "rejected";
}

export interface TaskComment {
  id: string;
  by: string;
  text: string;
  at: string;
}

export interface AuditEntry {
  id: string;
  datetime: string;
  user: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  deptId: string;
  ip: string;
  result: "success" | "failure";
  correlation: string;
  detail: string;
}

export interface ErrorNote {
  by: string;
  text: string;
  at: string;
}

export interface ErrorItem {
  id: string;
  datetime: string;
  severity: "critical" | "high" | "medium" | "low";
  code: string;
  module: string;
  path: string;
  message: string;
  affectedUser: string;
  correlation: string;
  status: "new" | "investigating" | "resolved" | "ignored";
  owner: string;
  notes?: ErrorNote[];
}

export interface Notification {
  id: string;
  type: "approval" | "info" | "warning" | "security" | "system";
  title: string;
  body: string;
  time: string;
  read: boolean;
  entityType?: string;
  entityId?: string;
}

export interface LegalHold {
  id: string;
  ref: string;
  reason: string;
  placedBy: string;
  placedAt: string;
  releasedAt?: string;
  releasedByName?: string;
  caseRef: string;
  items: number;
  documentIds?: string[];
  status: "active" | "released";
}

export interface RetentionItem {
  id: string;
  documentId?: string;
  docTitle: string;
  docNo: string;
  policy: string;
  retentionEnd: string;
  deptId: string;
  owner: string;
  onHold: boolean;
  proposedAction: string;
  proposedActionEn: string;
  daysLeft: number;
  reviewStatus: "pending" | "reviewed" | "exempt";
  action?: "REVIEW" | "ARCHIVE" | "DESTROY";
  executedAt?: string | null;
}

export interface ReportTemplate {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  categoryEn: string;
  desc: string;
  descEn: string;
  favorite: boolean;
  lastRun: string;
  schedule: string;
  icon: string;
}
