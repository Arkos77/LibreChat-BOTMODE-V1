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
export BOTMODE_MONGO_PASSWORD=ci-isolated-only
export POSTGRES_PASSWORD=ci-isolated-only
compose=(docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml)
"${compose[@]}" up -d --no-deps --force-recreate api
api_id="$("${compose[@]}" ps -q api)"
test -n "$api_id"
test "$(docker inspect "$api_id" --format '{{.Config.Image}}')" = "$BOTMODE_PUBLISHED_IMAGE"
ready=0
for _ in $(seq 1 60); do
    if curl -fsS --max-time 4 http://127.0.0.1:3090/api/config >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
done
test "$ready" = 1 || { echo 'CI_LIVE_FREE_FAIL=API_NOT_READY'; exit 3; }
# Do not emit the JWT, model prompts or any provider reply to Action logs.
echo 'CI_LIVE_FREE_REAL_OPENROUTER_ENDPOINT_READY=PASS'
python3 scripts/botmode/ci-live-free-child-oracle-gate.py
