#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
ARCHIVE=${1:?usage: restore.sh <mongodb-LibreChat.archive>}
case "$ARCHIVE" in */mongodb-LibreChat.archive) ;; *) echo 'Refusing restore: expected mongodb-LibreChat.archive' >&2; exit 2;; esac
[ -f "$ARCHIVE" ] || { echo 'Archive not found' >&2; exit 2; }
# Resolve caller-relative backup paths BEFORE switching to the verified project.
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd -P)/mongodb-LibreChat.archive"
# docker compose without this chdir can target a different project from the caller's cwd.
cd "$ROOT"
docker compose -f docker-compose.botmode.yml ps --status running --services | grep -qx mongodb || { echo 'BOT MODE Compose MongoDB service is not running' >&2; exit 2; }
printf 'About to restore LibreChat MongoDB from %s\n' "$ARCHIVE"
if [ "${BOTMODE_CONFIRM_RESTORE:-}" != 'YES' ]; then
  echo 'Set BOTMODE_CONFIRM_RESTORE=YES to execute restore.' >&2
  exit 3
fi
docker compose -f docker-compose.botmode.yml exec -T mongodb mongorestore --db LibreChat --archive --drop < "$ARCHIVE"
printf 'BOTMODE_RESTORE=PASS\n'
