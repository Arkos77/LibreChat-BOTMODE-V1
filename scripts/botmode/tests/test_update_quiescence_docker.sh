#!/usr/bin/env bash
# CI disposable integration: real Docker container states and genuine Redis job indexes.
set -euo pipefail
[[ "${CI:-}" == true && -n "${GITHUB_RUN_ID:-}" ]] || { echo 'CI_DISPOSABLE_ONLY_REFUSED'; exit 2; }
project="ci-botmode-update-${GITHUB_RUN_ID}"
redis="ci-botmode-redis-${GITHUB_RUN_ID}"
api="ci-botmode-running-api-${GITHUB_RUN_ID}"
temp=$(mktemp -d)
cleanup() {
  docker rm -f "$api" "$redis" >/dev/null 2>&1 || true
  rm -rf "$temp"
}
trap cleanup EXIT

mkdir -p "$temp/scripts/botmode" "$temp/bin"
cp update.sh "$temp/update.sh"
cp scripts/botmode/check-update-quiescence.sh "$temp/scripts/botmode/check-update-quiescence.sh"
cat > "$temp/bin/git" <<'GIT'
#!/usr/bin/env bash
case "$*" in
  "symbolic-ref --quiet --short HEAD") echo ci;;
  "status --porcelain") :;;
  "rev-parse --abbrev-ref --symbolic-full-name @{upstream}") echo origin/ci;;
  "pull --ff-only") echo 'GIT_PULL_ATTEMPTED' >> "$MOCK_GIT_LOG"; exit 0;;
  *) exit 8;;
esac
GIT
chmod +x "$temp/bin/git"
cat > "$temp/scripts/botmode/bootstrap.sh" <<'BOOT'
#!/usr/bin/env bash
printf 'UNSAFE_BOOTSTRAP_EXECUTED\n' >> "$MOCK_GIT_LOG"
BOOT
chmod +x "$temp/scripts/botmode/bootstrap.sh"
printf 'COMPOSE_PROJECT_NAME=%s\nUSE_REDIS=true\n' "$project" > "$temp/.env"
chmod 600 "$temp/.env"
export MOCK_GIT_LOG="$temp/operations.log"
export PATH="$temp/bin:$PATH"

# Entire test uses Docker-local state, no host mounts or user project volumes.
docker run -d --name "$redis" redis:7-alpine redis-server --save '' --appendonly no >/dev/null
for i in $(seq 1 25); do
  if docker exec "$redis" redis-cli ping 2>/dev/null | grep -q PONG; then break; fi
  sleep 1
done
docker exec "$redis" redis-cli ping | grep -q PONG
docker exec "$redis" redis-cli SADD stream:running ci-running >/dev/null
docker exec "$redis" redis-cli HSET 'stream:{ci-running}:job' status running createdAt 1 >/dev/null
docker exec "$redis" redis-cli SADD stream:requires_action ci-paused >/dev/null
docker exec "$redis" redis-cli HSET 'stream:{ci-paused}:job' status requires_action createdAt 2 >/dev/null

docker run -d --name "$api" \
  --label "com.docker.compose.project=$project" \
  --label com.docker.compose.service=api \
  redis:7-alpine sh -c 'sleep 120' >/dev/null

assert_refused() {
  local marker="$1" output
  if output=$(cd "$temp" && bash ./update.sh --no-pull 2>&1); then
    echo 'CI_UPDATE_DOCKER_UNEXPECTED_ALLOW=FAIL'
    exit 1
  fi
  if ! printf '%s\n' "$output" | grep -Fq "BOTMODE_UPDATE_REFUSED=$marker"; then
    echo 'CI_UPDATE_DOCKER_WRONG_REFUSAL=FAIL'
    exit 1
  fi
  test ! -f "$MOCK_GIT_LOG"
  test "$(docker exec "$redis" redis-cli HGET 'stream:{ci-running}:job' status | tr -d '\r')" = running
  test "$(docker exec "$redis" redis-cli HGET 'stream:{ci-paused}:job' status | tr -d '\r')" = requires_action
  test "$(docker exec "$redis" redis-cli SISMEMBER stream:running ci-running | tr -d '\r')" = 1
  test "$(docker exec "$redis" redis-cli SISMEMBER stream:requires_action ci-paused | tr -d '\r')" = 1
}
assert_refused API_NOT_QUIESCENT
echo 'CI_REAL_DOCKER_RUNNING_API_BEFORE_GIT_BLOCKED=PASS'
docker stop "$api" >/dev/null
assert_refused REDIS_INTERVERSION_NOT_QUALIFIED
echo 'CI_REAL_REDIS_RUNNING_AND_PAUSED_JOB_INDEXES_PRESERVED=PASS'
echo 'CI_REAL_REDIS_INTERVERSION_UPDATE_BLOCKED_BEFORE_GIT=PASS'
