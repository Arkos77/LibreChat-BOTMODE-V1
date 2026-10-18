#!/usr/bin/env bash
# Manual free-only OpenRouter E2E after the exact-OCI synthetic child probe.
# Does not publish, use paid models, modify repo runtime or touch user volumes.
set -euo pipefail
test "${CI_EXTERNAL_FREE_PROVIDER:-}" = true || exit 2
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^botmode-oci-child-[0-9]+-[0-9]+$ ]] || exit 2
test "${BOTMODE_PUBLISHED_IMAGE:-}" = 'ghcr.io/arkos77/librechat-botmode-v1@sha256:94b11ff0bc8f5820b803741f5a52c96a5e265c2994bb268ee565ba35444cee3a'
test -n "${OPENROUTER_API_KEY:-}" || { echo 'CI_LIVE_FREE_BLOCKED=NO_PROVIDER_SECRET'; exit 3; }
test "${#OPENROUTER_API_KEY}" -gt 16 || { echo 'CI_LIVE_FREE_BLOCKED=INVALID_PROVIDER_SECRET'; exit 3; }
echo "::add-mask::$OPENROUTER_API_KEY"
export OPENROUTER_KEY="$OPENROUTER_API_KEY"
# Runner-only existing fixture made this dotenv readable to the non-root API.
# Restore runner ownership briefly for a secret-preserving local edit.
sudo chown "$(id -u):$(id -g)" .env
python3 - <<'PY'
import json,os
from pathlib import Path
cfg=Path('librechat.yaml')
data=json.loads(cfg.read_text())
allowed=[]
for item in data.get('endpoints',{}).get('custom',[]):
    if item.get('name')=='OpenRouter':
        item['baseURL']='https://openrouter.ai/api/v1'
        item['models']={'fetch':False,'default':['openrouter/free']}
        allowed.append(item)
assert len(allowed)==1, 'CI_LIVE_FREE_FAIL=OPENROUTER_CONFIG_MISSING'
assert not data['endpoints']['agents'].get('hostModelRouting'), 'CI_LIVE_FREE_FAIL=OTHER_ROUTING_NOT_ISOLATED'
cfg.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
dotenv=Path('.env')
lines=dotenv.read_text().splitlines()
assert sum(line.startswith('OPENROUTER_KEY=') for line in lines)==1
new=['OPENROUTER_KEY='+os.environ['OPENROUTER_API_KEY'] if line.startswith('OPENROUTER_KEY=') else line for line in lines]
dotenv.write_text('\n'.join(new)+'\n')
print('CI_LIVE_FREE_EXACT_FREE_MODEL_ROUTING=PASS')
PY
sudo chown "1000:$(id -g)" .env
sudo chmod 640 .env
# Once the synthetic gate is complete, stop its model fixture entirely.
if test -r /tmp/botmode-ci-fixture.pid; then kill "$(cat /tmp/botmode-ci-fixture.pid)" 2>/dev/null || true; fi
export BOTMODE_IMAGE="$BOTMODE_PUBLISHED_IMAGE"
# GitHub Actions run steps have independent shell environments. The original
# synthetic setup used host port 3090, so preserve it on API recreation.
export BOTMODE_HOST_PORT=3090
export BOTMODE_MONGO_PASSWORD=ci-isolated-only
export POSTGRES_PASSWORD=ci-isolated-only
compose=(docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml)
"${compose[@]}" up -d --no-deps --force-recreate api
api_id="$("${compose[@]}" ps -q api)"
test -n "$api_id"
test "$(docker inspect "$api_id" --format '{{.Config.Image}}')" = "$BOTMODE_PUBLISHED_IMAGE"
# A live API on the *wrong* host port is not an upstream provider failure.
port_binding="$("${compose[@]}" port api 3080)"
case "$port_binding" in *:3090) echo 'CI_LIVE_FREE_HOST_PORT_MATCH=PASS';; *) echo 'CI_LIVE_FREE_FAIL=WRONG_HOST_PORT'; exit 3;; esac
ready=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 4 http://127.0.0.1:3090/api/config >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
done
if test "$ready" != 1; then
    echo 'CI_LIVE_FREE_FAIL=API_NOT_READY'
    docker inspect "$api_id" --format 'CI_LIVE_API_STATE={{.State.Status}} EXIT={{.State.ExitCode}} OOM={{.State.OOMKilled}} RESTARTS={{.RestartCount}}' || true
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:3090/api/config || true)"
    echo "CI_LIVE_API_HTTP_STATUS=$code"
    if "${compose[@]}" exec -T mongodb sh -ec 'mongo --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin admin --eval "print(db.adminCommand({ping:1}).ok)"' 2>/dev/null | tail -1 | grep -qx 1; then
      echo 'CI_LIVE_MONGO_ADMIN_AUTH=PASS'
    else
      echo 'CI_LIVE_MONGO_ADMIN_AUTH=FAIL'
    fi
    "${compose[@]}" logs --no-color --tail 180 api > /tmp/botmode-ci-live-api-startup.log 2>/dev/null || true
    python3 - <<'PY_DIAG'
from pathlib import Path
raw=Path('/tmp/botmode-ci-live-api-startup.log').read_text(errors='replace').lower()
categories={
 'MONGO_AUTH':('authentication failed','auth failed','mongoservererror'),
 'DB_CONNECTION':('server selection','connect econnrefused','mongodb connection'),
 'PERMISSION':('eacces','permission denied','operation not permitted'),
 'CONFIG':('invalid configuration','config failed','yamlexception','configuration error'),
 'KEY':('api key missing','api key required','key not provided'),
 'MODULE':('module not found','cannot find module'),
 'PROVIDER':('provider','openrouter','upstream idle timeout'),
 'REDIS':('redis connection','error connecting redis'),
 'SERVER_START':('failed to start server','uncaught exception','fatal'),
}
for category,terms in categories.items():
    print('CI_LIVE_API_LOG_'+category+'='+str(any(s in raw for s in terms)).upper(),flush=True)
print('CI_LIVE_API_LOG_LINES='+str(len(raw.splitlines())),flush=True)
PY_DIAG
    exit 3
fi
# Do not emit the JWT, model prompts or any provider reply to Action logs.
# /api/config can answer before post-listen initialization finishes.
# Agent POST readiness is explicitly fenced by the application /readyz gate.
mission_ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 4 http://127.0.0.1:3090/readyz >/dev/null 2>&1; then
    mission_ready=1
    break
  fi
  sleep 2
done
if test "$mission_ready" != 1; then
  echo 'CI_LIVE_FREE_FAIL=MISSION_SERVER_NOT_READY'
  exit 3
fi
echo 'CI_LIVE_FREE_MISSION_SERVER_READY=PASS'
echo 'CI_LIVE_FREE_REAL_OPENROUTER_ENDPOINT_READY=PASS'
python3 scripts/botmode/ci-live-free-child-oracle-gate.py
