#!/usr/bin/env python3
"""CI-only GitHub runner verifier for exact candidate Oracle + publication.

Requires the isolated candidate Compose services (including disposable Redis)
and a CI principal token. Does not print model content, secrets, or verdict inputs.
"""
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:3090"
COMPOSE = [
    "docker", "compose", "-f", "docker-compose.botmode.yml",
    "-f", "docker-compose.botmode-lite.yml",
]
TOKEN = Path("/tmp/botmode-e2e-test-token").read_text().strip()
WORKER = Path("/tmp/botmode-ci-worker-id").read_text().strip()
CHILD = Path("/tmp/botmode-ci-child-id").read_text().strip()
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
# The pinned candidate's ioredis client applies GLOBAL_PREFIX_SEPARATOR='::'
# even when REDIS_KEY_PREFIX is empty. redis-cli bypasses that client prefix.
# This CI stack leaves REDIS_KEY_PREFIX / REDIS_KEY_PREFIX_VAR unset.
REDIS_PHYSICAL_PREFIX = "::"

def fail(reason):
    raise SystemExit("CI_ORACLE_GATE_FAIL=" + reason)

def request(method, url, body=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    headers = {"Authorization": "Bearer " + TOKEN, "User-Agent": UA, "Accept": "text/event-stream"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(BASE + url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=220) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")

def result_events(raw):
    events = []
    for line in raw.splitlines():
        if line.startswith("data:"):
            try:
                item = json.loads(line[5:].strip())
                if isinstance(item, dict):
                    events.append(item)
            except (ValueError, TypeError):
                pass
    return events

def response_text(message):
    if not isinstance(message, dict):
        return ""
    body = message.get("text")
    if isinstance(body, str) and body.strip():
        return body
    parts = message.get("content")
    if isinstance(parts, str):
        return parts
    if isinstance(parts, list):
        return " ".join(
            p.get("text", "") for p in parts
            if isinstance(p, dict) and isinstance(p.get("text"), str)
        )
    return ""

def redis_job(stream_id):
    key = REDIS_PHYSICAL_PREFIX + "stream:{" + stream_id + "}:job"
    def field(name):
        cmd = COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw", "HGET", key, name]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=20, check=True)
        return out.stdout.strip()
    return field("status"), field("orchestratorPlan"), field("missionOracleState")

def classify_durable_failure(stream_id):
    """Read the real epoch's Redis terminal cause with allowlisted labels only."""
    key = REDIS_PHYSICAL_PREFIX + "stream:{" + stream_id + "}:job"
    p = subprocess.run(COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw",
                                  "HGET", key, "error"],
                       capture_output=True, text=True, timeout=20, check=True)
    value = p.stdout.strip().lower()
    categories = {
        "TERMINAL_TASK_OUTPUT_MISSING": ("native mission terminal oracle missing exact task output",),
        "DURABLE_MISSION_ORACLE_FAILURE": ("mission oracle result persistence verification failed",),
        "DURABLE_EVIDENCE_FAILURE": ("mission oracle evidence persistence verification failed",),
        "MISSION_ORACLE_VERDICT_BLOCKED": ("native mission oracle blocked task",),
        "CANDIDATE_MISSING": ("candidate missing",),
        "AUTHORIZED_BINDING_MISSING": ("missing or mismatched authorized binding",),
        "ORCHESTRATOR_PLAN_INVALID": ("orchestrator plan", "invalid native task identity"),
    }
    matched = [k for k, patterns in categories.items()
               if any(pattern in value for pattern in patterns)]
    print("CI_ORACLE_DURABLE_TERMINAL_ERROR_PRESENT=" + str(bool(value)), flush=True)
    print("CI_ORACLE_DURABLE_TERMINAL_ERROR_CLASS=" +
          (",".join(matched) if matched else "UNCLASSIFIED"), flush=True)

def safe_error_fragments(events):
    """Synthetic-CI model errors only, with secrets, URLs and identifiers scrubbed."""
    import re
    found = []
    for e in events:
        if not isinstance(e, dict):
            continue
        response = e.get("responseMessage")
        if isinstance(response, dict):
            parts = response.get("content")
            if isinstance(parts, list):
                for part in parts:
                    if isinstance(part, dict) and part.get("type") == "error":
                        value = part.get("error", "")
                        found.append(str(value))
    scrubbed = []
    for value in found:
        value = re.sub(r'(?i)(bearer\\s+|sk-[a-z0-9_-]+|api[_ -]?key[^, }\\n]*)', '[REDACTED]', value)
        value = re.sub(r'https?://\\S+|[\\w.+-]+@[\\w.-]+', '[REDACTED]', value)
        value = re.sub(r'[A-Za-z0-9_=-]{20,}', '[REDACTED]', value)
        value = re.sub(r'[^A-Za-z0-9 :_,.()\[\]/-]', '?', value)
        scrubbed.append(value[:220])
    return scrubbed

def inspect_reference_sse():
    file = Path("/tmp/botmode-ci-real-sse.txt")
    if not file.exists():
        fail("REFERENCE_SSE_FILE_MISSING")
    events = result_events(file.read_text(errors="replace"))
    finals = [e.get("responseMessage") for e in events
              if e.get("final") is True and isinstance(e.get("responseMessage"), dict)]
    types = sorted({str(p.get("type", "unspecified")) for r in finals
                    for p in (r.get("content") if isinstance(r.get("content"), list) else [])
                    if isinstance(p, dict)})
    print("CI_REFERENCE_FINAL_CONTENT_TYPES=" + ",".join(types), flush=True)
    for value in safe_error_fragments(events):
        print("CI_REFERENCE_SAFE_ERROR=" + value, flush=True)
    print("CI_REFERENCE_HAS_ERROR_PART=" + str("error" in types), flush=True)
    return "error" not in types

def diagnostic_error_class(events):
    """Allowlist error classification: never print raw provider messages."""
    terms = {
        "ORCHESTRATOR_SPECIALIST": ("orchestrator specialist", "specialist is not authorized"),
        "ORCHESTRATOR_PLAN": ("orchestrator plan", "invalid orchestrator", "native task identity"),
        "GRAPH_BINDING": ("authorized agent binding", "missing or mismatched", "invalid graph"),
        "MISSING_OUTPUT": ("missing exact task output", "checkpointed predecessor output"),
        "MISSION_ORACLE": ("mission oracle", "oracle blocked", "mission_oracle_failure"),
        "PROVIDER_AUTH": ("invalid api key", "no api key", "authentication", "unauthorized"),
        "PROVIDER_LIMIT": ("rate limit", "429", "quota", "free model"),
        "PROVIDER_MODEL": ("model not found", "invalid model", "no endpoints", "model unavailable"),
        "PROVIDER_MISC": ("provider", "model failed", "generation failed"),
        "SERVER_INTERNAL": ("internal server", "internal error", "cannot read properties"),
    }
    fragments = []
    for e in events:
        r = e.get("responseMessage")
        if isinstance(r, dict):
            content = r.get("content") or []
            for part in content if isinstance(content, list) else []:
                if isinstance(part, dict) and part.get("type") == "error":
                    value = part.get("error", "")
                    fragments.append(json.dumps(value, ensure_ascii=False).lower()
                                     if isinstance(value, (dict, list)) else str(value).lower())
        for field in ("error", "message"):
            value = e.get(field)
            if isinstance(value, str):
                fragments.append(value.lower())
    raw = " ".join(fragments)
    import hashlib
    return ",".join(k for k, phrases in terms.items() if any(p in raw for p in phrases)) or "UNCLASSIFIED", hashlib.sha256(raw.encode()).hexdigest()[:12], len(raw)

def redis_connection_summary(stream_id):
    cmd = COMPOSE + ["exec", "-T", "api", "node", "-e",
                     "console.log(JSON.stringify({redis:process.env.USE_REDIS,streams:process.env.USE_REDIS_STREAMS,keep:process.env.STREAM_KEEP_COMPLETED_JOBS,redisUriConfigured:Boolean(process.env.REDIS_URI)}))"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if proc.returncode == 0:
        try:
            info = json.loads(proc.stdout.strip().splitlines()[-1])
            print("CI_ORACLE_RUNTIME_REDIS=" + str(info.get("redis")), flush=True)
            print("CI_ORACLE_RUNTIME_STREAMS=" + str(info.get("streams")), flush=True)
            print("CI_ORACLE_RUNTIME_KEEP=" + str(info.get("keep")), flush=True)
            print("CI_ORACLE_RUNTIME_REDIS_URI_CONFIGURED=" + str(info.get("redisUriConfigured")), flush=True)
        except (TypeError, ValueError, IndexError):
            print("CI_ORACLE_RUNTIME_ENV_INSPECTION_FAILED=true", flush=True)
    logs = subprocess.run(COMPOSE + ["logs", "--no-color", "--tail", "140", "api"],
                          capture_output=True, text=True, timeout=20)
    logdata = logs.stdout.lower() if logs.returncode == 0 else ""
    # Report only fixed boolean diagnostics; never display API logs or prompts.
    for category in (
        "missing_output", "verdict_persistence", "evidence_persistence",
        "verdict_blocked", "result_replay_conflict", "invalid_mission",
        "sdk_output_method", "type_access", "job_storage", "other",
    ):
        token = "ci_oracle_diagnostic_failure class=" + category
        print("CI_DIAGNOSTIC_CLASS_" + category.upper() + "=" +
              str(token in logdata), flush=True)
    print("CI_DIAGNOSTIC_OUTPUT_MARKER_PRESENT=" +
          str("ci_oracle_diagnostic_output " in logdata), flush=True)
    # Read only fixed enums generated by our CI-only runtime instrumentation.
    # Do not emit the raw application log (which may contain request metadata).
    for label, choices in (
        ("INSTANCE_METHOD", ("function", "undefined", "object", "other")),
        ("SDK_METHOD", ("function", "undefined", "object", "other")),
        ("GRAPH_METHOD", ("function", "undefined", "object", "other")),
        ("OUTPUT_ERROR", ("none", "method_not_function", "method_unavailable",
                          "graph_uninitialized", "type_error", "get_output_exception")),
    ):
        field = {
            "INSTANCE_METHOD": "instancemethod",
            "SDK_METHOD": "sdkmethod",
            "GRAPH_METHOD": "graphmethod",
            "OUTPUT_ERROR": "outputerror",
        }[label]
        accepted = next((choice for choice in choices
                         if (field + "=" + choice) in logdata), "unknown")
        print("CI_ORACLE_PROBE_" + label + "=" + accepted.upper(), flush=True)
    for flag in ("ctormatches=true", "ctormatches=false",
                 "issdkrun=true", "issdkrun=false",
                 "prototypeaccessor=true", "prototypeaccessor=false",
                 "ownshadow=true", "ownshadow=false",
                 "graphmessages=true", "graphmessages=false"):
        print("CI_HTTP_RUN_" + flag.upper().replace("=", "_") + "=" +
              str("ci_oracle_diagnostic_output " in logdata and flag in logdata),
              flush=True)
    for flag in ("missing=0", "missing=1", "outputerror=none",
                 "nonempty=true", "nonempty=false"):
        print("CI_DIAGNOSTIC_OUTPUT_" + flag.upper().replace("=", "_") + "=" +
              str(("ci_oracle_diagnostic_output " in logdata)
                  and (flag in logdata)), flush=True)

    for label, phrase in (
        ("STORE_REDIS", "created redis-backed stream services"),
        ("STORE_MEMORY", "created in-memory stream services"),
        ("STORE_REDIS_FALLBACK", "falling back to in-memory"),
        ("PLAN_FAILURE", "orchestrator plan"),
        ("MISSION_ORACLE_FAILURE", "mission oracle"),
        ("BINDING_FAILURE", "authorized agent binding"),
        ("SPECIALIST_AUTH_FAILURE", "orchestrator specialist"),
    ):
        print("CI_ORACLE_" + label + "_IN_LAST_API_LOG=" + str(phrase in logdata), flush=True)
    scan = subprocess.run(COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw",
                                    "--scan", "--pattern", REDIS_PHYSICAL_PREFIX + "stream:*:job"],
                          capture_output=True, text=True, timeout=20)
    if scan.returncode == 0:
        print("CI_ORACLE_REDIS_JOB_KEY_COUNT=" + str(len([x for x in scan.stdout.splitlines() if x.strip()])), flush=True)

def redis_field_names(stream_id):
    key = REDIS_PHYSICAL_PREFIX + "stream:{" + stream_id + "}:job"
    p = subprocess.run(COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw",
                                  "HKEYS", key], capture_output=True, text=True,
                       timeout=20, check=True)
    return sorted(item for item in p.stdout.splitlines() if item.strip())

def verify(label, review, expected_status):
    conversation_id = str(uuid.uuid4())
    mission_id = "ci-oracle-" + str(uuid.uuid4())
    task_id = mission_id + "/main"
    mission = {
        "missionId": mission_id,
        "taskId": mission_id,
        "objective": "Deleguer a un specialiste autorise puis produire exactement le JSON valide par Oracle.",
        "constraints": ["Ne produis que du JSON strict sans balise Markdown."],
        "requiredCapabilities": ["basic"],
        "validation": {
            "criteria": [{"id": "ci-ok", "field": "ok", "expected": True}],
        },
    }
    if review:
        mission["validation"]["review"] = {"required": True, "reason": "policy"}
    payload = {
        "endpoint": "agents",
        "agent_id": WORKER,
        "conversationId": conversation_id,
        "messageId": str(uuid.uuid4()),
        "parentMessageId": "00000000-0000-0000-0000-000000000000",
        "isNewConvo": True,
        "text": 'Mission Oracle obligatoire. Réponds uniquement par cet objet JSON exact : {"ok":true}. Aucun commentaire.',
        "orchestratorMission": {
            "mission": mission,
            "plannerContext": {
                "worker": {
                    "id": "ci-worker",
                    "agentId": WORKER,
                    "role": "worker",
                    "capabilities": ["basic"],
                    "constraints": [],
                },
                "specialists": ([{"id": CHILD, "agentId": CHILD, "role": "specialist", "capabilities": ["basic"], "constraints": []}] if not review else []),
            },
        },
    }
    baseline = None
    if not review:
        from urllib.request import urlopen
        with urlopen("http://127.0.0.1:8088/metrics", timeout=5) as response:
            baseline = json.load(response)
    status, raw_start = request("POST", "/api/agents/chat/agents", payload)
    if status != 200:
        print("CI_ORACLE_" + label + "_START_HTTP=" + str(status))
        fail(label + "_MISSION_START")
    try:
        start = json.loads(raw_start)
        stream_id = start["streamId"]
        if start.get("status") != "started" or not stream_id:
            fail(label + "_MISSING_STREAM")
    except (ValueError, KeyError, TypeError):
        fail(label + "_BAD_START_ENVELOPE")
    print("CI_ORACLE_" + label + "_MISSION_ADMITTED=PASS", flush=True)
    stream_status, sse = request("GET", "/api/agents/chat/stream/" + stream_id + "?resume=true")
    if stream_status != 200:
        fail(label + "_SSE_HTTP_" + str(stream_status))
    events = result_events(sse)
    if not review:
        from urllib.request import urlopen
        with urlopen("http://127.0.0.1:8088/metrics", timeout=5) as response:
            metrics = json.load(response)
        for key in ("completion_calls", "parent_tool_requests", "child_responses", "parent_final", "missing_tool"):
            initial = baseline.get(key, -1)
            current = metrics.get(key, -1)
            delta = current - initial if isinstance(initial, int) and isinstance(current, int) else -1
            print("CI_ORACLE_ACCEPT_MODEL_"+key.upper()+"_DELTA="+str(delta), flush=True)
            if key in ("parent_tool_requests", "child_responses", "parent_final") and delta != 1:
                fail("ACCEPT_MODEL_CYCLE_INVALID_"+key.upper())
            if key == "missing_tool" and delta != 0:
                fail("ACCEPT_MODEL_TOOL_MISSING")
        print("CI_ORACLE_ACCEPT_EVENT_TYPES="+",".join(sorted({str(e.get("event","unspecified")) for e in events})), flush=True)
        updates = [e.get("data") for e in events
                   if e.get("event") == "on_subagent_update" and isinstance(e.get("data"), dict)]
        starts = [e for e in updates if e.get("phase") == "start"]
        stops = [e for e in updates if e.get("phase") == "stop"]
        runs = {str(e.get("subagentRunId")) for e in starts if e.get("subagentRunId")}
        linked = any(e.get("subagentAgentId") == CHILD and e.get("parentRunId")
                     and e.get("parentToolCallId") for e in starts)
        completed = any(str(e.get("subagentRunId")) in runs for e in stops)
        print("CI_ORACLE_ACCEPT_CHILD_STARTS="+str(len(starts)), flush=True)
        print("CI_ORACLE_ACCEPT_CHILD_STOPS="+str(len(stops)), flush=True)
        print("CI_ORACLE_ACCEPT_CHILD_LINKED="+str(linked), flush=True)
        print("CI_ORACLE_ACCEPT_CHILD_COMPLETED="+str(completed), flush=True)
        if not (len(runs) == 1 and linked and completed):
            print("CI_ORACLE_ACCEPT_CHILD_SSE_EVIDENCE=NOT_OBSERVED", flush=True)
        else:
            print("CI_ORACLE_ACCEPT_CHILD_SSE_EVIDENCE=OBSERVED", flush=True)
        print("CI_ORACLE_ACCEPT_DURABLE_CHILD_LINEAGE=NOT_PROVEN", flush=True)
    final = [e for e in events if e.get("final") is True]
    error_events = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
    print("CI_ORACLE_" + label + "_SSE_EVENTS=" + str(len(events)), flush=True)
    print("CI_ORACLE_" + label + "_SSE_FINALS=" + str(len(final)), flush=True)
    print("CI_ORACLE_" + label + "_SSE_ERRORS=" + str(len(error_events)), flush=True)
    cls, fingerprint, size = diagnostic_error_class(events)
    print("CI_ORACLE_" + label + "_ERROR_CLASSES=" + cls, flush=True)
    print("CI_ORACLE_" + label + "_ERROR_FINGERPRINT=" + fingerprint, flush=True)
    print("CI_ORACLE_" + label + "_ERROR_TEXT_SIZE=" + str(size), flush=True)
    for value in safe_error_fragments(events):
        print("CI_ORACLE_" + label + "_SAFE_ERROR=" + value, flush=True)
    # The prefix/absence of any job is not proof of a model or Oracle failure.
    # Explicitly separate the Redis physical keyspace from the logical key.
    finals = [e.get("responseMessage") for e in final if isinstance(e.get("responseMessage"), dict)]
    print("CI_ORACLE_" + label + "_FINAL_RESPONSE_PRESENT=" + str(bool(finals)), flush=True)
    print("CI_ORACLE_" + label + "_FINAL_CONTENT_PART_TYPES=" +
          ",".join(sorted({str(p.get("type", "unspecified"))
                           for r in finals for p in (r.get("content") or [])
                           if isinstance(p, dict) and isinstance(r.get("content"), list)}))[:140], flush=True)
    print("CI_ORACLE_" + label + "_FINAL_RESPONSE_NONEMPTY=" +
          str(any(bool(response_text(r).strip()) for r in finals)), flush=True)

    # Under Redis persistence, completed jobs are retained by CI-only configuration.
    persisted = None
    for attempt in range(12):
        stored_status, plan_raw, state_raw = redis_job(stream_id)
        if plan_raw and state_raw:
            try:
                plan, state = json.loads(plan_raw), json.loads(state_raw)
                v = state.get("results", {}).get(task_id, {}).get("verdicts", [])
                if v:
                    persisted = (stored_status, plan, state, v)
                    break
            except (TypeError, ValueError):
                pass
        time.sleep(1)
    if persisted is None:
        redis_connection_summary(stream_id)
        classify_durable_failure(stream_id)
        latest_status, latest_plan, latest_state = redis_job(stream_id)
        fields = redis_field_names(stream_id)
        print("CI_ORACLE_" + label + "_JOB_EXISTS=" + str(bool(fields)), flush=True)
        print("CI_ORACLE_" + label + "_JOB_STATUS=" + (latest_status or "absent"), flush=True)
        print("CI_ORACLE_" + label + "_PLAN_PRESENT=" + str(bool(latest_plan)), flush=True)
        print("CI_ORACLE_" + label + "_STATE_PRESENT=" + str(bool(latest_state)), flush=True)
        print("CI_ORACLE_" + label + "_JOB_FIELD_NAMES=" + ",".join(fields)[:500], flush=True)
        if latest_state:
            try:
                st = json.loads(latest_state)
                print("CI_ORACLE_" + label + "_RESULT_TASK_IDS=" +
                      str(len(st.get("results", {}))), flush=True)
                print("CI_ORACLE_" + label + "_RESULT_VERDICT_COUNTS=" +
                      ",".join(str(len(v.get("verdicts", []))) for v in st.get("results", {}).values())[:100], flush=True)
            except (TypeError, ValueError, AttributeError):
                print("CI_ORACLE_" + label + "_STATE_JSON_VALID=false", flush=True)
        fail(label + "_ORACLE_NOT_DURABLY_PERSISTED")
    stored_status, plan, state, verdicts = persisted
    if plan.get("mission", {}).get("missionId") != mission_id:
        fail(label + "_PLAN_IDENTITY_MISMATCH")
    if len(verdicts) != 1 or verdicts[0].get("status") != expected_status:
        print("CI_ORACLE_" + label + "_STATUS=" +
              ",".join(str(v.get("status")) for v in verdicts))
        fail(label + "_UNEXPECTED_ORACLE_VERDICT")
    print("CI_ORACLE_" + label + "_PERSISTED_STATUS=" + expected_status, flush=True)
    print("CI_ORACLE_" + label + "_DURABLE_PLAN=PASS", flush=True)

    visible = [response_text(e.get("responseMessage")) for e in final]
    if review:
        if any('{"ok":true}' in text.replace(" ", "") for text in visible):
            fail(label + "_REVIEW_CANDIDATE_PUBLISHED")
        # An error event is allowed, but never the candidate or a successful
        # normal final of that rejected mission.
        if final and any(bool(t.strip()) and not ("error" in t.lower() or "oracle" in t.lower())
                         for t in visible):
            fail(label + "_REVIEW_NONERROR_FINAL_PUBLISHED")
        print("CI_ORACLE_REVIEW_CANDIDATE_SUPPRESSED=PASS", flush=True)
    else:
        if not final or error_events:
            fail(label + "_ACCEPTED_FINAL_MISSING")
        if not any(t.strip() for t in visible):
            fail(label + "_ACCEPTED_CONTENT_EMPTY")
        print("CI_ORACLE_ACCEPT_PUBLICATION=PASS", flush=True)
    return conversation_id


def verify_mongo_child_lineage(parent_conversation_id, phase):
    """Assert real Mongo parent/child links, never inferred from fixture model metrics."""
    js = r"""
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const parent = process.env.CI_PARENT_CONVERSATION_ID;
  const children = await db.collection('conversations').find(
    {'subagentThread.parentConversationId': parent},
    {projection: {conversationId: 1, subagentThread: 1}}
  ).toArray();
  const findings = [];
  for (const child of children) {
    const link = child.subagentThread || {};
    const messages = await db.collection('messages').find(
      {conversationId: child.conversationId},
      {projection: {subagentTask: 1, messageId: 1}}
    ).toArray();
    const parentRunIds = [...new Set(messages.map(m => m.subagentTask?.parentRunId).filter(Boolean))];
    const statuses = [...new Set(messages.map(m => m.subagentTask?.status).filter(Boolean))];
    findings.push({
      linked: link.parentConversationId === parent &&
        link.rootConversationId === parent &&
        Boolean(link.parentToolCallId) &&
        Boolean(link.parentMessageId) &&
        parentRunIds.length === 1 &&
        link.parentMessageId === parentRunIds[0],
      childMessages: messages.length,
      terminal: statuses.some(s => ['completed','error','cancelled'].includes(s))
    });
  }
  console.log('CI_DURABLE_CHILD_COUNT=' + findings.length);
  console.log('CI_DURABLE_CHILD_LINKED_COUNT=' + findings.filter(f => f.linked).length);
  console.log('CI_DURABLE_CHILD_TERMINAL_COUNT=' + findings.filter(f => f.terminal).length);
  if (findings.length !== 1 || !findings[0].linked || !findings[0].terminal) {
    process.exitCode = 3;
  }
  await mongoose.disconnect();
})().catch(e => {console.error('CI_DURABLE_CHILD_INSPECTION_ERROR=' + e.name);process.exitCode=2});
"""
    command = COMPOSE + [
        "exec", "-T", "-e", "CI_PARENT_CONVERSATION_ID=" + parent_conversation_id,
        "api", "node", "-e", js,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    for line in result.stdout.splitlines():
        if line.startswith("CI_DURABLE_CHILD_"):
            print("CI_" + phase + "_" + line[3:], flush=True)
    if result.returncode != 0:
        fail(phase + "_DURABLE_CHILD_LINEAGE_MISSING")
    print("CI_" + phase + "_DURABLE_CHILD_LINEAGE=PASS", flush=True)


def verify_lineage_across_api_restart(parent_conversation_id):
    verify_mongo_child_lineage(parent_conversation_id, "BEFORE_RESTART")
    restarted = subprocess.run(COMPOSE + ["restart", "api"], capture_output=True,
                               text=True, timeout=120)
    if restarted.returncode:
        fail("API_RESTART_FAILED")
    verify_mongo_child_lineage(parent_conversation_id, "AFTER_RESTART")
    print("BOTMODE_DURABLE_CHILD_LINEAGE_RESTART=PASS", flush=True)

if __name__ == "__main__":
    reference_ok = inspect_reference_sse()
    accepted_conversation_id = verify("ACCEPT", False, "VERIFIED")
    verify("REVIEW", True, "HUMAN_REVIEW")
    verify_lineage_across_api_restart(accepted_conversation_id)
    if not reference_ok:
        fail("REFERENCE_TERMINAL_CONTAINS_ERROR_PART")
    print("BOTMODE_PR14_ORACLE_PUBLICATION_E2E=PASS")
