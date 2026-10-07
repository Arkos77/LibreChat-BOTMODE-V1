#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

export BOTMODE_IMAGE="${BOTMODE_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1:edge}"

docker compose -f docker-compose.botmode.yml config --quiet
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml config --quiet

full_image=$(docker compose -f docker-compose.botmode.yml config | awk '
  /^  api:$/ {in_api=1; next}
  in_api && /^  [[:alnum:]_-]+:$/ {exit}
  in_api && /^    image: / {print $2; exit}
')
[ "$full_image" = "$BOTMODE_IMAGE" ] || {
  echo "Unexpected BOTMODE API image: $full_image" >&2
  exit 1
}

lite_mongo=$(docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml config | awk '
  /^  mongodb:$/ {in_mongo=1; next}
  in_mongo && /^[[:space:]]+image: / {print $2; exit}
')
[ "$lite_mongo" = "mongo:4.4.29" ] || {
  echo "Lite profile must use mongo:4.4.29; got $lite_mongo" >&2
  exit 1
}

lite_config=$(docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml config)
grep -q 'SCHEDULES_SINGLE_PROCESS: "true"' <<< "$lite_config"
grep -q '/app/librechat.yaml' <<< "$lite_config"

if grep -q 'registry.librechat.ai/danny-avila/librechat-dev:latest' docker-compose.botmode.yml; then
  echo "BOTMODE runtime must not use the upstream LibreChat API image." >&2
  exit 1
fi

if grep -Eq 'need (node|npm)|npm ci|npm run build' scripts/botmode/bootstrap.sh; then
  echo "Runtime bootstrap must not install or build Node dependencies." >&2
  exit 1
fi

for runtime_path in logs uploads images; do
  if grep -q "./$runtime_path:/app" docker-compose.botmode.yml; then
    echo "Runtime path $runtime_path must use Docker-managed storage, not a host bind mount." >&2
    exit 1
  fi
done

printf 'BOTMODE_RUNTIME_DISTRIBUTION=PASS\n'
