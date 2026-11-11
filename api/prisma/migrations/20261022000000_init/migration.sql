-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'SUPERVISOR', 'DEPT_MANAGER', 'ARCHIVIST', 'AUDITOR', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "FolderType" AS ENUM ('DEPARTMENT', 'PROJECT', 'PERSONAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FolderScope" AS ENUM ('PUBLIC', 'DEPARTMENT', 'SECTION', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('NONE', 'PENDING', 'SIGNED');

-- CreateEnum
CREATE TYPE "AclPrincipal" AS ENUM ('USER', 'ROLE', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "AclAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RetentionAction" AS ENUM ('REVIEW', 'ARCHIVE', 'DESTROY');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ReportCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "manager" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "manager" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "departmentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "empNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "jobTitle" TEXT,
    "jobTitleEn" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID,
    "sectionId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "departmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "keycloakSub" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT,
    "jobTitleEn" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID,
    "sectionId" UUID,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "activeSessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" "FolderType" NOT NULL DEFAULT 'DEPARTMENT',
    "scope" "FolderScope" NOT NULL DEFAULT 'DEPARTMENT',
    "path" TEXT NOT NULL DEFAULT '/',
    "aclInherit" BOOLEAN NOT NULL DEFAULT true,
    "parentId" UUID,
    "departmentId" UUID,
    "projectId" UUID,
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "checksumSha256" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "docNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "description" TEXT,
    "category" TEXT,
    "classification" "Classification" NOT NULL DEFAULT 'INTERNAL',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "isRecord" BOOLEAN NOT NULL DEFAULT false,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "fileType" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retentionEnd" TIMESTAMP(3),
    "folderId" UUID,
    "departmentId" UUID,
    "sectionId" UUID,
    "projectId" UUID,
    "ownerId" UUID,
    "checkedOutById" UUID,
    "checkedOutAt" TIMESTAMP(3),
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'NONE',
    "signedById" UUID,
    "signedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "comment" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AclRule" (
    "id" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "principalType" "AclPrincipal" NOT NULL,
    "principalId" TEXT NOT NULL,
    "actions" "AclAction"[] DEFAULT ARRAY[]::"AclAction"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AclRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalChain" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" UUID NOT NULL,
    "chainId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalInstance" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "chainId" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "decision" "ApprovalStatus" NOT NULL,
    "comment" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "legalBasis" TEXT,
    "retentionMonths" INTEGER NOT NULL,
    "action" "RetentionAction" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionItem" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "action" "RetentionAction" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" UUID NOT NULL,
    "caseNo" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "placedById" UUID,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" UUID,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHoldDocument" (
    "id" UUID NOT NULL,
    "holdId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalHoldDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryEn" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "descEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'bar',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT NOT NULL DEFAULT '—',
    "lastRun" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "desc" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'functional',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" UUID,
    "actorName" TEXT,
    "departmentId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "correlationId" TEXT,
    "detail" JSONB,
    "prevHash" TEXT,
    "hash" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL DEFAULT 'INFO',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskItem" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "documentId" UUID,
    "assigneeId" UUID,
    "createdById" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "cadence" "ReportCadence" NOT NULL,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" UUID NOT NULL,
    "scheduleId" UUID,
    "reportType" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestedById" UUID,
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePolicy" (
    "role" "UserRole" NOT NULL,
    "actions" "AclAction"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "RolePolicy_pkey" PRIMARY KEY ("role")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_empNo_key" ON "Employee"("empNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Folder_path_idx" ON "Folder"("path");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_docNo_key" ON "Document"("docNo");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Document_departmentId_idx" ON "Document"("departmentId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "Document_checkedOutById_idx" ON "Document"("checkedOutById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AclRule_folderId_principalType_principalId_key" ON "AclRule"("folderId", "principalType", "principalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_chainId_order_key" ON "ApprovalStep"("chainId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionItem_documentId_policyId_key" ON "RetentionItem"("documentId", "policyId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalHoldDocument_holdId_documentId_key" ON "LegalHoldDocument"("holdId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "AuditEvent_ts_idx" ON "AuditEvent"("ts");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");

-- CreateIndex
CREATE INDEX "TaskItem_assigneeId_status_idx" ON "TaskItem"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AclRule" ADD CONSTRAINT "AclRule_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "ApprovalChain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "ApprovalChain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionItem" ADD CONSTRAINT "RetentionItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionItem" ADD CONSTRAINT "RetentionItem_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHoldDocument" ADD CONSTRAINT "LegalHoldDocument_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "LegalHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHoldDocument" ADD CONSTRAINT "LegalHoldDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
