#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

ARCHIVE=""

usage() {
  cat <<'EOF'
Usage: scripts/botmode/audit-public-release.sh [--archive <path>]

Audits BOT MODE changes for common credential patterns without printing secret values.
With --archive, creates a tar.gz from tracked HEAD only (git archive).

Environment:
  BOTMODE_PUBLIC_AUDIT_BASE   Optional explicit upstream/base commit.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive)
      [ "$#" -ge 2 ] || { echo "Missing path after --archive" >&2; exit 2; }
      ARCHIVE=$2
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 3; }

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing public-release audit with tracked or staged changes." >&2
  exit 4
fi

BASE=${BOTMODE_PUBLIC_AUDIT_BASE:-}
if [ -z "$BASE" ]; then
  for ref in origin/dev origin/main; do
    if git rev-parse --verify -q "$ref" >/dev/null 2>&1; then
      BASE=$(git merge-base HEAD "$ref" || true)
      [ -n "$BASE" ] && break
    fi
  done
fi

if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "Unable to resolve an upstream audit base. Set BOTMODE_PUBLIC_AUDIT_BASE." >&2
  exit 4
fi

PATTERNS=(
  "github_pat_[A-Za-z0-9_]{20,}"
  "ghp_[A-Za-z0-9]{20,}"
  "sk-[A-Za-z0-9]{20,}"
  "AIza[0-9A-Za-z_-]{30,}"
  "xox[baprs]-[A-Za-z0-9-]{20,}"
  "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
)

COMBINED_PATTERN=$(IFS="|"; echo "${PATTERNS[*]}")
RISK=0

while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    .env.example|\
    packages/api/src/cdn/__tests__/cloudfront-cookies.test.ts|\
    packages/api/src/cdn/__tests__/cloudfront.test.ts|\
    packages/api/src/mcp/__tests__/mcp.spec.ts|\
    packages/api/src/utils/key.test.ts)
      printf 'REVIEWED_FIXTURE_PATH=%s\n' "$path"
      ;;
    *)
      printf 'UNEXPECTED_SECRET_PATTERN_PATH=%s\n' "$path" >&2
      RISK=1
      ;;
  esac
done < <(git grep -Il -E "$COMBINED_PATTERN" HEAD -- . 2>/dev/null | sed 's#^[^:]*:##' | sort -u || true)

while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    .env.example|search/.env.example|api/test/.env.test.example) ;;
    *)
      printf 'TRACKED_ENV_RISK=%s\n' "$path" >&2
      RISK=1
      ;;
  esac
done < <(git ls-files | grep -E '(^|/)\.env($|\.)' || true)

for pattern in "${PATTERNS[@]}"; do
  if git log "$BASE"..HEAD --format='%H' -G "$pattern" -- . 2>/dev/null | grep -q .; then
    printf 'HISTORY_SECRET_PATTERN=%s\n' "$pattern" >&2
    git log "$BASE"..HEAD --name-only --format= -G "$pattern" -- . 2>/dev/null \
      | sed '/^$/d' | sort -u | sed 's/^/HISTORY_PATH=/' >&2
    RISK=1
  fi
done

if git log "$BASE"..HEAD --format='%B' \
  | grep -Eq 'github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}'; then
  echo "SECRET_PATTERN_IN_COMMIT_MESSAGE=YES" >&2
  RISK=1
fi

if [ "$RISK" -ne 0 ]; then
  echo "BOTMODE_PUBLIC_RELEASE_AUDIT=FAIL" >&2
  exit 5
fi

printf 'BOTMODE_PUBLIC_RELEASE_AUDIT=PASS\n'
printf 'AUDIT_BASE=%s\n' "$(git rev-parse --short "$BASE")"
printf 'AUDIT_HEAD=%s\n' "$(git rev-parse --short HEAD)"
printf 'CUSTOM_COMMIT_COUNT=%s\n' "$(git rev-list --count "$BASE"..HEAD)"
printf 'UNTRACKED_LOCAL_COUNT=%s\n' "$(git status --short --untracked-files=all | grep '^??' | wc -l | tr -d ' ')"

if [ -n "$ARCHIVE" ]; then
  mkdir -p "$(dirname "$ARCHIVE")"
  git archive --format=tar.gz --output="$ARCHIVE" HEAD
  printf 'PUBLIC_ARCHIVE=%s\n' "$ARCHIVE"
  if command -v sha256sum >/dev/null 2>&1; then
    printf 'PUBLIC_ARCHIVE_SHA256=%s\n' "$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    printf 'PUBLIC_ARCHIVE_SHA256=%s\n' "$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
  fi
fi
