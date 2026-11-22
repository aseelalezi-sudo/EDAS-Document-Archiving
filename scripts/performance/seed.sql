\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "Department" (id, code, name, "updatedAt")
SELECT ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'LOAD-' || i, 'Load department ' || i, now()
FROM generate_series(1, 16) AS g(i);

INSERT INTO "Folder" (id, name, scope, path, "departmentId", "updatedAt")
SELECT f.id, 'Load folder ' || i,
       CASE WHEN i % 4 = 0 THEN 'PUBLIC'::"FolderScope" ELSE 'DEPARTMENT'::"FolderScope" END,
       '/' || f.id || '/',
       ('10000000-0000-4000-8000-' || lpad((1 + (i - 1) % 16)::text, 12, '0'))::uuid, now()
FROM generate_series(1, 256) AS g(i)
CROSS JOIN LATERAL (SELECT ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid AS id) f;

INSERT INTO "AclRule" (id, "folderId", "principalType", "principalId", actions, effect)
SELECT gen_random_uuid(), id, 'ROLE', 'EMPLOYEE', ARRAY['VIEW'::"AclAction"], 'DENY'
FROM "Folder" WHERE name LIKE 'Load folder %' AND right(id::text, 1) IN ('3', '7');

UPDATE "User"
SET "departmentId" = '10000000-0000-4000-8000-000000000001', "nameEn" = 'Catalog Search Owner'
WHERE username = 'employee';

INSERT INTO "Document" (id, "docNo", title, "titleEn", description, category, status, tags,
                        "folderId", "departmentId", "ownerId", "fileType", "sizeBytes", "createdAt", "updatedAt", "deletedAt")
SELECT ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'LOAD-' || lpad(n::text, 9, '0'), 'وثيقة اختبار ' || n, 'Load document ' || n,
       CASE WHEN n % 257 = 0 THEN 'عبارة اختبار الأرشيف' ELSE 'Sample document description' END,
       CASE WHEN n % 3 = 0 THEN 'contract' ELSE 'correspondence' END,
       CASE WHEN n % 3 = 0 THEN 'APPROVED'::"DocumentStatus" ELSE 'DRAFT'::"DocumentStatus" END,
       ARRAY['load-fixture', 'group-' || (n % 50)],
       f.id, f."departmentId", CASE WHEN n % 2048 = 1 THEN owner.id END, 'application/pdf', file."sizeBytes",
       now() - n * interval '1 second', now(),
       CASE WHEN n % 100 = 0 THEN now() END
FROM generate_series(1, :documents) AS g(n)
JOIN "Folder" f ON f.id = ('20000000-0000-4000-8000-' || lpad((1 + (n - 1) % 256)::text, 12, '0'))::uuid
JOIN "FileObject" file ON file.id = :'file_id'::uuid
JOIN "User" owner ON owner.username = 'employee';

INSERT INTO "DocumentVersion" (id, "documentId", "fileId", version, "isCurrent")
SELECT gen_random_uuid(), id, :'file_id'::uuid, 1, true
FROM "Document" WHERE "docNo" LIKE 'LOAD-%';

COMMIT;
ANALYZE;
