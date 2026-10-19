#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"
# A pinned release/tag is intentionally detached: do not silently switch it
# to a moving branch or attempt a pull without an upstream.
if ! branch=$(git symbolic-ref --quiet --short HEAD); then
  echo "BOTMODE update refused: detached HEAD (pinned commit/tag)." >&2
  echo "Select a validated release explicitly before updating." >&2
  exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "BOTMODE update refused: working tree has local changes." >&2
  exit 2
fi
if ! git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
  echo "BOTMODE update refused: branch '$branch' has no configured upstream." >&2
  exit 2
fi
# Strictly before any change to the checkout or containers.
bash ./scripts/botmode/check-update-quiescence.sh
git pull --ff-only
# A second safety check covers state changes during remote fetch.
bash ./scripts/botmode/check-update-quiescence.sh
exec ./scripts/botmode/bootstrap.sh "$@"
