#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1@sha256:81339472d84f22188a28c71d69e12c45d26a942197009cc4badb34adca3f434d}"
prefix="botmode-effect-receipt-$$"
net="$prefix-net"
redis="$prefix-redis"
cleanup() {
  docker rm -fv "$redis" >/dev/null 2>&1 || :
  docker network rm "$net" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create "$net" >/dev/null
docker run -d --name "$redis" --network "$net" --memory 128m redis:7-alpine \
  redis-server --save '' --appendonly no >/dev/null
ready=0
for _ in $(seq 1 24); do
  if docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1 || { echo REDIS_NOT_READY; exit 1; }
docker run --rm --network "$net" --memory 730m --cpus 1 --read-only \
  -e "BOTMODE_TEST_REDIS_URI=redis://$redis:6379" \
  --mount "type=bind,src=$root/packages/api/src/stream/nativeMissionEffectReceipts.ts,dst=/work/packages/api/src/stream/nativeMissionEffectReceipts.ts,readonly" \
  --mount "type=bind,src=$root/packages/api/src/stream/implementations/RedisJobStore.ts,dst=/work/packages/api/src/stream/implementations/RedisJobStore.ts,readonly" \
  --mount "type=bind,src=$root/packages/api/src/agents/nativeMissionEffectExecution.ts,dst=/work/packages/api/src/agents/nativeMissionEffectExecution.ts,readonly" \
  --mount "type=bind,src=$root/scripts/botmode/native-effect-receipts-redis-regression.cjs,dst=/app/native-effect-receipts-redis-regression.cjs,readonly" \
  --entrypoint node "$image" /app/native-effect-receipts-redis-regression.cjs
echo BOTMODE_NATIVE_EFFECT_RECEIPTS_REDIS_INTEGRATION=PASS
