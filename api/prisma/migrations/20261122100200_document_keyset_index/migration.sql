CREATE INDEX CONCURRENTLY "Document_active_createdAt_id_idx"
ON "Document" ("createdAt" DESC, "id" DESC)
WHERE "deletedAt" IS NULL;
