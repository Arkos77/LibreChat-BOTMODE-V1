#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${BOTMODE_TEST_SDK_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1@sha256:81339472d84f22188a28c71d69e12c45d26a942197009cc4badb34adca3f434d}"
prefix="botmode-graph-midstep-$$"
net="$prefix-net"
mongo="$prefix-mongo"
seed="$prefix-seed"
cleanup() {
 docker rm -fv "$seed" "$mongo" >/dev/null 2>&1 || :
 docker network rm "$net" >/dev/null 2>&1 || :
}
trap cleanup EXIT
docker network create "$net" >/dev/null
docker run -d --name "$mongo" --network "$net" --memory 420m mongo:4.4.29 --bind_ip_all --quiet >/dev/null
ready=0
for _ in $(seq 1 28); do
 if docker exec "$mongo" mongo --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | tail -1 | grep -q '^1$'; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1 || { echo MONGO_NOT_READY; exit 1; }
args=(--network "$net" --memory 700m --cpus 1 --read-only
 -e "BOTMODE_TEST_MONGO_URI=mongodb://$mongo:27017"
 --mount "type=bind,src=$root/scripts/botmode/langgraph-cold-midstep-continuation-regression.cjs,dst=/app/langgraph-cold-midstep-continuation-regression.cjs,readonly"
 --entrypoint node "$image" /app/langgraph-cold-midstep-continuation-regression.cjs)
docker run -d --name "$seed" "${args[@]}" seed >/dev/null
seeded=0
for _ in $(seq 1 35); do
 if docker logs "$seed" 2>&1 | grep -q '^MIDDLE_GRAPH_PRE_KILL_DURABLE=PASS$'; then seeded=1; break; fi
 if [ "$(docker inspect -f '{{.State.Running}}' "$seed")" != true ]; then break; fi
 sleep 1
done
if [ "$seeded" != 1 ]; then docker logs "$seed"; echo MIDDLE_GRAPH_NOT_READY; exit 1; fi
docker kill --signal KILL "$seed" >/dev/null
test "$(docker wait "$seed")" = 137 || { echo NO_REAL_SIGKILL; exit 1; }
docker rm -v "$seed" >/dev/null
docker run --rm "${args[@]}" resume
docker run --rm "${args[@]}" verify
echo BOTMODE_LANGGRAPH_COLD_MIDSTEP_SIGKILL=PASS
