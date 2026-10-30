#!/usr/bin/env python3
"""PR107 cold API SIGKILL with two actual native specialists, local fixture only.

A first child must persist while the second provider completion is held. Kill the
disposable API, then observe autonomous durable recovery. Never replay a user
submission as a workaround, because that could duplicate external effects.
"""
import json
import os
import runpy
import subprocess
import threading
import time
import uuid
from urllib.error import URLError
from urllib.request import Request, urlopen

gate = runpy.run_path("scripts/botmode/ci-oracle-delegated-mission-gate.py")
COMPOSE = gate["COMPOSE"]
request = gate["request"]
redis_job = gate["redis_job"]
events_from_sse = gate["result_events"]
WORKER = gate["WORKER"]
BASE = "http://127.0.0.1:3090"
FIXTURE = "http://127.0.0.1:8088"

def fail(reason):
    raise SystemExit("CI_PR107_COLD_MULTI_FAIL=" + reason)

if not os.environ.get("COMPOSE_PROJECT_NAME", "").startswith("botmode-pr107-head-"):
    fail("NOT_ISOLATED_DISPOSABLE_COMPOSE_PROJECT")

def post_fixture(path, body):
    req = Request(FIXTURE + path, data=json.dumps(body).encode(),
                  headers={"Content-Type":"application/json"}, method="POST")
    with urlopen(req, timeout=8) as response:
        return json.load(response)

def metrics():
    with urlopen(FIXTURE+"/metrics", timeout=8) as response:
        return json.load(response)

def run_node(script, env):
    cmd = COMPOSE+["exec","-T"]
    for name,value in env:
        cmd.extend(["-e", name+"="+value])
    completed = subprocess.run(cmd+["api","node","-e",script],capture_output=True,text=True,timeout=45)
    if completed.returncode:
        print("CI_PR107_COLD_MULTI_MONGO_READ=FAIL",flush=True)
        fail("MONGO_READ")
    return completed.stdout.strip()

lookup = r"""
const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);
const w=await m.connection.db.collection('agents').findOne(
{id:process.env.CI_WORKER_ID},{projection:{subagents:1}});
const ids=w?.subagents?.agent_ids;
if(!w?.subagents?.enabled||!Array.isArray(ids)||ids.length<2||ids[0]===ids[1])
throw Error('MISSING_TWO_AUTHORIZED_SPECIALISTS');
console.log(JSON.stringify(ids.slice(0,2)));
await m.disconnect()})().catch(e=>{console.error(e.name);process.exitCode=1});
"""
ids = json.loads(run_node(lookup,[("CI_WORKER_ID",WORKER)]))
post_fixture("/configure",{"childIds":ids,"holdSecondChild":True})
before = metrics()
conversation = str(uuid.uuid4())
mission_id = "ci-pr107-cold-"+str(uuid.uuid4())
mission = {"missionId":mission_id,"taskId":mission_id,
           "objective":"Research then analysis with two delegated specialists, verify one answer.",
           "constraints":["Answer strictly with the approved JSON."],
           "requiredCapabilities":["basic"],
           "validation":{"criteria":[{"id":"ci-ok","field":"ok","expected":True}]}}
payload={"endpoint":"agents","agent_id":WORKER,
         "conversationId":conversation,"messageId":str(uuid.uuid4()),
         "parentMessageId":"00000000-0000-0000-0000-000000000000",
         "isNewConvo":True,
         "text":'Perform both delegated steps then answer {"ok":true}.',
         "orchestratorMission":{"mission":mission,"plannerContext":{
             "worker":{"id":"ci-worker","agentId":WORKER,"role":"worker","capabilities":["basic"],
                       "constraints":[]},
             "specialists":[{"id":a,"agentId":a,"role":"specialist",
                             "capabilities":["basic"],"constraints":[]} for a in ids]}}}
for attempt in range(15):
    try:
        status, raw = request("POST","/api/agents/chat/agents",payload)
    except (URLError, OSError, TimeoutError):
        status, raw = 503, '{"code":"SERVER_NOT_READY"}'
    if status == 200: break
    try:
        code=json.loads(raw).get("code")
    except (TypeError, ValueError, AttributeError):
        code=None
    if status != 503 or code != "SERVER_NOT_READY": fail("ADMISSION_"+str(status))
    time.sleep(4)
else:
    fail("API_DID_NOT_ACCEPT_MISSION")
try:
    started=json.loads(raw)
    stream_id=started["streamId"]
    if started.get("status")!="started":fail("BAD_START")
except (ValueError, KeyError, TypeError):
    fail("BAD_START")

stream_replies=[]
def read_stream():
    try:
        status,sse=request("GET","/api/agents/chat/stream/"+stream_id+"?resume=true")
        stream_replies.append({"status":status, "events":events_from_sse(sse)})
    except (OSError,TimeoutError,URLError):
        stream_replies.append({"disconnected":True})
threading.Thread(target=read_stream,daemon=True).start()

mongo_probe=r"""
const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);
const db=m.connection.db,p=process.env.CI_PARENT;
const children=await db.collection('conversations').find(
{'subagentThread.parentConversationId':p}).toArray();
let linked=0,completed=0,errors=0,types=[];
for(const c of children){
const rows=await db.collection('messages').find({conversationId:c.conversationId}).toArray();
const a=c.subagentThread||{}, parentIds=new Set(
rows.map(r=>r.subagentTask?.parentRunId).filter(Boolean));
if(a.parentConversationId===p&&a.rootConversationId===p&&
a.parentToolCallId&&a.parentMessageId&&parentIds.has(a.parentMessageId))linked++;
if(rows.some(r=>r.subagentTask?.status==='completed'))completed++;
if(rows.some(r=>r.subagentTask?.status==='error'))errors++;
types.push(a.subagentType||'');
}
const parent=await db.collection('messages').find(
{conversationId:p,isCreatedByUser:false}).toArray();
const finals=parent.filter(r=>/"ok"\s*:\s*true/.test(
(String(r.text||'')+' '+JSON.stringify(r.content||'')).replace(/\\/g,'')));
console.log(JSON.stringify({count:children.length,linked,completed,errors,
distinctTypes:new Set(types).size,published:finals.length}));
await m.disconnect()})().catch(e=>{console.error(e.name);process.exitCode=1});
"""
def snapshot():
    return json.loads(run_node(mongo_probe,[("CI_PARENT",conversation)]))

# Wait for first native child to finish and the second provider request to
# be in-flight. No arbitrary sleeps or synthetic fake child database records.
pre=None
for attempt in range(110):
    counts=metrics()
    if counts.get("held_second_child_requests",0)>0:
        pre=snapshot()
        if pre["completed"]==1 and pre["count"]==2 and pre["linked"]==2:
            break
    time.sleep(0.5)
else:
    fail("SECOND_CHILD_NOT_HELD_AFTER_FIRST_PERSISTED")
if pre["published"]!=0 or pre["errors"]!=0:
    fail("PUBLISHED_OR_FAILED_BEFORE_CRASH")
print("CI_PR107_COLD_MULTI_PRECRASH_TWO_THREADS_ONE_COMPLETED=PASS",flush=True)

# Only this disposable GitHub Actions compose service is ever killed.
dead=subprocess.run(COMPOSE+["kill","-s","SIGKILL","api"],
                    capture_output=True,text=True,timeout=20)
if dead.returncode: fail("SIGKILL_DISPOSABLE_API")
print("CI_PR107_COLD_MULTI_API_SIGKILL=PASS",flush=True)
post_fixture("/release-second-child",{})
up=subprocess.run(COMPOSE+["up","-d","--no-deps","api"],
                  capture_output=True,text=True,timeout=120)
if up.returncode:fail("API_REBOOT_FAILED")
for attempt in range(60):
    try:
        with urlopen(BASE+"/api/config",timeout=4) as response:
            if response.status==200: break
    except (URLError, OSError, TimeoutError):pass
    time.sleep(2)
else:
    fail("API_NOT_READY_AFTER_COLD_RESTART")
print("CI_PR107_COLD_MULTI_API_RESTART=PASS",flush=True)

# Subscribe to the same old stream, not a new generation or second submission.
threading.Thread(target=read_stream,daemon=True).start()
outcome=None
for attempt in range(90):
    try:
        value=snapshot()
    except BaseException:
        time.sleep(2)
        continue
    state=redis_job(stream_id)
    if value["count"]>=2 and value["completed"]>=2 and value["published"]==1:
        outcome=(value,state)
        break
    if attempt%15==0:
        print("CI_PR107_COLD_MULTI_RECOVERY_COUNTS="+json.dumps(value,sort_keys=True),flush=True)
    time.sleep(2)
if outcome is None:
    print("CI_PR107_COLD_MULTI_RECOVERY_TIMEOUT=TRUE",flush=True)
    fail("TWO_CHILD_OR_PUBLICATION_RECOVERY_UNPROVEN")
value,state=outcome
if (value["count"]!=2 or value["completed"]!=2 or value["linked"]!=2 or
    value["errors"]!=0 or value["distinctTypes"]!=2 or value["published"]!=1):
    fail("DUPLICATE_OR_INVALID_DURABLE_LINEAGE")
_,plan_raw,oracle_raw=state
try:
    plan,oracle=json.loads(plan_raw),json.loads(oracle_raw)
    verdicts=oracle["results"][mission_id+"/main"]["verdicts"]
except (ValueError,TypeError,KeyError):
    fail("ORACLE_DURABLE_VERDICT_MISSING")
if (plan.get("mission",{}).get("missionId")!=mission_id or
    len(verdicts)!=1 or verdicts[0].get("status")!="VERIFIED"):
    fail("ORACLE_NOT_SINGLE_VERIFIED")
if metrics().get("child_responses",0)-before.get("child_responses",0)!=2:
    fail("CHILD_MODEL_EFFECT_REEXECUTED_OR_NOT_COMPLETED")
if metrics().get("parent_final",0)-before.get("parent_final",0)!=1:
    fail("PARENT_MODEL_FINAL_DUPLICATE_OR_MISSING")
print("CI_PR107_COLD_MULTI_TWO_CHILD_REPLAY_SAFE=PASS",flush=True)
print("CI_PR107_COLD_MULTI_SINGLE_ORACLE_VERIFIED=PASS",flush=True)
print("CI_PR107_COLD_MULTI_SINGLE_P6_AFTER_SIGKILL=PASS",flush=True)
