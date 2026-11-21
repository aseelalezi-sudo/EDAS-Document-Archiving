#!/bin/sh
set -eu

SRC_DIR="${ALERTMANAGER_SRC_DIR:-/etc/alertmanager-src}"
TARGET="${ALERTMANAGER_CONFIG_FILE:-/tmp/alertmanager.yml}"

resolve_url() {
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    printf '%s' "$ALERT_WEBHOOK_URL"
    return
  fi
  if [ -n "${ALERT_WEBHOOK_URL_FILE:-}" ] && [ -r "$ALERT_WEBHOOK_URL_FILE" ]; then
    tr -d '\r\n' < "$ALERT_WEBHOOK_URL_FILE"
    return
  fi
  printf ''
}

send_resolved() {
  case "$(printf '%s' "${ALERT_WEBHOOK_SEND_RESOLVED:-true}" | tr '[:upper:]' '[:lower:]')" in
    false | 0 | no) printf 'false' ;;
    *) printf 'true' ;;
  esac
}

URL="$(resolve_url)"
if [ -z "$URL" ]; then
  echo "alertmanager: ALERT_WEBHOOK_URL is not configured; alerts are accepted and recorded locally but not delivered" >&2
  cp "$SRC_DIR/alertmanager.yml" "$TARGET"
else
  case "$URL" in
    http://* | https://*) ;;
    *)
      echo "alertmanager: ALERT_WEBHOOK_URL must start with http:// or https://" >&2
      exit 1
      ;;
  esac
  escaped="$(printf '%s' "$URL" | sed -e 's/[\\&|]/\\&/g')"
  sed -e "s|__ALERT_WEBHOOK_URL__|${escaped}|g" -e "s|__ALERT_SEND_RESOLVED__|$(send_resolved)|g" \
    "$SRC_DIR/alertmanager.yml.template" >"$TARGET"
  echo "alertmanager: internal webhook receiver configured" >&2
fi

if [ "${ALERTMANAGER_RENDER_ONLY:-0}" = "1" ]; then
  exit 0
fi

exec /bin/alertmanager --config.file="$TARGET" "$@"
