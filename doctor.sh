#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

PROFILE_ARG=()
for arg in "$@"; do
  case "$arg" in
    --lite|--full) PROFILE_ARG=("$arg") ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

printf '=== BOTMODE DOCTOR ===\n'
CHECK_OUTPUT=$(./scripts/botmode/bootstrap.sh "${PROFILE_ARG[@]}" --check-only)
printf '%s\n' "$CHECK_OUTPUT"

PROFILE=$(printf '%s\n' "$CHECK_OUTPUT" | awk -F= '/^BOTMODE_PROFILE=/{print $2; exit}')
[ -n "$PROFILE" ] || {
  echo "Unable to resolve BOTMODE profile." >&2
  exit 3
}

ARGS=(-f docker-compose.botmode.yml)
[ "$PROFILE" = "lite" ] && ARGS+=(-f docker-compose.botmode-lite.yml)

printf '\n=== CONTAINERS ===\n'
docker compose "${ARGS[@]}" ps
printf '\n=== API LOG TAIL ===\n'
docker compose "${ARGS[@]}" logs --tail 60 api 2>&1 || true
printf '\n=== MONGO LOG TAIL ===\n'
docker compose "${ARGS[@]}" logs --tail 30 mongodb 2>&1 || true
