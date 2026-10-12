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
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

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
    key = "stream:{" + stream_id + "}:job"
    def field(name):
        cmd = COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw", "HGET", key, name]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=20, check=True)
        return out.stdout.strip()
    return field("status"), field("orchestratorPlan"), field("missionOracleState")

def redis_field_names(stream_id):
    key = "stream:{" + stream_id + "}:job"
    p = subprocess.run(COMPOSE + ["exec", "-T", "redis", "redis-cli", "--raw",
                                  "HKEYS", key], capture_output=True, text=True,
                       timeout=20, check=True)
    return sorted(p.stdout.splitlines())

def verify(label, review, expected_status):
    conversation_id = str(uuid.uuid4())
    mission_id = "ci-oracle-" + str(uuid.uuid4())
    task_id = mission_id + "/main"
    mission = {
        "missionId": mission_id,
        "taskId": mission_id,
        "objective": "Produire exactement l'objet JSON demandé puis laisser Oracle valider.",
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
                "specialists": [],
            },
        },
    }
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
    final = [e for e in events if e.get("final") is True]
    error_events = [e for e in events if e.get("event") == "error" or e.get("type") == "error"]
    print("CI_ORACLE_" + label + "_SSE_EVENTS=" + str(len(events)), flush=True)
    print("CI_ORACLE_" + label + "_SSE_FINALS=" + str(len(final)), flush=True)
    print("CI_ORACLE_" + label + "_SSE_ERRORS=" + str(len(error_events)), flush=True)
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
    return True

if __name__ == "__main__":
    verify("ACCEPT", False, "VERIFIED")
    verify("REVIEW", True, "HUMAN_REVIEW")
    print("BOTMODE_PR14_ORACLE_PUBLICATION_E2E=PASS")
