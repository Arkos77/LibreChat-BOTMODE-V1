#!/usr/bin/env python3
"""Synthetic OCI regression: five ordered native tasks, one authorized specialist binding.

No external model inference. Strictly distinguishes SDK graph traversal from
hosted free-provider behavior; no model output, credentials or IDs are logged.
"""
import json
import runpy
import time
import uuid
from pathlib import Path

h = runpy.run_path("scripts/botmode/ci-oracle-delegated-mission-gate.py", run_name="ci_five_helpers")
request, events_from_sse, redis_job = h["request"], h["result_events"], h["redis_job"]
worker = Path("/tmp/botmode-ci-worker-id").read_text().strip()
specialist = Path("/tmp/botmode-ci-child-id").read_text().strip()
mission_id = "ci-native-five-" + str(uuid.uuid4())
conversation_id = str(uuid.uuid4())
keys = ["worker"] + ["specialist_" + str(n) for n in range(1, 5)]
objectives = [{
    "key": key,
    "objective": "Retourne exclusivement l'objet JSON de validation {\"ok\":true}.",
    "requiredCapabilities": ["basic"] if key == "worker" else ["research_specialist_ci"],
    "dependsOn": [] if index == 0 else [keys[index - 1]],
} for index, key in enumerate(keys)]
payload = {
    "endpoint": "agents", "agent_id": worker,
    "conversationId": conversation_id, "messageId": str(uuid.uuid4()),
    "parentMessageId": "00000000-0000-0000-0000-000000000000",
    "isNewConvo": True,
    "text": "Execute ces cinq etapes dependantes. JSON exact par etape.",
    "orchestratorMission": {
        "mission": {
            "missionId": mission_id, "taskId": mission_id,
            "objective": "Cinq etapes sequentielles, verifier chaque sortie avant publication.",
            "constraints": ["Retourne JSON strict uniquement."],
            "requiredCapabilities": ["basic", "research_specialist_ci"],
            "objectives": objectives,
            "validation": {"criteria": [{"id": "ci-ok", "field": "ok", "expected": True}]},
        },
        "plannerContext": {
            "worker": {"id": "ci-worker", "agentId": worker,
                       "role": "worker", "capabilities": ["basic"], "constraints": []},
            "specialists": [{"id": specialist, "agentId": specialist,
                             "role": "specialist", "capabilities": ["research_specialist_ci"],
                             "constraints": []}],
        },
    },
}
# The preceding archival gate restarts the container. Probe readiness without
# replaying a mutating mission POST after an ambiguous connection reset.
from urllib.request import urlopen
from urllib.error import HTTPError, URLError
api_ready = False
for _ in range(60):
    try:
        with urlopen(h["BASE"] + "/api/config", timeout=3) as response:
            api_ready = response.status == 200
    except (URLError, HTTPError, ConnectionError, TimeoutError, OSError):
        api_ready = False
    if api_ready:
        break
    time.sleep(1)
assert api_ready, "CI_FIVE_NATIVE_API_NOT_READY_AFTER_RESTART"
print("CI_FIVE_NATIVE_API_RESTART_READY=PASS", flush=True)
status, raw = request("POST", "/api/agents/chat/agents", payload)
assert status == 200, "CI_FIVE_NATIVE_ADMISSION_FAILED"
envelope = json.loads(raw)
assert envelope.get("status") == "started" and envelope.get("streamId"), "CI_FIVE_NATIVE_MISSING_STREAM"
sid = envelope["streamId"]
print("CI_FIVE_NATIVE_ADMISSION=PASS", flush=True)
status, raw_sse = request("GET", "/api/agents/chat/stream/" + sid + "?resume=true")
events = events_from_sse(raw_sse)
finals = [e for e in events if isinstance(e, dict) and e.get("final") is True]
err_frames = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
assert status == 200 and len(finals) == 1 and not err_frames, "CI_FIVE_NATIVE_TERMINAL_FRAME_DENIED"
content = finals[0].get("responseMessage", {}).get("content", [])
assert isinstance(content, list) and not any(
    isinstance(p, dict) and p.get("type") == "error" for p in content
), "CI_FIVE_NATIVE_TERMINAL_ERROR_PART"
verified = False
for _ in range(20):
    job_status, raw_plan, raw_state = redis_job(sid)
    if raw_plan and raw_state:
        plan, oracle = json.loads(raw_plan), json.loads(raw_state)
        tasks = plan.get("tasks", [])
        results = oracle.get("results", {})
        assignments = {t.get("key"): t for t in tasks if isinstance(t, dict)}
        actual_keys = set(assignments)
        expected_ids = {mission_id + "/" + key for key in keys}
        valid = (
            job_status in ("complete", "completed")
            and len(tasks) == 5 and len(actual_keys) == 5
            and actual_keys == set(keys) and set(results) == expected_ids
            and plan.get("strategy") == "SEQUENTIAL"
            and all(
                assignments[key]["taskId"] == mission_id + "/" + key
                and assignments[key]["agentId"] == (worker if i == 0 else specialist)
                and assignments[key].get("dependsOn") == ([] if i == 0 else [keys[i - 1]])
                and len(results[mission_id + "/" + key].get("verdicts", [])) == 1
                and results[mission_id + "/" + key]["verdicts"][0].get("status") == "VERIFIED"
                for i, key in enumerate(keys)
            )
        )
        if valid:
            verified = True
            break
    time.sleep(1)
if not verified:
    print("CI_FIVE_NATIVE_PERSISTED_VERDICT_COUNT=" + str(len(results) if 'results' in locals() else 0), flush=True)
    raise SystemExit("CI_FIVE_NATIVE_GRAPH_ORACLE_NOT_COMPLETE")
print("CI_FIVE_NATIVE_SEQUENTIAL_GRAPH=PASS", flush=True)
print("CI_FIVE_NATIVE_FIVE_ORACLE_VERDICTS=PASS", flush=True)
