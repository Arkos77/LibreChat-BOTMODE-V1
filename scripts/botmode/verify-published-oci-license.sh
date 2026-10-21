#!/usr/bin/env bash
# Read-only evidence probe against the exact already-published candidate OCI image.
set -euo pipefail

IMAGE='ghcr.io/arkos77/librechat-botmode-v1@sha256:ee4af50a8baa8795509fb3c0abba362a104fbae7b0de5eac8a9f1afb8e4a60d0'
EXPECTED_COMMIT='5fb904d375bffd6c54b5830cb1536088a9e77211'
EXPECTED_SUL_SHA256='5aca9a36f98d883157f1d1a567347c3d776b7ae60bf93fbb7bfa190f1e3ccf46'

test "${CI:-}" = 'true' || { echo 'Run only on a disposable CI runner' >&2; exit 2; }
command -v docker >/dev/null
command -v sha256sum >/dev/null

scratch=$(mktemp -d)
cid=''
cleanup() {
  if [ -n "$cid" ]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# No login, source rebuild, mutable tag, or token needed.
docker logout ghcr.io >/dev/null 2>&1 || true
docker pull "$IMAGE" >/dev/null
echo 'BOTMODE_LICENSE_OCI_ANONYMOUS_DIGEST_PULL=PASS'
cid=$(docker create --entrypoint /bin/sh "$IMAGE" -c 'exit 0')

actual_commit=$(docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^BUILD_COMMIT=//p' | head -1)
if [ "$actual_commit" != "$EXPECTED_COMMIT" ]; then
  printf 'BOTMODE_LICENSE_BUILD_COMMIT=FAIL\n' >&2
  exit 1
fi
echo 'BOTMODE_LICENSE_BUILD_COMMIT=PASS'

# Notice of third-party rights must be delivered in the actual image.
if ! docker cp "$cid:/app/THIRD_PARTY_NOTICES.md" "$scratch/THIRD_PARTY_NOTICES.md" >/dev/null 2>&1; then
  echo 'BOTMODE_LICENSE_NOTICE_IN_IMAGE=MISSING' >&2
  exit 1
fi
grep -q '@codesandbox/nodebox@0.1.8' "$scratch/THIRD_PARTY_NOTICES.md"
grep -q 'Sustainable Use License' "$scratch/THIRD_PARTY_NOTICES.md"
echo 'BOTMODE_LICENSE_NOTICE_IN_IMAGE=PASS'

# After npm prune the package may be in the root or nested client installation.
found=0
for p in \
  /app/node_modules/@codesandbox/nodebox/LICENSE \
  /app/client/node_modules/@codesandbox/nodebox/LICENSE \
  /app/THIRD_PARTY_LICENSES/Nodebox-SUL-1.0.txt; do
  if docker cp "$cid:$p" "$scratch/Nodebox-LICENSE" >/dev/null 2>&1; then
    found=1
    break
  fi
done
if [ "$found" -ne 1 ]; then
  echo 'BOTMODE_LICENSE_FULL_SUL_TERMS_IN_IMAGE=MISSING' >&2
  exit 1
fi
actual_hash=$(sha256sum "$scratch/Nodebox-LICENSE" | cut -d' ' -f1)
if [ "$actual_hash" != "$EXPECTED_SUL_SHA256" ]; then
  echo 'BOTMODE_LICENSE_FULL_SUL_TERMS_IN_IMAGE=HASH_MISMATCH' >&2
  exit 1
fi
echo 'BOTMODE_LICENSE_FULL_SUL_TERMS_IN_IMAGE=PASS'
echo 'BOTMODE_NONCOMMERCIAL_LICENSE_DISTRIBUTION_EVIDENCE=PASS'
