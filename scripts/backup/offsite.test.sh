#!/usr/bin/env bash
# Exercises the off-site backup path with a local fake AWS CLI. No cloud account is used.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BIN="$TMP/bin"
S3="$TMP/s3"
mkdir -p "$BIN" "$S3"

cat >"$BIN/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
root="$FAKE_S3_ROOT"
while [[ $# -gt 0 && "$1" != "s3" && "$1" != "s3api" ]]; do shift; done
service="$1"
action="$2"
shift 2

bucket=""
key=""
prefix=""
while [[ $# -gt 0 && "$1" == --* ]]; do
  case "$1" in
    --bucket) bucket="$2"; shift 2 ;;
    --key) key="$2"; shift 2 ;;
    --prefix) prefix="$2"; shift 2 ;;
    --region | --endpoint-url | --output) shift 2 ;;
    *) shift ;;
  esac
done

if [[ "$service $action" == "s3 cp" ]]; then
  if [[ "${1:-}" == s3://* ]]; then
    source_path="${1#s3://}"
    source_bucket="${source_path%%/*}"
    source_key="${source_path#*/}"
    cat "$root/$source_bucket/$source_key"
  else
    target_path="${2#s3://}"
    target_bucket="${target_path%%/*}"
    target_key="${target_path#*/}"
    mkdir -p "$root/$target_bucket/$(dirname "$target_key")"
    cp "$1" "$root/$target_bucket/$target_key"
  fi
  exit 0
fi

if [[ "$service $action" == "s3api head-object" ]]; then
  [[ -f "$root/$bucket/$key" ]]
  exit 0
fi

if [[ "$service $action" == "s3api delete-object" ]]; then
  rm -f "$root/$bucket/$key"
  exit 0
fi

if [[ "$service $action" == "s3api list-objects-v2" ]]; then
  node -e '
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[1] + "/" + process.argv[2];
const prefix = process.argv[3] || "";
const dir = path.join(root, prefix);
const contents = [];
function walk(current) {
  if (!fs.existsSync(current)) return;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const key = path.relative(root, full).split(path.sep).join("/");
      contents.push({ Key: key, LastModified: new Date(fs.statSync(full).mtimeMs).toISOString() });
    }
  }
}
walk(dir);
process.stdout.write(JSON.stringify({ Contents: contents }));
' "$root" "$bucket" "$prefix"
  exit 0
fi

echo "fake aws: unsupported $service $action" >&2
exit 1
EOF
chmod +x "$BIN/aws"

BACKUP_PARENT="$TMP/backups"
OUT="$BACKUP_PARENT/20260101T000000Z"
mkdir -p "$OUT"
printf 'database-bytes' >"$OUT/postgres.dump"
printf 'minio-bytes' >"$OUT/minio-data.tar.gz"
(cd "$OUT" && sha256sum postgres.dump minio-data.tar.gz >SHA256SUMS)
printf 'created_at=20260101\n' >"$OUT/MANIFEST"

run() {
  env PATH="$BIN:$PATH" FAKE_S3_ROOT="$S3" "$@"
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "1) no bucket -> explicit skip, no upload"
run BACKUP_DIR="$OUT" bash "$ROOT/scripts/backup/offsite.sh" >"$TMP/out1" 2>&1 || fail "expected success"
grep -q "skipping the off-site copy" "$TMP/out1" || fail "skip message missing"
[[ -z "$(find "$S3" -type f 2>/dev/null)" ]] || fail "uploaded without a bucket"

echo "2) no passphrase -> refuse and upload nothing"
if run BACKUP_DIR="$OUT" BACKUP_OFFSITE_BUCKET=offsite bash "$ROOT/scripts/backup/offsite.sh" >"$TMP/out2" 2>&1; then
  fail "expected a refusal without a passphrase"
fi
grep -q "refusing to upload an unencrypted backup" "$TMP/out2" || fail "refusal message missing"
[[ -z "$(find "$S3" -type f 2>/dev/null)" ]] || fail "uploaded without encryption"

echo "3) encrypt, upload, verify and prune old backups"
mkdir -p "$S3/offsite/edas/20200101T000000Z"
printf 'old' >"$S3/offsite/edas/20200101T000000Z/postgres.dump.enc"
touch -d "2020-01-01T00:00:00Z" "$S3/offsite/edas/20200101T000000Z/postgres.dump.enc"
touch -d "2020-01-01" "$S3/offsite/edas/unrelated"
run BACKUP_DIR="$OUT" BACKUP_OFFSITE_BUCKET=offsite BACKUP_OFFSITE_PREFIX=edas \
  BACKUP_OFFSITE_RETENTION_DAYS=30 BACKUP_ENCRYPTION_PASSPHRASE=test-passphrase \
  bash "$ROOT/scripts/backup/offsite.sh" >"$TMP/out3" 2>&1 || {
  cat "$TMP/out3" >&2
  fail "off-site copy failed"
}
[[ -f "$S3/offsite/edas/unrelated" ]] || fail "unrelated key was removed"
DEST="$S3/offsite/edas/20260101T000000Z"
[[ -f "$DEST/postgres.dump.enc" ]] || fail "postgres ciphertext missing"
[[ -f "$DEST/minio-data.tar.gz.enc" ]] || fail "minio ciphertext missing"
[[ ! -f "$DEST/postgres.dump" ]] || fail "plaintext database dump uploaded"
[[ ! -f "$S3/offsite/edas/20200101T000000Z/postgres.dump.enc" ]] || fail "expired backup was not pruned"
[[ -f "$S3/offsite/edas/20260101T000000Z/SHA256SUMS" ]] || fail "checksums not uploaded"

echo "4) encrypted payload round-trips"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:test-passphrase \
  -in "$DEST/postgres.dump.enc" -out "$TMP/restored.dump"
cmp "$OUT/postgres.dump" "$TMP/restored.dump" || fail "decrypted database dump differs"

echo "5) unset retention keeps old backups"
touch -d "2020-01-01T00:00:00Z" "$S3/offsite/edas/20200101T000000Z/postgres.dump.enc"
run BACKUP_DIR="$OUT" BACKUP_OFFSITE_BUCKET=offsite BACKUP_OFFSITE_PREFIX=edas \
  BACKUP_ENCRYPTION_PASSPHRASE=test-passphrase \
  bash "$ROOT/scripts/backup/offsite.sh" >"$TMP/out5" 2>&1 || fail "second off-site copy failed"
[[ -f "$S3/offsite/edas/20200101T000000Z/postgres.dump.enc" ]] || fail "unset retention pruned data"

echo "offsite backup tests passed"
