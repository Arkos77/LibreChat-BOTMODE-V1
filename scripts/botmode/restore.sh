#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
ARCHIVE=${1:?usage: restore.sh <mongodb-LibreChat.archive>}
case "$ARCHIVE" in */mongodb-LibreChat.archive) ;; *) echo 'Refusing restore: expected mongodb-LibreChat.archive' >&2; exit 2;; esac
[ -s "$ARCHIVE" ] || { echo 'Restore refused: missing or empty archive' >&2; exit 2; }
# Resolve caller-relative backup paths BEFORE switching to the verified project.
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd -P)/mongodb-LibreChat.archive"
# New backups carry a checksum. Refuse corruption, but keep explicitly
# approved historical backups without a checksum restorable.
if [ -e "$ARCHIVE.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    CHECK_HASH=(sha256sum --check --status)
  elif command -v shasum >/dev/null 2>&1; then
    CHECK_HASH=(shasum -a 256 --check)
  else
    echo 'Restore refused: no SHA256 verification tool available' >&2
    exit 2
  fi
  (cd "$(dirname "$ARCHIVE")" &&
    "${CHECK_HASH[@]}" mongodb-LibreChat.archive.sha256 >/dev/null 2>&1) || {
    echo 'Restore refused: archive checksum mismatch' >&2
    exit 2
  }
fi
# docker compose without this chdir can target a different project from the caller's cwd.
cd "$ROOT"
docker compose -f docker-compose.botmode.yml ps --status running --services | grep -qx mongodb || { echo 'BOT MODE Compose MongoDB service is not running' >&2; exit 2; }
printf 'About to restore LibreChat MongoDB from %s\n' "$ARCHIVE"
if [ "${BOTMODE_CONFIRM_RESTORE:-}" != 'YES' ]; then
  echo 'Set BOTMODE_CONFIRM_RESTORE=YES to execute restore.' >&2
  exit 3
fi
docker compose -f docker-compose.botmode.yml exec -T mongodb sh -ec   'test -n "$MONGO_INITDB_ROOT_USERNAME" && test -n "$MONGO_INITDB_ROOT_PASSWORD";    exec mongorestore --username "$MONGO_INITDB_ROOT_USERNAME"    --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin    --db LibreChat --archive --drop' < "$ARCHIVE"
printf 'BOTMODE_RESTORE=PASS\n'
