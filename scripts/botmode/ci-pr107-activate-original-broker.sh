#!/usr/bin/env bash
# GitHub runner only; never run against a user's installed LibreChat.
set -euo pipefail
[[ "${COMPOSE_PROJECT_NAME:-}" == botmode-pr107-head-* ]] ||
  { echo "CI_ORIGINAL_BROKER_NOT_ISOLATED=FAIL"; exit 1; }
COMPOSE=(docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml)
test -s /tmp/botmode-ci-worker-id

python3 - <<'PY_CONFIG'
import json
from pathlib import Path
path=Path('librechat.yaml')
data=json.loads(path.read_text())
routes=[e for e in data['endpoints']['custom'] if e.get('name')=='OpenRouter']
if len(routes)!=1: raise SystemExit('CI_ORIGINAL_OPENROUTER_CONFIG_MISSING')
routes[0]['baseURL']='http://host.docker.internal:8088/api/v1'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('CI_ORIGINAL_PROVIDER_FIXED_ENDPOINT=PASS')
PY_CONFIG

# Fetch the current, persisted two native specialist bindings from Mongo.
"${COMPOSE[@]}" exec -T api node - <<'NODE_CATALOG' > /tmp/botmode-ci-original-bindings.json
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const agents=mongoose.connection.db.collection('agents');
  const worker=await agents.findOne({name:'BOT MODE Worker'});
  const ids=worker?.subagents?.agent_ids;
  if(!Array.isArray(ids)||ids.length<2||new Set(ids).size<2) throw Error('ORIGINAL_TWO_AGENTS_MISSING');
  const bindings=[];
  for(const id of ids.slice(0,2)){
    const agent=await agents.findOne({id});
    const provider=agent?.provider==='OpenRouter'?'openrouter':agent?.provider;
    const model=agent?.model_parameters?.model??agent?.model;
    if(provider!=='openrouter'||model!=='openrouter/free') throw Error('ORIGINAL_BINDING_NOT_FREE');
    bindings.push({
      agentId:id,provider,model,
      endpoint:'http://host.docker.internal:8088/api/v1/chat/completions'
    });
  }
  process.stdout.write(JSON.stringify(bindings));
  await mongoose.disconnect();
})().catch(e=>{console.error('CI_ORIGINAL_BINDING_CLASS='+e.name);process.exitCode=1});
NODE_CATALOG
python3 - <<'PY_VALIDATE'
import json
from pathlib import Path
items=json.loads(Path('/tmp/botmode-ci-original-bindings.json').read_text())
assert len(items)==2 and len({v['agentId'] for v in items})==2
assert all(v['provider']=='openrouter' and v['model']=='openrouter/free' for v in items)
print('CI_ORIGINAL_TWO_REAL_AGENT_BINDINGS=PASS')
PY_VALIDATE

secret="$(openssl rand -hex 48)"
catalog="$(cat /tmp/botmode-ci-original-bindings.json)"
printf 'BOTMODE_CI_ORIGINAL_SECRET=%s\n' "$secret" | sudo tee -a .env >/dev/null
printf "BOTMODE_CI_ORIGINAL_BINDINGS='%s'\n" "$catalog" | sudo tee -a .env >/dev/null
unset secret catalog
# All edits are in the disposable runner checkout, not in the stable source.
sed -i '/      - OPENROUTER_KEY=/a\      - BOTMODE_NATIVE_ORIGINAL_BROKER_ENABLED=true\n      - BOTMODE_NATIVE_ORIGINAL_BROKER_URL=http://ci-original-provider-broker:8096/\n      - BOTMODE_NATIVE_ORIGINAL_BROKER_SECRET=${BOTMODE_CI_ORIGINAL_SECRET:?}\n      - BOTMODE_NATIVE_ORIGINAL_BROKER_BINDINGS=${BOTMODE_CI_ORIGINAL_BINDINGS:?}' docker-compose.botmode.yml
cat >> docker-compose.botmode-lite.yml <<'YAML_BROKER'
  ci-original-provider-broker:
    image: ${BOTMODE_IMAGE:?}
    entrypoint: ["node", "/app/scripts/botmode/ci-native-original-provider-broker-server.cjs"]
    environment:
      BOTMODE_CI_ORIGINAL_BROKER: "1"
      COMPOSE_PROJECT_NAME: ${COMPOSE_PROJECT_NAME:?}
      BOTMODE_CI_ORIGINAL_BROKER_SECRET: ${BOTMODE_CI_ORIGINAL_SECRET:?}
      BOTMODE_CI_ORIGINAL_MONGO_URI: "mongodb://botmode_admin:ci-isolated-only@mongodb:27017/LibreChat?authSource=admin"
      BOTMODE_CI_ORIGINAL_FIXTURE_URL: "http://host.docker.internal:8088/v1/chat/completions"
      MONGO_URI: "mongodb://botmode_admin:ci-isolated-only@mongodb:27017/LibreChat?authSource=admin"
    extra_hosts:
      - "host.docker.internal:host-gateway"
YAML_BROKER

"${COMPOSE[@]}" up -d --no-deps ci-original-provider-broker
broker_ready=0
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T ci-original-provider-broker \
    node -e "fetch('http://127.0.0.1:8096/status',{method:'POST'}).then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then broker_ready=1; break; fi
  sleep 1
done
test "$broker_ready" = 1 || { echo 'CI_ORIGINAL_BROKER_MONGO_BOOT=FAIL'; exit 1; }
echo 'CI_ORIGINAL_BROKER_INDEPENDENT_READY=PASS'

# Recreate only the disposable API; never replay the already tested mission.
"${COMPOSE[@]}" up -d --no-deps --force-recreate api
ready=0
for i in $(seq 1 75); do
  if curl -fsS http://127.0.0.1:3090/api/config >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 2
done
test "$ready" = 1 || { echo 'CI_ORIGINAL_BROKER_API_STARTUP=FAIL'; exit 1; }
echo 'CI_ORIGINAL_BROKER_ENABLED_API_READY=PASS'
# HTTP readiness alone does not prove the SDK broker was installed. Inspect
# only the fixed startup marker; never print application logs or credentials.
if ! "${COMPOSE[@]}" logs --no-color api 2>/dev/null |
  grep -Fq 'Original-child broker host enabled after independent broker check'; then
  echo 'CI_ORIGINAL_BROKER_HOST_NOT_ACTIVATED=FAIL'
  exit 1
fi
echo 'CI_ORIGINAL_BROKER_HOST_INSTALLED=PASS'
