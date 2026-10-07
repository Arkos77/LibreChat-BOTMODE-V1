#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

PROFILE="${1:-auto}"
ARGS=(-f docker-compose.botmode.yml)

if [ "$PROFILE" = "--lite" ]; then
  ARGS+=(-f docker-compose.botmode-lite.yml)
elif [ "$PROFILE" = "auto" ] && [ "$(uname -s)" = "Linux" ]; then
  mem_mb=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 ))
  if [ "$mem_mb" -lt 4096 ] || ! grep -qm1 -w avx /proc/cpuinfo; then
    ARGS+=(-f docker-compose.botmode-lite.yml)
  fi
fi

docker compose "${ARGS[@]}" down
