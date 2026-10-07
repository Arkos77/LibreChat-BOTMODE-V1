#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

PROFILE="auto"
for arg in "$@"; do
  case "$arg" in
    --lite) PROFILE="lite" ;;
    --full) PROFILE="full" ;;
  esac
done

if [ "$PROFILE" = "auto" ]; then
  PROFILE="full"
  if [ "$(uname -s)" = "Linux" ]; then
    mem_mb=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 ))
    if [ "$mem_mb" -lt 4096 ] || ! grep -qm1 -w avx /proc/cpuinfo; then
      PROFILE="lite"
    fi
  fi
fi

ARGS=(-f docker-compose.botmode.yml)
[ "$PROFILE" = "lite" ] && ARGS+=(-f docker-compose.botmode-lite.yml)

printf '=== BOTMODE DOCTOR ===\n'
./scripts/botmode/bootstrap.sh "--$PROFILE" --check-only
printf '\n=== CONTAINERS ===\n'
docker compose "${ARGS[@]}" ps
printf '\n=== API LOG TAIL ===\n'
docker compose "${ARGS[@]}" logs --tail 60 api 2>&1 || true
printf '\n=== MONGO LOG TAIL ===\n'
docker compose "${ARGS[@]}" logs --tail 30 mongodb 2>&1 || true
