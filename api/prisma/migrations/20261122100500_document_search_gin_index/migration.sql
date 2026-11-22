CREATE INDEX CONCURRENTLY "Document_search_gin_idx"
ON "Document" USING GIN (
  "title" gin_trgm_ops,
  "titleEn" gin_trgm_ops,
  "docNo" gin_trgm_ops,
  "description" gin_trgm_ops,
  "category" gin_trgm_ops,
  "tags" array_ops
);
