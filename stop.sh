#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

# The BOTMODE Compose files share a fixed project name. The base file contains
# every possible service, so it can safely stop either a Full or Lite stack
# without trying to rediscover the profile that was used at startup.
docker compose -f docker-compose.botmode.yml down
