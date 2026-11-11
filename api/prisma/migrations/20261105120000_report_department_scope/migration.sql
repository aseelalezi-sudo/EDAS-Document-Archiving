-- Report schedules and runs carry the department their content was built for, so a
-- department manager cannot list or download another department's reports.

ALTER TABLE "ReportSchedule" ADD COLUMN "departmentId" UUID;

ALTER TABLE "ReportRun" ADD COLUMN "departmentId" UUID;

-- Backfill: a run requested by an account is scoped to that account's department.
UPDATE "ReportRun" r
SET "departmentId" = u."departmentId"
FROM "User" u
WHERE r."requestedById" = u.id
  AND r."departmentId" IS NULL;

-- Backfill: a schedule created through the audit trail keeps the department recorded on its create event.
UPDATE "ReportSchedule" s
SET "departmentId" = e."departmentId"
FROM "AuditEvent" e
WHERE e."entityType" = 'ReportSchedule'
  AND e."action" = 'report.schedule.create'
  AND e."entityId" = s.id::text
  AND s."departmentId" IS NULL
  AND e."departmentId" IS NOT NULL;

CREATE INDEX "ReportSchedule_departmentId_idx" ON "ReportSchedule"("departmentId");

CREATE INDEX "ReportRun_departmentId_createdAt_idx" ON "ReportRun"("departmentId", "createdAt");
