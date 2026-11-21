#!/usr/bin/env bash
# Verifies a backup by restoring it into a throwaway database and inspecting the archive.
# This never writes to the live EDAS database. Encrypted off-site copies are decrypted
# into a temporary directory first; the passphrase is never printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="${1:-}"
if [[ -z "$BACKUP" || ! -d "$BACKUP" ]]; then
  echo "usage: $0 <backup-directory>" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
VERIFY_DB="edas_verify_${STAMP}"
POSTGRES_USER="${POSTGRES_USER:-edas}"
COMPOSE="${COMPOSE:-docker compose}"
WORK="$(mktemp -d)"

cleanup() {
  $COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres dropdb --if-exists --username "$POSTGRES_USER" "$VERIFY_DB" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

resolve_passphrase() {
  if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}" ]]; then
    [[ -r "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" ]] || {
      echo "cannot read BACKUP_ENCRYPTION_PASSPHRASE_FILE" >&2
      exit 2
    }
    printf 'file:%s' "$BACKUP_ENCRYPTION_PASSPHRASE_FILE"
    return
  fi
  if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
    export EDAS_BACKUP_PASSPHRASE="$BACKUP_ENCRYPTION_PASSPHRASE"
    printf 'env:EDAS_BACKUP_PASSPHRASE'
    return
  fi
  echo "backup is encrypted: set BACKUP_ENCRYPTION_PASSPHRASE or BACKUP_ENCRYPTION_PASSPHRASE_FILE" >&2
  exit 2
}

ARTIFACTS="$BACKUP"
if [[ ! -f "$BACKUP/postgres.dump" ]]; then
  [[ -f "$BACKUP/postgres.dump.enc" ]] || {
    echo "no postgres.dump or postgres.dump.enc in $BACKUP" >&2
    exit 2
  }
  OPENSSL_PASS="$(resolve_passphrase)"
  echo "Decrypting the encrypted backup into a temporary directory"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "$OPENSSL_PASS" \
    -in "$BACKUP/postgres.dump.enc" -out "$WORK/postgres.dump"
  if [[ -f "$BACKUP/minio-data.tar.gz.enc" ]]; then
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "$OPENSSL_PASS" \
      -in "$BACKUP/minio-data.tar.gz.enc" -out "$WORK/minio-data.tar.gz"
  elif [[ -f "$BACKUP/minio-data.tar.gz" ]]; then
    cp "$BACKUP/minio-data.tar.gz" "$WORK/minio-data.tar.gz"
  fi
  [[ -f "$BACKUP/SHA256SUMS" ]] && cp "$BACKUP/SHA256SUMS" "$WORK/SHA256SUMS"
  ARTIFACTS="$WORK"
fi

if [[ -f "$ARTIFACTS/SHA256SUMS" ]]; then
  (cd "$ARTIFACTS" && sha256sum --check SHA256SUMS)
fi

echo "Restoring into isolated database $VERIFY_DB"
$COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres createdb --username "$POSTGRES_USER" "$VERIFY_DB"
$COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres \
  pg_restore --no-owner --no-privileges --exit-on-error --dbname "$VERIFY_DB" --username "$POSTGRES_USER" <"$ARTIFACTS/postgres.dump"

for table in Document Folder AclRule AuditEvent UserSession; do
  count="$($COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres \
    psql --username "$POSTGRES_USER" --dbname "$VERIFY_DB" --tuples-only --no-align --command "SELECT count(*) FROM \"$table\";")"
  echo "$table=$count"
done

if [[ -f "$ARTIFACTS/minio-data.tar.gz" ]]; then
  echo "Checking MinIO archive readability"
  (cd "$ARTIFACTS" && tar -tzf minio-data.tar.gz >/dev/null)
fi

echo "Backup verification succeeded. The temporary database is removed on exit."
