#!/usr/bin/env bash
# Local, non-publishing integration rehearsal. No branch is updated.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is not clean" >&2
  exit 2
fi
git fetch origin main botmode-v1-mammoth-security-trial-20261013
tmp="$(mktemp -d)"
cleanup() {
  git worktree remove --force "$tmp/worktree" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT
git worktree add --detach "$tmp/worktree" origin/main >/dev/null
cd "$tmp/worktree"
set +e
git -c user.name='BOTMODE rehearsal' -c user.email='botmode-rehearsal@localhost' merge --no-ff --no-commit origin/botmode-v1-mammoth-security-trial-20261013
merge_status=$?
set -e
mapfile -t conflicts < <(git diff --name-only --diff-filter=U)
printf 'BOTMODE_DRYRUN_INITIAL_MERGE_EXIT=%s\n' "$merge_status"
printf 'BOTMODE_DRYRUN_CONFLICT_COUNT=%s\n' "${#conflicts[@]}"
printf '%s\n' "${conflicts[@]}"
if [[ "${#conflicts[@]}" -eq 1 && "${conflicts[0]}" == ".github/workflows/botmode-image.yml" ]]; then
  # The qualified candidate version disables registry publication on PR runs.
  git checkout --theirs -- .github/workflows/botmode-image.yml
  git add -- .github/workflows/botmode-image.yml
fi
if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  echo "BOTMODE_DRYRUN=CONFLICTS_REMAIN" >&2
  exit 1
fi
if [[ "$merge_status" -ne 0 && "${#conflicts[@]}" -eq 0 ]]; then
  echo "BOTMODE_DRYRUN=MERGE_FAILED_WITHOUT_FILE_CONFLICTS" >&2
  exit 1
fi
git -c user.name='BOTMODE rehearsal' -c user.email='botmode-rehearsal@localhost' commit --no-edit -m 'test(botmode): ephemeral main integration rehearsal' >/dev/null
echo "BOTMODE_DRYRUN_MERGE_COMMIT=$(git rev-parse HEAD)"
echo "BOTMODE_DRYRUN=MERGE_TREE_CREATED_EPHEMERALLY"
if [[ "${BOTMODE_DRYRUN_DOCKER:-0}" == "1" ]]; then
  echo "BOTMODE_DRYRUN_DOCKER=START"
  docker buildx build --platform "linux/${BOTMODE_DRYRUN_ARCH:-amd64}" --target node --load --tag botmode-integrated-dryrun:local -f Dockerfile .
  docker run --rm --entrypoint node botmode-integrated-dryrun:local -e "const { createRequire } = require('node:module'); const fs = require('node:fs'); const requireApp = createRequire('/app/package.json'); const { chromium } = requireApp('playwright'); if (!fs.existsSync(chromium.executablePath())) throw Error('CHROMIUM_MISSING'); console.log('BOTMODE_DRYRUN_DOCKER_PLAYWRIGHT=PASS')"
  echo "BOTMODE_DRYRUN_DOCKER=PASS"
fi
if [[ "${BOTMODE_DRYRUN_E2E:-0}" == "1" ]]; then
  echo "BOTMODE_DRYRUN_INTEGRATED_E2E=START"
  npm ci --no-audit --no-fund
  npm run build:packages
  npm run build:client
  CI=true E2E_CHROMIUM_CHANNEL=chrome E2E_STREAM_STORE=memory timeout 1500s npx playwright test --config=e2e/playwright.config.mock.ts e2e/specs/mock/tool-approvals.spec.ts e2e/specs/mock/soft-default.spec.ts --workers=1 --retries=0
  echo "BOTMODE_DRYRUN_INTEGRATED_E2E=PASS"
fi
if [[ "${BOTMODE_DRYRUN_VALIDATE:-0}" == "1" ]]; then
  echo "BOTMODE_DRYRUN_INTEGRATED_VALIDATION=START"
  npm ci --ignore-scripts --no-audit --no-fund
  npm run build:data-provider
  npm exec --workspace=packages/api -- jest --runInBand --coverage=false --runTestsByPath src/files/documents/docxWorker.spec.ts src/files/documents/html.spec.ts src/files/documents/crud.spec.ts src/files/documents/zipSafety.spec.ts
  echo "BOTMODE_DRYRUN_INTEGRATED_VALIDATION=PASS"
  if [[ "${BOTMODE_DRYRUN_EXTENDED:-0}" == "1" ]]; then
    echo "BOTMODE_DRYRUN_EXTENDED_VALIDATION=START"
    npm run build:packages
    echo "BOTMODE_DRYRUN_AUTH_REGRESSION=START"
    timeout 180s npm exec --workspace=api -- jest --ci --runInBand --coverage=false --forceExit --runTestsByPath server/middleware/optionalShareFileAuth.spec.js
    echo "BOTMODE_DRYRUN_AUTH_REGRESSION=PASS"
    for shard in 1 2 3 4; do
      echo "BOTMODE_DRYRUN_BACKEND_SHARD=$shard/4"
      timeout 600s npm exec --workspace=api -- jest --ci --runInBand --coverage=false --forceExit --shard="$shard/4" --testPathIgnorePatterns=optionalShareFileAuth.spec.js
      echo "BOTMODE_DRYRUN_BACKEND_SHARD_PASS=$shard/4"
    done
    timeout 900s npm run test:client -- --runInBand --coverage=false --forceExit
    echo "BOTMODE_DRYRUN_EXTENDED_VALIDATION=PASS"
  fi
fi
echo "NOTES: Worktree and commit are destroyed on exit. This is not a CI pass."
