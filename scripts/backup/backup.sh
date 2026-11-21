#!/usr/bin/env bash
# Creates a consistent local EDAS backup: PostgreSQL dump + MinIO object data + checksums.
# The script never stops a running stack and never deletes a backup older than RETENTION_DAYS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-$ROOT/backups}/$STAMP"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
POSTGRES_DB="${POSTGRES_DB:-edas}"
POSTGRES_USER="${POSTGRES_USER:-edas}"
COMPOSE="${COMPOSE:-docker compose}"

mkdir -p "$OUT"

echo "Backing up PostgreSQL to $OUT/postgres.dump"
$COMPOSE -f "$ROOT/docker-compose.yml" exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" "$POSTGRES_DB" >"$OUT/postgres.dump"

VOLUME="$($COMPOSE -f "$ROOT/docker-compose.yml" config --format json | node -e '
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const config = JSON.parse(input);
  const name = Object.keys(config.volumes || {}).find((key) => key === "miniodata");
  if (!name) process.exit(1);
  process.stdout.write(`${config.name || "edas"}_${name}`);
});
')"

echo "Backing up MinIO volume $VOLUME to $OUT/minio-data.tar.gz"
docker run --rm \
  -v "$VOLUME:/source:ro" \
  -v "$OUT:/backup" \
  alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc \
  sh -c 'tar -czf /backup/minio-data.tar.gz -C /source .'

echo "Writing manifest"
(
  cd "$OUT"
  sha256sum postgres.dump minio-data.tar.gz >SHA256SUMS
  {
    echo "created_at=$STAMP"
    echo "database=$POSTGRES_DB"
    echo "compose_project=$($COMPOSE -f "$ROOT/docker-compose.yml" config --format json | node -e 'let s="";process.stdin.on("data",(c)=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).name||"edas"))')"
  } >MANIFEST
)

if [[ -n "${BACKUP_OFFSITE_BUCKET:-}" ]]; then
  BACKUP_DIR="$OUT" bash "$ROOT/scripts/backup/offsite.sh"
else
  echo "Off-site copy skipped: BACKUP_OFFSITE_BUCKET is not set (this is a local backup only)"
fi

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "${BACKUP_DIR:-$ROOT/backups}" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +
fi

echo "Backup complete: $OUT"
echo "Verify restore with scripts/backup/verify.sh $OUT"
