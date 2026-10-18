#!/usr/bin/env python3
"""Strict external OpenRouter/free delegated-child → Oracle CI gate.

Executed only on explicit workflow_dispatch. This does not emulate inference,
fabricate model metrics, or accept Oracle success without Mongo child lineage.
Never prints prompts, provider responses, JWTs, or API credentials.
"""
import json
import os
import runpy
import time
import uuid
from pathlib import Path

if os.environ.get("CI_EXTERNAL_FREE_PROVIDER") != "true":
    raise SystemExit("CI_LIVE_FREE_GATE_REFUSED=NOT_EXPLICITLY_ENABLED")

helpers = runpy.run_path("scripts/botmode/ci-oracle-delegated-mission-gate.py", run_name="ci_helpers")
request = helpers["request"]
result_events = helpers["result_events"]
redis_job = helpers["redis_job"]
response_text = helpers["response_text"]
verify_mongo_child_lineage = helpers["verify_mongo_child_lineage"]
verify_lineage_across_api_restart = helpers["verify_lineage_across_api_restart"]

worker = Path("/tmp/botmode-ci-worker-id").read_text().strip()
child = Path("/tmp/botmode-ci-child-id").read_text().strip()
mission_id = "ci-live-free-" + str(uuid.uuid4())
conversation_id = str(uuid.uuid4())
task_id = mission_id + "/main"
mission = {
    "missionId": mission_id,
    "taskId": mission_id,
    "objective": "Déléguer obligatoirement à un spécialiste autorisé en utilisant l'outil subagent, attendre sa réponse, puis produire le JSON exact demandé.",
    "constraints": ["Ne pas inventer une réponse du spécialiste", "Retour final JSON strict : {\"ok\":true}"],
    "requiredCapabilities": ["basic"],
    "validation": {"criteria": [{"id": "ci-ok", "field": "ok", "expected": True}]},
}
payload = {
    "endpoint": "agents",
    "agent_id": worker,
    "conversationId": conversation_id,
    "messageId": str(uuid.uuid4()),
    "parentMessageId": "00000000-0000-0000-0000-000000000000",
    "isNewConvo": True,
    "text": "Cette mission exige l'appel de l'outil subagent pour faire participer le spécialiste autorisé. Après cette délégation, retourne strictement {\"ok\":true}. Ne saute pas la délégation.",
    "orchestratorMission": {
        "mission": mission,
        "plannerContext": {
            "worker": {"id": "ci-worker", "agentId": worker, "role": "worker", "capabilities": ["basic"], "constraints": []},
            "specialists": [
                {"id": child, "agentId": child, "role": "specialist", "capabilities": ["basic"], "constraints": []}
            ],
        },
    },
}
status, raw = request("POST", "/api/agents/chat/agents", payload)
if status != 200:
    print("CI_LIVE_FREE_MISSION_START_HTTP=" + str(status), flush=True)
    raise SystemExit("CI_LIVE_FREE_FAIL=MISSION_NOT_ADMITTED")
try:
    envelope = json.loads(raw)
    stream_id = envelope["streamId"]
    if envelope.get("status") != "started" or not isinstance(stream_id, str) or not stream_id:
        raise ValueError("bad stream")
except (ValueError, KeyError, TypeError):
    raise SystemExit("CI_LIVE_FREE_FAIL=INVALID_START_ENVELOPE")
print("CI_LIVE_FREE_MISSION_STARTED=PASS", flush=True)

stream_status, sse = request("GET", "/api/agents/chat/stream/" + stream_id + "?resume=true")
events = result_events(sse)
finals = [e for e in events if e.get("final") is True]
errors = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
print("CI_LIVE_FREE_SSE_HTTP=" + str(stream_status), flush=True)
print("CI_LIVE_FREE_FINAL_COUNT=" + str(len(finals)), flush=True)
print("CI_LIVE_FREE_ERROR_FRAME_COUNT=" + str(len(errors)), flush=True)
if stream_status != 200 or len(finals) != 1 or errors:
    classes, _, _ = helpers["diagnostic_error_class"](events)
    print("CI_LIVE_FREE_ERROR_CLASSES=" + classes, flush=True)
    raise SystemExit("CI_LIVE_FREE_FAIL=NO_CLEAN_SINGLE_TERMINAL")

durable = None
for _ in range(30):
    _, raw_plan, raw_state = redis_job(stream_id)
    if raw_plan and raw_state:
        try:
            plan, state = json.loads(raw_plan), json.loads(raw_state)
            verdicts = state.get("results", {}).get(task_id, {}).get("verdicts", [])
            if verdicts:
                durable = (plan, verdicts)
                break
        except (TypeError, ValueError, AttributeError):
            pass
    time.sleep(1)
if durable is None:
    raise SystemExit("CI_LIVE_FREE_FAIL=ORACLE_NOT_DURABLE")
plan, verdicts = durable
if (plan.get("mission", {}).get("missionId") != mission_id or
        len(verdicts) != 1 or verdicts[0].get("status") != "VERIFIED"):
    print("CI_LIVE_FREE_ORACLE_VERDICTS=" + str(len(verdicts)), flush=True)
    raise SystemExit("CI_LIVE_FREE_FAIL=ORACLE_NOT_VERIFIED")
if not any(response_text(e.get("responseMessage")).strip()
           for e in finals if isinstance(e.get("responseMessage"), dict)):
    raise SystemExit("CI_LIVE_FREE_FAIL=NO_PUBLISHED_RESPONSE")
print("CI_LIVE_FREE_ORACLE_VERIFIED_AND_PUBLISHED=PASS", flush=True)

# The exact matching Mongo thread, not a model-generated claim, proves the
# delegated child executed and had a terminal checkpoint.
for i in range(20):
    try:
        verify_mongo_child_lineage(conversation_id, "LIVE_FREE_PRE_RESTART")
        break
    except SystemExit:
        if i == 19:
            raise SystemExit("CI_LIVE_FREE_FAIL=CHILD_LINEAGE_NOT_DURABLE")
        time.sleep(2)
verify_lineage_across_api_restart(conversation_id)
print("BOTMODE_LIVE_FREE_EXTERNAL_CHILD_ORACLE=PASS", flush=True)
