#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ARCHIVE=${1:?usage: restore.sh <mongodb-LibreChat.archive>}
case "$ARCHIVE" in */mongodb-LibreChat.archive) ;; *) echo 'Refusing restore: expected mongodb-LibreChat.archive' >&2; exit 2;; esac
[ -f "$ARCHIVE" ] || { echo 'Archive not found' >&2; exit 2; }
docker ps --format '{{.Names}}' | grep -qx 'botmode-mongodb-final' || { echo 'Mongo container botmode-mongodb-final is not running' >&2; exit 2; }
printf 'About to restore LibreChat MongoDB from %s\n' "$ARCHIVE"
if [ "${BOTMODE_CONFIRM_RESTORE:-}" != 'YES' ]; then
  echo 'Set BOTMODE_CONFIRM_RESTORE=YES to execute restore.' >&2
  exit 3
fi
docker exec -i botmode-mongodb-final mongorestore --db LibreChat --archive --drop < "$ARCHIVE"
printf 'BOTMODE_RESTORE=PASS\n'
