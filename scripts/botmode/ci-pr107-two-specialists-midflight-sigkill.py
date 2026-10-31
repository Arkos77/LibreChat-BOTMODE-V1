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
# The immutable plan MUST grant two actual native specialists. A single
# basic objective is solved by the basic-capable Worker, producing only ONE
# planned task; requiring 2 broker tasks then correctly fails admission.
# Two distinct capabilities and an explicit dependency make this a genuine
# signed research -> analysis mission, not a synthetic extra child side effect.
mission = {"missionId":mission_id,"taskId":mission_id,
           "objective":"Research then analyse; publish one verified synthesis.",
           "constraints":["Answer strictly with the approved JSON."],
           "requiredCapabilities":["ci-native-research","ci-native-analysis"],
           "objectives":[
               {"key":"research","objective":"Perform the delegated research.",
                "requiredCapabilities":["ci-native-research"],"dependsOn":[]},
               {"key":"analysis","objective":"Analyse the research result.",
                "requiredCapabilities":["ci-native-analysis"],"dependsOn":["research"]},
           ],
           "validation":{"criteria":[{"id":"ci-ok","field":"ok","expected":True}]}}
payload={"endpoint":"agents","agent_id":WORKER,
         "conversationId":conversation,"messageId":str(uuid.uuid4()),
         "parentMessageId":"00000000-0000-0000-0000-000000000000",
         "isNewConvo":True,
         "text":'Execute the signed research then analysis tasks and answer {"ok":true}.',
         "orchestratorMission":{"mission":mission,"plannerContext":{
             "worker":{"id":"ci-worker","agentId":WORKER,"role":"worker","capabilities":["basic"],
                       "constraints":[]},
             "specialists":[{"id":a,"agentId":a,"role":"specialist",
                             "capabilities":["basic",("ci-native-research" if i==0 else "ci-native-analysis")],
                             "constraints":[]} for i,a in enumerate(ids)]}}}
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

# Fail immediately if the server-signed plan ever drifts back to a
# DIRECT/one-task Worker plan. No child request, provider dispatch or SIGKILL
# is allowed for a plan that cannot authorize BOTH selected specialists.
planned=None
for attempt in range(30):
    try:
        _,plan_raw,_=redis_job(stream_id)
        if plan_raw:
            planned=json.loads(plan_raw)
            break
    except (ValueError,TypeError,KeyError):
        fail("ORIGINAL_SIGNED_PLAN_UNREADABLE")
    time.sleep(0.2)
if not isinstance(planned,dict):
    fail("ORIGINAL_SIGNED_PLAN_MISSING")
tasks=planned.get("tasks")
if not (
    planned.get("strategy")=="SEQUENTIAL" and
    isinstance(tasks,list) and len(tasks)==2 and
    tasks[0].get("agentId")==ids[0] and
    tasks[1].get("agentId")==ids[1] and
    tasks[0].get("key")=="research" and
    tasks[1].get("key")=="analysis" and
    tasks[1].get("dependsOn")==["research"]
):
    fail("ORIGINAL_SIGNED_TWO_SPECIALIST_PLAN_DENIED")
print("CI_PR107_COLD_MULTI_TWO_SPECIALIST_SIGNED_PLAN=PASS",flush=True)

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
    # Diagnose this precise gate without disclosing identities, prompts or
    # model outputs. A missing hold can mean no child execution, a rejected
    # provider operation, or an unrelated checkpoint refusal.
    try:
        p=snapshot()
        for label in ("count","linked","completed","errors","distinctTypes","published"):
            print("CI_PR107_COLD_MULTI_WAIT_"+label.upper()+"="+str(p[label]),flush=True)
        mm=metrics()
        for label in ("completion_calls","child_responses","held_second_child_requests",
                      "parent_final"):
            print("CI_PR107_COLD_MULTI_WAIT_METRIC_"+label.upper()+"="+str(mm.get(label,0)),flush=True)
        diag_script=r"""
const mongoose=require('mongoose');(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const c=mongoose.connection.db.collection('native_mission_provider_calls');
 const [total,statuses]=await Promise.all([
    c.countDocuments({}),
    c.aggregate([{$group:{_id:'$status',count:{$sum:1}}}]).toArray(),
 ]);
 console.log(JSON.stringify({total,statuses:statuses.map(v=>({
   status:typeof v._id==='string' && /^[a-z_]{1,30}$/.test(v._id)?v._id:'unknown',
   count:v.count,
 }))}));
 await mongoose.disconnect();
})().catch(e=>{console.log(JSON.stringify({unavailable:e.name}));process.exitCode=1});
"""
        j=json.loads(run_node(diag_script,[]))
        print("CI_PR107_COLD_MULTI_WAIT_ORIGINAL_JOURNAL_TOTAL="+str(j.get("total","unavailable")),flush=True)
        for record in j.get("statuses",[]):
            print("CI_PR107_COLD_MULTI_WAIT_ORIGINAL_JOURNAL_STATUS_"+
                  record["status"].upper()+"="+str(record["count"]),flush=True)
    except Exception as e:
        print("CI_PR107_COLD_MULTI_WAIT_DIAG_UNAVAILABLE="+type(e).__name__,flush=True)
    # The accepted HTTP admission is not proof that the background job
    # reached graph initialization. Report only status + allowlisted error
    # categories, not raw Redis JSON, prompts, keys, tokens or SSE content.
    try:
        status, plan_text, oracle_text = redis_job(stream_id)
        safe_status = status if status in (
            "queued", "pending", "running", "completed", "failed",
            "cancelled", "interrupted", "paused", "error"
        ) else "OTHER_OR_MISSING"
        print("CI_PR107_COLD_MULTI_WAIT_REDIS_STATUS="+safe_status,flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_REDIS_PLAN_PERSISTED="+
              str(bool(plan_text)),flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_REDIS_ORACLE_STATE_PERSISTED="+
              str(bool(oracle_text)),flush=True)
        gate["classify_durable_failure"](stream_id)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as e:
        print("CI_PR107_COLD_MULTI_WAIT_REDIS_DIAG_UNAVAILABLE="+
              type(e).__name__,flush=True)
    try:
        observed=[e for reply in stream_replies for e in reply.get("events",[])
                  if isinstance(e,dict)]
        categories,fingerprint,length=gate["diagnostic_error_class"](observed)
        print("CI_PR107_COLD_MULTI_WAIT_SSE_REPLY_COUNT="+str(len(stream_replies)),flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_SSE_EVENTS="+str(len(observed)),flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_SSE_ERROR_CLASSES="+categories,flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_SSE_ERROR_FINGERPRINT="+fingerprint,flush=True)
        print("CI_PR107_COLD_MULTI_WAIT_SSE_ERROR_TEXT_LENGTH="+str(length),flush=True)
    except (ValueError,TypeError,KeyError) as e:
        print("CI_PR107_COLD_MULTI_WAIT_SSE_DIAG_UNAVAILABLE="+type(e).__name__,flush=True)
    fail("SECOND_CHILD_NOT_HELD_AFTER_FIRST_PERSISTED")
# Identify a real P6 early publication separately from an errored child.
# Never log prompts, child IDs, JWTs, or raw private database messages.
for label in ("count","linked","completed","errors","distinctTypes","published"):
    print("CI_PR107_COLD_MULTI_PRECRASH_"+label.upper()+"="+str(pre[label]),flush=True)
current_metrics=metrics()
print("CI_PR107_COLD_MULTI_PRECRASH_PARENT_FINAL_CALLS="+str(
    current_metrics.get("parent_final",0)-before.get("parent_final",0)),flush=True)
print("CI_PR107_COLD_MULTI_PRECRASH_SECOND_HELD="+str(
    current_metrics.get("held_second_child_requests",0)),flush=True)
print("CI_PR107_COLD_MULTI_PRECRASH_STREAM_FINALS="+str(sum(
    len([e for e in item.get("events",[]) if e.get("final") is True])
    for item in stream_replies)),flush=True)
job_status,_,job_oracle=redis_job(stream_id)
print("CI_PR107_COLD_MULTI_PRECRASH_REDIS_STATUS="+str(job_status),flush=True)
try:
    st=json.loads(job_oracle) if job_oracle else {}
    verdicts=st.get("results",{}).get(mission_id+"/main",{}).get("verdicts",[])
    print("CI_PR107_COLD_MULTI_PRECRASH_ORACLE_VERDICT_COUNT="+str(len(verdicts)),flush=True)
except (ValueError,TypeError,AttributeError):
    print("CI_PR107_COLD_MULTI_PRECRASH_ORACLE_STATE=UNREADABLE",flush=True)
if pre["errors"]!=0:
    fail("CHILD_TERMINAL_ERROR_BEFORE_CRASH")
if pre["published"]!=0:
    fail("PARENT_OUTPUT_BEFORE_SECOND_CHILD_RESULT")
print("CI_PR107_COLD_MULTI_PRECRASH_TWO_THREADS_ONE_COMPLETED=PASS",flush=True)

# Prove the actual second child's operation (not the separately successful
# synthetic broker smoke) belongs to the exact original provider journal.
# On a disconnected integration, fail in seconds instead of timing out after
# a SIGKILL and wrongly treating an unrelated broker receipt as recovery proof.
actual_child_proof = r"""
const m=require('mongoose');
(async()=>{
  await m.connect(process.env.MONGO_URI);
  const db=m.connection.db, parent=process.env.CI_PARENT;
  const children=await db.collection('conversations')
    .find({'subagentThread.parentConversationId':parent}).toArray();
  const pending=[];
  for(const child of children) {
    const rows=await db.collection('messages')
      .find({conversationId:child.conversationId}).toArray();
    if(rows.some(row=>row.subagentTask?.status==='completed')) continue;
    const starts=rows.filter(row=>row.subagentTask?.status==='running');
    if(starts.length!==1) throw Error('NATIVE_SECOND_CHILD_START_AMBIGUOUS');
    const lineage=child.subagentThread;
    const taskId=starts[0].messageId.replace(/:user$/, '');
    if(taskId===starts[0].messageId ||
       starts[0].subagentTask?.parentRunId!==lineage?.parentMessageId ||
       !lineage?.parentToolCallId) throw Error('NATIVE_SECOND_CHILD_LINEAGE_INVALID');
    // The real original child host writes the production-named Mongo journal
    // in this disposable CI DB. The "_ci" collection belongs exclusively to
    // the independent synthetic broker smoke and MUST NOT satisfy this proof.
    const calls=await db.collection('native_mission_provider_calls').countDocuments({
      'identity.childThreadId':child.conversationId,
      'identity.parentRunId':lineage.parentMessageId,
      // The broker's immutable identity deliberately excludes the tool call;
      // the task+attempt bind that original parent tool call in Mongo.
      'identity.taskId':taskId,
      'identity.attemptKey':starts[0].subagentTask.attemptKey,
    });
    // An SDK child checkpoint uses an encoded subagent: graph identity,
    // not the Task Engine's Mongo conversation UUID. Check its original
    // parent/agent/tool identity without revealing checkpoint content or keys.
    const checkpointRows=await db.collection('agent_checkpoints')
      .find({thread_id:/^subagent:/}).project({thread_id:1}).toArray();
    let checkpoints=0, fromSameParent=0, matchedAgent=0, matchedTool=0;
    for(const row of checkpointRows){
      let coordinates;
      try {
        coordinates=JSON.parse(Buffer.from(row.thread_id.slice('subagent:'.length),
           'base64url').toString('utf8'));
      } catch {continue;}
      // SDK SubagentExecutionRegistry.createAddress encodes the conversation
      // thread_id, parent checkpoint fork, parent agent, original tool call
      // and batch (optionally a sixth resume-attempt entry). It does NOT encode
      // the parent's response message id as its first coordinate.
      if(Array.isArray(coordinates) && (coordinates.length===5 || coordinates.length===6) &&
         coordinates.every(v=>typeof v==='string' && v.length>0) &&
         coordinates[0]===parent) {
        fromSameParent++;
        if(coordinates[2]===lineage.parentAgentId) matchedAgent++;
        if(coordinates[3]===lineage.parentToolCallId) matchedTool++;
        if(coordinates[2]===lineage.parentAgentId &&
           coordinates[3]===lineage.parentToolCallId) {
          // The optional sixth field is a durable SDK resume attempt ID,
          // not necessarily the Mongo parent response message ID.
          // This is only an inventory: the original lease/attempt and exact
          // checkpoint grant are checked separately before dispatch.
          checkpoints++;
        }
      }
    }
    pending.push({calls,checkpoints,fromSameParent,matchedAgent,matchedTool,raw:checkpointRows.length});
  }
  console.log(JSON.stringify({pending:pending.length,
    originalBrokerReceipts:pending.reduce((n,c)=>n+c.calls,0),
    childCheckpointRows:pending.reduce((n,c)=>n+c.checkpoints,0),
    parentCheckpointRows:pending.reduce((n,c)=>n+c.fromSameParent,0),
    parentAgentMatches:pending.reduce((n,c)=>n+c.matchedAgent,0),
    parentToolMatches:pending.reduce((n,c)=>n+c.matchedTool,0),
    rawSubagentCheckpointRows:pending.reduce((n,c)=>n+c.raw,0)}));
  await m.disconnect();
})().catch(e=>{console.error(e.name);process.exitCode=1});
"""
proof=json.loads(run_node(actual_child_proof,[("CI_PARENT",conversation)]))
# Keep the standalone synthetic /ci broker smoke independent from genuine
# mission child effects; a fixture call cannot satisfy the real Mongo proof.
print("CI_PR107_COLD_MULTI_ORIGINAL_BROKER_RECEIPTS="+str(
    proof["originalBrokerReceipts"]),flush=True)
print("CI_PR107_COLD_MULTI_CHILD_CHECKPOINT_ROWS="+str(
    proof["childCheckpointRows"]),flush=True)
print("CI_PR107_COLD_MULTI_PARENT_CHECKPOINT_ROWS="+str(
    proof["parentCheckpointRows"]),flush=True)
print("CI_PR107_COLD_MULTI_RAW_SDK_CHECKPOINT_ROWS="+str(
    proof["rawSubagentCheckpointRows"]),flush=True)
print("CI_PR107_COLD_MULTI_PARENT_AGENT_MATCHES="+str(
    proof["parentAgentMatches"]),flush=True)
print("CI_PR107_COLD_MULTI_PARENT_TOOL_MATCHES="+str(
    proof["parentToolMatches"]),flush=True)
if proof["pending"]!=1:
    fail("SECOND_CHILD_ORIGINAL_IDENTITY_AMBIGUOUS")
if proof["originalBrokerReceipts"]!=1:
    fail("SECOND_CHILD_PROVIDER_NOT_BOUND_TO_ORIGINAL_BROKER")
if proof["childCheckpointRows"]<1:
    fail("SECOND_CHILD_DURABLE_SDK_CHECKPOINT_MISSING")


# Only this disposable GitHub Actions compose service is ever killed.
dead=subprocess.run(COMPOSE+["kill","-s","SIGKILL","api"],
                    capture_output=True,text=True,timeout=20)
if dead.returncode: fail("SIGKILL_DISPOSABLE_API")
print("CI_PR107_COLD_MULTI_API_SIGKILL=PASS",flush=True)
# Complete the independent broker's ORIGINAL in-flight mock call only after
# the API is dead. No new provider call is submitted or reconstructed.
post_fixture("/release-ci-broker", {})
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
