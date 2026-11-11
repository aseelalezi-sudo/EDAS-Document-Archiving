-- Repair orphaned references before enforcing the new foreign keys.
UPDATE "ApprovalDecision" SET "decidedById" = NULL WHERE "decidedById" IS NOT NULL AND "decidedById" NOT IN (SELECT "id" FROM "User");
UPDATE "Notification" SET "userId" = NULL WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "SavedSearch" WHERE "userId" NOT IN (SELECT "id" FROM "User");
UPDATE "TaskItem" SET "documentId" = NULL WHERE "documentId" IS NOT NULL AND "documentId" NOT IN (SELECT "id" FROM "Document");
UPDATE "TaskItem" SET "assigneeId" = NULL WHERE "assigneeId" IS NOT NULL AND "assigneeId" NOT IN (SELECT "id" FROM "User");
UPDATE "TaskItem" SET "createdById" = NULL WHERE "createdById" IS NOT NULL AND "createdById" NOT IN (SELECT "id" FROM "User");
UPDATE "TaskComment" SET "authorId" = NULL WHERE "authorId" IS NOT NULL AND "authorId" NOT IN (SELECT "id" FROM "User");
UPDATE "ReportSchedule" SET "departmentId" = NULL WHERE "departmentId" IS NOT NULL AND "departmentId" NOT IN (SELECT "id" FROM "Department");
UPDATE "ReportRun" SET "requestedById" = NULL WHERE "requestedById" IS NOT NULL AND "requestedById" NOT IN (SELECT "id" FROM "User");
UPDATE "ReportRun" SET "departmentId" = NULL WHERE "departmentId" IS NOT NULL AND "departmentId" NOT IN (SELECT "id" FROM "Department");

-- CreateIndex
CREATE INDEX "ApprovalDecision_decidedById_idx" ON "ApprovalDecision"("decidedById");

-- CreateIndex
CREATE INDEX "ReportRun_requestedById_idx" ON "ReportRun"("requestedById");

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "TaskComment_authorId_idx" ON "TaskComment"("authorId");

-- CreateIndex
CREATE INDEX "TaskItem_documentId_idx" ON "TaskItem"("documentId");

-- CreateIndex
CREATE INDEX "TaskItem_createdById_idx" ON "TaskItem"("createdById");

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;