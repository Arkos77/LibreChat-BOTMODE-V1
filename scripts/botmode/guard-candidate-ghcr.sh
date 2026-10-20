#!/usr/bin/env bash
# Read-only prepublication gate. Must run before any image digest is pushed.
set -euo pipefail

deny() {
  printf 'BOTMODE_GHCR_CANDIDATE_REFUSED=%s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || deny 'INVALID_SOURCE_SHA'
[[ "${GITHUB_REF_TYPE:-}" == 'branch' ]] || deny 'BRANCH_REF_REQUIRED'
[[ "${GITHUB_REPOSITORY_OWNER:-}" =~ ^[A-Za-z0-9-]+$ ]] || deny 'INVALID_OWNER'
expected="candidate-botmode-v1-${GITHUB_SHA:0:12}"
[[ "${CANDIDATE_TAG:-}" == "$expected" ]] || deny 'TAG_MUST_MATCH_EXACT_SOURCE'
command -v gh >/dev/null 2>&1 || deny 'GH_CLI_UNAVAILABLE'

# Failure to read the registry is not evidence that a tag is absent.
tags_file="$(mktemp "${RUNNER_TEMP:-/tmp}/botmode-existing-ghcr-tags.XXXXXX")"
trap 'rm -f "$tags_file"' EXIT
if ! gh api "users/${GITHUB_REPOSITORY_OWNER}/packages/container/librechat-botmode-v1/versions?per_page=100" \
  --paginate --jq '.[] | .metadata.container.tags[]?' > "$tags_file"; then
  deny 'CANNOT_VERIFY_EXISTING_TAGS'
fi

sha_tag="sha-${GITHUB_SHA:0:12}"
if grep -Fxq -- "$CANDIDATE_TAG" "$tags_file" || grep -Fxq -- "$sha_tag" "$tags_file"; then
  deny 'IMMUTABLE_TAG_ALREADY_PRESENT'
fi
echo 'BOTMODE_GHCR_TAG_PREPUBLICATION_GUARD=PASS'
