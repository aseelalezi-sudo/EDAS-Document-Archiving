import type {
  AclAction,
  ApprovalChainDto,
  ApprovalInstanceDto,
  AuditChainReportDto,
  AuditEventDto,
  DocumentDto,
  DestructionCertificateDto,
  FileVerificationDto,
  GroupDto,
  LegalHoldDto,
  NotificationDto,
  NotificationTemplateDto,
  OrgDepartmentDto,
  OrgDepartmentInput,
  OrgEmployeeDto,
  OrgEmployeeInput,
  OrgProjectDto,
  OrgProjectInput,
  OrgSectionDto,
  OrgSectionInput,
  Paginated,
  ReportCadenceDto,
  ReportRunDto,
  ReportScheduleDto,
  ReportSummaryDto,
  ReportTemplateDto,
  RolePolicyDto,
  RetentionActionDto,
  RetentionItemDto,
  RetentionPolicyDto,
  SavedSearchDto,
  SettingDto,
  StorageIntegrityDto,
  StoragePurgeResultDto,
  TaskCommentDto,
  TaskDto,
  UserRole,
  UserSessionDto,
  UserSummaryDto,
} from "@edas/shared";
import { createApiClient } from "./api-client";

const client = createApiClient();

export const domainApi = {
  me: () => client.me(),
  reportSummary: () => client.get<ReportSummaryDto>("/reports/summary"),
  submitApproval: (body: { documentId: string; chainId?: string; comment?: string }) => client.post<{ id: string }>("/approvals", body),
  approvals: () => client.get<Paginated<ApprovalInstanceDto>>("/approvals", { query: { pageSize: 100 } }),
  pendingApprovals: () => client.get<{ items: ApprovalInstanceDto[]; meta: { total: number } }>("/approvals/pending"),
  decideApproval: (id: string, body: { decision: "APPROVED" | "REJECTED"; comment?: string }) =>
    client.post<ApprovalInstanceDto>(`/approvals/${id}/decide`, body),
  approvalChains: () => client.get<Paginated<ApprovalChainDto>>("/approval-chains"),
  createApprovalChain: (body: { name: string; description?: string; steps: { role: UserRole; order?: number; name?: string }[] }) =>
    client.post<ApprovalChainDto>("/approval-chains", body),
  updateApprovalChain: (
    id: string,
    body: { name?: string; description?: string; isActive?: boolean; steps?: { role: UserRole; order?: number; name?: string }[] },
  ) => client.patch<ApprovalChainDto>(`/approval-chains/${id}`, body),
  retentionPolicies: () => client.get<Paginated<RetentionPolicyDto>>("/retention/policies"),
  createRetentionPolicy: (body: {
    name: string;
    description?: string;
    category?: string;
    legalBasis?: string;
    retentionMonths: number;
    action: RetentionActionDto;
    departmentId?: string;
    isActive?: boolean;
  }) => client.post<RetentionPolicyDto>("/retention/policies", body),
  updateRetentionPolicy: (
    id: string,
    body: {
      name?: string;
      description?: string;
      category?: string | null;
      legalBasis?: string;
      retentionMonths?: number;
      action?: RetentionActionDto;
      departmentId?: string | null;
      isActive?: boolean;
    },
  ) => client.patch<RetentionPolicyDto>(`/retention/policies/${id}`, body),
  deleteRetentionPolicy: (id: string) => client.del<{ id: string; deleted: boolean }>(`/retention/policies/${id}`),
  retentionItems: (params: { dueOnly?: boolean; status?: string; page?: number; pageSize?: number } = {}) =>
    client.get<Paginated<RetentionItemDto>>("/retention/items", {
      query: params as unknown as Record<string, string | number | boolean | undefined>,
    }),
  scheduleRetention: (documentId: string, policyId: string) => client.post<RetentionItemDto>("/retention/items", { documentId, policyId }),
  extendRetention: (id: string, dueAt: string) => client.patch<RetentionItemDto>(`/retention/items/${id}`, { dueAt }),
  executeRetention: (id: string, action?: RetentionActionDto) =>
    client.post<{ item: RetentionItemDto; document: Pick<DocumentDto, "id" | "docNo" | "title" | "status" | "retentionEnd"> }>(
      `/retention/items/${id}/execute`,
      action ? { action } : {},
    ),
  retentionCertificate: (id: string) => client.get<DestructionCertificateDto>(`/retention/items/${id}/certificate`),
  holds: () => client.get<Paginated<LegalHoldDto>>("/legal-holds", { query: { pageSize: 100 } }),
  createHold: (body: { caseNo: string; reason: string; documentIds?: string[] }) => client.post<LegalHoldDto>("/legal-holds", body),
  releaseHold: (id: string) => client.post<LegalHoldDto>(`/legal-holds/${id}/release`, {}),
  tasks: () => client.get<Paginated<TaskDto>>("/tasks", { query: { pageSize: 100 } }),
  taskComments: (taskId: string) => client.get<{ items: TaskCommentDto[]; meta: { total: number } }>(`/tasks/${taskId}/comments`),
  addTaskComment: (taskId: string, body: string) => client.post<TaskCommentDto>(`/tasks/${taskId}/comments`, { body }),
  completeTask: (id: string) => client.post<TaskDto>(`/tasks/${id}/complete`, {}),
  updateTask: (id: string, body: { assigneeId?: string; status?: string; priority?: string; title?: string; description?: string }) =>
    client.patch<TaskDto>(`/tasks/${id}`, body),
  users: () => client.get<Paginated<UserSummaryDto>>("/users", { query: { pageSize: 100 } }),
  settings: () => client.get<{ items: SettingDto[]; meta: { total: number } }>("/settings"),
  putSetting: (key: string, value: unknown) => client.put<SettingDto>(`/settings/${encodeURIComponent(key)}`, { value }),
  health: () => client.get<{ status: string; database: string }>("/health/ready"),
  reportSchedules: () => client.get<{ items: ReportScheduleDto[]; meta: { total: number } }>("/reports/schedules"),
  createReportSchedule: (body: {
    name: string;
    reportType: string;
    cadence: ReportCadenceDto;
    recipients?: string[];
    filters?: { time?: string; format?: string };
    isActive?: boolean;
  }) => client.post<ReportScheduleDto>("/reports/schedules", body),
  updateReportSchedule: (id: string, body: { isActive?: boolean; cadence?: ReportCadenceDto; recipients?: string[] }) =>
    client.patch<ReportScheduleDto>(`/reports/schedules/${id}`, body),
  deleteReportSchedule: (id: string) => client.del<{ id: string; deleted: boolean }>(`/reports/schedules/${id}`),
  createReportRun: (body: { reportType: string; format?: string; scheduleId?: string }) => client.post<ReportRunDto>("/reports/runs", body),
  runReportSchedule: (id: string) => client.post<ReportRunDto>(`/reports/schedules/${id}/run`, {}),
  downloadReportRun: (id: string) =>
    client.get<{ url: string; fileName: string; expiresInSeconds: number }>(`/reports/runs/${id}/download`),
  reportRuns: () => client.get<Paginated<ReportRunDto>>("/reports/runs", { query: { pageSize: 100 } }),
  notifications: (params: { unreadOnly?: boolean; pageSize?: number } = {}) =>
    client.get<Paginated<NotificationDto> & { meta: { unread: number } }>("/notifications", {
      query: { pageSize: 50, ...params },
    }),
  markNotificationRead: (id: string) => client.post<{ id: string; read: boolean }>(`/notifications/${id}/read`, {}),
  markAllNotificationsRead: () => client.post<{ updated: number }>("/notifications/read-all", {}),
  auditEvents: (
    params: {
      q?: string;
      entityType?: string;
      entityId?: string;
      action?: string;
      actorId?: string;
      result?: "success" | "failure";
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) =>
    client.get<Paginated<AuditEventDto> & { meta: { success: number; failure: number; entityTypes: string[] } }>("/audit", {
      query: { pageSize: 100, ...params },
    }),
  verifyAuditChain: () => client.get<AuditChainReportDto>("/audit/verify"),
  recordAuditChainBaseline: () => client.post<AuditChainReportDto>("/audit/verify/baseline", {}),
  storageIntegrity: () => client.get<StorageIntegrityDto>("/files/integrity"),
  purgeUnreferencedFiles: (body: { confirm?: boolean }) => client.post<StoragePurgeResultDto>("/files/integrity/purge", body),
  verifyFile: (id: string) => client.post<FileVerificationDto>(`/files/${encodeURIComponent(id)}/verify`, {}),
  savedSearches: () => client.get<{ items: SavedSearchDto[]; meta: { total: number } }>("/saved-searches"),
  createSavedSearch: (body: { name: string; query: Record<string, unknown> }) => client.post<SavedSearchDto>("/saved-searches", body),
  updateSavedSearch: (id: string, body: { name?: string; query?: Record<string, unknown> }) =>
    client.patch<SavedSearchDto>(`/saved-searches/${id}`, body),
  deleteSavedSearch: (id: string) => client.del<{ id: string; deleted: boolean }>(`/saved-searches/${id}`),
  orgTree: () => client.get<{ items: OrgDepartmentDto[] }>("/org/tree"),
  orgProjects: () => client.get<{ items: OrgProjectDto[]; meta: { total: number } }>("/org/projects"),
  orgEmployees: (params: { page?: number; pageSize?: number } = {}) =>
    client.get<Paginated<OrgEmployeeDto>>("/org/employees", {
      query: params as unknown as Record<string, string | number | boolean | undefined>,
    }),
  reportTemplates: () => client.get<{ items: ReportTemplateDto[]; meta: { total: number } }>("/report-templates"),
  setReportTemplateFavorite: (id: string, favorite: boolean) =>
    client.patch<ReportTemplateDto>(`/report-templates/${id}/favorite`, { favorite }),
  notificationTemplates: () => client.get<{ items: NotificationTemplateDto[]; meta: { total: number } }>("/notification-templates"),
  createNotificationTemplate: (
    body: Partial<NotificationTemplateDto> & {
      name: string;
      nameEn: string;
      subject: string;
      subjectEn: string;
      body: string;
      bodyEn: string;
    },
  ) => client.post<NotificationTemplateDto>("/notification-templates", body),
  updateNotificationTemplate: (id: string, body: Partial<NotificationTemplateDto>) =>
    client.patch<NotificationTemplateDto>(`/notification-templates/${id}`, body),
  deleteNotificationTemplate: (id: string) => client.del<{ id: string; deleted: boolean }>(`/notification-templates/${id}`),
  resetNotificationTemplate: (id: string) => client.post<NotificationTemplateDto>(`/notification-templates/${id}/reset`, {}),
  rolePolicies: () => client.get<{ items: RolePolicyDto[]; meta: { total: number } }>("/roles"),
  updateRolePolicy: (role: string, actions: AclAction[]) => client.patch<RolePolicyDto>(`/roles/${role}`, { actions }),
  resetRolePolicy: (role: string) => client.del<RolePolicyDto>(`/roles/${role}`),
  groups: () => client.get<{ items: GroupDto[]; meta: { total: number } }>("/groups"),
  createGroup: (body: { name: string; nameEn?: string; desc?: string; scope?: string; type?: string; memberIds?: string[] }) =>
    client.post<GroupDto>("/groups", body),
  updateGroup: (id: string, body: { name?: string; nameEn?: string; desc?: string; scope?: string; type?: string; memberIds?: string[] }) =>
    client.patch<GroupDto>(`/groups/${id}`, body),
  deleteGroup: (id: string) => client.del<{ id: string; deleted: boolean }>(`/groups/${id}`),
  createUser: (body: {
    name: string;
    username: string;
    email: string;
    password: string;
    role: UserRole;
    departmentId?: string;
    sectionId?: string;
    jobTitle?: string;
    phone?: string;
  }) => client.post<UserSummaryDto>("/users", body),
  updateUser: (
    id: string,
    body: {
      name?: string;
      username?: string;
      email?: string;
      role?: UserRole;
      status?: "ACTIVE" | "INACTIVE" | "LOCKED";
      departmentId?: string;
      sectionId?: string;
      jobTitle?: string;
      phone?: string;
      requirePasswordChange?: boolean;
      requireTwoFactor?: boolean;
    },
  ) => client.patch<UserSummaryDto>(`/users/${id}`, body),
  updateMyProfile: (body: { name?: string; nameEn?: string; email?: string; jobTitle?: string; jobTitleEn?: string; phone?: string }) =>
    client.patch<UserSummaryDto>("/users/me", body),
  myPreferences: () => client.get<{ items: Record<string, unknown> }>("/users/me/preferences"),
  putMyPreference: (key: string, value: unknown) => client.put<{ key: string; value: unknown }>(`/users/me/preferences/${key}`, { value }),
  deleteUser: (id: string) => client.del<{ id: string; deleted: boolean }>(`/users/${id}`),
  resetUserPassword: (id: string, password: string) =>
    client.post<{ id: string; updated: boolean }>(`/users/${id}/reset-password`, { password }),
  revokeUserSessions: (id: string) => client.post<{ id: string; sessions: number }>(`/users/${id}/revoke-sessions`, {}),
  userSessions: (id: string) => client.get<{ count: number; sessions: UserSessionDto[] }>(`/users/${id}/sessions`),
  departmentDefaults: (id: string) => client.get<{ departmentId: string; value: unknown }>(`/org/departments/${id}/defaults`),
  putDepartmentDefaults: (id: string, value: unknown) =>
    client.put<{ departmentId: string; value: unknown }>(`/org/departments/${id}/defaults`, { value }),
  createDepartment: (body: OrgDepartmentInput) => client.post<OrgDepartmentDto>("/org/departments", body),
  updateDepartment: (id: string, body: Partial<OrgDepartmentInput>) => client.patch<OrgDepartmentDto>(`/org/departments/${id}`, body),
  deleteDepartment: (id: string) => client.del<{ id: string; deleted: boolean }>(`/org/departments/${id}`),
  createSection: (body: OrgSectionInput) => client.post<OrgSectionDto>("/org/sections", body),
  updateSection: (id: string, body: Partial<OrgSectionInput>) => client.patch<OrgSectionDto>(`/org/sections/${id}`, body),
  deleteSection: (id: string) => client.del<{ id: string; deleted: boolean }>(`/org/sections/${id}`),
  createProject: (body: OrgProjectInput) => client.post<OrgProjectDto>("/org/projects", body),
  updateProject: (id: string, body: Partial<OrgProjectInput>) => client.patch<OrgProjectDto>(`/org/projects/${id}`, body),
  deleteProject: (id: string) => client.del<{ id: string; deleted: boolean }>(`/org/projects/${id}`),
  createEmployee: (body: OrgEmployeeInput) => client.post<OrgEmployeeDto>("/org/employees", body),
  updateEmployee: (id: string, body: Partial<OrgEmployeeInput>) => client.patch<OrgEmployeeDto>(`/org/employees/${id}`, body),
  deleteEmployee: (id: string) => client.del<{ id: string; deleted: boolean }>(`/org/employees/${id}`),
};
