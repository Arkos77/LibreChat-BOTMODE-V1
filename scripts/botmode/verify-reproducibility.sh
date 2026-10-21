#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
command -v git >/dev/null
command -v docker >/dev/null
git diff --check
./scripts/botmode/verify-runtime-distribution.sh
node --check scripts/botmode/seed-default-specialists.js
npm --workspace @librechat/api exec jest -- src/agents/orchestrator/native.spec.ts src/agents/orchestrator/routing.spec.ts src/agents/orchestrator/improvement.spec.ts src/agents/channels/gateway.spec.ts --runInBand --coverage=false
./node_modules/.bin/eslint packages/api/src/agents/orchestrator/capabilityRegistry.ts packages/api/src/agents/orchestrator/improvement.ts packages/api/src/agents/channels/gateway.ts
printf 'BOTMODE_REPRODUCIBILITY=PASS\n'
printf 'GIT_HEAD=%s\n' "$(git rev-parse --short HEAD)"
printf 'WORKTREE_CHANGES=%s\n' "$(git status --short | wc -l | tr -d ' ')"
