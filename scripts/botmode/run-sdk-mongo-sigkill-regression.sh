#!/usr/bin/env bash
set -euo pipefail

# SDK-only SIGKILL qualification. Docker containers/network are disposable.
# Never stops or joins the user's running LibreChat or MongoDB installation.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1:edge}"
name="botmode-sdk-crash-${$}"
network="${name}-net"
mongo="${name}-mongo"
seed="${name}-seed"

cleanup() {
  docker rm -f "$seed" "$mongo" >/dev/null 2>&1 || :
  docker network rm "$network" >/dev/null 2>&1 || :
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --name "$mongo" --network "$network" --memory 420m \
  mongo:4.4.29 --bind_ip_all --quiet >/dev/null

ready=0
for _ in $(seq 1 25); do
  if docker exec "$mongo" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | tail -1 | grep -q '^1$'; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1 || { echo "MONGO_NOT_READY"; exit 1; }

run_phase() {
  docker run --rm --network "$network" --memory 700m --cpus 1 \
    -e "BOTMODE_TEST_MONGO_URI=mongodb://$mongo:27017" \
    --mount "type=bind,src=$root/scripts/botmode/sdk-mongo-cold-checkpoint-regression.cjs,dst=/app/sdk-mongo-cold-checkpoint-regression.cjs,readonly" \
    --mount "type=bind,src=$root/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,dst=/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,readonly" \
    --entrypoint node "$image" /app/sdk-mongo-cold-checkpoint-regression.cjs "$1"
}
docker run -d --name "$seed" --network "$network" --memory 700m --cpus 1 \
  -e "BOTMODE_TEST_MONGO_URI=mongodb://$mongo:27017" \
  --mount "type=bind,src=$root/scripts/botmode/sdk-mongo-cold-checkpoint-regression.cjs,dst=/app/sdk-mongo-cold-checkpoint-regression.cjs,readonly" \
  --mount "type=bind,src=$root/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,dst=/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,readonly" \
  --entrypoint node "$image" /app/sdk-mongo-cold-checkpoint-regression.cjs seed-sigkill >/dev/null

persisted=0
for _ in $(seq 1 25); do
  if docker logs "$seed" 2>&1 | grep -q '^BOTMODE_MONGO_SDK_CHECKPOINT_BEFORE_SIGKILL=PASS$'; then
    persisted=1
    break
  fi
  sleep 1
done
test "$persisted" = 1 || { docker logs "$seed"; echo "CHECKPOINT_NOT_CONFIRMED"; exit 1; }
echo "CHECKPOINT_DURABLE=PASS"
docker kill --signal=KILL "$seed" >/dev/null
code="$(docker wait "$seed")"
test "$code" = 137 || { echo "UNEXPECTED_SIGKILL_EXIT=$code"; exit 1; }
echo "EXTERNAL_SIGKILL_EXIT=137"
docker rm "$seed" >/dev/null
run_phase resume
run_phase retry
echo "MONGO_SDK_EXTERNAL_SIGKILL_RESTART=PASS"
