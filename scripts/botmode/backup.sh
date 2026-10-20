#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAMP=${BOTMODE_BACKUP_STAMP:-$(date +%Y%m%d-%H%M%S)}
DEST=${1:-"$ROOT/../backups/botmode-$STAMP"}
mkdir -p "$DEST"
# Backup destinations supplied relative to the caller must not move when
# changing into the source checkout to run git and Docker Compose.
DEST="$(cd "$DEST" && pwd -P)"
cd "$ROOT"
git diff --check
git rev-parse HEAD > "$DEST/git-head.txt"
cp .env.example "$DEST/env.example" 2>/dev/null || true
if command -v sha256sum >/dev/null 2>&1; then
  HASH=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  HASH=(shasum -a 256)
else
  echo 'BOTMODE_BACKUP_REFUSED=SHA256_TOOL_MISSING' >&2
  exit 2
fi
ARCHIVE="$DEST/mongodb-LibreChat.archive"
# A completed archive is immutable: never overwrite an earlier verified backup.
if [ -e "$ARCHIVE" ] || [ -L "$ARCHIVE" ]; then
  echo 'BOTMODE_BACKUP_REFUSED=ARCHIVE_EXISTS' >&2
  exit 2
fi
if ! docker compose -f docker-compose.botmode.yml ps --status running --services | grep -qx mongodb; then
  printf '%s\n' 'BOT MODE Compose MongoDB service not running' > "$DEST/mongodb.SKIPPED"
  echo 'BOTMODE_BACKUP_DB=UNAVAILABLE' >&2
  exit 3
fi
# An interrupted dump must not leave a misleading restore-ready archive.
TMP_ARCHIVE=$(mktemp "$DEST/.mongodb-LibreChat.archive.partial.XXXXXX")
trap 'rm -f "$TMP_ARCHIVE"' EXIT
if ! docker compose -f docker-compose.botmode.yml exec -T mongodb sh -ec   'test -n "$MONGO_INITDB_ROOT_USERNAME" && test -n "$MONGO_INITDB_ROOT_PASSWORD";    exec mongodump --username "$MONGO_INITDB_ROOT_USERNAME"    --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin    --db LibreChat --archive' > "$TMP_ARCHIVE"; then
  echo 'BOTMODE_BACKUP_DB=DUMP_FAILED' >&2
  exit 4
fi
if [ ! -s "$TMP_ARCHIVE" ]; then
  echo 'BOTMODE_BACKUP_DB=EMPTY_ARCHIVE' >&2
  exit 4
fi
# Hard linking within one directory creates the final name atomically and
# refuses collisions, unlike an ordinary mv that could replace prior evidence.
if ! ln "$TMP_ARCHIVE" "$ARCHIVE"; then
  echo 'BOTMODE_BACKUP_REFUSED=ARCHIVE_EXISTS_OR_LINK_FAILED' >&2
  exit 4
fi
rm -f "$TMP_ARCHIVE"
trap - EXIT
(cd "$DEST" && "${HASH[@]}" mongodb-LibreChat.archive > mongodb-LibreChat.archive.sha256)
rm -f "$DEST/mongodb.SKIPPED"
printf 'BOTMODE_BACKUP_DB=COMPLETE\n'
printf 'BOTMODE_BACKUP=%s\n' "$DEST"
