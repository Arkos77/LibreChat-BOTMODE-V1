#!/usr/bin/env python3
"""Strict external OpenRouter/free delegated-child → Oracle CI gate.

Executed only on explicit workflow_dispatch. This does not emulate inference,
fabricate model metrics, or accept Oracle success without Mongo child lineage.
Never prints prompts, provider responses, JWTs, or API credentials.
"""
import json
import os
import runpy
import subprocess
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
    "objective": "Déléguer obligatoirement avec l'outil subagent en mode synchrone (run_in_background:false), attendre sa réponse terminale puis produire le JSON final.",
    "constraints": ["Le spécialiste doit terminer AVANT la publication Oracle", "Ne pas inventer sa réponse", "Retour final JSON strict : {\"ok\":true}"],
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
    "text": "Appelle obligatoirement l'outil subagent avec run_in_background:false, ATTENDS le résultat complet du spécialiste, puis retourne strictement {\"ok\":true}. Ne publie rien tant que le spécialiste n'est pas terminé.",
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

# Distinguish a real completed child from a running/error child. The
# synthetic verifier accepts any terminal status; the LIVE gate requires
# successful completion, *before* the Oracle publication.
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

at_oracle=child_state(conversation_id)
emit_child_state('AT_ORACLE',at_oracle)
if at_oracle['children']!=1:
    raise SystemExit('CI_LIVE_FREE_FAIL=WRONG_CHILD_COUNT')
if at_oracle['failed']:
    raise SystemExit('CI_LIVE_FREE_FAIL=CHILD_TERMINATED_WITH_ERROR')
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
