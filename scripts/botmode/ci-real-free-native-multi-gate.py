#!/usr/bin/env python3
"""Fail-closed CI: two different *real* free native children in one Oracle/P6 mission.

Explicitly opted in. Uses the existing source-built Docker stack and the real
NVIDIA :free relay. Up to six provider calls, no paid fallback. No private
messages, user identifiers, credentials, tool arguments or model text in logs.
"""
import hashlib
import json
import os
import runpy
import subprocess
import sys
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

core = runpy.run_path("scripts/botmode/ci-real-free-native-oracle-gate.py",
                      run_name="botmode_multi_core")
STATE = core["STATE"]
MODEL = core["MODEL"]


def fail(code):
    raise SystemExit("CI_REAL_MULTI_FAIL=" + code)


def inspect_children(parent_id, helpers, label):
    """Require exactly two distinct authorized, completed, correlated child threads."""
    node = r"""
const mongoose=require('mongoose');
const crypto=require('crypto');
(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const db=mongoose.connection.db;
 const parent=process.env.CI_REAL_PARENT_ID;
 const expected=JSON.parse(process.env.CI_REAL_AUTHORIZED_CHILD_IDS);
 const children=await db.collection('conversations').find(
   {'subagentThread.parentConversationId':parent},
   {projection:{conversationId:1,subagentThread:1}}).limit(5).toArray();
 const details=[];
 for(const child of children){
  const link=child.subagentThread||{};
  const messages=await db.collection('messages').find(
    {conversationId:child.conversationId},
    {projection:{text:1,error:1,unfinished:1,isCreatedByUser:1,subagentTask:1}}
  ).limit(30).toArray();
  const parentRunIds=[...new Set(messages.map(m=>m.subagentTask?.parentRunId).filter(Boolean))];
  const successes=messages.filter(m=>m.subagentTask?.status==='completed' &&
    m.error!==true && m.isCreatedByUser===false && m.unfinished!==true &&
    typeof m.text==='string' && m.text.trim().length>0);
  const failures=messages.filter(m=>m.error===true ||
    ['error','cancelled'].includes(m.subagentTask?.status));
  details.push({thread:child.conversationId,toolCall:link.parentToolCallId,
    type:link.subagentType,linked:link.parentConversationId===parent &&
      link.rootConversationId===parent && typeof link.parentMessageId==='string' &&
      link.parentMessageId.length>0 && typeof link.parentToolCallId==='string' &&
      link.parentToolCallId.length>0 && parentRunIds.length===1 &&
      link.parentMessageId===parentRunIds[0],
    completed:successes.length===1 && failures.length===0 && messages.length>=2});
 }
 const types=details.map(x=>x.type);
 const roles=types.map(t=>t===expected[0] || t==='RECHERCHE' ? 'research' :
                            t===expected[1] || t==='ANALYSE' ? 'analysis' : null);
 const known=roles.length===2 && roles.includes('research') && roles.includes('analysis');
 const valid=details.length===2 && details.every(x=>x.linked && x.completed) &&
   new Set(details.map(x=>x.thread)).size===2 &&
   new Set(details.map(x=>x.toolCall)).size===2 &&
   new Set(types).size===2 && known;
 const evidence=crypto.createHash('sha256').update(JSON.stringify(details.map(x=>
   [x.thread,x.toolCall,x.type]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))))
   .digest('hex');
 await mongoose.disconnect();
 console.log(JSON.stringify({ok:valid,count:details.length,
   linked:details.filter(x=>x.linked).length,
   completed:details.filter(x=>x.completed).length,
   distinct_types:new Set(types).size,known_types:known,fingerprint:evidence}));
})().catch(e=>{console.log(JSON.stringify({ok:false,error_class:e.name}));process.exitCode=2});
"""
    allowed = json.loads(Path("/tmp/botmode-ci-real-multi-child-map.json").read_text())
    expected = [allowed["research"], allowed["analysis"]]
    result = subprocess.run(helpers["COMPOSE"] + [
        "exec", "-T", "-e", "CI_REAL_PARENT_ID=" + parent_id,
        "-e", "CI_REAL_AUTHORIZED_CHILD_IDS=" + json.dumps(expected),
        "api", "node", "-e", node,
    ], capture_output=True, text=True, timeout=65)
    try:
        report = json.loads(result.stdout.strip())
    except (ValueError, TypeError):
        fail(label + "_CHILD_READBACK_NON_JSON")
    for field in ("count", "linked", "completed", "distinct_types"):
        value = report.get(field)
        print("CI_REAL_MULTI_" + label + "_" + field.upper() + "=" +
              (str(value) if type(value) is int and 0 <= value <= 5 else "OTHER"), flush=True)
    print("CI_REAL_MULTI_" + label + "_TWO_AUTHORIZED_CHILDREN=" +
          str(report.get("ok") is True).upper(), flush=True)
    if result.returncode or report.get("ok") is not True or report.get("count") != 2:
        fail(label + "_TWO_CHILDREN_NOT_DURABLY_COMPLETE")
    return report["fingerprint"]


def run():
    if not (os.environ.get("CI_REAL_FREE_PROVIDER") == "1" and
            os.environ.get("CI_NATIVE_REAL_INTEGRATED") == "1" and
            os.environ.get("CI_NATIVE_REAL_MULTI") == "1" and
            os.environ.get("CI_REAL_FORCE_FIRST_TOOL") == "0"):
        fail("EXPLICIT_FREE_UNFORCED_MULTI_OPT_IN_REQUIRED")
    before = json.loads(STATE.read_text())
    helpers = runpy.run_path("scripts/botmode/ci-oracle-delegated-mission-gate.py",
                             run_name="ci_multi_helpers")
    worker = Path("/tmp/botmode-ci-worker-id").read_text().strip()
    children = json.loads(Path("/tmp/botmode-ci-real-multi-child-map.json").read_text())
    if not worker or (len(set(children.values())) != 2 or
                      any(not isinstance(x, str) or not x.strip() or x == worker
                          for x in children.values())):
        fail("WORKER_OR_SPECIALIST_BINDINGS_INVALID")
    mission = "ci-native-real-multi-" + str(uuid.uuid4())
    parent = str(uuid.uuid4())
    task_id = mission + "/main"
    payload = {
        "endpoint": "agents", "agent_id": worker, "conversationId": parent,
        "messageId": str(uuid.uuid4()),
        "parentMessageId": "00000000-0000-0000-0000-000000000000",
        "isNewConvo": True,
        "text": (
            "Deux travaux indépendants sont obligatoires dans une seule mission. "
            "Sélectionne les deux spécialistes autorisés distincts RECHERCHE et ANALYSE. "
            "Lance immédiatement DEUX appels natifs subagent, un par spécialiste, chacun "
            "avec run_in_background=true, sans attendre la fin du premier pour lancer "
            "le second. RECHERCHE produit un constat court; ANALYSE réalise une vérification "
            "indépendante. Après le lancement de ces deux tâches, termine ce tour pour "
            "permettre les notifications automatiques de l'hôte. "
            "N'appelle PAS check_background_task sur des tâches en cours et ne fais "
            "aucun polling: la reprise automatique fournit les résultats persistés. "
            "Ne publie aucun résultat avant confirmation des DEUX achèvements distincts. "
            "Seulement ensuite retourne le JSON exact {\"ok\":true}."
        ),
        "orchestratorMission": {
            "mission": {
                "missionId": mission, "taskId": mission,
                "objective": "Deux enfants natifs réels Recherche et Analyse, Oracle et P6 uniques.",
                "constraints": [
                    "Déléguer à deux spécialistes distincts autorisés",
                    "Lancer les deux enfants avant toute attente, puis attendre leur fin durable sans polling",
                    "Ne publier qu'après les deux résultats",
                    "Répondre en JSON uniquement après achèvement",
                ],
                "requiredCapabilities": ["basic"],
                "validation": {"criteria": [{"id": "ci-multi-ok", "field": "ok",
                                             "expected": True}]},
            },
            "plannerContext": {
                "worker": {"id": "ci-worker", "agentId": worker, "role": "worker",
                           "capabilities": ["basic"], "constraints": []},
                "specialists": [
                    {"id": child_id, "agentId": child_id, "role": role,
                     "capabilities": [role + "_specialist_ci"], "constraints": []}
                    for role, child_id in (("research", children["research"]),
                                           ("analysis", children["analysis"]))
                ],
            },
        },
    }
    status, raw = helpers["request"]("POST", "/api/agents/chat/agents", payload)
    if status != 200:
        print("CI_REAL_MULTI_MISSION_HTTP=" + str(status), flush=True)
        fail("MISSION_ADMISSION_DENIED")
    try:
        started = json.loads(raw)
        stream_id = started["streamId"]
        if started.get("status") != "started" or not isinstance(stream_id, str) or not stream_id:
            raise ValueError("missing")
    except (KeyError, ValueError, TypeError):
        fail("MISSION_START_ENVELOPE_INVALID")
    print("CI_REAL_MULTI_SINGLE_PARENT_MISSION_STARTED=PASS", flush=True)
    http, events, outcome, subscriptions = core["read_native_terminal_stream"](helpers, stream_id)
    finals = [e for e in events if e.get("final") is True]
    errors = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
    print("CI_REAL_MULTI_SSE_OUTCOME=" + outcome, flush=True)
    # Never print any HTTP response body; a restricted code alone separates
    # missing/reclaimed streams, authorization failures and transport errors.
    safe_http={200,400,401,403,404,408,409,410,422,429,500,502,503,504}
    print("CI_REAL_MULTI_SSE_HTTP="+(str(http) if http in safe_http else "OTHER"),flush=True)
    print("CI_REAL_MULTI_SSE_SUBSCRIPTIONS="+
          (str(subscriptions) if isinstance(subscriptions,int) and 0<=subscriptions<=250
           else "OTHER"),flush=True)
    print("CI_REAL_MULTI_SSE_FINAL_COUNT=" + str(len(finals)), flush=True)
    if http != 200 or outcome != "TERMINAL_FRAME" or len(finals) != 1 or errors:
        core["bounded_failure_diagnostics"](helpers, stream_id, parent, events)
        # Preserve discriminating evidence even when the parent stream fails
        # before Oracle/P6: this NEVER turns a missing final into PASS.
        try:
            inspect_children(parent, helpers, "FAILED_STREAM_DIAGNOSTIC")
        except (SystemExit, OSError, ValueError, subprocess.SubprocessError):
            print("CI_REAL_MULTI_FAILED_STREAM_TWO_CHILDREN=NOT_PROVEN", flush=True)
        fail("TERMINAL_STREAM_INVALID")
    fingerprint = inspect_children(parent, helpers, "BEFORE_RESTART")
    with urlopen("http://127.0.0.1:8088/provider-diagnostics", timeout=8) as response:
        diagnostics = json.load(response)
    records = diagnostics.get("records")
    if (diagnostics.get("route") != MODEL or diagnostics.get("simulated") is not False or
            diagnostics.get("limit_requests") != 6 or not isinstance(records, list) or
            not 4 <= len(records) <= 6 or
            any(not isinstance(r, dict) or r.get("http_status") != 200 for r in records)):
        fail("REAL_PROVIDER_LIMIT_OR_STATUS_INVALID")
    if sum("subagent" in (r.get("tool_names") or []) for r in records) < 2:
        fail("TWO_NATIVE_TOOL_CALLS_NOT_ADVERTISED")
    if any(Decimal(str((r.get("usage") or {}).get("cost", 0))) > 0 for r in records):
        fail("POSITIVE_PROVIDER_COST_DETECTED")
    print("CI_REAL_MULTI_PROVIDER_REQUESTS=" + str(len(records)), flush=True)
    status, plan_raw, oracle_raw, response_id, pending = core["read_p6"](stream_id, helpers)
    if status != "complete" or not response_id.strip() or pending.strip() not in ("0", "false", "False"):
        fail("P6_NOT_COMMITTED")
    try:
        plan = json.loads(plan_raw)
        oracle = json.loads(oracle_raw)
        verdicts = oracle["results"][task_id]["verdicts"]
        if not (plan["mission"]["missionId"] == mission and len(plan["tasks"]) == 1
                and plan["tasks"][0].get("agentId") == worker and
                len(verdicts) == 1 and verdicts[0].get("status") == "VERIFIED"):
            fail("ORACLE_NOT_VERIFIED")
    except (ValueError, KeyError, TypeError, IndexError):
        fail("ORACLE_STATE_INVALID")
    core["verify_parent_message"](parent, response_id, helpers)
    print("CI_REAL_MULTI_ORACLE_VERIFIED_P6_SINGLE=PASS", flush=True)
    restarted = subprocess.run(helpers["COMPOSE"] + ["restart", "api"],
                               capture_output=True, text=True, timeout=120)
    if restarted.returncode:
        fail("API_RESTART_FAILED")
    if inspect_children(parent, helpers, "AFTER_RESTART") != fingerprint:
        fail("CHILD_IDENTITIES_CHANGED_AFTER_RESTART")
    post = core["read_p6"](stream_id, helpers)
    if list(post) != [status, plan_raw, oracle_raw, response_id, pending]:
        fail("ORACLE_P6_CHANGED_AFTER_RESTART")
    core["verify_parent_message"](parent, response_id, helpers)
    after = core["quota_and_price"](min_remaining=0)
    for key, value in before.items():
        if key in after and Decimal(after[key]) > Decimal(value):
            fail("POSITIVE_ACCOUNT_SPEND_DETECTED")
    print("CI_REAL_MULTI_NO_POSITIVE_ACCOUNT_SPEND=PASS", flush=True)
    print("BOTMODE_REAL_FREE_TWO_NATIVE_CHILDREN_ORACLE_P6_RESTART=PASS", flush=True)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--preflight"]:
            if os.environ.get("CI_NATIVE_REAL_MULTI") != "1":
                fail("OPT_IN_REQUIRED")
            STATE.write_text(json.dumps(core["quota_and_price"](min_remaining=6)))
            print("CI_REAL_MULTI_FREE_QUOTA_PRICE=PASS", flush=True)
        elif not sys.argv[1:]:
            run()
        else:
            fail("UNSUPPORTED_ARGUMENTS")
    except (HTTPError, URLError, TimeoutError, OSError, ValueError,
            ArithmeticError, InvalidOperation) as exc:
        print("CI_REAL_MULTI_ERROR_CLASS=" + type(exc).__name__, flush=True)
        fail("UPSTREAM_OR_IO_FAILURE")
