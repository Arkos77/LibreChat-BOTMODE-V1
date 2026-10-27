#!/usr/bin/env python3
"""One fail-closed real-free native subagent -> durable child -> Oracle -> P6 CI gate.

Only for an explicitly dispatched disposable GitHub runner. Never logs credentials,
prompts, model text, tool arguments or user identifiers.
"""
import json
import os
import runpy
import subprocess
import sys
import time
import uuid
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = "liquid/lfm-2.5-2.6b:free"
API = "https://openrouter.ai/api/v1"
METRICS = "http://127.0.0.1:8088/metrics"
STATE = Path("/tmp/botmode-native-free-price-preflight.json")


def fail(reason):
    raise SystemExit("CI_NATIVE_REAL_FAIL=" + reason)


def api_json(path, key=None):
    headers = {"Accept": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    with urlopen(Request(API + path, headers=headers), timeout=25) as resp:
        return json.load(resp)


def quota_and_price():
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if len(key) < 17:
        fail("SECRET_MISSING")
    info = api_json("/key", key).get("data") or {}
    remaining = (info.get("free_model_daily_requests") or {}).get("remaining")
    if info.get("is_management_key") or type(remaining) is not int or remaining < 4:
        fail("FREE_DAILY_QUOTA_NOT_CONFIRMED_FOR_FOUR_REQUESTS")
    matches = [m for m in api_json("/models").get("data", []) if m.get("id") == MODEL]
    if len(matches) != 1:
        fail("NAMED_FREE_MODEL_MISSING")
    prices = matches[0].get("pricing") or {}
    if any(Decimal(str(prices.get(k, "1"))) != 0 for k in ("prompt", "completion")):
        fail("MODEL_HAS_POSITIVE_PRICE")
    params = matches[0].get("supported_parameters") or []
    if not all(x in params for x in ("tools", "tool_choice")):
        fail("MODEL_CANNOT_GENERATE_NATIVE_TOOL_CALL")
    return {k: str(info[k]) for k in ("usage", "usage_daily") if info.get(k) is not None}


def metrics():
    with urlopen(METRICS, timeout=8) as resp:
        return json.load(resp)


def read_p6(stream_id, helpers):
    command = helpers["COMPOSE"] + [
        "exec", "-T", "redis", "redis-cli", "--raw", "HMGET",
        helpers["REDIS_PHYSICAL_PREFIX"] + "generation:job:" + stream_id,
        "status", "orchestratorPlan", "missionOracleState",
        "responseMessageId", "terminalPersistencePending",
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=25)
    if result.returncode:
        fail("P6_REDIS_READ_FAILED")
    fields = result.stdout.splitlines()
    if len(fields) < 5:
        fail("P6_REDIS_FIELDS_ABSENT")
    return fields[:5]


def verify_parent_message(parent_id, message_id, helpers):
    js = r"""
const mongoose = require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const db=mongoose.connection.db;
  const cid=process.env.CI_REAL_PARENT_ID;
  const mid=process.env.CI_REAL_RESPONSE_ID;
  const conversation=await db.collection('conversations').findOne({conversationId:cid});
  const message=await db.collection('messages').findOne(
    {conversationId:cid,messageId:mid,isCreatedByUser:false},
    {projection:{messageId:1,parentMessageId:1,content:1,unfinished:1}}
  );
  const valid=Boolean(conversation && message && message.unfinished===false &&
    typeof message.parentMessageId==='string' && message.parentMessageId &&
    Array.isArray(message.content) && message.content.some(
      x=>x.type==='text' && typeof x.text==='string' && x.text.trim()));
  console.log('CI_NATIVE_REAL_P6_PARENT_MONGO_COMMITTED='+String(valid).toUpperCase());
  await mongoose.disconnect();
  if (!valid) process.exitCode=3;
})().catch(e=>{console.log('CI_NATIVE_REAL_MONGO_ERROR_CLASS='+e.name);process.exitCode=2});
"""
    p = subprocess.run(helpers["COMPOSE"] + [
        "exec", "-T", "-e", "CI_REAL_PARENT_ID=" + parent_id,
        "-e", "CI_REAL_RESPONSE_ID=" + message_id,
        "api", "node", "-e", js,
    ], capture_output=True, text=True, timeout=65)
    for line in p.stdout.splitlines():
        if line.startswith("CI_NATIVE_REAL_"):
            print(line, flush=True)
    if p.returncode:
        fail("P6_PARENT_MONGO_READBACK_FAILED")


def live_gate():
    if os.environ.get("CI_NATIVE_REAL_INTEGRATED") != "1":
        fail("EXPLICIT_OPT_IN_REQUIRED")
    if os.environ.get("CI_REAL_FREE_PROVIDER") != "1":
        fail("LIVE_PROVIDER_RELAY_NOT_ENABLED")
    before = json.loads(STATE.read_text())
    baseline = metrics()
    helpers = runpy.run_path(
        "scripts/botmode/ci-oracle-delegated-mission-gate.py",
        run_name="ci_integrated_helpers",
    )
    worker = Path("/tmp/botmode-ci-worker-id").read_text().strip()
    child = Path("/tmp/botmode-ci-child-id").read_text().strip()
    if not worker or not child or worker == child:
        fail("NATIVE_AGENT_IDENTITIES_INVALID")
    mission_id = "ci-native-real-" + str(uuid.uuid4())
    parent_id = str(uuid.uuid4())
    task_id = mission_id + "/main"
    payload = {
        "endpoint": "agents", "agent_id": worker, "conversationId": parent_id,
        "messageId": str(uuid.uuid4()),
        "parentMessageId": "00000000-0000-0000-0000-000000000000",
        "isNewConvo": True,
        "text": (
            "Tu DOIS utiliser l'outil natif subagent exactement une fois pour demander "
            "au spécialiste autorisé de retourner le JSON exact {\"ok\":true}. "
            "Attends son résultat, puis retourne seulement {\"ok\":true}. "
            "Ne publie rien avant son retour."
        ),
        "orchestratorMission": {
            "mission": {
                "missionId": mission_id, "taskId": mission_id,
                "objective": "Délégation native réelle, confirmation enfant, Oracle et publication unique.",
                "constraints": ["Appeler subagent avant toute réponse finale", "Répondre exclusivement en JSON strict."],
                "requiredCapabilities": ["basic"],
                "validation": {"criteria": [{"id": "ci-ok", "field": "ok", "expected": True}]},
            },
            "plannerContext": {
                "worker": {
                    "id": "ci-worker", "agentId": worker, "role": "worker",
                    "capabilities": ["basic"], "constraints": [],
                },
                "specialists": [{
                    "id": child, "agentId": child, "role": "specialist",
                    "capabilities": ["research_specialist_ci"], "constraints": [],
                }],
            },
        },
    }
    status, raw = helpers["request"]("POST", "/api/agents/chat/agents", payload)
    if status != 200:
        print("CI_NATIVE_REAL_MISSION_HTTP=" + str(status), flush=True)
        fail("MISSION_ADMISSION_DENIED")
    try:
        start = json.loads(raw)
        stream_id = start["streamId"]
        if start.get("status") != "started" or not isinstance(stream_id, str) or not stream_id:
            raise ValueError("missing start")
    except (KeyError, ValueError, TypeError):
        fail("MISSION_START_ENVELOPE_INVALID")
    print("CI_NATIVE_REAL_SINGLE_MISSION_STARTED=PASS", flush=True)
    sse_status, raw_sse = helpers["request"](
        "GET", "/api/agents/chat/stream/" + stream_id + "?resume=true")
    events = helpers["result_events"](raw_sse)
    finals = [e for e in events if e.get("final") is True]
    errors = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
    if sse_status != 200 or len(finals) != 1 or errors:
        print("CI_NATIVE_REAL_SSE_HTTP=" + str(sse_status), flush=True)
        print("CI_NATIVE_REAL_SSE_FINAL_COUNT=" + str(len(finals)), flush=True)
        print("CI_NATIVE_REAL_SSE_ERROR_COUNT=" + str(len(errors)), flush=True)
        fail("NATIVE_MISSION_TERMINAL_STREAM_INVALID")
    print("CI_NATIVE_REAL_ONE_FINAL_EVENT=PASS", flush=True)
    started = [e.get("data") for e in events if e.get("event") == "on_subagent_update"
               and isinstance(e.get("data"), dict) and e["data"].get("phase") == "start"]
    ended = [e.get("data") for e in events if e.get("event") == "on_subagent_update"
             and isinstance(e.get("data"), dict) and e["data"].get("phase") == "stop"]
    if not any(s.get("subagentAgentId") == child and s.get("parentRunId") and
               s.get("parentToolCallId") and s.get("subagentRunId") and
               any(e.get("subagentRunId") == s["subagentRunId"] for e in ended)
               for s in started):
        fail("NATIVE_CHILD_START_STOP_SSE_NOT_CORRELATED")
    print("CI_NATIVE_REAL_CHILD_SSE_CORRELATED=PASS", flush=True)
    after = metrics()
    attempts = after.get("provider_requests", 0) - baseline.get("provider_requests", 0)
    if type(attempts) is not int or not 3 <= attempts <= 4:
        fail("REAL_PROVIDER_REQUEST_COUNT_NOT_BOUNDED_THREE_TO_FOUR")
    with urlopen("http://127.0.0.1:8088/provider-diagnostics", timeout=8) as diagnostic_response:
        diagnostics = json.load(diagnostic_response)
    records = diagnostics.get("records") or []
    if len(records) != attempts or any(r.get("http_status") != 200 for r in records):
        fail("REAL_PROVIDER_RESPONSES_NOT_ALL_200")
    if not any("subagent" in (r.get("tool_names") or []) for r in records):
        fail("REAL_PROVIDER_TOOL_CALL_NOT_OBSERVED")
    if any(Decimal(str((r.get("usage") or {}).get("cost", 0))) > 0 for r in records):
        fail("REAL_PROVIDER_POSITIVE_COST")
    print("CI_NATIVE_REAL_PROVIDER_TOOL_ACTUALLY_CALLED=PASS", flush=True)
    print("CI_NATIVE_REAL_PROVIDER_REQUESTS=" + str(attempts), flush=True)

    status, raw_plan, raw_oracle, response_id, pending = read_p6(stream_id, helpers)
    if status != "complete" or not response_id.strip() or pending.strip() not in ("0", "false", "False"):
        fail("P6_NOT_DURABLY_COMMITTED")
    try:
        plan, state = json.loads(raw_plan), json.loads(raw_oracle)
        tasks = plan["tasks"]
        verdicts = state["results"][task_id]["verdicts"]
        verified = (
            plan["mission"]["missionId"] == mission_id and
            len(tasks) == 1 and tasks[0].get("agentId") == worker and
            len(verdicts) == 1 and verdicts[0].get("status") == "VERIFIED"
        )
    except (TypeError, KeyError, ValueError, IndexError):
        verified = False
    if not verified:
        fail("SAME_MISSION_NATIVE_ORACLE_VERDICT_NOT_VERIFIED")
    print("CI_NATIVE_REAL_SAME_MISSION_ORACLE_VERIFIED=PASS", flush=True)
    helpers["verify_mongo_child_lineage"](parent_id, "BEFORE_RESTART")
    verify_parent_message(parent_id, response_id, helpers)
    print("CI_NATIVE_REAL_P6_SINGLE_PUBLISHED_MESSAGE=PASS", flush=True)
    helpers["verify_lineage_across_api_restart"](parent_id)
    status2, _, raw_oracle2, response_id2, pending2 = read_p6(stream_id, helpers)
    if status2 != status or raw_oracle2 != raw_oracle or response_id2 != response_id or pending2 != pending:
        fail("ORACLE_P6_STATE_CHANGED_AFTER_RESTART")
    verify_parent_message(parent_id, response_id, helpers)
    print("CI_NATIVE_REAL_ORACLE_P6_SURVIVES_API_RESTART=PASS", flush=True)
    current = quota_and_price()
    for key, value in before.items():
        if key in current and Decimal(current[key]) > Decimal(value):
            fail("POSITIVE_ACCOUNT_SPEND_DETECTED")
    print("CI_NATIVE_REAL_NO_POSITIVE_ACCOUNT_SPEND_DETECTED=PASS", flush=True)
    print("BOTMODE_REAL_FREE_NATIVE_CHILD_ORACLE_P6_RESTART=PASS", flush=True)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--preflight"]:
            STATE.write_text(json.dumps(quota_and_price()))
            print("CI_NATIVE_REAL_FREE_PRICE_TOOL_QUOTA=PASS", flush=True)
        elif not sys.argv[1:]:
            live_gate()
        else:
            fail("UNSUPPORTED_ARGS")
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, ArithmeticError) as err:
        print("CI_NATIVE_REAL_UPSTREAM_OR_IO_CLASS=" + type(err).__name__, flush=True)
        fail("PROVIDER_OR_TRANSPORT_FAILURE")
