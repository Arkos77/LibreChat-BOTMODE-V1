#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAMP=${BOTMODE_BACKUP_STAMP:-$(date +%Y%m%d-%H%M%S)}
DEST=${1:-"$ROOT/../backups/botmode-$STAMP"}
mkdir -p "$DEST"
cd "$ROOT"
git diff --check
git rev-parse HEAD > "$DEST/git-head.txt"
cp .env.example "$DEST/env.example" 2>/dev/null || true
if docker compose -f docker-compose.botmode.yml ps --status running --services | grep -qx mongodb; then
  docker compose -f docker-compose.botmode.yml exec -T mongodb mongodump --db LibreChat --archive > "$DEST/mongodb-LibreChat.archive"
else
  printf '%s\n' 'BOT MODE Compose MongoDB service not running' > "$DEST/mongodb.SKIPPED"
fi
printf 'BOTMODE_BACKUP=%s\n' "$DEST"
