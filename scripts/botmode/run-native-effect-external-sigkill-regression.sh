#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1@sha256:81339472d84f22188a28c71d69e12c45d26a942197009cc4badb34adca3f434d}"
prefix="botmode-effect-sigkill-$$"
network="$prefix-net"
redis="$prefix-redis"
seed_container="$prefix-seed"
cleanup(){
  docker rm -fv "$seed_container" "$redis" >/dev/null 2>&1 || :
  docker network rm "$network" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create "$network" >/dev/null
docker run -d --name "$redis" --network "$network" --memory 128m redis:7-alpine \
  redis-server --save '' --appendonly no >/dev/null
ready=0
for _ in $(seq 1 25); do
  if docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1 || { echo REDIS_NOT_READY; exit 1; }
args=(
  --network "$network" --memory 680m --cpus 1 --read-only
  -e "BOTMODE_TEST_REDIS_URI=redis://$redis:6379"
  --mount "type=bind,src=$root/packages/api/src/stream/nativeMissionEffectReceipts.ts,dst=/work/packages/api/src/stream/nativeMissionEffectReceipts.ts,readonly"
  --mount "type=bind,src=$root/packages/api/src/agents/nativeMissionEffectExecution.ts,dst=/work/packages/api/src/agents/nativeMissionEffectExecution.ts,readonly"
  --mount "type=bind,src=$root/scripts/botmode/native-effect-external-sigkill-regression.cjs,dst=/app/native-effect-external-sigkill-regression.cjs,readonly"
  --entrypoint node "$image" /app/native-effect-external-sigkill-regression.cjs
)
for scenario in uncertain committed; do
  upper="$(printf %s "$scenario" | tr '[:lower:]' '[:upper:]')"
  docker run -d --name "$seed_container" "${args[@]}" "seed_$scenario" >/dev/null
  started=0
  for _ in $(seq 1 30); do
    if docker logs "$seed_container" 2>&1 | grep -q "EXTERNAL_EFFECT_PRE_KILL_$upper=PASS"; then
      started=1
      break
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$seed_container")" != true ]; then break; fi
    sleep 1
  done
  if [ "$started" != 1 ]; then docker logs "$seed_container"; echo SEED_NOT_READY; exit 1; fi
  docker kill --signal KILL "$seed_container" >/dev/null
  test "$(docker wait "$seed_container")" = 137 || { echo NOT_HARD_KILLED; exit 1; }
  docker rm -v "$seed_container" >/dev/null
  docker run --rm "${args[@]}" "resume_$scenario"
done
echo BOTMODE_NATIVE_EFFECT_REAL_SIGKILL_UNCERTAIN_AND_COMMITTED=PASS
