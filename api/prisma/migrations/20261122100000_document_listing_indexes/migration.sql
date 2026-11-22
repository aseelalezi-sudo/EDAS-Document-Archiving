CREATE INDEX CONCURRENTLY "Document_active_createdAt_idx"
ON "Document" ("createdAt" DESC)
WHERE "deletedAt" IS NULL;
