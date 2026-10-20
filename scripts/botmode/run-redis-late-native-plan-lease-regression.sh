#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1@sha256:81339472d84f22188a28c71d69e12c45d26a942197009cc4badb34adca3f434d}"
prefix="botmode-late-plan-$$"
net="$prefix-net"
redis="$prefix-redis"
cleanup() {
 docker rm -fv "$redis" >/dev/null 2>&1 || :
 docker network rm "$net" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create "$net" >/dev/null
docker run -d --name "$redis" --network "$net" --memory 128m redis:7-alpine  redis-server --save '' --appendonly no >/dev/null
ready=0
for _ in $(seq 1 20); do
 if docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1 || { echo REDIS_NOT_READY; exit 1; }
docker run --rm --network "$net" --memory 680m --cpus 1 --read-only  -e "BOTMODE_TEST_REDIS_URI=redis://$redis:6379"  --mount "type=bind,src=$root/scripts/botmode/redis-late-native-plan-lease-regression.cjs,dst=/app/redis-late-native-plan-lease-regression.cjs,readonly"  --mount "type=bind,src=$root/packages/api/src/stream/implementations/RedisJobStore.ts,dst=/work/packages/api/src/stream/implementations/RedisJobStore.ts,readonly"  --entrypoint node "$image" /app/redis-late-native-plan-lease-regression.cjs
echo BOTMODE_REDIS_LATE_PLAN_LEASE_INTEGRATION=PASS
