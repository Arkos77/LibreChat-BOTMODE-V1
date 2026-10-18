#!/usr/bin/env bash
# Disposable GitHub Actions only: approved experimental source SHA 13edaa4f4
set -euo pipefail
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^botmode-ci-digest-[0-9]+-[0-9]+$ ]] || { echo 'NON_ISOLATED_PROJECT' >&2; exit 2; }
[[ "${BOTMODE_HOST_PORT:-}" == 3090 ]] || exit 2
repo=ghcr.io/arkos77/librechat-botmode-v1
candidate="$repo@sha256:94b11ff0bc8f5820b803741f5a52c96a5e265c2994bb268ee565ba35444cee3a"
older_tag="$repo:sha-d4e82dded5df"
docker logout ghcr.io >/dev/null 2>&1 || true
docker pull "$older_tag"
older="$(docker image inspect "$older_tag" --format '{{index .RepoDigests 0}}')"
case "$older" in "$repo"@sha256:*) ;; *) exit 1;; esac
test "$older" != "$candidate"
export BOTMODE_IMAGE="$candidate"
compose=(sudo --preserve-env=BOTMODE_MONGO_PASSWORD,POSTGRES_PASSWORD,BOTMODE_HOST_PORT,COMPOSE_PROJECT_NAME,BOTMODE_IMAGE docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml)
mongo_before="$("${compose[@]}" ps -q mongodb)"
test -n "$mongo_before"
ready_api() {
  local ready=0
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 5 http://127.0.0.1:3090/api/config >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
  done
  test "$ready" = 1
}
verify_marker() {
  local count
  count="$("${compose[@]}" exec -T mongodb sh -ec '
    mongo --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin LibreChat --eval "$1"
  ' sh 'print(db.rollback_ci.countDocuments({_id:"rollback-smoke",payload:"preserved"}))' | tail -1 | tr -d '\r')"
  test "$count" = 1
}
for target in "$older" "$candidate"; do
  export BOTMODE_IMAGE="$target"
  "${compose[@]}" up -d --no-deps --force-recreate api
  api_id="$("${compose[@]}" ps -q api)"
  test -n "$api_id"
  test "$(sudo docker inspect "$api_id" --format '{{.Config.Image}}')" = "$target"
  test "$("${compose[@]}" ps -q mongodb)" = "$mongo_before"
  ready_api
  verify_marker
done
echo 'BOTMODE_STAGING_IMAGE_OLD_NEW_ROLLBACK=PASS'
echo 'SCOPE=isolated API downgrade+return, same Mongo4.4 marker only; NOT full schema/agent/Redis rollback'
