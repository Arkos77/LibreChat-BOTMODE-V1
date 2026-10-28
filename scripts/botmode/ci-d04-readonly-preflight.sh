#!/usr/bin/env bash
# D04 ASSESSMENT ONLY: no push, merge, tag creation, deployment or promotion.
set -euo pipefail
REPO='Arkos77/LibreChat-BOTMODE-V1'
IMAGE='ghcr.io/arkos77/librechat-botmode-v1'
SOURCE_SHA='7605e9186b84d4a7eb6d14be1bc9528c6033bbd8'
EXPECTED_DIGEST='sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1'
for tool in gh docker python3; do
  command -v "$tool" >/dev/null || { echo "D04_MISSING_TOOL=$tool"; exit 1; }
done
digest_of() {
  local dig
  dig="$(docker buildx imagetools inspect "$IMAGE:$1" | sed -nE 's/^Digest:[[:space:]]*(sha256:[a-f0-9]{64}).*$/\1/p' | head -1)"
  [[ "$dig" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "D04_DIGEST_UNAVAILABLE=$1" >&2; exit 1; }
  printf '%s' "$dig"
}
test "$(digest_of candidate-botmode-v1-7605e9186b84)" = "$EXPECTED_DIGEST"
test "$(digest_of sha-7605e9186b84)" = "$EXPECTED_DIGEST"
echo 'D04_D03_CANDIDATE_IMMUTABLE_DIGEST=PASS'
docker buildx imagetools inspect --raw "$IMAGE@$EXPECTED_DIGEST" |
 python3 -c 'import json,sys; p={(e.get("platform",{}).get("os"),e.get("platform",{}).get("architecture")) for e in json.load(sys.stdin).get("manifests",[])}; assert {("linux","amd64"),("linux","arm64")}.issubset(p),p'
echo 'D04_D03_CANDIDATE_MULTIARCH=PASS'
MAIN_SHA="$(gh api "repos/$REPO/branches/main" --jq '.commit.sha')"
test "$(gh api "repos/$REPO/branches/main" --jq '.protected')" = true
echo 'D04_MAIN_BRANCH_PROTECTED=PASS'
test "$(gh api "repos/$REPO/git/ref/heads/experiment/botmode-zod4-security-20261027" --jq '.object.sha')" = "$SOURCE_SHA"
echo 'D04_SOURCE_BRANCH_EXACT=PASS'
COMPARE_STATUS="$(gh api "repos/$REPO/compare/main...$SOURCE_SHA" --jq '.status')"
AHEAD="$(gh api "repos/$REPO/compare/main...$SOURCE_SHA" --jq '.ahead_by')"
TAG_SHA="$(gh api "repos/$REPO/git/ref/tags/v1.0.0" --jq '.object.sha')"
STABLE="$(digest_of stable)"
LATEST="$(digest_of latest)"
for id in 40750429460 40750154581 40757067711 40767920565 40769097230 40769106150; do
  status="$(gh api "repos/$REPO/actions/runs/$id" --jq '.conclusion')"
  if [ "$status" != success ]; then echo "D04_REQUIRED_RUN_NOT_PASS=$id"; exit 1; fi
done
echo 'D04_REQUIRED_SIX_EVIDENCE_RUNS=PASS'
test "$(digest_of stable)" = "$STABLE"
test "$(digest_of latest)" = "$LATEST"
echo 'D04_EXISTING_ALIASES_UNCHANGED=PASS'
echo "D04_MAIN_SHA=$MAIN_SHA"
echo "D04_SOURCE_SHA=$SOURCE_SHA"
echo "D04_SOURCE_AHEAD_OF_MAIN=$AHEAD"
echo "D04_COMPARE_STATUS=$COMPARE_STATUS"
echo "D04_GIT_V1_TAG_SHA=$TAG_SHA"
echo "D04_STABLE_DIGEST=$STABLE"
echo "D04_LATEST_DIGEST=$LATEST"
echo "D04_NEW_CANDIDATE_DIGEST=$EXPECTED_DIGEST"
if { [ "$COMPARE_STATUS" = identical ] || [ "$COMPARE_STATUS" = behind ]; } &&
 [ "$TAG_SHA" = "$SOURCE_SHA" ] &&
 [ "$STABLE" = "$EXPECTED_DIGEST" ] && [ "$LATEST" = "$EXPECTED_DIGEST" ]; then
  echo 'D04_PROVENANCE=ALIGNED_HUMAN_GO_STILL_REQUIRED'
else
  echo 'D04_PROVENANCE=BLOCKED'
  if [ "$COMPARE_STATUS" = ahead ] || [ "$COMPARE_STATUS" = diverged ]; then
    echo 'D04_CANDIDATE_SOURCE_NOT_ON_MAIN=BLOCKED'
  fi
  if [ "$TAG_SHA" != "$SOURCE_SHA" ]; then echo 'D04_OLD_V1_TAG_DIFFERENT=BLOCKED'; fi
  if [ "$STABLE" != "$EXPECTED_DIGEST" ] || [ "$LATEST" != "$EXPECTED_DIGEST" ]; then
    echo 'D04_STABLE_LATEST_EXISTING_ALIAS_DRIFT=BLOCKED'
  fi
fi
echo 'D04_READ_ONLY_ASSESSMENT=PASS'
