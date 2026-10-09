#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

PROFILE_REQUEST="auto"
CHECK_ONLY=0
START_STACK=1
PULL_IMAGE=1
BOTMODE_IMAGE_VALUE="${BOTMODE_IMAGE:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/botmode/bootstrap.sh [options]

Runtime installer for LibreChat BOTMODE V1.

Options:
  --lite          Force the low-memory / non-AVX profile.
  --full          Force the full profile.
  --check-only    Validate the host and Compose configuration only.
  --start         Explicitly start the stack (default; kept for compatibility).
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
    --start) START_STACK=1 ;;
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

BOTMODE_COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
BOTMODE_DEFAULT_IMAGE="ghcr.io/arkos77/librechat-botmode-v1:sha-${BOTMODE_COMMIT_SHA}"
if [ -z "$BOTMODE_IMAGE_VALUE" ]; then
  BOTMODE_IMAGE_VALUE="$BOTMODE_DEFAULT_IMAGE"
fi

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

CPU_AVX="n/a"
case "$ARCH" in
  x86_64|amd64)
    CPU_AVX="unknown"
    if [ "$OS" = "Linux" ] && [ -r /proc/cpuinfo ]; then
      if grep -qm1 -w avx /proc/cpuinfo; then CPU_AVX="yes"; else CPU_AVX="no"; fi
    elif [ "$OS" = "Darwin" ]; then
      if sysctl -a 2>/dev/null | grep -Eiq 'machdep\.cpu\.(features|leaf7_features).*AVX'; then
        CPU_AVX="yes"
      else
        CPU_AVX="no"
      fi
    fi
    ;;
esac

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

# Bootstrap database credentials without printing them. Existing databases must never
# be silently switched to authentication or a different password.
read_env_value() {
  local key="$1" line
  line=$(grep -E "^${key}=" .env | tail -n 1 || true)
  printf '%s' "${line#*=}"
}
set_env_value() {
  local key="$1" value="$2"
  printf '%s=%s\n' "$key" "$value" >> .env
}
mongo_pass=$(read_env_value BOTMODE_MONGO_PASSWORD)
pg_pass=$(read_env_value POSTGRES_PASSWORD)
if [ -z "$mongo_pass" ] || [ -z "$pg_pass" ]; then
  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "Missing BOTMODE_MONGO_PASSWORD or POSTGRES_PASSWORD in .env; run ./install.sh --no-start first." >&2
    exit 4
  fi
  need openssl
  if [ -z "$mongo_pass" ]; then
    mongo_pass=$(openssl rand -hex 32)
    set_env_value BOTMODE_MONGO_PASSWORD "$mongo_pass"
  fi
  if [ -z "$pg_pass" ]; then
    pg_pass=$(openssl rand -hex 32)
    set_env_value POSTGRES_PASSWORD "$pg_pass"
  fi
  chmod 600 .env
fi

# Docker's database initialization credentials only apply to empty data
# directories. Refuse to guess whether pre-existing volumes were initialized
# with authentication; the operator must run an explicit migration.
need openssl
auth_stamp=$(printf 'mongo=%s\npostgres=%s\n' "$mongo_pass" "$pg_pass" | openssl dgst -sha256 | awk '{print $NF}')
if [ "$CHECK_ONLY" -eq 0 ]; then
  for db_volume in botmode-mongo-data botmode-pgdata; do
    volume_name="librechat-botmode_${db_volume}"
    if docker volume inspect "$volume_name" >/dev/null 2>&1; then
      if [ ! -f ".botmode-database-auth-initialized" ] || [ "$(cat .botmode-database-auth-initialized)" != "v2:$auth_stamp" ]; then
        echo "Existing database volume $volume_name: automatic auth migration is unsafe." >&2
        echo "Back up and migrate existing data explicitly before proceeding." >&2
        exit 5
      fi
    fi
  done
fi
export BOTMODE_MONGO_PASSWORD="$mongo_pass"
export POSTGRES_PASSWORD="$pg_pass"
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
  # "up -d" only confirms container creation, not working database credentials.
  # Require authenticated reads before trusting the local volume marker.
  db_verified=0
  for attempt in $(seq 1 60); do
    if docker compose "${COMPOSE_ARGS[@]}" exec -T mongodb sh -ec '
      if command -v mongosh >/dev/null 2>&1; then cli=mongosh; else cli=mongo; fi
      "$cli" --quiet --authenticationDatabase admin -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --eval "db.adminCommand({ping:1}).ok" | grep -q 1
    ' >/dev/null 2>&1; then
      if [ "$PROFILE" = "lite" ] || docker compose "${COMPOSE_ARGS[@]}" exec -T vectordb sh -ec '
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$(hostname -i | cut -d ' ' -f1)" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1" | grep -q 1
      ' >/dev/null 2>&1; then
        db_verified=1
        break
      fi
    fi
    sleep 2
  done
  if [ "$db_verified" -ne 1 ]; then
    echo "Database authentication verification failed; no initialization marker was written." >&2
    exit 6
  fi
  printf 'v2:%s\\n' "$auth_stamp" > .botmode-database-auth-initialized
  chmod 600 .botmode-database-auth-initialized
  printf 'BOTMODE_STACK=STARTED\n'
else
  printf 'BOTMODE_STACK=NOT_STARTED\n'
fi

printf 'BOTMODE_BOOTSTRAP=PASS\n'
printf 'GIT_HEAD=%s\n' "$(git rev-parse --short HEAD)"
