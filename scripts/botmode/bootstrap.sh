#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

PROFILE_REQUEST="auto"
CHECK_ONLY=0
START_STACK=1
PULL_IMAGE=1
BOTMODE_IMAGE_VALUE="${BOTMODE_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1:edge}"

usage() {
  cat <<'USAGE'
Usage: scripts/botmode/bootstrap.sh [options]

Runtime installer for LibreChat BOTMODE V1.

Options:
  --lite          Force the low-memory / non-AVX profile.
  --full          Force the full profile.
  --check-only    Validate the host and Compose configuration only.
  --no-start      Prepare and pull images, but do not start containers.
  --no-pull       Do not pull the BOTMODE image before starting.
  --image IMAGE   Override the BOTMODE runtime image.
  -h, --help      Show this help.

Target hosts require Git, Docker and Docker Compose v2. Node/npm are not
required to run the published BOTMODE image.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --lite) PROFILE_REQUEST="lite" ;;
    --full) PROFILE_REQUEST="full" ;;
    --check-only) CHECK_ONLY=1; START_STACK=0; PULL_IMAGE=0 ;;
    --no-start) START_STACK=0 ;;
    --no-pull) PULL_IMAGE=0 ;;
    --image)
      shift
      [ "$#" -gt 0 ] || { echo "--image requires a value" >&2; exit 2; }
      BOTMODE_IMAGE_VALUE="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 3
  }
}

need git
need docker

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 3
}

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but its daemon is not reachable." >&2
  echo "On Crostini, open a shell with Docker group access (for example: newgrp docker)." >&2
  exit 3
fi

OS=$(uname -s)
ARCH=$(uname -m)
case "$OS" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *) echo "Unsupported operating system: $OS" >&2; exit 3 ;;
esac

TOTAL_MEM_MB=0
if [ "$OS" = "Linux" ] && [ -r /proc/meminfo ]; then
  TOTAL_MEM_MB=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 ))
elif [ "$OS" = "Darwin" ]; then
  TOTAL_MEM_MB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
fi

CPU_AVX="unknown"
if [ "$OS" = "Linux" ] && [ -r /proc/cpuinfo ]; then
  if grep -qm1 -w avx /proc/cpuinfo; then CPU_AVX="yes"; else CPU_AVX="no"; fi
elif [ "$OS" = "Darwin" ]; then
  if sysctl -a 2>/dev/null | grep -Eiq 'machdep\.cpu\.(features|leaf7_features).*AVX'; then
    CPU_AVX="yes"
  fi
fi

PROFILE="$PROFILE_REQUEST"
if [ "$PROFILE" = "auto" ]; then
  PROFILE="full"
  if [ "$TOTAL_MEM_MB" -gt 0 ] && [ "$TOTAL_MEM_MB" -lt 4096 ]; then PROFILE="lite"; fi
  if [ "$CPU_AVX" = "no" ]; then PROFILE="lite"; fi
fi

if [ "$PROFILE" = "full" ] && [ "$CPU_AVX" = "no" ]; then
  echo "Full profile requires AVX because MongoDB 5.0+ requires AVX. Use --lite." >&2
  exit 3
fi
if [ "$PROFILE" = "full" ] && [ "$TOTAL_MEM_MB" -gt 0 ] && [ "$TOTAL_MEM_MB" -lt 4096 ]; then
  echo "Full profile requires at least 4 GiB RAM. Use --lite." >&2
  exit 3
fi

COMPOSE_ARGS=(-f docker-compose.botmode.yml)
if [ "$PROFILE" = "lite" ]; then
  COMPOSE_ARGS+=(-f docker-compose.botmode-lite.yml)
fi

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  printf 'BOTMODE_ENV_CREATED=%s\n' "$ROOT/.env"
else
  printf 'BOTMODE_ENV_EXISTING=YES\n'
fi

export BOTMODE_IMAGE="$BOTMODE_IMAGE_VALUE"
docker compose "${COMPOSE_ARGS[@]}" config --quiet

printf 'BOTMODE_PLATFORM=%s\n' "$PLATFORM"
printf 'BOTMODE_ARCH=%s\n' "$ARCH"
printf 'BOTMODE_MEMORY_MB=%s\n' "$TOTAL_MEM_MB"
printf 'BOTMODE_CPU_AVX=%s\n' "$CPU_AVX"
printf 'BOTMODE_PROFILE=%s\n' "$PROFILE"
printf 'BOTMODE_IMAGE=%s\n' "$BOTMODE_IMAGE"
printf 'BOTMODE_DOCKER=PASS\n'
printf 'BOTMODE_COMPOSE=PASS\n'

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf 'BOTMODE_BOOTSTRAP_CHECK=PASS\n'
  exit 0
fi

if [ "$PULL_IMAGE" -eq 1 ]; then
  docker pull "$BOTMODE_IMAGE"
  printf 'BOTMODE_IMAGE_PULL=PASS\n'
fi

if [ "$START_STACK" -eq 1 ]; then
  docker compose "${COMPOSE_ARGS[@]}" up -d
  printf 'BOTMODE_STACK=STARTED\n'
else
  printf 'BOTMODE_STACK=NOT_STARTED\n'
fi

printf 'BOTMODE_BOOTSTRAP=PASS\n'
printf 'GIT_HEAD=%s\n' "$(git rev-parse --short HEAD)"
