import type { AclAction, AclEffect, AclPrincipal } from "./permissions";
import type { UserRole } from "./roles";

export const API_PREFIX = "/api/v1";

export interface ApiEnvelope<T> {
  data: T;
}

export type ApiErrorCode =
  "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "BAD_REQUEST" | "CONFLICT" | "INTERNAL_ERROR" | (string & {});

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  messageAr?: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
  correlationId: string | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface OidcConfigDto {
  issuer: string;
  clientId: string;
  audience: string;
  scopes: string;
}

export interface ProfileDto {
  id: string;
  username: string;
  name: string;
  nameEn: string | null;
  email: string;
  role: UserRole;
  status: string;
  departmentId: string | null;
  sectionId: string | null;
  jobTitle: string | null;
  jobTitleEn: string | null;
  phone: string | null;
  isNew: boolean;
}

export interface AclRuleDto {
  id: string;
  folderId: string;
  principalType: AclPrincipal;
  principalId: string;
  actions: AclAction[];
  effect: AclEffect;
  createdAt: string;
}

export interface FolderDto {
  id: string;
  name: string;
  nameEn: string | null;
  type: "DEPARTMENT" | "PROJECT" | "PERSONAL" | "SYSTEM";
  scope: "PUBLIC" | "DEPARTMENT" | "SECTION" | "PRIVATE";
  path: string;
  parentId: string | null;
  departmentId: string | null;
  projectId: string | null;
  createdAt: string;
}

export interface FileDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
}

export type FileVerificationReasonDto = "missing_object" | "size_mismatch" | "unreadable_object" | "checksum_mismatch";

export interface FileVerificationDto {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  ok: boolean;
  reason: FileVerificationReasonDto | null;
  declaredSizeBytes: number;
  storedSizeBytes: number | null;
  expectedChecksum: string;
  actualChecksum: string | null;
  verifiedAt: string;
}

export interface UnreferencedFileDto {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface MissingObjectDto {
  id: string;
  storageKey: string;
  originalName: string;
  sizeBytes: number;
}

export interface VersionPointerIssueDto {
  id: string;
  docNo: string;
  currentVersion: number;
  status: string;
  versionCount: number;
  currentFlags: number;
  flaggedVersion: number | null;
}

export interface StorageIntegrityDto {
  generatedAt: string;
  bucket: string;
  files: {
    total: number;
    attachedToDocuments: number;
    attachedToReportRuns: number;
    unreferencedCount: number;
    unreferencedTruncated: boolean;
    unreferenced: UnreferencedFileDto[];
  };
  storage: {
    listedObjects: number;
    listingTruncated: boolean;
    listingFailed: boolean;
    listingError: string | null;
    missingObjectsCount: number;
    missingObjectsTruncated: boolean;
    missingObjects: MissingObjectDto[];
    orphanObjectsCount: number;
    orphanObjectsTruncated: boolean;
    orphanObjects: string[];
  };
  versions: { mismatchCount: number; mismatchesTruncated: boolean; mismatches: VersionPointerIssueDto[] };
  checksums: { verified: boolean; note: string };
}

export interface StoragePurgeResultDto {
  dryRun: boolean;
  bucket: string;
  files: UnreferencedFileDto[];
  storageKeys: string[];
  deleted: { files: number; objects: number; failures: string[] } | null;
}

export interface PresignedUploadDto {
  storageKey: string;
  bucket: string;
  method: "PUT";
  url: string;
  expiresInSeconds: number;
}

export type FilePreviewKind = "pdf" | "image" | "text" | "cad" | "unsupported";

export type FilePreviewStatus = "ready" | "converting" | "failed" | "unavailable";

export type FilePreviewReason =
  | "converter_unavailable"
  | "too_large"
  | "unreadable"
  | "unsupported_type"
  | "type_mismatch"
  | "image_not_supported"
  | "conversion_failed"
  | "conversion_timeout"
  | "converter_busy"
  | "conversion_produced_no_output";

export type FilePreviewSource = "original" | "office" | "dwg";

export interface FilePreviewDto {
  fileId: string;
  kind: FilePreviewKind;
  status: FilePreviewStatus;
  source: FilePreviewSource;
  detectedType: string;
  fileName: string;
  mimeType: string;
  url: string | null;
  reason: FilePreviewReason | null;
  message: string | null;
  retryable: boolean;
  downloadable?: boolean;
  expiresInSeconds: number | null;
  startedAt: string | null;
  elapsedMs: number | null;
}

export interface PreviewCapabilitiesDto {
  office: { available: boolean; version: string | null };
  dwg: { available: boolean };
  limits: { maxSourceBytes: number; timeoutMs: number; concurrency: number };
}

export interface PreviewCacheCleanupDto {
  olderThanDays: number;
  removed: number;
  failed: number;
  truncated: boolean;
}

export interface DocumentVersionDto {
  id: string;
  version: number;
  comment: string | null;
  isCurrent: boolean;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  file: FileDto;
}

export type SignatureStatusDto = "NONE" | "PENDING" | "SIGNED";

export type RetentionActionDto = "REVIEW" | "ARCHIVE" | "DESTROY";

export interface RetentionPolicyDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  legalBasis: string | null;
  retentionMonths: number;
  action: RetentionActionDto;
  isActive: boolean;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

export interface RetentionItemDto {
  id: string;
  documentId: string;
  policyId: string;
  dueAt: string;
  action: RetentionActionDto;
  status: string;
  executedAt: string | null;
  onHold?: boolean;
  createdAt: string;
  document: {
    id: string;
    docNo: string;
    title: string;
    status: DocumentDto["status"];
    isRecord: boolean;
    departmentId: string | null;
    retentionEnd: string | null;
    folderId: string | null;
    ownerId: string | null;
    owner?: { name: string } | null;
  };
  policy: { id: string; name: string; action: RetentionActionDto; retentionMonths: number; legalBasis?: string | null };
}

export interface DestroyedFileDto {
  version: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

export interface DestructionCertificateDto {
  certificateRef: string;
  auditEventId: string;
  auditHash: string | null;
  destroyedAt: string;
  performedById: string | null;
  performedBy: string | null;
  retentionItemId: string;
  document: { id: string; docNo: string; title: string };
  policy: { id: string; name: string; retentionMonths: number; legalBasis: string | null };
  dueAt: string | null;
  note: string | null;
  files: DestroyedFileDto[];
  fileCount: number;
  totalBytes: number;
  storageErrors: number;
}

export interface LegalHoldDocumentDto {
  id: string;
  docNo: string;
  title: string;
  status: DocumentDto["status"];
  departmentId: string | null;
  addedAt: string;
}

export interface LegalHoldDto {
  id: string;
  caseNo: string;
  reason: string;
  status: "ACTIVE" | "RELEASED";
  placedById: string | null;
  placedByName: string | null;
  placedAt: string;
  releasedById: string | null;
  releasedByName: string | null;
  releasedAt: string | null;
  documents: LegalHoldDocumentDto[];
}

export interface SettingDto {
  id?: string;
  key: string;
  value: unknown;
  updatedAt?: string;
}

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationTemplateDto {
  id: string;
  name: string;
  nameEn: string;
  channel: NotificationChannel;
  subject: string;
  subjectEn: string;
  body: string;
  bodyEn: string;
  isDefault?: boolean;
  updatedAt: string;
}
export interface RolePolicyDto {
  role: UserRole;
  actions: AclAction[];
  customized: boolean;
  userCount: number;
  updatedAt: string | null;
}
export interface ReportSummaryDto {
  documents: { total: number; byStatus: Record<string, number>; byClassification: Record<string, number> };
  approvals: { pending: number };
  retention: { overdue: number };
  legalHolds: { active: number };
  users: { total: number };
  tasks: { open: number };
  trend: { month: string; uploaded: number; archived: number }[];
}

export interface ApprovalChainStepDto {
  id: string;
  chainId: string;
  order: number;
  role: UserRole;
  name: string | null;
}

export interface ApprovalChainDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  steps: ApprovalChainStepDto[];
  _count?: { instances: number };
}

export interface ApprovalDecisionDto {
  id: string;
  stepOrder: number;
  decision: string;
  comment: string | null;
  decidedById: string | null;
  decidedAt: string;
}

export interface ApprovalInstanceDto {
  id: string;
  documentId: string;
  document: { id: string; docNo: string; title: string; departmentId: string | null; status: string };
  chainId: string | null;
  chainName: string | null;
  status: string;
  startedById: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: { order: number; name: string | null; role: UserRole; decided: boolean }[];
  currentStep: { order: number; role: UserRole } | null;
  decisions: ApprovalDecisionDto[];
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  documentId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskCommentDto {
  id: string;
  taskId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface UserSummaryDto {
  id: string;
  username: string;
  name: string;
  nameEn: string | null;
  email: string;
  role: string;
  status: string;
  departmentId: string | null;
  sectionId: string | null;
  jobTitle: string | null;
  jobTitleEn?: string | null;
  phone?: string | null;
  failedAttempts?: number;
  activeSessions?: number;
  lastLoginAt: string | null;
}

export interface UserSessionDto {
  id: string;
  ipAddress: string | null;
  started: string | null;
  lastAccess: string | null;
  clients: string[];
}

export type ReportCadenceDto = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

export interface ReportScheduleDto {
  id: string;
  name: string;
  reportType: string;
  cadence: ReportCadenceDto;
  recipients: string[];
  filters: { time?: string; format?: string } | null;
  isActive: boolean;
  nextRunAt: string | null;
  createdAt: string;
  _count?: { runs: number };
}

export interface ReportRunDto {
  id: string;
  scheduleId: string | null;
  reportType: string;
  format: string;
  status: string;
  requestedById: string | null;
  fileId?: string | null;
  createdAt: string;
  completedAt: string | null;
  schedule?: { id: string; name: string } | null;
}

export type NotificationLevelDto = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export interface NotificationDto {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  level: NotificationLevelDto;
  read: boolean;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface AuditEventDto {
  id: string;
  ts: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  departmentId: string | null;
  ip: string | null;
  result: string;
  correlationId: string | null;
  detail: unknown;
  prevHash: string | null;
  hash: string | null;
}

export type AuditChainBreakKindDto = "hash_mismatch" | "broken_link" | "missing_hash";

export interface AuditChainBreakDto {
  seq: number;
  id: string;
  ts: string;
  action: string;
  entityType: string;
  kind: AuditChainBreakKindDto;
  expected: string | null;
  found: string | null;
  known: boolean;
}

export interface AuditChainForkDto {
  prevHash: string;
  children: number;
  seqs: number[];
  known: boolean;
}

export interface AuditChainBaselineDto {
  seq: number;
  id: string;
  recordedAt: string;
  events: number;
  maxSeq: number | null;
  breakCount: number;
  forkCount: number;
}

export interface AuditChainReportDto {
  events: number;
  maxSeq: number | null;
  sequenceGaps: number;
  valid: boolean;
  breakCount: number;
  breaks: AuditChainBreakDto[];
  truncated: boolean;
  forkCount: number;
  forks: AuditChainForkDto[];
  genesisCount: number;
  firstBrokenSeq: number | null;
  verifiedAt: string;
  detailSignedEvents: number;
  detailSignedFromSeq: number | null;
  baseline: AuditChainBaselineDto | null;
  knownBreakCount: number;
  knownForkCount: number;
  newBreakCount: number;
  newForkCount: number;
  alarm: boolean;
}

export interface SavedSearchDto {
  id: string;
  userId: string;
  name: string;
  query: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSectionDto {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  manager: string | null;
  departmentId: string;
  _count?: { users: number; employees: number };
}

export interface OrgDepartmentDto {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  manager: string | null;
  parentId: string | null;
  sections: OrgSectionDto[];
  _count?: { users: number; employees: number; documents: number };
}

export interface OrgProjectDto {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  departmentId: string | null;
  _count?: { documents: number; folders: number };
}

export interface ReportTemplateDto {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  categoryEn: string;
  desc: string;
  descEn: string;
  icon: string;
  favorite: boolean;
  schedule: string;
  lastRun: string | null;
}

export interface GroupDto {
  id: string;
  name: string;
  nameEn: string | null;
  desc: string;
  scope: string;
  type: string;
  memberIds: string[];
  createdAt: string;
}

export interface OrgEmployeeDto {
  id: string;
  empNo: string;
  name: string;
  nameEn: string | null;
  jobTitle: string | null;
  jobTitleEn: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  departmentId: string | null;
  sectionId: string | null;
  userId: string | null;
}

export interface OrgDepartmentInput {
  code: string;
  name: string;
  nameEn?: string;
  manager?: string;
  order?: number;
  parentId?: string | null;
}

export interface OrgSectionInput {
  code: string;
  name: string;
  nameEn?: string;
  manager?: string;
  order?: number;
  departmentId: string;
}

export interface OrgProjectInput {
  code: string;
  name: string;
  nameEn?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  departmentId?: string | null;
}

export interface OrgEmployeeInput {
  empNo: string;
  name: string;
  nameEn?: string;
  jobTitle?: string;
  jobTitleEn?: string;
  email?: string;
  phone?: string;
  status?: "ACTIVE" | "INACTIVE" | "LOCKED";
  departmentId?: string | null;
  sectionId?: string | null;
  userId?: string | null;
}

export interface DocumentDto {
  id: string;
  docNo: string;
  title: string;
  titleEn: string | null;
  description?: string | null;
  category: string | null;
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED" | "DISPOSED";
  isRecord: boolean;
  currentVersion: number;
  fileType: string | null;
  sizeBytes: number;
  tags: string[];
  retentionEnd: string | null;
  folderId: string | null;
  departmentId: string | null;
  sectionId: string | null;
  projectId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerNameEn: string | null;
  departmentName: string | null;
  departmentNameEn: string | null;
  folderName: string | null;
  checkedOutById: string | null;
  checkedOutByName: string | null;
  checkedOutAt: string | null;
  signatureStatus: SignatureStatusDto;
  signedById: string | null;
  signedByName: string | null;
  signedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  deletedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetailDto extends DocumentDto {
  versions: DocumentVersionDto[];
}

export interface DocumentPermissionsDto {
  documentId: string;
  actions: AclAction[];
}
