#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

# Synthetic values for configuration-only checks; never use production credentials.
export BOTMODE_MONGO_PASSWORD=ci-mongo-only-not-a-real-secret
export POSTGRES_PASSWORD=ci-postgres-only-not-a-real-secret

BOTMODE_COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
export BOTMODE_IMAGE="${BOTMODE_IMAGE:-ghcr.io/arkos77/librechat-botmode-v1:sha-${BOTMODE_COMMIT_SHA}}"

docker compose -f docker-compose.botmode.yml config --quiet
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml config --quiet

# Assert actual resolved port binding, not merely the YAML string.
# Empty overrides force Compose's safe defaults even if a CI runner has a .env.
python3 - <<'PY_PUBLIC_PORTS'
import json
import os
import subprocess

base = os.environ.copy()
base['BOTMODE_HOST_BIND_IP'] = ''
base['BOTMODE_ADMIN_PANEL_BIND_IP'] = ''

def config(files, env):
    cmd = ['docker', 'compose']
    for path in files:
        cmd.extend(['-f', path])
    cmd.extend(['config', '--format', 'json'])
    return json.loads(subprocess.check_output(cmd, env=env, text=True))['services']

base_file = 'docker-compose.botmode.yml'
lite_file = 'docker-compose.botmode-lite.yml'
full = config([base_file], base)
lite = config([base_file, lite_file], base)

def host_ip(services, name, target):
    ports = [port for port in services[name].get('ports', [])
             if int(port.get('target', -1)) == target]
    assert len(ports) == 1, f'{name}:{target}: expected one published port'
    return ports[0].get('host_ip', '')

assert host_ip(full, 'api', 3080) == '127.0.0.1', 'Full API must default to loopback'
assert host_ip(lite, 'api', 3080) == '127.0.0.1', 'Lite API must default to loopback'
assert host_ip(full, 'admin-panel', 3000) == '127.0.0.1', 'Full admin panel must default to loopback'
for name in ['mongodb', 'redis']:
    assert not lite[name].get('ports'), f'Lite {name} must not publish a host port'

# Network access must be a deliberate opt-in; the admin panel remains
# independent from the API's external binding decision.
opt_in = base.copy()
opt_in['BOTMODE_HOST_BIND_IP'] = '0.0.0.0'
opt_in['BOTMODE_ADMIN_PANEL_BIND_IP'] = '192.0.2.5'
remote = config([base_file], opt_in)
assert host_ip(remote, 'api', 3080) == '0.0.0.0', 'Explicit API bind must be honored'
assert host_ip(remote, 'admin-panel', 3000) == '192.0.2.5', 'Admin bind must be independent'
print('BOTMODE_PUBLIC_PORT_DEFAULTS=PASS')
PY_PUBLIC_PORTS

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
full_config=$(docker compose -f docker-compose.botmode.yml config)
grep -q "authSource=admin" <<< "$full_config"
grep -q "MONGO_INITDB_ROOT_USERNAME: botmode_admin" <<< "$full_config"
grep -q "POSTGRES_PASSWORD: ci-postgres-only-not-a-real-secret" <<< "$full_config"
if grep -Eq "mongod --noauth|POSTGRES_PASSWORD: mypassword" docker-compose.botmode.yml; then
  echo "BOTMODE database must not use unauthenticated or default-password configuration." >&2
  exit 1
fi
grep -q 'SCHEDULES_SINGLE_PROCESS: "true"' <<< "$lite_config"
grep -q 'USE_REDIS: "true"' <<< "$lite_config"
grep -q 'USE_REDIS_STREAMS: "true"' <<< "$lite_config"
grep -q 'REDIS_URI: redis://redis:6379' <<< "$lite_config"
grep -q 'STREAM_KEEP_COMPLETED_JOBS: "true"' <<< "$lite_config"
# Redis is internal-only and AOF-persistent; the Lite runtime must not
# silently switch the validated durable mission store back to memory.
python3 - <<'PY_LITE_REDIS'
import json, subprocess
result = subprocess.check_output([
    'docker', 'compose', '-f', 'docker-compose.botmode.yml',
    '-f', 'docker-compose.botmode-lite.yml', 'config', '--format', 'json'
], text=True)
services = json.loads(result)['services']
redis = services['redis']
assert len(redis.get('ports') or []) == 0, 'Redis must never expose a host port'
assert int(redis.get('mem_limit')) == 167772160, 'Redis memory limit unexpectedly changed'
assert 'yes' in redis.get('command', []) and '--appendonly' in redis.get('command', [])
assert any(v.get('target') == '/data' and v.get('type') == 'volume'
           for v in redis.get('volumes', [])), 'Redis AOF data volume missing'
assert services['api']['depends_on']['redis']['condition'] == 'service_healthy'
print('BOTMODE_LITE_DURABLE_INTERNAL_REDIS=PASS')
PY_LITE_REDIS
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
