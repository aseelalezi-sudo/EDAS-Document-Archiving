#!/usr/bin/env bash
# Verifies the newest local backup directory. Used by the systemd verify timer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT/backups}"

if [[ ! -d "$BACKUP_ROOT" ]]; then
  echo "no backup root at $BACKUP_ROOT" >&2
  exit 2
fi

LATEST="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
if [[ -z "$LATEST" ]]; then
  echo "no backups under $BACKUP_ROOT" >&2
  exit 2
fi

exec bash "$ROOT/scripts/backup/verify.sh" "$LATEST"
