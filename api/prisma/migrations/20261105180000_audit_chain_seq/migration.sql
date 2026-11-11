-- Deterministic ordering and fork detection for the audit hash chain.
-- `seq` is a monotonic application-order column: the chain is read and verified by `seq`, never by the app-clock `ts`.
ALTER TABLE "AuditEvent" ADD COLUMN "seq" BIGINT;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY "ts" ASC, "id" ASC) AS n
  FROM "AuditEvent"
)
UPDATE "AuditEvent" AS a
SET "seq" = ordered.n
FROM ordered
WHERE ordered.id = a.id;

CREATE SEQUENCE "AuditEvent_seq_seq";

DO $$
DECLARE max_seq BIGINT;
BEGIN
  SELECT MAX("seq") INTO max_seq FROM "AuditEvent";
  IF max_seq IS NULL THEN
    PERFORM setval('"AuditEvent_seq_seq"', 1, false);
  ELSE
    PERFORM setval('"AuditEvent_seq_seq"', max_seq, true);
  END IF;
END $$;

ALTER TABLE "AuditEvent" ALTER COLUMN "seq" SET DEFAULT nextval('"AuditEvent_seq_seq"'::regclass);

ALTER TABLE "AuditEvent" ALTER COLUMN "seq" SET NOT NULL;

ALTER SEQUENCE "AuditEvent_seq_seq" OWNED BY "AuditEvent"."seq";

CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");
