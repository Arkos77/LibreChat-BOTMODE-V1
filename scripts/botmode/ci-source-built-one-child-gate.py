#!/usr/bin/env python3
"""One REAL LibreChat native child on isolated API/Redis/Mongo; model is local fixture.

No new production code; fail closed unless exactly one authorized child actually
received a model request and left a durable, completed transcript in MongoDB.
Never print IDs, prompts, tokens or model content. One POST, subsequent reads only.
"""
import json
import subprocess
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = 'http://127.0.0.1:3090'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
COMPOSE = ['docker', 'compose', '-f', 'docker-compose.botmode.yml', '-f', 'docker-compose.botmode-lite.yml']
TOKEN = Path('/tmp/botmode-e2e-test-token').read_text().strip()
WORKER = Path('/tmp/botmode-ci-worker-id').read_text().strip()
CHILD = Path('/tmp/botmode-ci-child-id').read_text().strip()


def fail(code):
    raise SystemExit('CI_ONE_CHILD_FAIL=' + code)


def request(url, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': UA,
               'Accept': 'text/event-stream', 'Content-Type': 'application/json'}
    with urlopen(Request(BASE + url, data=data, method='POST' if data else 'GET',
                         headers=headers), timeout=timeout) as response:
        return response.status, response.read(1024 * 1024).decode('utf8', 'replace')


def metrics():
    with urlopen('http://127.0.0.1:8088/metrics', timeout=5) as response:
        return json.load(response)


def inspect_child(parent):
    js = r'''
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI);
  const db=mongoose.connection.db;
  const rows=await db.collection('conversations').find(
    {'subagentThread.parentConversationId': process.env.CI_PARENT_ID},
    {projection:{conversationId:1,subagentThread:1}}).limit(3).toArray();
  let complete=0,errors=0,messages=0,linked=false;
  if(rows.length===1){
    const link=rows[0].subagentThread||{};
    const transcript=await db.collection('messages').find(
      {conversationId:rows[0].conversationId},
      {projection:{subagentTask:1,error:1,unfinished:1,isCreatedByUser:1,text:1}}
    ).limit(30).toArray();
    messages=transcript.length;
    complete=transcript.filter(x=>x.subagentTask?.status==='completed'&&x.error!==true&&
      x.isCreatedByUser===false&&x.unfinished!==true&&typeof x.text==='string'&&x.text.trim()).length;
    errors=transcript.filter(x=>x.error===true||['error','cancelled'].includes(x.subagentTask?.status)).length;
    const parentIds=[...new Set(transcript.map(x=>x.subagentTask?.parentRunId).filter(Boolean))];
    linked=link.parentConversationId===process.env.CI_PARENT_ID &&
      link.rootConversationId===process.env.CI_PARENT_ID &&
      typeof link.parentToolCallId==='string' && link.parentToolCallId.length>0 &&
      typeof link.parentMessageId==='string' && link.parentMessageId.length>0 &&
      parentIds.length===1 && link.parentMessageId===parentIds[0];
  }
  console.log(JSON.stringify({child_count:rows.length,complete,errors,messages,linked}));
  await mongoose.disconnect();
})().catch(e=>{console.error('CI_CHILD_DB_ERROR_CLASS='+e.name);process.exit(2)});
'''
    proc = subprocess.run(COMPOSE + ['exec', '-T', '-e', 'CI_PARENT_ID=' + parent,
                                    'api', 'node', '-e', js], capture_output=True,
                          text=True, timeout=25)
    if proc.returncode:
        print('CI_ONE_CHILD_MONGO_CHECK=ERROR_CLASS', flush=True)
        return None
    try:
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return None


def main():
    if not WORKER or not CHILD or CHILD == WORKER:
        fail('INVALID_AGENT_IDENTITIES')
    before = metrics()
    parent = str(uuid.uuid4())
    # Ordinary native Worker turn. Mission planner and Oracle were already
    # qualified in the separate zero-specialist source-built E2E. Do not tie
    # a child tool-call test to an unrelated planned mission schema.
    body = {
        'endpoint': 'agents', 'agent_id': WORKER, 'conversationId': parent,
        'messageId': str(uuid.uuid4()),
        'parentMessageId': '00000000-0000-0000-0000-000000000000',
        'isNewConvo': True,
        'text': 'Délègue une seule tâche à ton spécialiste autorisé. Attends son résultat et réponds en JSON {"ok":true}.',
    }
    try:
        status, raw = request('/api/agents/chat/agents', body, timeout=90)
    except HTTPError as error:
        # Never print the request, JWT, response body or identifiers.
        print('CI_ONE_CHILD_HTTP_STATUS=' + str(error.code), flush=True)
        fail('ADMISSION_REJECTED')
    except OSError as error:
        print('CI_ONE_CHILD_HTTP_CLASS=' + type(error).__name__, flush=True)
        fail('ADMISSION_REQUEST_FAILED')
    if status != 200:
        print('CI_ONE_CHILD_ADMISSION_STATUS=' + str(status), flush=True)
        fail('ADMISSION_HTTP_NOT_200')
    try:
        started = json.loads(raw)
    except ValueError:
        fail('BAD_ADMISSION_JSON')
    stream_id = started.get('streamId')
    if started.get('status') != 'started' or not isinstance(stream_id, str) or not stream_id:
        fail('BAD_ADMISSION_ENVELOPE')
    print('CI_ONE_CHILD_REAL_API_ADMITTED=PASS', flush=True)
    # The request was submitted ONCE. SSE GET and Mongo readback cannot relaunch it.
    try:
        status, raw = request('/api/agents/chat/stream/' + stream_id + '?resume=true', timeout=110)
        finals = 0
        for line in raw.splitlines():
            if not line.startswith('data:'):
                continue
            try:
                frame = json.loads(line[5:].strip())
            except ValueError:
                continue
            if isinstance(frame, dict) and frame.get('final') is True:
                finals += 1
        print('CI_ONE_CHILD_INITIAL_SSE_FINAL_COUNT=' + str(finals), flush=True)
    except (OSError, ValueError):
        print('CI_ONE_CHILD_INITIAL_SSE=NOT_CONCLUSIVE', flush=True)
    deadline = time.monotonic() + 80
    final_metrics = None
    child = None
    while time.monotonic() < deadline:
        final_metrics = metrics()
        tool = final_metrics.get('parent_tool_requests', 0) - before.get('parent_tool_requests', 0)
        child_calls = final_metrics.get('child_responses', 0) - before.get('child_responses', 0)
        if tool >= 1:
            child = inspect_child(parent)
        if tool >= 1 and child_calls >= 1 and child and child.get('complete') == 1:
            break
        time.sleep(3)
    final_metrics = final_metrics or metrics()
    deltas = {key: final_metrics.get(key, 0) - before.get(key, 0)
              for key in ('parent_tool_requests', 'child_responses', 'parent_final', 'missing_tool')}
    for key, value in deltas.items():
        print('CI_ONE_CHILD_' + key.upper() + '_DELTA=' + str(value), flush=True)
    if child:
        for key in ('child_count', 'complete', 'errors', 'messages', 'linked'):
            print('CI_ONE_CHILD_MONGO_' + key.upper() + '=' + str(child.get(key)), flush=True)
    if deltas['parent_tool_requests'] != 1 or deltas['child_responses'] != 1 or deltas['missing_tool'] != 0:
        fail('REAL_NATIVE_CHILD_MODEL_CYCLE_UNPROVEN')
    if (child is None or child.get('child_count') != 1 or child.get('complete') != 1 or
            child.get('errors') != 0 or child.get('messages', 0) < 2 or child.get('linked') is not True):
        fail('DURABLE_CHILD_LINEAGE_OR_RECEIPT_UNPROVEN')
    print('BOTMODE_C3_ONE_NATIVE_CHILD_DURABLY_COMPLETED=PASS', flush=True)


if __name__ == '__main__':
    main()
