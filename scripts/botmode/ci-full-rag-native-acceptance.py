#!/usr/bin/env python3
"""CI-only acceptance of real Full RAG: pgvector, source evidence, owner separation."""
import json
import os
import re
import subprocess
import sys
import time
import uuid

if os.getenv("CI") != "true" or not os.getenv("GITHUB_RUN_ID"):
    raise SystemExit("CI_DISPOSABLE_ONLY_REFUSED")
if not os.getenv("BOTMODE_IMAGE", "").startswith("botmode-ci-full-rag:"):
    raise SystemExit("CI_SOURCE_IMAGE_REQUIRED")

fid = str(uuid.uuid4())
owner = "ci-owner-" + str(uuid.uuid4())
body = "Le protocole ORANGE-17 impose que la couleur de validation finale soit indigo."
question = "Quelle couleur de validation finale impose le protocole ORANGE-17 ?"
cmd = ["docker", "compose", "-f", "docker-compose.botmode.yml", "exec", "-T"]
data = {"fileId": fid, "userId": owner, "query": question}
stage = "INITIAL"
created = False

def call(argv, stdin=None, timeout=120):
    proc = subprocess.run(argv, input=stdin, capture_output=True, text=True, timeout=timeout)
    if proc.returncode:
        # The internal bridge deliberately prints error CLASS and HTTP STATUS,
        # not bearer tokens or request bodies. Keep just these bounded fields.
        match = re.search(r"P7_ERROR=([A-Za-z][A-Za-z0-9]*):(\d{3}|operation failed)", proc.stderr)
        detail = match.group(1) + "_" + match.group(2).replace(" ", "_") if match else "unknown"
        raise RuntimeError("BRIDGE_" + detail)
    return proc.stdout

def native(action, more=None, timeout=150):
    payload = dict(data, action=action)
    payload.update(more or {})
    output = call(cmd + ["api", "node", "api/test/p7/rag.cjs"], json.dumps(payload), timeout)
    receipt = next((line[10:] for line in output.splitlines() if line.startswith("P7_RESULT=")), None)
    if receipt is None:
        raise RuntimeError("NO_NATIVE_RECEIPT")
    return json.loads(receipt)

def count_vectors():
    sql = "SELECT count(*) FROM langchain_pg_embedding WHERE cmetadata->>'file_id' = '" + fid + "'"
    sh = 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc ' + json.dumps(sql)
    return int(call(cmd + ["vectordb", "sh", "-ec", sh], timeout=30).strip())

try:
    stage = "INGEST"
    for attempt in range(6):
        try:
            embedded = native("ingest", {"text": body})
            break
        except (RuntimeError, subprocess.TimeoutExpired):
            if attempt == 5:
                raise
            time.sleep(12)
    if embedded.get("embedded") is not True:
        raise RuntimeError("REAL_EMBEDDING_NOT_CONFIRMED")
    created = True
    print("CI_FULL_RAG_EMBED=PASS", flush=True)

    stage = "POSTGRES"
    if count_vectors() < 1:
        raise RuntimeError("NO_PGVECTOR_ROWS")
    print("CI_FULL_RAG_VECTOR_DURABLE=PASS", flush=True)

    stage = "RETRIEVAL"
    found = native("search")
    sources = ((found[1] or {}).get("file_search") or {}).get("sources") or []
    if not any(s.get("fileId") == fid and "indigo" in s.get("content", "") for s in sources):
        raise RuntimeError("FILE_SOURCE_MISMATCH")
    print("CI_FULL_RAG_RETRIEVAL_WITH_SOURCE=PASS", flush=True)

    stage = "AGENT_CONTEXT"
    result = native("run", {"runId": "ci-rag-" + fid})
    if result.get("answer") != "indigo":
        raise RuntimeError("NATIVE_GRAPH_ANSWER_MISMATCH")
    if not any(body in message.get("content", "")
               for block in result.get("consumed", [])
               for message in block):
        raise RuntimeError("SOURCE_NOT_USED_BY_GRAPH")
    receipts = result.get("sources") or []
    if not receipts or receipts[0].get("tool_call_id") != "p7-search":
        raise RuntimeError("MISSING_TOOL_RECEIPT")
    print("CI_FULL_RAG_NATIVE_AGENT_CONTEXT_AND_RECEIPT=PASS", flush=True)

    stage = "OWNER"
    outsider = native("search", {"userId": "ci-other-" + str(uuid.uuid4())})
    if len(outsider) != 2 or outsider[1]:
        raise RuntimeError("CROSS_OWNER_LEAK")
    print("CI_FULL_RAG_OTHER_OWNER_NO_ACCESS=PASS", flush=True)

    stage = "IRRELEVANT_QUERY"
    irrelevant = native("search", {"query": "How many moons orbit Jupiter?"})
    if len(irrelevant) != 2 or irrelevant[1]:
        raise RuntimeError("FALSE_RAG_PROVENANCE")
    print("CI_FULL_RAG_IRRELEVANT_QUERY_NO_SOURCE=PASS", flush=True)

    stage = "DELETE"
    native("delete")
    created = False
    if count_vectors() != 0:
        raise RuntimeError("DELETION_INCOMPLETE")
    print("CI_FULL_RAG_DELETE_PERSISTENCE=PASS", flush=True)
    print("BOTMODE_FULL_NATIVE_RAG_NO_PROVIDER_ACCEPTANCE=PASS", flush=True)
except Exception as exc:
    print("CI_FULL_RAG_FAILED_PHASE=" + stage, file=sys.stderr)
    print("CI_FULL_RAG_FAILED_TYPE=" + type(exc).__name__, file=sys.stderr)
    if isinstance(exc, RuntimeError):
        print("CI_FULL_RAG_FAIL_CODE=" + str(exc)[:80], file=sys.stderr)
    sys.exit(1)
finally:
    if created:
        try:
            native("delete", timeout=35)
        except Exception:
            print("CI_FULL_RAG_CLEANUP_INCOMPLETE", file=sys.stderr)
