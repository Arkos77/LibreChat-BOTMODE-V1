#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

ARGS=("$@")
HAS_PROFILE=0
for arg in "${ARGS[@]}"; do
  case "$arg" in
    --lite) HAS_PROFILE=1 ;;
  esac
done

if [ "$HAS_PROFILE" -eq 0 ]; then
  if [ "$(uname -s)" = "Linux" ] && [ -r /proc/meminfo ]; then
    mem_mb=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 ))
    if [ "$mem_mb" -lt 4096 ]; then
      echo "BOTMODE installer: low-memory host detected (${mem_mb} MiB); selecting --lite."
      ARGS=(--lite "${ARGS[@]}")
    fi
  elif [ "$(uname -s)" = "Darwin" ]; then
    mem_mb=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
    if [ "$mem_mb" -lt 4096 ]; then
      echo "BOTMODE installer: low-memory host detected (${mem_mb} MiB); selecting --lite."
      ARGS=(--lite "${ARGS[@]}")
    fi
  fi
fi

CHECK_ARGS=()
for arg in "${ARGS[@]}"; do
  case "$arg" in
    --start|--check-only) ;;
    *) CHECK_ARGS+=("$arg") ;;
  esac
done

echo "BOTMODE installer: validating prerequisites."
./scripts/botmode/bootstrap.sh --check-only "${CHECK_ARGS[@]}"

if printf '%s\n' "${ARGS[@]}" | grep -qx -- '--check-only'; then
  exit 0
fi

echo "BOTMODE installer: installing and validating."
exec ./scripts/botmode/bootstrap.sh "${ARGS[@]}"
