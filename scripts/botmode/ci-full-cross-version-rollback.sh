#!/usr/bin/env bash
# Disposable CI only: check prior/current immutable API images on one restored Full MongoDB.
set -euo pipefail
[[ "${CI:-}" == true && -n "${GITHUB_RUN_ID:-}" ]] || { echo 'CI_ONLY_REFUSED'; exit 2; }
test -f "${RUNNER_TEMP:?}/restore-compose.yml"
old='ghcr.io/arkos77/librechat-botmode-v1@sha256:e76d39172c62b543756c6f9af740a9e43b4289a0990af879234acae295788c9a'
new='ghcr.io/arkos77/librechat-botmode-v1@sha256:ee4af50a8baa8795509fb3c0abba362a104fbae7b0de5eac8a9f1afb8e4a60d0'
compose() {
  local image=$1; shift
  sudo env -u BOTMODE_MONGO_PASSWORD -u POSTGRES_PASSWORD -u MEILI_MASTER_KEY \
    "BOTMODE_IMAGE=$image" BOTMODE_HOST_PORT=3090 ADMIN_PANEL_PORT=3091 \
    docker compose -f docker-compose.botmode.yml \
    -f "$RUNNER_TEMP/restore-compose.yml" "$@"
}
check_state() {
  compose "$new" exec -T mongodb sh -ec 'exec mongosh --quiet -u botmode_admin -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin LibreChat' <<'JS'
const owner=ObjectId("665000000000000000000123");
const agent=db.agents.findOne({id:"botmode-worker",author:owner});
const acl=agent&&db.aclentries.findOne({resourceId:agent._id,principalId:owner,resourceType:"agent"});
const epoch=db.restore_epoch_ci.countDocuments({_id:"api-restore-boot",state:"committed"});
const agents=db.ci_restore_agents.countDocuments({checkpoint:"epoch-001"});
const acls=db.ci_restore_acls.countDocuments({principal:"ci-test-user"});
if(!agent||!acl||epoch!==1||agents!==6||acls!==6){print("CI_FULL_ACL_STATE=FAIL");quit(44)}
print("CI_FULL_ACL_STATE=PASS");
JS
}
boot() {
  local image=$1
  compose "$image" up -d --no-deps --force-recreate api >/dev/null
  local cid
  cid=$(compose "$image" ps -q api)
  test -n "$cid"
  test "$(sudo docker inspect "$cid" --format '{{.Config.Image}}')" = "$image"
  local ok=0
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 5 http://127.0.0.1:3090/api/config >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [[ "$ok" != 1 ]]; then echo "CI_FULL_API_DOWNGRADE_HTTP=FAIL"; return 1; fi
  check_state
}
# Exact registry digest, never a moving tag; no user volumes are mounted.
sudo docker logout ghcr.io >/dev/null 2>&1 || true
sudo docker pull "$old" >/dev/null
boot "$new"
echo 'CI_FULL_CROSS_VERSION_BASELINE=PASS'
boot "$old"
echo 'CI_FULL_PRIOR_API_RESTORED_MONGO=PASS'
boot "$new"
echo 'CI_FULL_CURRENT_API_RETURN_AFTER_DOWNGRADE=PASS'
echo 'SCOPE=CI-only Full Mongo8 restored same-schema data, API new-old-new, Worker ACL; not arbitrary migrations, Redis in-flight or external inference'
