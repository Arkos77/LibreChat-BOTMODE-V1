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
post_fixture("/configure",{"childIds":ids,"holdSecondChild":True,"nativeGraph":True})
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

# In a signed native Oracle plan, execution follows graph edges rather than
# spawning Mongo child conversations through the SDK subagent tool. A durable
# node write is required before killing the API; fixture calls alone are NOT proof.
native_proof_script=r"""
const mongoose=require('mongoose');(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const nodes=JSON.parse(process.env.CI_NATIVE_NODES);
 const docs=await mongoose.connection.db.collection('agent_checkpoints')
  .find({thread_id:process.env.CI_PARENT})
  .project({metadata_search:1}).toArray();
 const writes=nodes.map(node=>docs.filter(d=>
   d.metadata_search?.writes &&
   Object.prototype.hasOwnProperty.call(d.metadata_search.writes,node)).length);
 const steps=docs.map(d=>d.metadata_search?.step).filter(Number.isInteger);
 console.log(JSON.stringify({researchWrites:writes[0],analysisWrites:writes[1],
    checkpoints:docs.length,maxStep:steps.length?Math.max(...steps):null}));
 await mongoose.disconnect();
})().catch(e=>{console.log(JSON.stringify({unavailable:e.name}));process.exitCode=1});
"""
def native_state():
    return json.loads(run_node(native_proof_script,[
        ("CI_PARENT",conversation),
        ("CI_NATIVE_NODES",json.dumps([task["nodeId"] for task in tasks])),
    ]))

# Wait for first native child to finish and the second provider request to
# be in-flight. No arbitrary sleeps or synthetic fake child database records.
pre=None
for attempt in range(110):
    counts=metrics()
    if counts.get("held_second_child_requests",0)>0:
        native_pre=native_state()
        if native_pre.get("researchWrites",0)>0 and native_pre.get("analysisWrites",0)==0:
            pre=snapshot()
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
            # Global fixture counters include earlier CI scenarios; isolate
            # this mission's activity from the configure-time baseline.
            if isinstance(mm.get(label),int) and isinstance(before.get(label,0),int):
                print("CI_PR107_COLD_MULTI_MISSION_DELTA_"+label.upper()+"="+
                      str(mm[label]-before.get(label,0)),flush=True)
        # Bounded schema/phase metadata only. No request bodies, tool args,
        # model outputs or identities are emitted to CI logs.
        for label in ("advertised_subagent_requests","requests_without_subagent_tool",
                      "parent_tool_requests","missing_tool","unclassified_no_tool_turns"):
            if isinstance(mm.get(label),int) and isinstance(before.get(label,0),int):
                print("CI_PR107_COLD_MULTI_MISSION_DELTA_"+label.upper()+"="+
                      str(mm[label]-before.get(label,0)),flush=True)
        for label in ("last_tool_count","last_has_tool_result",
                      "last_prior_subagent_call","last_advertised_subagent"):
            value=mm.get(label)
            if type(value) is int and 0<=value<=1000:
                print("CI_PR107_COLD_MULTI_LAST_"+label.upper()+"="+str(value),flush=True)
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
    # Native Oracle plans compile direct graph nodes, not necessarily SDK
    # subagent tool calls. Probe only checkpoint counts for this conversation;
    # never print checkpoint data, namespace, identities or agent messages.
    try:
        native_probe=r"""
const mongoose=require('mongoose');(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const db=mongoose.connection.db;
 const docs=await db.collection('agent_checkpoints')
  .find({thread_id:process.env.CI_PARENT})
  .project({checkpoint_ns:1,metadata_search:1}).toArray();
 // MongoDBSaver stores serialized metadata separately. metadata_search is the
 // queryable BSON copy of LangGraph metadata, not the serialized payload.
 const steps=docs.map(x=>x.metadata_search?.step).filter(x=>Number.isInteger(x));
 const sources=docs.map(x=>x.metadata_search?.source)
   .filter(x=>typeof x==='string');
 const allowed=['input','loop','update','fork'];
 // Compare checkpoint write keys against the signed plan, without printing
 // node names, metadata values, checkpoint identifiers, or model content.
 const signedNodes=JSON.parse(process.env.CI_NATIVE_NODE_IDS);
 const nodeWrites=signedNodes.map(node=>docs.filter(doc=>{
   const writes=doc.metadata_search?.writes;
   return writes && typeof writes==='object' && 
     Object.prototype.hasOwnProperty.call(writes,node);
 }).length);
 console.log(JSON.stringify({
  root:docs.filter(x=>x.checkpoint_ns==='').length,
  scoped:docs.filter(x=>typeof x.checkpoint_ns==='string'&&x.checkpoint_ns!=='').length,
  total:docs.length,
  plannedNodeWriteCounts:nodeWrites,
  stepCount:steps.length,
  maxStep:steps.length?Math.max(...steps):null,
  sources:Object.fromEntries(allowed.map(k=>[k,sources.filter(v=>v===k).length])),
 }));
 await mongoose.disconnect();
})().catch(e=>{console.log(JSON.stringify({unavailable:e.name}));process.exitCode=1});
"""
        checkpoint_diag=json.loads(run_node(native_probe,[("CI_PARENT",conversation),("CI_NATIVE_NODE_IDS",json.dumps([task["nodeId"] for task in tasks]))]))
        for label in ("root","scoped","total"):
            print("CI_PR107_COLD_MULTI_NATIVE_CHECKPOINT_"+label.upper()+"="+
                  str(checkpoint_diag.get(label,"UNAVAILABLE")),flush=True)
        write_counts=checkpoint_diag.get("plannedNodeWriteCounts")
        if isinstance(write_counts,list) and len(write_counts)==2 and all(
            type(value) is int and 0<=value<=100000 for value in write_counts
        ):
            print("CI_PR107_COLD_MULTI_NATIVE_RESEARCH_WRITES="+str(write_counts[0]),flush=True)
            print("CI_PR107_COLD_MULTI_NATIVE_ANALYSIS_WRITES="+str(write_counts[1]),flush=True)
        for label in ("stepCount","maxStep"):
            value=checkpoint_diag.get(label)
            if type(value) is int and -1<=value<=100000:
                print("CI_PR107_COLD_MULTI_NATIVE_"+label.upper()+"="+str(value),flush=True)
        for label in ("input","loop","update","fork"):
            value=checkpoint_diag.get("sources",{}).get(label)
            if type(value) is int and 0<=value<=100000:
                print("CI_PR107_COLD_MULTI_NATIVE_SOURCE_"+label.upper()+"="+str(value),flush=True)
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as e:
        print("CI_PR107_COLD_MULTI_NATIVE_CHECKPOINT_DIAG_UNAVAILABLE="+
              type(e).__name__,flush=True)
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
    # The SSE deliberately returns only a generic publication error.
    # Inspect the *server-side* root cause without disclosing logs, IDs,
    # prompts, provider messages, auth headers, request bodies or secrets.
    # All emitted categories and codes below have a fixed allowlist.
    try:
        import re
        api_logs=subprocess.run(
            COMPOSE+["logs","--no-color","--tail","2500","api"],
            capture_output=True,text=True,timeout=25,check=True,
        ).stdout
        # The isolated API emits this directly BEFORE wrapping the original
        # exception for SSE. Only bounded, nonsecret fields are surfaced.
        for field in ("CODE","CLASS","MESSAGE_HASH","MESSAGE_LENGTH"):
            items=re.findall(
                r"CI_ORIGINAL_MISSION_ROOT_"+field+r"=([A-Za-z0-9_]{1,100})",
                api_logs
            )
            print("CI_PR107_COLD_MULTI_API_UNWRAPPED_"+field+"="+
                  (items[-1] if items else "NOT_OBSERVED"),flush=True)
        markers=(
            "Mission execution failed before publication",
            "NATIVE_BROKER",
            "NATIVE_ORIGINAL",
            "NATIVE_MISSION",
            "Failed to create run",
        )
        all_lines=api_logs.splitlines()
        # Winston transports can render getSafeErrorMetadata(err) on separate
        # following lines. Collect a bounded neighborhood, not only the
        # matching warning line. Everything remains private in this process.
        matches=[index for index,line in enumerate(all_lines)
                 if any(marker in line for marker in markers)]
        relevant=[line for index in matches
                  for line in all_lines[index:min(index+20,len(all_lines))]]
        # Independently classify the entire bounded log tail. This catches
        # structured errors whose metadata precedes the terminal warning.
        error_context=[line for line in all_lines
                       if any(k in line for k in (
                           "NATIVE_","MISSION_","ORCHESTRATOR_",
                           "Error:", "errorCode", "errorClass",
                           "Failed to create run", "Unsupported LLM provider",
                       ))]
        allowed_prefixes=(
            "NATIVE_", "MISSION_", "ORCHESTRATOR_", "BOTMODE_",
            "SUBAGENT_", "AGENT_", "MODEL_", "PROVIDER_",
        )
        codes=set()
        for line in relevant:
            for code in re.findall(r"\b[A-Z][A-Z0-9_]{6,100}\b",line):
                if code.startswith(allowed_prefixes):
                    codes.add(code)
        classes=sorted({name for name in (
            "TypeError","ReferenceError","SyntaxError","RangeError",
            "ValidationError","MongoServerError","Error",
        ) if any(re.search(r"\b"+name+r"\b",line) for line in relevant)})
        print("CI_PR107_COLD_MULTI_API_ROOT_LOG_COUNT="+str(len(relevant)),flush=True)
        print("CI_PR107_COLD_MULTI_API_ROOT_CODES="+
              (",".join(sorted(codes)) or "NONE"),flush=True)
        context_codes=sorted({code for line in error_context
            for code in re.findall(r"\\b[A-Z][A-Z0-9_]{6,100}\\b",line)
            if code.startswith(allowed_prefixes)})
        print("CI_PR107_COLD_MULTI_API_CONTEXT_CODES="+
              (",".join(context_codes[:16]) or "NONE"),flush=True)
        print("CI_PR107_COLD_MULTI_API_CONTEXT_LINE_COUNT="+
              str(len(error_context)),flush=True)
        print("CI_PR107_COLD_MULTI_API_ROOT_CLASSES="+
              (",".join(classes) or "NONE"),flush=True)
        # Do not output raw message fields: emit only class and SHA-256
        # prefixes of the metadata's own message value. This lets the host
        # correlate a constant exception from source without leaking content.
        import hashlib
        message_hashes=[]
        for line in relevant:
            for item in re.findall(
                r"""(?:['"]message['"]|\\bmessage)\\s*[:=]\\s*['"]([^'"]{1,250})['"]""",
                line
            ):
                message_hashes.append(
                    str(len(item))+":"+hashlib.sha256(item.lower().encode()).hexdigest()[:12]
                )
        print("CI_PR107_COLD_MULTI_API_ROOT_MESSAGE_HASHES="+
              (",".join(sorted(set(message_hashes))[:8]) or "NONE"),flush=True)
        phrase_map={
            "HOST_MODEL_UNAUTHORIZED":"NATIVE_BROKER_HOST_MODEL_UNAUTHORIZED",
            "TRANSPORT_CONFLICT":"NATIVE_BROKER_MODEL_TRANSPORT_CONFLICT",
            "GRAPH_BUILD":"Failed to create run",
            "MODEL_BINDING":"NATIVE_BROKER_MODEL_BINDING_UNAUTHORIZED",
            "ORIGINAL_CHECKPOINT":"NATIVE_ORIGINAL_CHECKPOINT",
            "NO_DEPENDENCY":"Cannot read properties",
            "UNSUPPORTED_PROVIDER":"Unsupported LLM provider",
            "MISSING_PROVIDER":"provider/model binding",
        }
        for name, phrase in phrase_map.items():
            print("CI_PR107_COLD_MULTI_API_ROOT_"+name+"="+
                  str(any(phrase in line for line in relevant)),flush=True)
    except (OSError,subprocess.SubprocessError,ValueError) as e:
        print("CI_PR107_COLD_MULTI_API_ROOT_DIAG_UNAVAILABLE="+
              type(e).__name__,flush=True)
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
if pre["published"]!=0:
    fail("P6_PREMATURE_BEFORE_NATIVE_ANALYSIS")
if native_pre["researchWrites"]<1 or native_pre["analysisWrites"]!=0:
    fail("NATIVE_PRECRASH_CHECKPOINT_NOT_READY")
if current_metrics.get("held_second_child_requests",0)!=1:
    fail("NATIVE_SECOND_PROVIDER_NOT_HELD")
print("CI_PR107_COLD_MULTI_NATIVE_RESEARCH_DURABLE_BEFORE_CRASH=PASS",flush=True)
print("CI_PR107_COLD_MULTI_NATIVE_ANALYSIS_HELD_BEFORE_CRASH=PASS",flush=True)

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
        state=redis_job(stream_id)
        native_post=native_state()
    except (OSError,ValueError,KeyError,TypeError):
        time.sleep(2)
        continue
    if native_post.get("researchWrites",0)>0 and native_post.get("analysisWrites",0)>0 and value["published"]==1:
        outcome=(value,state,native_post)
        break
    if attempt%15==0:
        print("CI_PR107_COLD_MULTI_NATIVE_RECOVERY="+json.dumps({
            "researchWrites":native_post.get("researchWrites",0),
            "analysisWrites":native_post.get("analysisWrites",0),
            "published":value["published"]
        },sort_keys=True),flush=True)
    time.sleep(2)
if outcome is None:
    fail("NATIVE_GRAPH_OR_PUBLICATION_RECOVERY_UNPROVEN")
value,state,native_post=outcome
if (native_post["researchWrites"]!=native_pre["researchWrites"] or
    native_post["analysisWrites"]!=1 or value["published"]!=1):
    fail("NATIVE_GRAPH_DUPLICATE_OR_INVALID_RECOVERY")
_,plan_raw,oracle_raw=state
try:
    plan,oracle=json.loads(plan_raw),json.loads(oracle_raw)
    verdicts=oracle["results"][mission_id+"/main"]["verdicts"]
except (ValueError,TypeError,KeyError):
    fail("ORACLE_DURABLE_VERDICT_MISSING")
if (plan.get("mission",{}).get("missionId")!=mission_id or
    len(verdicts)!=1 or verdicts[0].get("status")!="VERIFIED"):
    fail("ORACLE_NOT_SINGLE_VERIFIED")
if metrics().get("native_graph_turns",0)-before.get("native_graph_turns",0)!=2:
    fail("NATIVE_GRAPH_MODEL_EFFECT_REEXECUTED_OR_MISSING")
print("CI_PR107_COLD_MULTI_NATIVE_GRAPH_REPLAY_SAFE=PASS",flush=True)
print("CI_PR107_COLD_MULTI_SINGLE_ORACLE_VERIFIED=PASS",flush=True)
print("CI_PR107_COLD_MULTI_SINGLE_P6_AFTER_SIGKILL=PASS",flush=True)
