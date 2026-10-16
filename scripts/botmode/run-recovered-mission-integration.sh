#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1@sha256:81339472d84f22188a28c71d69e12c45d26a942197009cc4badb34adca3f434d}"
prefix="botmode-recovered-qual-$$"
network="$prefix-net"
mongo="$prefix-mongo"
redis="$prefix-redis"
seed="$prefix-seed"
cleanup() {
  docker rm -fv "$seed" "$mongo" "$redis" >/dev/null 2>&1 || :
  docker network rm "$network" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create "$network" >/dev/null
docker run -d --name "$mongo" --network "$network" --memory 420m mongo:4.4.29 --bind_ip_all --quiet >/dev/null
docker run -d --name "$redis" --network "$network" --memory 128m redis:7-alpine redis-server --save '' --appendonly no >/dev/null
ready=0
for _ in $(seq 1 25); do
  if docker exec "$mongo" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | tail -1 | grep -q '^1$' &&
     docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1 || { echo MONGO_OR_REDIS_NOT_READY; exit 1; }
docker_args=(
  --network "$network" --memory 700m --cpus 1
  -e "BOTMODE_TEST_MONGO_URI=mongodb://$mongo:27017"
  -e "BOTMODE_TEST_REDIS_URI=redis://$redis:6379"
  --mount "type=bind,src=$root/scripts/botmode/recovered-mission-redis-mongo-regression.cjs,dst=/app/recovered-mission-redis-mongo-regression.cjs,readonly"
  --mount "type=bind,src=$root/packages/api/src/stream/implementations/RedisJobStore.ts,dst=/work/packages/api/src/stream/implementations/RedisJobStore.ts,readonly"
  --mount "type=bind,src=$root/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,dst=/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts,readonly"
  --entrypoint node "$image" /app/recovered-mission-redis-mongo-regression.cjs
)
docker run -d --name "$seed" "${docker_args[@]}" seed >/dev/null
durable=0
for _ in $(seq 1 25); do
  if docker logs "$seed" 2>&1 | grep -q '^RECOVERED_MISSION_SEED_DURABLE=PASS$'; then
    durable=1
    break
  fi
  sleep 1
done
test "$durable" = 1 || { docker logs "$seed"; echo CHECKPOINT_SEED_FAILED; exit 1; }
docker kill --signal=KILL "$seed" >/dev/null
test "$(docker wait "$seed")" = 137 || { echo NO_REAL_SIGKILL; exit 1; }
docker rm -v "$seed" >/dev/null
docker run --rm "${docker_args[@]}" resume
docker run --rm "${docker_args[@]}" retry
echo BOTMODE_RECOVERED_REDIS_MONGO_SDK_EXTERNAL_SIGKILL=PASS
