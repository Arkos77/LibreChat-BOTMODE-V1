#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"
git pull --ff-only
exec ./scripts/botmode/bootstrap.sh "$@"
