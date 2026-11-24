#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}
repo_host="$(host_path "$repo")"
work="$(mktemp -d)"
work_host="$(host_path "$work")"
artifacts="${DRILL_ARTIFACTS_DIR:-}"
: >"$work/empty.env"
run_id="$$-${RANDOM:-0}"
source_project="edas-drill-source-$run_id"
restore_project="edas-drill-target-$run_id"
api_pid=""
phase=source

export POSTGRES_PORT="${DRILL_POSTGRES_PORT:-55433}"
export POSTGRES_PASSWORD=edas_dev_pw
export KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=admin
export MINIO_ROOT_USER=edas_minio MINIO_ROOT_PASSWORD=edas_minio_dev_pw
export MINIO_BUCKET=edas-documents
export PORT="${DRILL_API_PORT:-14210}"
export DATABASE_URL="postgresql://edas:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/edas?schema=public"
export KEYCLOAK_ISSUER="http://localhost:${DRILL_KEYCLOAK_PORT:-8080}/realms/edas"
export KEYCLOAK_JWKS_URI="$KEYCLOAK_ISSUER/protocol/openid-connect/certs"
export KEYCLOAK_AUDIENCE=edas-api KEYCLOAK_CLIENT_ID=edas-web
export MINIO_ENDPOINT=127.0.0.1 MINIO_PORT="${DRILL_MINIO_PORT:-9000}" MINIO_USE_SSL=false
export MINIO_PUBLIC_ENDPOINT=localhost MINIO_PUBLIC_PORT="$MINIO_PORT"
export MINIO_ACCESS_KEY="$MINIO_ROOT_USER" MINIO_SECRET_KEY="$MINIO_ROOT_PASSWORD"
export DOWNLOAD_TICKET_SECRET="${DOWNLOAD_TICKET_SECRET:-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')}"
export API_PUBLIC_URL="http://localhost:$PORT"
export CORS_ORIGINS=http://localhost:5173 PREVIEW_PREWARM=off

assert_free_port() {
  local port="$1" label="$2"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "The drill port for $label must be numeric (got '$port')" >&2
    return 1
  fi
  if ! node -e 'const net=require("node:net");const server=net.createServer();server.unref();server.once("error",()=>process.exit(1));server.listen(Number(process.argv[1]),"127.0.0.1",()=>server.close(()=>process.exit(0)));' "$port"; then
    echo "Port $port ($label) is already in use. Set DRILL_POSTGRES_PORT, DRILL_MINIO_PORT, DRILL_KEYCLOAK_PORT and DRILL_API_PORT to free ports." >&2
    return 1
  fi
}

assert_free_port "$POSTGRES_PORT" postgres
assert_free_port "$MINIO_PORT" minio
assert_free_port "${DRILL_KEYCLOAK_PORT:-8080}" keycloak
assert_free_port "$PORT" api
echo "Drill ports: postgres=$POSTGRES_PORT minio=$MINIO_PORT keycloak=${DRILL_KEYCLOAK_PORT:-8080} api=$PORT"

compose() {
  local project="$1"
  shift
  docker compose --env-file "$work_host/empty.env" --project-name "$project" \
    -f "$repo_host/docker-compose.yml" -f "$work_host/ports.yml" "$@"
}

drill_compose() {
  docker compose --env-file "$work_host/empty.env" --project-name "$source_project" \
    -f "$repo_host/docker-compose.yml" -f "$work_host/ports.yml" "$@"
}

keep_artifact() {
  [[ -n "$artifacts" && -f "$1" ]] || return 0
  mkdir -p "$artifacts"
  cp "$1" "$artifacts/$(basename "$1")"
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
    keep_artifact "$work/api.log"
  fi
  stop_api
  compose "$source_project" down --volumes --timeout 5 || true
  compose "$restore_project" down --volumes --timeout 5 || true
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cat >"$work/ports.yml" <<PORTS
services:
  postgres:
    ports: !override ["127.0.0.1:${POSTGRES_PORT}:5432"]
  minio:
    ports: !override ["127.0.0.1:${MINIO_PORT}:9000"]
  keycloak:
    ports: !override ["127.0.0.1:${DRILL_KEYCLOAK_PORT:-8080}:8080"]
    environment:
      KC_HOSTNAME: "http://localhost:${DRILL_KEYCLOAK_PORT:-8080}"
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
  for (( attempt=0; attempt<90; attempt++ )); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$api_pid" 2>/dev/null; then
      echo "The API exited before becoming healthy; see the log above" >&2
      return 1
    fi
    sleep 1
  done
  echo "Timed out waiting for http://127.0.0.1:$PORT/api/v1/health" >&2
  return 1
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
phase=access-before
node scripts/backup/restore-fixture.mjs access-create "$work/access-fixture.json"
keep_artifact "$work/access-fixture.json"
stop_api

phase=backup
compose "$source_project" stop minio
export ROOT="$repo_host"
export COMPOSE=drill_compose
export work_host repo_host source_project
export -f drill_compose
BACKUP_OFFSITE_BUCKET= BACKUP_DIR="$work_host/backups" RETENTION_DAYS=0 \
  bash scripts/backup/backup.sh
backups=("$work/backups/"*/)
[[ "${#backups[@]}" -eq 1 ]]
backup="${backups[0]%/}"
(cd "$backup" && sha256sum --check SHA256SUMS)
keep_artifact "$backup/MANIFEST"
keep_artifact "$backup/SHA256SUMS"
if [[ -n "$artifacts" ]]; then
  mkdir -p "$artifacts/backup"
  cp "$backup/"* "$artifacts/backup/"
fi
compose "$source_project" stop postgres

phase=restore
restore_started=$SECONDS
compose "$restore_project" run --rm -T --no-deps --user 0:0 --entrypoint sh minio \
  -c 'tar -xzf - -C /bitnami/minio/data' <"$backup/minio-data.tar.gz"
compose "$restore_project" up -d --wait --wait-timeout 150 postgres minio
compose "$restore_project" exec -T postgres pg_restore \
  --no-owner --no-privileges --exit-on-error --username edas --dbname edas <"$backup/postgres.dump"
npm --prefix api run prisma:deploy
start_api
node scripts/backup/restore-fixture.mjs check "$work/fixture.json"
echo "Restore to verified open: $((SECONDS - restore_started))s"
keep_artifact "$work/fixture.json"

phase=access
node scripts/backup/restore-fixture.mjs access-verify "$work/access-fixture.json" "$work/access-after.json"
keep_artifact "$work/access-after.json"
