#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

START_STACK=0
CHECK_ONLY=0
SKIP_INSTALL=0
SKIP_BUILD=0
SKIP_VERIFY=0

usage() {
  cat <<'EOF'
Usage: scripts/botmode/bootstrap.sh [options]

Safe BOT MODE bootstrap for Linux/ChromeOS Crostini/macOS.

Options:
  --check-only    Validate prerequisites only; change nothing.
  --start         Start the Docker Compose stack after validation.
  --skip-install  Skip npm ci.
  --skip-build    Skip package/client builds.
  --skip-verify   Skip BOT MODE reproducibility tests.
  -h, --help      Show this help.

The script never runs sudo, never overwrites an existing .env, and never
deletes application data.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only) CHECK_ONLY=1 ;;
    --start) START_STACK=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
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
need node
need npm
need docker

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 3
}

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but its daemon is not reachable." >&2
  exit 3
fi

OS=$(uname -s)
ARCH=$(uname -m)
case "$OS" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *) echo "Unsupported operating system: $OS" >&2; exit 3 ;;
esac

EXPECTED_NODE=$(tr -d '[:space:]' < .nvmrc)
EXPECTED_MAJOR=${EXPECTED_NODE%%.*}
CURRENT_NODE=$(node -p "process.versions.node")
CURRENT_MAJOR=${CURRENT_NODE%%.*}
if [ "$CURRENT_MAJOR" != "$EXPECTED_MAJOR" ]; then
  echo "Node $EXPECTED_NODE.x major is required; found $CURRENT_NODE." >&2
  exit 3
fi

printf 'BOTMODE_PLATFORM=%s\n' "$PLATFORM"
printf 'BOTMODE_ARCH=%s\n' "$ARCH"
printf 'BOTMODE_NODE=%s\n' "$CURRENT_NODE"
printf 'BOTMODE_DOCKER=PASS\n'
printf 'BOTMODE_COMPOSE=PASS\n'

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf 'BOTMODE_BOOTSTRAP_CHECK=PASS\n'
  exit 0
fi

git diff --check

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  printf 'BOTMODE_ENV_CREATED=%s\n' "$ROOT/.env"
else
  printf 'BOTMODE_ENV_EXISTING=YES\n'
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  npm ci
else
  printf 'BOTMODE_NPM_INSTALL=SKIPPED\n'
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  npm run build:packages
  npm run build:client
else
  printf 'BOTMODE_BUILD=SKIPPED\n'
fi

env UID="$(id -u)" GID="$(id -g)" docker compose config --quiet
printf 'BOTMODE_COMPOSE_CONFIG=PASS\n'

if [ "$SKIP_VERIFY" -eq 0 ]; then
  ./scripts/botmode/verify-reproducibility.sh
else
  printf 'BOTMODE_VERIFY=SKIPPED\n'
fi

if [ "$START_STACK" -eq 1 ]; then
  env UID="$(id -u)" GID="$(id -g)" docker compose up -d
  printf 'BOTMODE_STACK=STARTED\n'
else
  printf 'BOTMODE_STACK=NOT_STARTED\n'
fi

printf 'BOTMODE_BOOTSTRAP=PASS\n'
printf 'GIT_HEAD=%s\n' "$(git rev-parse --short HEAD)"
