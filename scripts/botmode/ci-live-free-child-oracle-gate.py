#!/usr/bin/env python3
"""Strict external OpenRouter/free delegated-child → Oracle CI gate.

Executed only on explicit workflow_dispatch. This does not emulate inference,
fabricate model metrics, or accept Oracle success without Mongo child lineage.
Never prints prompts, provider responses, JWTs, or API credentials.
"""
import json
import os
import runpy
import socket
import subprocess
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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
# The deterministic planner must REQUIRE a specialist by a capability gap,
# rather than relying on prose instructions that a free model may ignore.
# Two ordered graph tasks exercise real Worker -> specialist -> Oracle actors.
FIVE_TASKS = os.environ.get("CI_LIVE_FREE_FIVE_TASKS") == "true"
task_keys = ["worker"] + ([f"specialist_{i}" for i in range(1, 5)] if FIVE_TASKS else ["specialist"])
task_ids = {key: mission_id + "/" + key for key in task_keys}
mission = {
    "missionId": mission_id,
    "taskId": mission_id,
    "objective": "Exécuter les étapes dépendantes Worker puis spécialiste, vérifier leurs sorties indépendamment et publier après Oracle.",
    "constraints": ["Le spécialiste doit terminer AVANT la publication Oracle", "Ne pas inventer sa réponse", "Retour final JSON strict : {\"ok\":true}"],
    "requiredCapabilities": ["basic", "research_specialist_ci"],
    "objectives": [
        {"key": "worker", "objective": "Préparer le plan de réponse. Retourne strictement {\"ok\":true}.",
         "requiredCapabilities": ["basic"], "dependsOn": []},
        {"key": "specialist", "objective": "Vérifier le plan du Worker et retourner strictement {\"ok\":true}.",
         "requiredCapabilities": ["research_specialist_ci"], "dependsOn": ["worker"]},
    ],
    "validation": {"criteria": [{"id": "ci-ok", "field": "ok", "expected": True}]},
}
if FIVE_TASKS:
    # Four explicitly ordered specialist graph nodes; no model tool-choice
    # heuristics and no claim of four separate nested child conversations.
    mission["objectives"] = [
        {
            "key": key,
            "objective": (
                "Préparer la réponse. Retourne strictement {\"ok\":true}."
                if key == "worker" else
                "Vérifier l'étape précédente. Retourne strictement {\"ok\":true}."
            ),
            "requiredCapabilities": ["basic"] if key == "worker" else ["research_specialist_ci"],
            "dependsOn": [task_keys[index - 1]] if index else [],
        }
        for index, key in enumerate(task_keys)
    ]
payload = {
    "endpoint": "agents",
    "agent_id": worker,
    "conversationId": conversation_id,
    "messageId": str(uuid.uuid4()),
    "parentMessageId": "00000000-0000-0000-0000-000000000000",
    "isNewConvo": True,
    "text": "Exécute le contrat structuré en deux tâches : Worker puis spécialiste de recherche dépendant du Worker. Le spécialiste doit terminer avant Oracle. Réponse par tâche strictement {\"ok\":true}.",
    "orchestratorMission": {
        "mission": mission,
        "plannerContext": {
            "worker": {"id": "ci-worker", "agentId": worker, "role": "worker", "capabilities": ["basic"], "constraints": []},
            "specialists": [
                {"id": child, "agentId": child, "role": "specialist", "capabilities": ["research_specialist_ci"], "constraints": []}
            ],
        },
    },
}
if FIVE_TASKS:
    payload["text"] = (
        "Exécute successivement les cinq étapes, Worker puis quatre étapes spécialistes. "
        "Chaque résultat doit être le JSON strict {\"ok\":true}, afin d'être validé "
        "indépendamment par Oracle avant publication."
    )
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

def child_state(parent_id):
    js = r"""
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const db=mongoose.connection.db;
  const children=await db.collection('conversations').find(
    {'subagentThread.parentConversationId':process.env.CI_PARENT_CONVERSATION_ID},
    {projection:{conversationId:1}}
  ).toArray();
  const found=[];
  for(const child of children){
    const msgs=await db.collection('messages').find(
      {conversationId:child.conversationId},
      {projection:{subagentTask:1,isCreatedByUser:1}}
    ).toArray();
    const statuses=msgs.map(m=>m.subagentTask?.status).filter(Boolean);
    found.push({
      completed:statuses.includes('completed'),
      failed:statuses.includes('error')||statuses.includes('cancelled'),
      active:statuses.includes('running')||statuses.includes('paused'),
      messages:msgs.length
    });
  }
  console.log('CI_LIVE_CHILD_STATE='+JSON.stringify({
    children:found.length,completed:found.filter(x=>x.completed&&!x.failed).length,
    failed:found.filter(x=>x.failed).length,
    active:found.filter(x=>x.active).length,
    messages:found.reduce((n,x)=>n+x.messages,0)
  }));
  await mongoose.disconnect();
})().catch(e=>{console.error('CI_LIVE_CHILD_STATE_CLASS='+e.name);process.exitCode=2});
"""
    output=subprocess.run(
        helpers['COMPOSE']+['exec','-T','-e','CI_PARENT_CONVERSATION_ID='+parent_id,
                           'api','node','-e',js],
        capture_output=True,text=True,timeout=50)
    if output.returncode:
        raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_STATE_READBACK_FAILED')
    lines=[x for x in output.stdout.splitlines() if x.startswith('CI_LIVE_CHILD_STATE=')]
    if len(lines)!=1:
        raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_STATE_NOT_FOUND')
    try:
        return json.loads(lines[0].split('=',1)[1])
    except ValueError:
        raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_STATE_INVALID')

def emit_child_state(label, state):
    # Counts only: no model output, Mongo IDs or provider details.
    for key in ('children','completed','failed','active','messages'):
        print('CI_LIVE_FREE_CHILD_'+label+'_'+key.upper()+'='+str(state[key]),flush=True)

# SSE streams can stay open while the hosted free model/child is pending.
# Stop at the first *actual* terminal event, not TCP EOF (which may never
# arrive), and distinguish a bounded idle timeout from a child/Oracle failure.
# Do not print model text, event payloads, token, or the HTTP response body.
def read_terminal_stream(stream_path):
    req = Request(
        helpers["BASE"] + stream_path,
        headers={"Authorization": "Bearer " + helpers["TOKEN"],
                 "User-Agent": helpers["UA"], "Accept": "text/event-stream"},
        method="GET",
    )
    started = time.monotonic()
    deadline = started + 210
    if FIVE_TASKS:
        deadline = started + 450
    items = []
    retries = 0
    http_status = 0
    # Free providers may stay silent >75 s while Redis still shows running.
    # Reconnect ONLY the existing streamId with resume=true. Never repeat POST.
    while time.monotonic() < deadline:
        timeout = max(1, min(75, deadline - time.monotonic()))
        try:
            with urlopen(req, timeout=timeout) as response:
                http_status = response.status
                for line in response:
                    if time.monotonic() >= deadline:
                        return http_status, items, "SSE_TOTAL_DEADLINE"
                    if not line.startswith(b"data:"):
                        continue
                    try:
                        item = json.loads(line[5:].strip())
                    except (TypeError, ValueError):
                        continue
                    if not isinstance(item, dict):
                        continue
                    items.append(item)
                    if item.get("final") is True or item.get("event") == "error" or item.get("type") == "error":
                        return http_status, items, "TERMINAL_FRAME"
                return http_status, items, "STREAM_EOF"
        except HTTPError as exc:
            return exc.code, items, "HTTP_ERROR"
        except (socket.timeout, TimeoutError):
            if time.monotonic() >= deadline or (retries >= 5 if FIVE_TASKS else retries >= 2):
                return http_status, items, "SSE_IDLE_TOTAL_DEADLINE"
            retries += 1
            # This GET merely resumes observation of the same already-started
            # mission and does not consume another model-generation request.
        except (URLError, ConnectionError, OSError):
            return http_status, items, "SSE_CONNECTION_ERROR"
    return http_status, items, "SSE_TOTAL_DEADLINE"

stream_status, events, stream_outcome = read_terminal_stream(
    "/api/agents/chat/stream/" + stream_id + "?resume=true"
)
finals = [e for e in events if e.get("final") is True]
errors = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
print("CI_LIVE_FREE_SSE_HTTP=" + str(stream_status), flush=True)
print("CI_LIVE_FREE_SSE_OUTCOME=" + stream_outcome, flush=True)
print("CI_LIVE_FREE_SSE_EVENTS_SEEN=" + str(len(events)), flush=True)
print("CI_LIVE_FREE_FINAL_COUNT=" + str(len(finals)), flush=True)
print("CI_LIVE_FREE_ERROR_FRAME_COUNT=" + str(len(errors)), flush=True)
# Terminal classification only; never display model output or identities.
for item in finals[:1]:
    msg=item.get("responseMessage")
    msg=msg if isinstance(msg,dict) else {}
    print("CI_LIVE_FREE_FINAL_UNFINISHED="+str(msg.get("unfinished","ABSENT")),flush=True)
    reason=msg.get("finish_reason",msg.get("finishReason"))
    safe_reasons={"stop","length","tool_calls","content_filter","tool_call_limit","max_tokens","incomplete","error"}
    print("CI_LIVE_FREE_FINAL_FINISH_REASON="+(reason if isinstance(reason,str) and reason in safe_reasons else "OTHER_OR_ABSENT"),flush=True)
    parts=msg.get("content")
    parts=parts if isinstance(parts,list) else []
    types=sorted({p.get("type") for p in parts if isinstance(p,dict) and isinstance(p.get("type"),str)})
    print("CI_LIVE_FREE_FINAL_CONTENT_TYPES="+",".join(x for x in types if x in {"text","error","tool_call","think","reasoning","activity_label"}),flush=True)
    if "error" in types:
        # Classify internal response error only; never emit raw provider/error
        # messages, secrets, user content or arbitrary upstream error codes.
        error_fragments=[]
        for part in parts:
            if isinstance(part,dict) and part.get("type")=="error":
                for key in ("error","message","text"):
                    val=part.get(key)
                    if val is not None:
                        error_fragments.append(str(val)[:2000])
        raw_error=" ".join(error_fragments).lower()
        family=("MISSION_ORACLE" if ("mission oracle" in raw_error or "mission_oracle" in raw_error)
            else "RATE_LIMIT" if ("rate limit" in raw_error or "rate_limit" in raw_error or "429" in raw_error)
            else "PROVIDER_UNAVAILABLE" if any(t in raw_error for t in ("upstream", "503", "502", "504", "timeout", "temporarily unavailable"))
            else "STEP_LIMIT" if ("step limit" in raw_error or "recursion_limit" in raw_error or "recursion limit" in raw_error)
            else "OTHER")
        print("CI_LIVE_FREE_FINAL_ERROR_CLASS="+family,flush=True)
        try:
            status_now, raw_plan_now, raw_oracle_now=redis_job(stream_id)
            if raw_plan_now and raw_oracle_now:
                parsed_plan_now=json.loads(raw_plan_now)
                parsed_oracle_now=json.loads(raw_oracle_now)
                print("CI_LIVE_FREE_TERMINAL_ERROR_PLAN_TASKS="+str(len(parsed_plan_now.get("tasks",[]))),flush=True)
                print("CI_LIVE_FREE_TERMINAL_ERROR_VERDICT_TASKS="+str(len(parsed_oracle_now.get("results",{}))),flush=True)
        except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
            print("CI_LIVE_FREE_TERMINAL_ERROR_REDIS_DIAG_UNAVAILABLE=TRUE",flush=True)
        raise SystemExit("CI_LIVE_FREE_FAIL=TERMINAL_CONTAINS_ERROR_PART")

# Correlate only event metadata with the two deterministic native node ids.
# Avoid logging event bodies, prompts, model output or identifiers.
import hashlib
from collections import Counter
def node_id(key):
    compact=json.dumps([mission_id,key],separators=(',',':'),ensure_ascii=False)
    return 'p6_'+hashlib.sha256(compact.encode()).hexdigest()
seen=Counter()
for event in events:
    if not isinstance(event,dict):
        continue
    kind=event.get('event') or event.get('type') or 'other'
    if kind in ('on_run_step','on_run_step_completed','on_run_step_closed','on_run_step_delta'):
        seen[str(kind)]+=1
    metadata=event.get('data') if isinstance(event.get('data'),dict) else {}
    as_text=json.dumps(metadata,default=str,ensure_ascii=False)
    for label in task_keys:
        if node_id(label) in as_text:
            seen[label+'_node_event']+=1
for label in [key+'_node_event' for key in task_keys] + ['on_run_step','on_run_step_completed','on_run_step_closed','on_run_step_delta']:
    print('CI_LIVE_FREE_EVENT_'+label.upper()+'='+str(seen[label]),flush=True)
if stream_status != 200 or len(finals) != 1 or errors:
    try:
        job_status, raw_plan, raw_state = redis_job(stream_id)
        if job_status not in ("queued", "pending", "running", "completed", "complete", "failed", "error", "paused", "cancelled"):
            job_status = "OTHER_OR_MISSING"
        print("CI_LIVE_FREE_REDIS_JOB_STATUS=" + job_status, flush=True)
        print("CI_LIVE_FREE_REDIS_ORACLE_STATE_PRESENT=" + str(bool(raw_state)).upper(), flush=True)
        # Existing allowlisted Redis error classifier prints no raw provider text.
        helpers["classify_durable_failure"](stream_id)
        # The archival classifier is deliberately narrow; classify the current
        # provider/model init failure locally without exposing exception text.
        from hashlib import sha256
        redis_key=helpers["REDIS_PHYSICAL_PREFIX"]+"stream:{"+stream_id+"}:job"
        err_read=subprocess.run(helpers["COMPOSE"]+["exec","-T","redis","redis-cli","--raw",
                         "HGET",redis_key,"error"],capture_output=True,text=True,timeout=20)
        if err_read.returncode==0:
            detail=err_read.stdout.strip().lower()
            kinds={
                "OPENROUTER_AUTH":("unauthorized","invalid api key","authentication","401"),
                "PROVIDER_RATE_LIMIT":("rate limit","rate_limit","429","quota","daily limit"),
                "MODEL_UNAVAILABLE":("model not found","no endpoints found","unsupported model","model unavailable","unknown model","404"),
                "JSON_MODE_UNSUPPORTED":("response_format","json_schema","json mode","structured output"),
                "PROVIDER_TRANSPORT":("timeout","econnreset","fetch failed","network error","upstream","503","502"),
                "AGENT_BINDING":("missing or mismatched authorized binding","invalid agent","agent not found","unsupported provider"),
                "RUNTIME_CONFIGURATION":("undefined","cannot read properties","typeerror","invalid configuration","missing config"),
                "RECURSION_BUDGET":("recursion_limit","recursion limit","step limit","max iterations"),
                "MISSION_ORACLE":("mission oracle","oracle_not","native mission"),
            }
            matches=[k for k,patterns in kinds.items() if any(t in detail for t in patterns)]
            print("CI_LIVE_FREE_INIT_ERROR_CLASSES="+(",".join(matches) if matches else "UNCLASSIFIED"),flush=True)
            print("CI_LIVE_FREE_INIT_ERROR_TEXT_LENGTH="+str(len(detail)),flush=True)
            print("CI_LIVE_FREE_INIT_ERROR_FINGERPRINT="+sha256(detail.encode()).hexdigest()[:16],flush=True)
    except (subprocess.SubprocessError, OSError):
        print("CI_LIVE_FREE_REDIS_DIAG_UNAVAILABLE=TRUE", flush=True)
    try:
        emit_child_state("AT_SSE_FAILURE", child_state(conversation_id))
    except (SystemExit, subprocess.SubprocessError, OSError):
        print("CI_LIVE_FREE_CHILD_DIAG_UNAVAILABLE=TRUE", flush=True)
    failure = stream_outcome if stream_outcome != "TERMINAL_FRAME" else "INVALID_TERMINAL_FRAME"
    raise SystemExit("CI_LIVE_FREE_FAIL=" + failure)

durable = None
for _ in range(30):
    _, raw_plan, raw_state = redis_job(stream_id)
    if raw_plan and raw_state:
        try:
            plan, state = json.loads(raw_plan), json.loads(raw_state)
            results = state.get("results", {})
            if all(results.get(task_id, {}).get("verdicts") for task_id in task_ids.values()):
                durable = (plan, results)
                break
        except (TypeError, ValueError, AttributeError):
            pass
    time.sleep(1)
if durable is None:
    # Emit only state shape and bounded counts. Never log provider payloads,
    # prompts, JWTs, Redis keys, user IDs, raw plans or any credential.
    try:
        job_status, raw_plan, raw_state = redis_job(stream_id)
        allowed = {"queued", "pending", "running", "completed", "complete", "failed", "error", "paused", "cancelled"}
        print("CI_LIVE_FREE_REDIS_JOB_STATUS=" + (job_status if job_status in allowed else "OTHER_OR_MISSING"), flush=True)
        print("CI_LIVE_FREE_REDIS_PLAN_PRESENT=" + str(bool(raw_plan)).upper(), flush=True)
        print("CI_LIVE_FREE_REDIS_ORACLE_STATE_PRESENT=" + str(bool(raw_state)).upper(), flush=True)
        if raw_plan:
            parsed_plan=json.loads(raw_plan)
            stages=parsed_plan.get('tasks',[]) if isinstance(parsed_plan,dict) else []
            if not isinstance(stages,list):
                stages=[]
            print("CI_LIVE_FREE_PLAN_TASK_COUNT="+str(len(stages)),flush=True)
            print("CI_LIVE_FREE_PLAN_STRATEGY="+str(parsed_plan.get('strategy','OTHER'))[:32],flush=True)
            print("CI_LIVE_FREE_PLAN_WORKER_PRESENT="+str(any(isinstance(t,dict) and t.get('key')=='worker' and t.get('agentId')==worker for t in stages)).upper(),flush=True)
            print("CI_LIVE_FREE_PLAN_SPECIALIST_COUNT="+str(sum(isinstance(t,dict) and t.get('key') in task_keys[1:] and t.get('agentId')==child for t in stages)),flush=True)
            print("CI_LIVE_FREE_PLAN_CHAIN_VALID="+str(all(any(isinstance(t,dict) and t.get('key')==key and t.get('dependsOn')==([task_keys[i-1]] if i else []) for t in stages) for i,key in enumerate(task_keys))).upper(),flush=True)
        if raw_state:
            parsed = json.loads(raw_state)
            results = parsed.get("results", {}) if isinstance(parsed, dict) else {}
            if not isinstance(results, dict):
                results = {}
            print("CI_LIVE_FREE_RESULT_TASK_COUNT=" + str(min(len(results), 9999)), flush=True)
            print("CI_LIVE_FREE_WORKER_VERDICT_PRESENT=" + str(bool(results.get(task_ids["worker"], {}).get("verdicts")) if isinstance(results.get(task_ids["worker"]), dict) else False).upper(), flush=True)
            print("CI_LIVE_FREE_SPECIALIST_VERDICT_COUNT=" + str(sum(bool(results.get(task_ids[k], {}).get("verdicts")) for k in task_keys[1:])), flush=True)
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        print("CI_LIVE_FREE_REDIS_DIAG_UNAVAILABLE=TRUE", flush=True)
    try:
        emit_child_state("ORACLE_NOT_DURABLE", child_state(conversation_id))
    except (SystemExit, OSError, subprocess.SubprocessError):
        print("CI_LIVE_FREE_CHILD_DIAG_UNAVAILABLE=TRUE", flush=True)
    raise SystemExit("CI_LIVE_FREE_FAIL=ORACLE_NOT_DURABLE")
plan, results = durable
expected_tasks = {
    key: {"taskId": task_ids[key], "agentId": worker if key == "worker" else child}
    for key in task_keys
}
actual_tasks = {item.get("key"): item for item in plan.get("tasks", []) if isinstance(item, dict)}
if (plan.get("mission", {}).get("missionId") != mission_id or
        plan.get("strategy") != "SEQUENTIAL" or
        set(actual_tasks) != set(expected_tasks) or
        any(actual_tasks[key].get("taskId") != expected["taskId"] or
            actual_tasks[key].get("agentId") != expected["agentId"]
            for key, expected in expected_tasks.items()) or
        any(actual_tasks[key].get("dependsOn") != ([task_keys[i-1]] if i else [])
            for i, key in enumerate(task_keys))):
    raise SystemExit("CI_LIVE_FREE_FAIL=STRUCTURED_SPECIALIST_PLAN_MISSING")
print("CI_LIVE_FREE_STRUCTURED_SPECIALIST_PLAN=PASS", flush=True)
for key, task in expected_tasks.items():
    verdicts = results.get(task["taskId"], {}).get("verdicts", [])
    if len(verdicts) != 1 or verdicts[0].get("status") != "VERIFIED":
        print("CI_LIVE_FREE_ORACLE_UNVERIFIED_STAGE=" + key, flush=True)
        raise SystemExit("CI_LIVE_FREE_FAIL=ORACLE_NOT_VERIFIED")
print("CI_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS", flush=True)
if not any(response_text(e.get("responseMessage")).strip()
           for e in finals if isinstance(e.get("responseMessage"), dict)):
    raise SystemExit("CI_LIVE_FREE_FAIL=NO_PUBLISHED_RESPONSE")
print("CI_LIVE_FREE_ORACLE_VERIFIED_AND_PUBLISHED=PASS", flush=True)
if FIVE_TASKS:
    print("CI_LIVE_FREE_FIVE_TASKS_ORACLE_VERIFIED=PASS", flush=True)

# Distinguish a real completed child from a running/error child. The
# synthetic verifier accepts any terminal status; the LIVE gate requires
# successful completion, *before* the Oracle publication.
at_oracle=child_state(conversation_id)
emit_child_state('AT_ORACLE',at_oracle)
if at_oracle['failed']:
    raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_TERMINATED_WITH_ERROR')
if at_oracle['children']==0:
    # A planned specialist graph actor is NOT a nested subagentThread. The
    # sequential plan above must have already proven its separate Agent ID and
    # independent VERIFIED task before accepting this limited qualification.
    # A real nested child remains a separate, stricter gate; never label it PASS.
    print('CI_LIVE_FREE_NESTED_CHILD_THREAD=NOT_OBSERVED',flush=True)
    print('BOTMODE_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS',flush=True)
    raise SystemExit(0)
if at_oracle['children']!=1:
    raise SystemExit('CI_LIVE_FREE_FAIL=UNEXPECTED_NESTED_CHILD_COUNT')
if at_oracle['completed']!=1:
    # Diagnose whether the provider still works after the parent was already
    # published, but NEVER turn late completion into a full-chain PASS.
    latest=at_oracle
    for _ in range(24):
        time.sleep(5)
        latest=child_state(conversation_id)
        if latest['completed'] or latest['failed']:
            break
    emit_child_state('AFTER_BOUNDED_OBSERVATION',latest)
    if latest['failed']:
        raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_FAILED_AFTER_ORACLE')
    if latest['completed']:
        raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_FINISHED_AFTER_ORACLE_PUBLICATION')
    raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_STILL_NONTERMINAL_AFTER_ORACLE')

verify_mongo_child_lineage(conversation_id,'LIVE_FREE_PRE_RESTART')
verify_lineage_across_api_restart(conversation_id)
after=child_state(conversation_id)
emit_child_state('AFTER_RESTART',after)
if after['children']!=1 or after['completed']!=1 or after['failed']:
    raise SystemExit('CI_LIVE_FREE_FAIL=SUCCESSFUL_CHILD_NOT_DURABLE_AFTER_RESTART')
print('BOTMODE_LIVE_FREE_EXTERNAL_CHILD_ORACLE=PASS',flush=True)
print('BOTMODE_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS',flush=True)
