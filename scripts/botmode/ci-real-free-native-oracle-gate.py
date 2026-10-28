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

MODEL = "nvidia/nemotron-3.5-super-vl:free"
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


def quota_and_price(min_remaining=4):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if len(key) < 17:
        fail("SECRET_MISSING")
    info = api_json("/key", key).get("data") or {}
    remaining = (info.get("free_model_daily_requests") or {}).get("remaining")
    if info.get("is_management_key") or type(remaining) is not int or remaining < min_remaining:
        fail("FREE_DAILY_QUOTA_NOT_CONFIRMED_FOR_FOUR_REQUESTS")
    matches = [m for m in api_json("/models").get("data", []) if m.get("id") == MODEL]
    if len(matches) != 1:
        fail("NAMED_FREE_MODEL_MISSING")
    prices = matches[0].get("pricing") or {}
    if any(Decimal(str(prices.get(k, "1"))) != 0 for k in ("prompt", "completion")):
        fail("MODEL_HAS_POSITIVE_PRICE")
    params = matches[0].get("supported_parameters") or []
    if not all(x in params for x in ("tools", "tool_choice", "response_format", "structured_outputs")):
        fail("MODEL_CANNOT_GENERATE_NATIVE_TOOL_CALL")
    return {k: str(info[k]) for k in ("usage", "usage_daily") if info.get(k) is not None}


def metrics():
    with urlopen(METRICS, timeout=8) as resp:
        return json.load(resp)


def read_p6(stream_id, helpers):
    command = helpers["COMPOSE"] + [
        "exec", "-T", "redis", "redis-cli", "--raw", "HMGET",
        helpers["REDIS_PHYSICAL_PREFIX"] + "stream:{" + stream_id + "}:job",
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


def read_native_terminal_stream(helpers, stream_id):
    """Observe one already-admitted mission; reconnect only GET, never POST.

    LibreChat can close an SSE subscription after returning a nonterminal
    event. EOF is not mission failure. Reattach with resume=true, bounded by
    elapsed time; retain nonduplicated child start/stop events for correlation.
    """
    import socket
    url = helpers["BASE"] + "/api/agents/chat/stream/" + stream_id + "?resume=true"
    req = Request(url, headers={
        "Authorization": "Bearer " + helpers["TOKEN"],
        "User-Agent": helpers["UA"],
        "Accept": "text/event-stream",
    }, method="GET")
    # Up to four upstream free-only calls can each wait 90 seconds.
    # Observation cannot time out before the configured provider bound.
    deadline = time.monotonic() + 450
    events = []
    seen = set()
    attempts = 0
    last_http = 0
    last_reason = "NOT_ATTEMPTED"
    while time.monotonic() < deadline and attempts < 250:
        attempts += 1
        timeout = max(1, min(65, deadline - time.monotonic()))
        try:
            with urlopen(req, timeout=timeout) as response:
                last_http = response.status
                for raw_line in response:
                    if time.monotonic() >= deadline:
                        last_reason = "OVERALL_DEADLINE"
                        break
                    if not raw_line.startswith(b"data:"):
                        continue
                    raw_item = raw_line[5:].strip()
                    if len(raw_item) > 262144:
                        fail("SSE_FRAME_TOO_LARGE")
                    try:
                        item = json.loads(raw_item)
                    except (TypeError, ValueError):
                        continue
                    if not isinstance(item, dict):
                        continue
                    # Replayed frames can appear on each resubscription.
                    # Deduplicate only exact identical frames, retaining distinct
                    # native child start/stop updates from the same run.
                    signature = raw_item
                    if signature in seen:
                        continue
                    seen.add(signature)
                    events.append(item)
                    if len(events) > 2000:
                        fail("SSE_EVENT_LIMIT_EXCEEDED")
                    if item.get("final") is True or item.get("event") == "error" or item.get("type") == "error":
                        return last_http, events, "TERMINAL_FRAME", attempts
                else:
                    last_reason = "NONTERMINAL_EOF"
        except HTTPError as exc:
            return exc.code, events, "HTTP_ERROR", attempts
        except (socket.timeout, TimeoutError):
            last_reason = "SSE_IDLE_TIMEOUT"
        except (URLError, ConnectionError, OSError):
            return last_http, events, "SSE_TRANSPORT_ERROR", attempts
        # Local relay rejection happens before provider inference. Fail fast on
        # that deterministic class rather than spending 450s reconnecting to
        # a mission that cannot advance. No new generation request is sent.
        if attempts % 2 == 0:
            try:
                with urlopen("http://127.0.0.1:8088/provider-diagnostics",timeout=3) as diag_response:
                    diag=json.load(diag_response)
                if diag.get("simulated") is False and diag.get("route") == MODEL:
                    if diag.get("local_rejections"):
                        return last_http, events, "RELAY_LOCAL_REJECTION", attempts
                    records=diag.get("records") or []
                    if any(r.get("http_status") not in (None,200) for r in records if isinstance(r,dict)):
                        return last_http, events, "PROVIDER_NON200_RESPONSE", attempts
            except (OSError, ValueError, TypeError):
                pass
        if time.monotonic() < deadline:
            time.sleep(min(2.0, max(0, deadline - time.monotonic())))
    return last_http, events, last_reason if attempts < 250 else "SSE_RECONNECT_LIMIT", attempts


def bounded_failure_diagnostics(helpers, stream_id, parent_id, events):
    """Print classifications and counts only, never upstream text or identities."""
    allowed={"queued","pending","running","completed","complete","failed","error","paused","cancelled"}
    try:
        status, plan, oracle, response_id, pending = read_p6(stream_id, helpers)
        print("CI_NATIVE_REAL_REDIS_STATUS="+(status if status in allowed else "OTHER_OR_MISSING"),flush=True)
        print("CI_NATIVE_REAL_REDIS_PLAN_PRESENT="+str(bool(plan)).upper(),flush=True)
        print("CI_NATIVE_REAL_REDIS_ORACLE_PRESENT="+str(bool(oracle)).upper(),flush=True)
        print("CI_NATIVE_REAL_REDIS_RESPONSE_ID_PRESENT="+str(bool(response_id)).upper(),flush=True)
        print("CI_NATIVE_REAL_REDIS_PERSISTENCE_PENDING="+("TRUE" if pending.lower() in ("true","1") else "FALSE_OR_ABSENT"),flush=True)
    except (OSError, ValueError, subprocess.SubprocessError):
        print("CI_NATIVE_REAL_REDIS_DIAG_UNAVAILABLE=TRUE",flush=True)
    try:
        with urlopen("http://127.0.0.1:8088/provider-diagnostics",timeout=5) as r:
            data=json.load(r)
        rec=data.get("records") or []
        if not isinstance(rec,list): rec=[]
        print("CI_NATIVE_REAL_PROVIDER_REQUEST_COUNT="+str(len(rec)),flush=True)
        rejections=data.get("local_rejections") or []
        print("CI_NATIVE_REAL_PROVIDER_LOCAL_REJECTIONS="+str(len(rejections)),flush=True)
        # These labels are constants raised by the checked-in relay. Strictly
        # allowlist to prevent accidental logging of provider or prompt content.
        approved={"REAL_FREE_ROUTE_REQUIRED","REAL_REASONING_DISABLED_REQUIRED",
                  "REAL_SINGLE_CHOICE_REQUIRED","REAL_FUNCTION_SCHEMA_REQUIRED",
                  "REAL_TOKEN_LIMIT_REQUIRED","REAL_REQUEST_BUDGET_EXHAUSTED",
                  "NATIVE_FALLBACK_ROUTE_REQUIRED","NATIVE_FALLBACK_SYSTEM_REQUIRED"}
        for item in rejections[:4]:
            code=item.get("code") if isinstance(item,dict) else None
            print("CI_NATIVE_REAL_LOCAL_REJECTION_CLASS="+(code if code in approved else "OTHER"),flush=True)
        phases={"waiting_headers","reading_body","response_complete","transport_error"}
        statuses={"200","400","401","403","404","408","422","429","500","502","503","504"}
        for i,record in enumerate(rec[:4],1):
            phase=record.get("phase")
            code=str(record.get("http_status"))
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_PHASE="+(phase if phase in phases else "OTHER"),flush=True)
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_HTTP="+(code if code in statuses else "OTHER_OR_PENDING"),flush=True)
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_SUBAGENT_TOOL="+str("subagent" in (record.get("tool_names") or [])).upper(),flush=True)
            p=record.get("request_parameters") or {}
            allowed_format={"json_schema","json_object"}
            fmt=p.get("response_format")
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_FORMAT="+(fmt if fmt in allowed_format else "NONE_OR_OTHER"),flush=True)
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_STRICT="+str(p.get("strict") is True).upper(),flush=True)
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_REASONING_DISABLED="+str(p.get("reasoning_enabled") is False).upper(),flush=True)
            for field in ("max_tokens","max_completion_tokens"):
                value=p.get(field)
                print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_"+field.upper()+"_BAND="+("VALID" if type(value) is int and 0 < value <= 2048 else "MISSING_OR_OTHER"),flush=True)
            # The relay stores upstream errors privately. Only classify
            # known parameter keywords; never emit model text or raw errors.
            error_text=" ".join(str(e).lower() for e in (record.get("errors") or [])[:2])
            categories={
                "REASONING":("reasoning","thinking"),
                "STRUCTURED_OUTPUT":("response_format","json_schema","json object","structured"),
                "TOOLS":("tool_choice","tool_calls","function","tools","tool use"),
                "MODEL":("model","unknown endpoint","not supported"),
                "PARAMETERS":("parameter","unsupported","invalid request"),
                "TOKENS":("max_tokens","max_completion_tokens","token limit"),
                "MESSAGES":("messages","role","content"),
                "TEMPERATURE":("temperature",),
                "PROVIDER":("provider","upstream"),
            }
            classes=[k for k,terms in categories.items() if any(t in error_text for t in terms)]
            print("CI_NATIVE_REAL_PROVIDER_"+str(i)+"_SAFE_ERROR_TAGS="+(",".join(classes) if classes else "UNCLASSIFIED"),flush=True)
    except (OSError, ValueError, TypeError):
        print("CI_NATIVE_REAL_PROVIDER_DIAG_UNAVAILABLE=TRUE",flush=True)
    allowed_events={"on_subagent_update","on_run_step","on_run_step_closed","error","on_message_delta","on_chain_end","on_chain_start"}
    print("CI_NATIVE_REAL_SSE_NATIVE_CHILD_UPDATES="+str(sum(x.get("event")=="on_subagent_update" for x in events)),flush=True)
    print("CI_NATIVE_REAL_SSE_RECOGNIZED_EVENTS="+",".join(sorted({x.get("event") for x in events if x.get("event") in allowed_events})),flush=True)
    js = r"""
const mongoose=require('mongoose');
(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const count=await mongoose.connection.db.collection('conversations').countDocuments(
   {'subagentThread.parentConversationId':process.env.CI_REAL_PARENT_ID});
 console.log('CI_NATIVE_REAL_DIAG_PERSISTED_CHILD_COUNT='+count);
 await mongoose.disconnect();
})().catch(e=>{console.log('CI_NATIVE_REAL_DIAG_CHILD_READBACK_CLASS='+e.name);process.exitCode=1});
"""
    try:
        p=subprocess.run(helpers["COMPOSE"]+["exec","-T","-e","CI_REAL_PARENT_ID="+parent_id,
          "api","node","-e",js],capture_output=True,text=True,timeout=25)
        for ln in p.stdout.splitlines():
            if ln.startswith("CI_NATIVE_REAL_DIAG_"):
                print(ln,flush=True)
    except (OSError,subprocess.SubprocessError):
        print("CI_NATIVE_REAL_DIAG_CHILD_UNAVAILABLE=TRUE",flush=True)


def live_gate():
    if os.environ.get("CI_NATIVE_REAL_INTEGRATED") != "1":
        fail("EXPLICIT_OPT_IN_REQUIRED")
    if os.environ.get("CI_REAL_FREE_PROVIDER") != "1":
        fail("LIVE_PROVIDER_RELAY_NOT_ENABLED")
    before = json.loads(STATE.read_text())
    # The relay has just been started as a new, empty process, and its metrics
    # were verified by the previous readiness gate. Avoid a redundant socket
    # read immediately after handoff (the failed run reset at this read).
    # Provider attempt accounting remains fail-closed on the relay's own
    # dedicated post-mission diagnostic records and hard four-call limit.
    print("CI_NATIVE_REAL_GATE_ENTERED=PASS", flush=True)
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
    sse_status, events, outcome, subscriptions = read_native_terminal_stream(helpers, stream_id)
    finals = [e for e in events if e.get("final") is True]
    errors = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
    print("CI_NATIVE_REAL_SSE_HTTP=" + str(sse_status), flush=True)
    print("CI_NATIVE_REAL_SSE_OUTCOME=" + outcome, flush=True)
    print("CI_NATIVE_REAL_SSE_SUBSCRIPTIONS=" + str(subscriptions), flush=True)
    print("CI_NATIVE_REAL_SSE_EVENT_COUNT=" + str(len(events)), flush=True)
    print("CI_NATIVE_REAL_SSE_FINAL_COUNT=" + str(len(finals)), flush=True)
    print("CI_NATIVE_REAL_SSE_ERROR_COUNT=" + str(len(errors)), flush=True)
    if sse_status != 200 or outcome != "TERMINAL_FRAME" or len(finals) != 1 or errors:
        bounded_failure_diagnostics(helpers, stream_id, parent_id, events)
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
    with urlopen("http://127.0.0.1:8088/provider-diagnostics", timeout=8) as diagnostic_response:
        diagnostics = json.load(diagnostic_response)
    if (diagnostics.get("route") != MODEL or diagnostics.get("simulated") is not False
            or diagnostics.get("limit_requests") != 4):
        fail("PROVIDER_RELAY_IDENTITY_OR_LIMIT_MISMATCH")
    records = diagnostics.get("records")
    if not isinstance(records, list) or not 3 <= len(records) <= 4:
        fail("REAL_PROVIDER_REQUEST_COUNT_NOT_BOUNDED_THREE_TO_FOUR")
    attempts = len(records)
    if any(r.get("http_status") != 200 for r in records):
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
    current = quota_and_price(min_remaining=0)
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
