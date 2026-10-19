#!/usr/bin/env bash
# Fail-closed preflight: reads Docker metadata and the local dotenv ONLY.
# Must run before git pull or docker compose up. Does not stop or mutate any service.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"

refuse() {
  printf 'BOTMODE_UPDATE_REFUSED=%s\n' "$1" >&2
  printf 'Stop admitting missions, inspect the active mission/Oracle state and use a documented maintenance window. No update performed.\n' >&2
  exit 21
}
[[ -f .env && -r .env ]] || refuse DOTENV_UNAVAILABLE
command -v docker >/dev/null 2>&1 || refuse DOCKER_UNAVAILABLE
docker info >/dev/null 2>&1 || refuse DOCKER_DAEMON_UNAVAILABLE

# Do not source/eval .env: its contents include secrets and must not execute shell code.
# Treat unclear Redis settings as enabled, not as an absent store.
# Bash 3.2 compatible (macOS default); parse last matching KEY without eval.
# Values are never printed, and unset/blank Redis settings are distinct from
# unknown or nonempty settings.
dotenv_value() {
  local key="$1" val
  val=$(awk -v requested="$key" '
    index($0, requested "=") == 1 {
      value = substr($0, length(requested) + 2)
    }
    END { print value }
  ' .env) || refuse DOTENV_PARSE_UNAVAILABLE
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "${#val}" -ge 2 ]]; then
    if [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]] || [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]]; then
      val="${val:1:${#val}-2}"
    fi
  fi
  printf '%s' "$val"
}

# Configuration may be altered by Compose environment or .env. Unknown
# override files / alternate runtime discovery are not a safe allow-path.
for k in COMPOSE_FILE COMPOSE_PROFILES; do
  [[ -z "${!k:-}" && -z "$(dotenv_value "$k")" ]] || refuse UNSUPPORTED_COMPOSE_OVERRIDE
done
project="${COMPOSE_PROJECT_NAME:-$(dotenv_value COMPOSE_PROJECT_NAME)}"
project="${project:-librechat-botmode}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]] || refuse UNKNOWN_COMPOSE_PROJECT

# Docker metadata is sufficient to deny hot updates, regardless of whether a
# mission uses Redis or in-memory streams. A running instance can start work
# between any non-atomic Redis check and Compose recreation.
if ! rows=$(docker ps -a --filter "label=com.docker.compose.project=$project" \
    --format '{{.Label "com.docker.compose.service"}}|{{.State}}' 2>/dev/null); then
  refuse DOCKER_STATUS_UNAVAILABLE
fi
while IFS='|' read -r service state; do
  [[ -n "$service" ]] || continue
  if [[ "$service" == api ]]; then
    case "$state" in
      exited|dead) ;;
      *) refuse API_NOT_QUIESCENT ;;
    esac
  fi
done <<< "$rows"

redis_configured=0
for k in USE_REDIS USE_REDIS_STREAMS; do
  value="${!k:-$(dotenv_value "$k")}"
  case "$value" in
    ''|[Ff][Aa][Ll][Ss][Ee]|0|[Nn][Oo]|[Oo][Ff][Ff]) ;;
    *) redis_configured=1 ;;
  esac
done
# Detect an explicit URI even if the feature flag was omitted or contradictory.
[[ -z "${REDIS_URI:-$(dotenv_value REDIS_URI)}" ]] || redis_configured=1

if [[ "$redis_configured" -eq 1 ]]; then
  # A stopped API is NOT a proof that Redis has no in-flight missions,
  # paused HITL turns, uncommitted Oracle receipts or stale recovery claims.
  # There is no race-free cross-version migration contract yet; no unsafe override.
  refuse REDIS_INTERVERSION_NOT_QUALIFIED
fi

printf 'BOTMODE_UPDATE_QUIESCENCE=PASS\n'
