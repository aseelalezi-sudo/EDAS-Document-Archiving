#!/usr/bin/env bash
# Encrypts a completed local backup, uploads it to an S3-compatible bucket, verifies it,
# and only then applies the off-site retention policy. Never uploads plaintext.
set -euo pipefail

log() { printf 'offsite: %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

BACKUP_DIR="${BACKUP_DIR:-}"
BUCKET="${BACKUP_OFFSITE_BUCKET:-}"
PREFIX="${BACKUP_OFFSITE_PREFIX:-edas}"
RETENTION_DAYS="${BACKUP_OFFSITE_RETENTION_DAYS:-}"
REGION="${BACKUP_S3_REGION:-us-east-1}"
ENDPOINT="${BACKUP_S3_ENDPOINT:-}"

[[ -n "$BACKUP_DIR" ]] || fail "BACKUP_DIR is required"
[[ -d "$BACKUP_DIR" ]] || fail "backup directory not found: $BACKUP_DIR"

if [[ -z "$BUCKET" ]]; then
  log "BACKUP_OFFSITE_BUCKET is not set; skipping the off-site copy (a local backup is not an off-site backup)"
  exit 0
fi

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}" ]]; then
  [[ -r "$BACKUP_ENCRYPTION_PASSPHRASE_FILE" ]] || fail "cannot read BACKUP_ENCRYPTION_PASSPHRASE_FILE"
  OPENSSL_PASS="file:${BACKUP_ENCRYPTION_PASSPHRASE_FILE}"
elif [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  export EDAS_BACKUP_PASSPHRASE="$BACKUP_ENCRYPTION_PASSPHRASE"
  OPENSSL_PASS="env:EDAS_BACKUP_PASSPHRASE"
else
  fail "set BACKUP_ENCRYPTION_PASSPHRASE or BACKUP_ENCRYPTION_PASSPHRASE_FILE; refusing to upload an unencrypted backup"
fi

if [[ -n "$RETENTION_DAYS" ]]; then
  [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail "BACKUP_OFFSITE_RETENTION_DAYS must be a non-negative integer"
fi

AWS=(aws --region "$REGION")
if [[ -n "$ENDPOINT" ]]; then
  AWS+=(--endpoint-url "$ENDPOINT")
fi

for artifact in postgres.dump minio-data.tar.gz SHA256SUMS MANIFEST; do
  [[ -f "$BACKUP_DIR/$artifact" ]] || fail "missing backup artifact: $BACKUP_DIR/$artifact"
done

STAMP="$(basename "$BACKUP_DIR")"
DEST="s3://${BUCKET}/${PREFIX%/}/${STAMP}"
uploaded=()

for artifact in postgres.dump minio-data.tar.gz; do
  encrypted="${artifact}.enc"
  log "encrypting $artifact"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass "$OPENSSL_PASS" \
    -in "$BACKUP_DIR/$artifact" -out "$BACKUP_DIR/$encrypted"
  local_sha="$(sha256sum "$BACKUP_DIR/$encrypted" | awk '{print $1}')"
  log "uploading $encrypted"
  "${AWS[@]}" s3 cp "$BACKUP_DIR/$encrypted" "$DEST/$encrypted" --only-show-errors
  remote_sha="$("${AWS[@]}" s3 cp "$DEST/$encrypted" - --only-show-errors | sha256sum | awk '{print $1}')"
  [[ "$local_sha" == "$remote_sha" ]] || fail "checksum mismatch after uploading $encrypted"
  uploaded+=("$encrypted")
  rm -f "$BACKUP_DIR/$encrypted"
done

for artifact in SHA256SUMS MANIFEST; do
  log "uploading $artifact"
  "${AWS[@]}" s3 cp "$BACKUP_DIR/$artifact" "$DEST/$artifact" --only-show-errors
done

for artifact in "${uploaded[@]}" SHA256SUMS MANIFEST; do
  "${AWS[@]}" s3api head-object --bucket "$BUCKET" --key "${PREFIX%/}/${STAMP}/$artifact" >/dev/null \
    || fail "remote verification failed for $artifact"
done
log "off-site copy verified at $DEST"

if [[ -n "$RETENTION_DAYS" ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  cutoff="$(( $(date -u +%s) - RETENTION_DAYS * 86400 ))"
  listing="$("${AWS[@]}" s3api list-objects-v2 --bucket "$BUCKET" --prefix "${PREFIX%/}/" --output json 2>/dev/null || printf '{}')"
  printf '%s' "$listing" | node -e '
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const parsed = JSON.parse(input || "{}");
  for (const item of parsed.Contents || []) {
    process.stdout.write(`${item.Key}\t${item.LastModified}\n`);
  }
});
' | while IFS=$'\t' read -r key modified; do
    relative="${key#"${PREFIX%/}/"}"
    [[ "$relative" =~ ^[0-9]{8}T[0-9]{6}Z/(postgres\.dump\.enc|minio-data\.tar\.gz\.enc|MANIFEST|SHA256SUMS)$ ]] || continue
    modified_epoch="$(date -u -d "$modified" +%s 2>/dev/null || printf '%s' "$cutoff")"
    if [[ "$modified_epoch" -lt "$cutoff" ]]; then
      log "retention: deleting $key"
      "${AWS[@]}" s3api delete-object --bucket "$BUCKET" --key "$key" >/dev/null
    fi
  done
elif [[ -n "$RETENTION_DAYS" ]]; then
  log "BACKUP_OFFSITE_RETENTION_DAYS=0; keeping every off-site backup"
else
  log "BACKUP_OFFSITE_RETENTION_DAYS is not set; keeping every off-site backup"
fi
