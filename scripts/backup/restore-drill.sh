#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
work="$(mktemp -d)"
source_project="edas-drill-source-$$"
restore_project="edas-drill-target-$$"
api_pid=""
phase=source
export POSTGRES_PORT=55433
export POSTGRES_PASSWORD=edas_dev_pw
export KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=admin
export MINIO_ROOT_USER=edas_minio MINIO_ROOT_PASSWORD=edas_minio_dev_pw
export MINIO_BUCKET=edas-documents
export PORT=14210
export DATABASE_URL="postgresql://edas:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/edas?schema=public"
export KEYCLOAK_ISSUER=http://localhost:8080/realms/edas
export KEYCLOAK_AUDIENCE=edas-api KEYCLOAK_CLIENT_ID=edas-web
export MINIO_ENDPOINT=127.0.0.1 MINIO_PORT=9000 MINIO_USE_SSL=false
export MINIO_ACCESS_KEY="$MINIO_ROOT_USER" MINIO_SECRET_KEY="$MINIO_ROOT_PASSWORD"
export CORS_ORIGINS=http://localhost:5173 PREVIEW_PREWARM=off

compose() {
  local project="$1"
  shift
  docker compose --env-file /dev/null --project-name "$project" -f docker-compose.yml -f "$work/ports.yml" "$@"
}

stop_api() {
  if [[ -n "$api_pid" ]]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
    api_pid=""
  fi
}

cleanup() {
  local result=$?
  if (( result != 0 )); then
    echo "Recovery drill failed during $phase" >&2
    if [[ -f "$work/api.log" ]]; then tail -60 "$work/api.log" >&2; fi
    compose "$source_project" logs --tail=25 postgres keycloak minio >&2 || true
    compose "$restore_project" logs --tail=25 postgres minio >&2 || true
  fi
  stop_api
  compose "$source_project" down --volumes --timeout 5 || true
  compose "$restore_project" down --volumes --timeout 5 || true
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cat >"$work/ports.yml" <<'PORTS'
services:
  postgres:
    ports: !override ["127.0.0.1:55433:5432"]
  minio:
    ports: !override ["127.0.0.1:9000:9000"]
  keycloak:
    ports: !override ["127.0.0.1:8080:8080"]
PORTS

wait_for() {
  local url="$1"
  for (( attempt=0; attempt<90; attempt++ )); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

start_api() {
  (cd api && exec node dist/main.js) >"$work/api.log" 2>&1 &
  api_pid=$!
  wait_for "http://127.0.0.1:$PORT/api/v1/health"
}

compose "$source_project" up -d --wait --wait-timeout 150 postgres minio keycloak
compose "$source_project" run --rm --no-deps minio-init
wait_for "$KEYCLOAK_ISSUER/.well-known/openid-configuration"
npm --prefix api run prisma:deploy
start_api
node scripts/backup/restore-fixture.mjs create "$work/fixture.json"
if [[ "${1:-}" == benchmark ]]; then
  phase=benchmark
  : "${LOAD_DOCUMENTS:=1000000}"
  : "${LOAD_REPORT:=edas-load-result.json}"
  [[ "$LOAD_DOCUMENTS" =~ ^[1-9][0-9]{0,6}$ ]]
  node scripts/backup/restore-fixture.mjs employee
  node scripts/backup/restore-fixture.mjs create "$work/load-file.json"
  fixture_id="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).fileId' "$work/fixture.json")"
  compose "$source_project" exec -T postgres psql --username edas --dbname edas \
    --set="documents=$LOAD_DOCUMENTS" --set="file_id=$fixture_id" <scripts/performance/seed.sql
  LOAD_API_PID="$api_pid" LOAD_DOCUMENTS="$LOAD_DOCUMENTS" LOAD_REPORT="$LOAD_REPORT" \
    node scripts/backup/restore-fixture.mjs benchmark "$work/load-file.json"
  exit
fi
stop_api

phase=backup
compose "$source_project" stop minio
BACKUP_OFFSITE_BUCKET= BACKUP_DIR="$work/backups" RETENTION_DAYS=0 \
  COMPOSE="docker compose --env-file /dev/null --project-name $source_project" \
  bash scripts/backup/backup.sh
backups=("$work/backups/"*/)
[[ "${#backups[@]}" -eq 1 ]]
backup="${backups[0]%/}"
(cd "$backup" && sha256sum --check SHA256SUMS)
compose "$source_project" stop postgres

phase=restore
compose "$restore_project" run --rm -T --no-deps --user 0:0 --entrypoint sh minio \
  -c 'tar -xzf - -C /bitnami/minio/data' <"$backup/minio-data.tar.gz"
compose "$restore_project" up -d --wait --wait-timeout 150 postgres minio
compose "$restore_project" exec -T postgres pg_restore \
  --no-owner --no-privileges --exit-on-error --username edas --dbname edas <"$backup/postgres.dump"
npm --prefix api run prisma:deploy
start_api
node scripts/backup/restore-fixture.mjs check "$work/fixture.json"
