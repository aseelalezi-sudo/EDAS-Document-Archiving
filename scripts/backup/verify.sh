#!/usr/bin/env bash
# Verifies a backup by restoring it into a throwaway database and inspecting the archive.
# This never writes to the live EDAS database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="${1:-}"
if [[ -z "$BACKUP" || ! -f "$BACKUP/postgres.dump" ]]; then
  echo "usage: $0 <backup-directory>" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
VERIFY_DB="edas_verify_${STAMP}"
POSTGRES_USER="${POSTGRES_USER:-edas}"
COMPOSE="${COMPOSE:-docker compose}"

cleanup() {
  $COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres dropdb --if-exists --username "$POSTGRES_USER" "$VERIFY_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ -f "$BACKUP/SHA256SUMS" ]]; then
  (cd "$BACKUP" && sha256sum --check SHA256SUMS)
fi

echo "Restoring into isolated database $VERIFY_DB"
$COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres createdb --username "$POSTGRES_USER" "$VERIFY_DB"
$COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres \
  pg_restore --no-owner --no-privileges --exit-on-error --dbname "$VERIFY_DB" --username "$POSTGRES_USER" <"$BACKUP/postgres.dump"

for table in Document Folder AclRule AuditEvent UserSession; do
  count="$($COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres \
    psql --username "$POSTGRES_USER" --dbname "$VERIFY_DB" --tuples-only --no-align --command "SELECT count(*) FROM \"$table\";")"
  echo "$table=$count"
done

if [[ -f "$BACKUP/minio-data.tar.gz" ]]; then
  echo "Checking MinIO archive readability"
  (cd "$BACKUP" && tar -tzf minio-data.tar.gz >/dev/null)
fi

echo "Backup verification succeeded. The temporary database is removed on exit."
