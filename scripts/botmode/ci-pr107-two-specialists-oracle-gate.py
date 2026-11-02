#!/usr/bin/env python3
"""Exact-HEAD CI: two distinct real host child threads with synthetic LLM output.

No external inference. Every PASS requires real persisted Mongo lineage,
one durable Oracle VERIFIED verdict, and one final response after both children.
"""
import json
import runpy
import subprocess
import time
import uuid
from urllib.request import Request, urlopen

gate = runpy.run_path("scripts/botmode/ci-oracle-delegated-mission-gate.py")
request = gate["request"]
result_events = gate["result_events"]
redis_job = gate["redis_job"]
COMPOSE = gate["COMPOSE"]
WORKER = gate["WORKER"]

def fail(reason):
    raise SystemExit("CI_PR107_MULTI_FAIL=" + reason)

def ci_node(code, env=()):
    command = COMPOSE + ["exec", "-T"]
    for name,value in env:
        command += ["-e", name + "=" + value]
    command += ["api", "node", "-e", code]
    result = subprocess.run(command, capture_output=True, text=True, timeout=50)
    if result.returncode:
        print("CI_PR107_MULTI_MONGO_ERROR=" + str(result.returncode), flush=True)
        fail("MONGO_INSPECTION")
    return result.stdout.strip()

ids_script = r"""
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const w=await mongoose.connection.db.collection('agents').findOne(
    {id:process.env.CI_WORKER_ID},{projection:{subagents:1}});
  const ids=w?.subagents?.agent_ids;
  if (!w?.subagents?.enabled || !Array.isArray(ids) || ids.length<2 ||
      ids[0]===ids[1]) throw Error('TWO_AUTHORIZED_SPECIALISTS_REQUIRED');
  console.log(JSON.stringify(ids.slice(0,2)));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.name);process.exitCode=1});
"""
children = json.loads(ci_node(ids_script, [("CI_WORKER_ID",WORKER)]))
if len(children) != 2 or len(set(children)) != 2:
    fail("NOT_TWO_DISTINCT_AUTHORIZED_AGENTS")

configure = Request(
    "http://127.0.0.1:8088/configure",
    data=json.dumps({"childIds": children}).encode(),
    headers={"Content-Type":"application/json"},method="POST",
)
with urlopen(configure, timeout=8) as response:
    result = json.load(response)
if not result.get("multi"):
    fail("MULTI_FIXTURE_NOT_ENABLED")

def metrics():
    with urlopen("http://127.0.0.1:8088/metrics",timeout=8) as response:
        return json.load(response)

baseline = metrics()
conversation_id = str(uuid.uuid4())
mission_id = "ci-pr107-two-" + str(uuid.uuid4())
mission = {
    "missionId":mission_id,
    "taskId":mission_id,
    "objective":"Two independent specialist tasks: first research, then analysis; synthesize once.",
    "constraints":["Use both authorized specialists, produce strict JSON only."],
    "requiredCapabilities":["basic"],
    "validation":{"criteria":[{"id":"ci-ok","field":"ok","expected":True}]},
}
payload = {
    "endpoint":"agents","agent_id":WORKER,
    "conversationId":conversation_id,"messageId":str(uuid.uuid4()),
    "parentMessageId":"00000000-0000-0000-0000-000000000000","isNewConvo":True,
    "text":'Execute two independent delegated checks; return only {"ok":true} after both.',
    "orchestratorMission":{
        "mission":mission,
        "plannerContext":{
            "worker":{"id":"ci-worker","agentId":WORKER,"role":"worker",
                      "capabilities":["basic"],"constraints":[]},
            "specialists":[{"id":agent_id,"agentId":agent_id,"role":"specialist",
                            "capabilities":["basic"],"constraints":[]}
                           for agent_id in children],
        },
    },
}
# The preceding single-child Oracle gate explicitly restarts the API.
# A Mongo CLI read can succeed before the HTTP server is ready.
for readiness_attempt in range(45):
    try:
        with urlopen("http://127.0.0.1:3090/api/config", timeout=4) as response:
            if response.status == 200:
                print("CI_PR107_MULTI_API_READY_AFTER_RESTART=PASS",flush=True)
                break
    except (OSError,TimeoutError):
        pass
    time.sleep(2)
else:
    fail("API_NOT_READY_AFTER_PREVIOUS_GATE")

for admission_attempt in range(12):
    status,body = request("POST","/api/agents/chat/agents",payload)
    if status != 503:
        break
    try:
        response_code = json.loads(body).get("code")
    except (ValueError, TypeError, AttributeError):
        response_code = None
    if response_code != "SERVER_NOT_READY":
        print("CI_PR107_MULTI_503_CLASS=UNEXPECTED",flush=True)
        break
    print("CI_PR107_MULTI_SERVER_NOT_READY_RETRY="+str(admission_attempt+1),flush=True)
    time.sleep(6)
if status != 200:
    print("CI_PR107_MULTI_START_HTTP="+str(status),flush=True)
    fail("MISSION_ADMISSION")
try:
    started=json.loads(body)
    stream_id=started["streamId"]
    if started.get("status")!="started": fail("START_ENVELOPE")
except (TypeError,ValueError,KeyError):
    fail("START_ENVELOPE")

stream_status,sse=request("GET","/api/agents/chat/stream/"+stream_id+"?resume=true")
if stream_status != 200: fail("SSE_HTTP")
events=result_events(sse)
finals=[e for e in events if e.get("final") is True]
errors=[e for e in events if e.get("event")=="error" or e.get("type")=="error"]
print("CI_PR107_MULTI_SSE_FINAL_COUNT="+str(len(finals)),flush=True)
if len(finals)!=1 or errors: fail("P6_SSE_NOT_UNIQUE")
if not isinstance(finals[0].get("responseMessage"),dict): fail("P6_FINAL_MISSING")

for _ in range(25):
    actual=metrics()
    if actual.get("child_responses",0)-baseline.get("child_responses",0)>=2:
        break
    time.sleep(2)
model_delta_failures=[]
for key,expected in (("parent_tool_requests",2),("child_responses",2),
                     ("parent_final",1),("missing_tool",0)):
    delta=actual.get(key,0)-baseline.get(key,0)
    print("CI_PR107_MULTI_"+key.upper()+"_DELTA="+str(delta),flush=True)
    if delta!=expected:
        model_delta_failures.append(key.upper())

snapshot_script=r"""
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const db=mongoose.connection.db;
  const parent=process.env.CI_PARENT_CONVO;
  const children=await db.collection('conversations').find(
      {'subagentThread.parentConversationId':parent}).toArray();
  const items=[];
  for (const child of children) {
    const link=child.subagentThread||{};
    const rows=await db.collection('messages').find(
      {conversationId:child.conversationId}).toArray();
    const statuses=rows.map(m=>m.subagentTask?.status).filter(Boolean);
    const terminal=rows.filter(m=>m.subagentTask?.status==='completed');
    const taskParents=new Set(rows.map(m=>m.subagentTask?.parentRunId).filter(Boolean));
    items.push({
      type:link.subagentType,
      running:statuses.includes('running'),
      error:statuses.includes('error'),
      cancelled:statuses.includes('cancelled'),
      linked:link.parentConversationId===parent &&
        link.rootConversationId===parent &&
        Boolean(link.parentToolCallId) && Boolean(link.parentMessageId) &&
        taskParents.size===1 && taskParents.has(link.parentMessageId),
      completed:terminal.length>0,
      latestTerminal:Math.max(0,...terminal.map(m=>new Date(m.updatedAt||m.createdAt||0).getTime())),
    });
  }
  const parentRows=await db.collection('messages').find({
    conversationId:parent,isCreatedByUser:false
  }).toArray();
  const published=parentRows.filter(m=>{
    const txt=String(m.text||'')+" "+JSON.stringify(m.content||'');
    return /"ok"\s*:\s*true/.test(txt.replace(/\\/g, ''));
  });
  console.log(JSON.stringify({children:items,published:published.length,
    finalCreated:published.length===1 ?
      new Date(published[0].createdAt||0).getTime():0,
    finalUpdated:published.length===1 ?
      new Date(published[0].updatedAt||0).getTime():0}));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.name);process.exitCode=1});
"""

def snapshot():
    return json.loads(ci_node(snapshot_script,[("CI_PARENT_CONVO",conversation_id)]))

# A failed count must not discard the database evidence needed to distinguish:
# absent task, running child, terminal failure, or premature P6 publication.
preflight=snapshot()
children_found=preflight["children"]
print("CI_PR107_MULTI_DURABLE_CHILD_COUNT="+str(len(children_found)),flush=True)
for label, field in (("LINKED","linked"),("COMPLETED","completed"),
                     ("RUNNING","running"),("ERROR","error"),("CANCELLED","cancelled")):
    print("CI_PR107_MULTI_DURABLE_"+label+"_COUNT="+str(
        sum(bool(child.get(field)) for child in children_found)),flush=True)
print("CI_PR107_MULTI_DURABLE_UNIQUE_TYPES="+str(
    len({child.get("type") for child in children_found})),flush=True)
print("CI_PR107_MULTI_DURABLE_PUBLISHED_COUNT="+str(preflight["published"]),flush=True)
if model_delta_failures:
    if preflight["published"] and not all(c.get("completed") for c in children_found):
        print("CI_PR107_MULTI_P6_PREMATURE_SUSPICION=TRUE",flush=True)
    fail("MODEL_DELTA_"+",".join(model_delta_failures))

findings=None
for attempt in range(25):
    findings=snapshot()
    if len(findings["children"])==2 and all(c["completed"] for c in findings["children"]):
        break
    time.sleep(2)
if len(findings["children"])!=2: fail("TWO_DURABLE_CHILD_THREADS_MISSING")
if not all(c["linked"] and c["completed"] for c in findings["children"]):
    fail("CHILD_LINEAGE_OR_TERMINAL_MISSING")
if len({c["type"] for c in findings["children"]})!=2:
    fail("TWO_DISTINCT_SPECIALISTS_NOT_PROVEN")
print("CI_PR107_MULTI_TWO_DISTINCT_DURABLE_CHILDREN=PASS",flush=True)
if findings["published"]!=1:
    print("CI_PR107_MULTI_PUBLISHED_COUNT="+str(findings["published"]),flush=True)
    fail("P6_DURABLE_PUBLICATION_NOT_SINGLE")
last_terminal=max(c["latestTerminal"] for c in findings["children"])
print("CI_PR107_MULTI_PARENT_CREATED_BEFORE_CHILDREN="+str(
    findings["finalCreated"] < last_terminal),flush=True)
print("CI_PR107_MULTI_FINAL_WRITE_AFTER_LAST_CHILD="+str(
    findings["finalUpdated"] >= last_terminal),flush=True)
if not findings["finalUpdated"] or findings["finalUpdated"] < last_terminal:
    fail("P6_PREMATURE_BEFORE_BOTH_CHILDREN")
print("CI_PR107_MULTI_P6_AFTER_BOTH_CHILDREN=PASS",flush=True)

task_id=mission_id+"/main"
persisted=None
for _ in range(15):
    status,plan_raw,state_raw=redis_job(stream_id)
    if plan_raw and state_raw:
        try:
            plan=json.loads(plan_raw)
            state=json.loads(state_raw)
            verdicts=state.get("results",{}).get(task_id,{}).get("verdicts",[])
            if verdicts:
                persisted=(plan,verdicts)
                break
        except (ValueError,TypeError):
            pass
    time.sleep(1)
if persisted is None: fail("ORACLE_NOT_PERSISTED")
plan,verdicts=persisted
if plan.get("mission",{}).get("missionId")!=mission_id or len(verdicts)!=1 \
        or verdicts[0].get("status")!="VERIFIED":
    fail("ORACLE_VERDICT_NOT_SINGLE_VERIFIED")
print("CI_PR107_MULTI_ORACLE_VERIFIED_SINGLE=PASS",flush=True)

restarted=subprocess.run(COMPOSE+["restart","api"],capture_output=True,text=True,timeout=110)
if restarted.returncode: fail("API_RESTART")
for _ in range(12):
    try:
        after=snapshot()
        break
    except Exception:
        time.sleep(2)
else: fail("MONGO_AFTER_API_RESTART")
if after["children"]!=findings["children"] or after["published"]!=1:
    fail("DURABLE_LINEAGE_OR_PUBLICATION_CHANGED_AFTER_RESTART")
print("CI_PR107_MULTI_RESTART_DURABILITY=PASS",flush=True)
print("BOTMODE_PR107_TWO_SPECIALISTS_ORACLE_P6=PASS",flush=True)
