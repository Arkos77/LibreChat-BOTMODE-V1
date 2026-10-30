#!/usr/bin/env python3
"""Deterministic OpenAI-compatible fixture with an *observed* native subagent tool call.

CI-only; not an LLM or a source of delegated authority. A real agent's advertised
tool schema and a configured authorized child ID are required. No secrets logged.
"""
import json
import hashlib
import os
import re
import threading
import time
from http.client import HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

lock = threading.Lock()
calls = {"parent_tool_requests": 0, "child_responses": 0, "parent_final": 0,
         "missing_tool": 0, "completion_calls": 0}
child_id = os.environ.get("CI_AUTHORIZED_CHILD_ID", "").strip()
child_ids = []  # Opt-in two-child synthetic test only; ordinary fixture unchanged.
hold_second_child = False
held_baseline = 0
second_child_release = threading.Event()
MODEL = "openrouter/free"
SOURCE_MODE = os.environ.get("CI_MISSION_SOURCE_MODE") == "1"
REAL_MODE = os.environ.get('CI_REAL_FREE_PROVIDER') == '1'
FALLBACK_MODE = os.environ.get('CI_NATIVE_FALLBACK') == '1'
REAL_KEY = os.environ.get('CI_OPENROUTER_KEY', '')
REAL_URL = 'https://openrouter.ai/api/v1/chat/completions'
REAL_MODEL = 'nvidia/nemotron-3.5-super-vl:free'
# Exactly one CI-opted-in two-child mission may use six free requests.
# All other test modes retain their previous four-request hard limit.
REAL_REQUEST_LIMIT = 6 if REAL_MODE and os.environ.get('CI_NATIVE_REAL_MULTI') == '1' else 4
REAL_OUTPUT_TOKEN_LIMIT = 8192 if REAL_MODE and os.environ.get('CI_NATIVE_REAL_MULTI') == '1' else 2048
provider_records = []
provider_started = {}
provider_finished = {}
local_rejections = []
fallback_records = []
fallback_mismatches = []
pending_fallback_context = None
class NoProviderRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

provider_opener = build_opener(ProxyHandler({}), NoProviderRedirect())
SOURCE_URL = "https://ci-source.invalid/report"
SOURCE_FACTS = {
    'report_id': 'CI-FIXTURE-001', 'published_at': '2026-10-25T00:00:00Z',
    'publisher': 'BOTMODE qualification fixture', 'synthetic': True,
    'scope': 'Controlled test report only; no claim about a real service or release.',
    'checks': [{'id': 'search_endpoint', 'status': 'passed'},
               {'id': 'scrape_endpoint', 'status': 'passed'},
               {'id': 'report_available', 'status': 'passed'}],
}
SOURCE_MARKDOWN = ('# Controlled CI report CI-FIXTURE-001\n\n'
    'Synthetic test data. Reported observations apply only to this fixture.\n\n'
    '```json\n' + json.dumps(SOURCE_FACTS, ensure_ascii=False) + '\n```\n')
SOURCE_RESULT = json.dumps({"ok":True,"result":"Synthetic CI observation: "+SOURCE_URL,"sources":SOURCE_URL})

def bounded_real_request(request):
    if request.get('model') != REAL_MODEL or any(k in request for k in ('models', 'plugins', 'web_search_options')):
        raise ValueError('REAL_FREE_ROUTE_REQUIRED')
    if request.get('reasoning') != {'enabled': False}:
        raise ValueError('REAL_REASONING_DISABLED_REQUIRED')
    if request.get('n', 1) != 1:
        raise ValueError('REAL_SINGLE_CHOICE_REQUIRED')
    # Function schemas describe application-side tools; the relay neither grants
    # permissions nor executes them. Keep native authorization in the host.
    # Provider-executed built-ins/plugins remain forbidden on this free route.
    for tool in request.get('tools') or []:
        function = tool.get('function') if isinstance(tool, dict) else None
        name = function.get('name') if isinstance(function, dict) else None
        if (not isinstance(tool, dict) or tool.get('type') != 'function'
                or not isinstance(name, str) or not name.strip()):
            raise ValueError('REAL_FUNCTION_SCHEMA_REQUIRED')
    result = dict(request)
    for key in ('max_tokens', 'max_completion_tokens'):
        value = result.get(key)
        if value is not None and (type(value) is not int or not 1 <= value <= REAL_OUTPUT_TOKEN_LIMIT):
            raise ValueError('REAL_TOKEN_LIMIT_REQUIRED')
    if result.get('max_tokens') is None and result.get('max_completion_tokens') is None:
        result['max_tokens'] = REAL_OUTPUT_TOKEN_LIMIT
    return result

def reserve_real_request():
    with lock:
        count = calls.get('provider_requests', 0)
        if count >= REAL_REQUEST_LIMIT:
            raise ValueError('REAL_REQUEST_BUDGET_EXHAUSTED')
        calls['provider_requests'] = count + 1
        return count + 1


def observe_fallback_request(request):
    global pending_fallback_context
    if not SOURCE_MODE:
        raise ValueError('NATIVE_FALLBACK_SOURCE_MODE_REQUIRED')
    model = request.get('model')
    if model not in (MODEL, REAL_MODEL):
        raise ValueError('NATIVE_FALLBACK_ROUTE_REQUIRED')
    system_present = any(isinstance(m, dict) and m.get('role') in ('system', 'developer')
                         and message_text(m).strip() for m in request['messages'])
    if not system_present:
        raise ValueError('NATIVE_FALLBACK_SYSTEM_REQUIRED')
    context = {key: request.get(key) for key in ('messages', 'tools', 'tool_choice', 'response_format')}
    signature = hashlib.sha256(json.dumps(context, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    record = {'kind': 'primary_429' if model == MODEL else 'secondary', 'model': model,
              'context_sha256': signature, 'system_present': True}
    with lock:
        count = len(fallback_records)
        if model == MODEL:
            if count >= 8 or count % 2:
                raise ValueError('NATIVE_FALLBACK_PRIMARY_ORDER_OR_BUDGET')
            calls['controlled_primary_429'] = calls.get('controlled_primary_429', 0) + 1
            pending_fallback_context = context
        else:
            if count >= 8 or count % 2 != 1:
                raise ValueError('NATIVE_FALLBACK_SECONDARY_CONTEXT_OR_ORDER')
            if fallback_records[-1]['context_sha256'] != signature:
                if not fallback_mismatches:
                    fallback_mismatches.append({
                        'changed_fields': [key for key in context if
                            json.dumps(pending_fallback_context.get(key), sort_keys=True) !=
                            json.dumps(context[key], sort_keys=True)],
                        'primary': bounded_fallback_context(pending_fallback_context),
                        'secondary': bounded_fallback_context(context)})
                raise ValueError('NATIVE_FALLBACK_SECONDARY_CONTEXT_OR_ORDER')
            pending_fallback_context = None
        fallback_records.append(record)
    return model == MODEL


def bounded_fallback_context(context):
    text = json.dumps(context, ensure_ascii=False, sort_keys=True)
    if REAL_KEY:
        text = text.replace(REAL_KEY, '[redacted]')
    size = len(text.encode())
    if size > 16384:
        return {'omitted': 'size_limit', 'bytes': size}
    return {'value': json.loads(text)}

def provider_request_parameters(request):
    def obj(value): return value if isinstance(value, dict) else {}
    fmt = obj(request.get('response_format'))
    structured = obj(fmt.get('json_schema'))
    required = obj(structured.get('schema')).get('required')
    # Metadata only: distinguish parent/child request phases without retaining
    # model prompts, arguments, credentials, identifiers or response content.
    messages = request.get('messages')
    messages = messages if isinstance(messages, list) else []
    role_counts = {role: 0 for role in ('system', 'developer', 'user', 'assistant', 'tool')}
    prior_native_calls = 0
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = message.get('role')
        if role in role_counts:
            role_counts[role] += 1
        if role == 'assistant':
            for call in message.get('tool_calls') or []:
                if (isinstance(call, dict)
                        and isinstance(call.get('function'), dict)
                        and call['function'].get('name') == 'subagent'):
                    prior_native_calls += 1
    tail = messages[-1] if messages else None
    tail_role = tail.get('role') if isinstance(tail, dict) else None
    choice = request.get('tool_choice')
    choice_class = ('auto' if choice == 'auto'
                    else 'forced_subagent' if isinstance(choice, dict)
                    and isinstance(choice.get('function'), dict)
                    and choice['function'].get('name') == 'subagent'
                    else 'other')
    return {'response_format': fmt.get('type') if fmt.get('type') in ('json_object', 'json_schema') else None,
        'strict': structured.get('strict') is True,
        'required_output_fields': [name for name in ('result', 'sources', 'ok') if isinstance(required, list) and name in required],
        'require_parameters': obj(request.get('provider')).get('require_parameters') is True,
        'model': request.get('model') if request.get('model') == REAL_MODEL else None,
        'reasoning_enabled': obj(request.get('reasoning')).get('enabled'),
        'max_tokens': request.get('max_tokens'), 'max_completion_tokens': request.get('max_completion_tokens'),
        'message_count': len(messages), 'tool_result_count': role_counts['tool'],
        'assistant_message_count': role_counts['assistant'],
        'prior_subagent_calls': prior_native_calls,
        'tail_role': tail_role if tail_role in role_counts else 'other',
        'tool_choice_class': choice_class,
        'advertised_subagent': tool_name(request) == 'subagent'}


def start_provider_request(number, request):
    with lock:
        provider_started[number] = time.monotonic()
        provider_records.append({'request': number, 'phase': 'waiting_headers', 'http_status': None,
            'upstream_headers_status': None, 'usage': {}, 'models': [], 'finish_reasons': [],
            'tool_names': [], 'errors': [], 'candidate_text': '', 'candidate_truncated': False,
            'request_parameters': provider_request_parameters(request)})


def update_provider_phase(number, phase, status=None, error_type=None):
    with lock:
        record = next((r for r in provider_records if r['request'] == number), None)
        if record is None: return
        record['phase'] = phase
        if status is not None:
            record['upstream_headers_status'] = status
            record['http_status'] = status
        if error_type is not None: record['transport_error_type'] = error_type[:80]


def provider_snapshot():
    with lock:
        now = time.monotonic()
        return [{**r, 'elapsed_ms': max(0, int(1000 * (provider_finished.get(r['request'], now)
                  - provider_started.get(r['request'], now))))} for r in provider_records]


def record_provider_response(number, status, body, request=None):
    text = body.decode('utf8', errors='replace')
    if REAL_KEY:
        text = text.replace(REAL_KEY, '[redacted]')
    items = []
    for frame in ([line[5:].strip() for line in text.splitlines() if line.startswith('data:')]
                  if text.lstrip().startswith('data:') or '\ndata:' in text else [text]):
        try:
            value = json.loads(frame)
            if isinstance(value, dict): items.append(value)
        except ValueError:
            pass
    content = []
    models = set()
    finishes = set()
    tools = set()
    # Count distinct native tool-call slots. A set of names loses multiplicity:
    # two subagent calls in one provider response otherwise look like one.
    subagent_slots = set()
    usage = {}
    errors = []
    for item in items:
        if isinstance(item.get('model'), str): models.add(item['model'])
        if item.get('error'):
            error = item['error']
            errors.append(str(error.get('message', '') if isinstance(error, dict) else error)[:500])
        for key in ('prompt_tokens', 'completion_tokens', 'total_tokens', 'cost'):
            value = (item.get('usage') or {}).get(key)
            if isinstance(value, (int, float)): usage[key] = value
        for choice in item.get('choices') or []:
            if not isinstance(choice, dict): continue
            if choice.get('finish_reason'): finishes.add(str(choice['finish_reason']))
            message = choice.get('delta') or choice.get('message') or {}
            if not isinstance(message, dict): continue
            if isinstance(message.get('content'), str): content.append(message['content'])
            for position, call in enumerate(message.get('tool_calls') or []):
                if not isinstance(call, dict): continue
                function = call.get('function')
                name = function.get('name') if isinstance(function, dict) else None
                if not isinstance(name, str): continue
                tools.add(name)
                if name == 'subagent':
                    # SSE chunks may mention the same index repeatedly.
                    # For full non-stream responses, use call ID or position.
                    choice_index = choice.get('index', 0)
                    index = call.get('index')
                    call_id = call.get('id')
                    if type(index) is int and index >= 0:
                        slot = ('index', choice_index, index)
                    elif isinstance(call_id, str) and call_id:
                        slot = ('id', call_id)
                    elif 'delta' not in choice:
                        slot = ('position', choice_index, position)
                    else:
                        # Never count unidentified repeated SSE fragments as new calls.
                        slot = ('unknown', choice_index)
                    subagent_slots.add(slot)
    candidate = ''.join(content)
    record = {'request': number, 'http_status': status, 'models': sorted(models),
              'finish_reasons': sorted(finishes), 'tool_names': sorted(tools),
              'subagent_tool_call_count': min(len(subagent_slots), 16), 'usage': usage,
              'candidate_text': candidate[:8192], 'candidate_truncated': len(candidate) > 8192,
              'errors': errors[:2]}
    if request is not None:
        record['request_parameters'] = provider_request_parameters(request)
    with lock:
        existing = next((r for r in provider_records if r['request'] == number), None)
        if existing is None:
            provider_records.append({**record, 'phase': 'response_complete'})
        else:
            existing.update(record)
            existing['phase'] = 'response_complete'
        provider_finished[number] = time.monotonic()
        if status == 200: calls['provider_http_200'] = calls.get('provider_http_200', 0) + 1

def tool_name(request):
    for item in request.get("tools") or []:
        if not isinstance(item, dict):
            continue
        f = item.get("function") if item.get("type") == "function" else None
        if isinstance(f, dict) and f.get("name") == "subagent":
            return "subagent"
    return None

def message_text(message):
    content = message.get('content')
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(part['text'] for part in content if isinstance(part, dict)
                         and part.get('type') == 'text' and isinstance(part.get('text'), str))
    return ''

def planned_output_contract(messages):
    marker='Mission planning context (not execution permission):'
    for message in reversed(messages):
        if not isinstance(message,dict) or message.get('role') not in ('system','developer'): continue
        content=message_text(message)
        if marker not in content: continue
        try: context,_=json.JSONDecoder().raw_decode(content.split(marker,1)[1].lstrip())
        except ValueError: continue
        if not isinstance(context,dict) or not isinstance(context.get('validation'),list): continue
        contracts={v.get('outputContract') for v in context['validation'] if isinstance(v,dict)}
        if 'research-v1' in contracts: return 'research-v1'
        if 'result-v1' in contracts: return 'result-v1'
    return None

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *_):
        pass
    def send(self, obj, status=200):
        data=json.dumps(obj,separators=(",",":")).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if (REAL_MODE or FALLBACK_MODE) and self.path == '/provider-diagnostics':
            snapshot = provider_snapshot()
            with lock:
                rejections = list(local_rejections)
                fallback = {'enabled': FALLBACK_MODE, 'records': list(fallback_records),
                            'mismatches': list(fallback_mismatches)}
            return self.send({'route': REAL_MODEL, 'reasoning_enabled': False, 'limit_requests': REAL_REQUEST_LIMIT,
                              'limit_output_tokens': REAL_OUTPUT_TOKEN_LIMIT, 'records': snapshot,
                              'local_rejections': rejections, 'fallback': fallback,
                              'simulated': not REAL_MODE})
        if self.path.startswith('/search?'):
            with lock: calls['source_search_calls']=calls.get('source_search_calls',0)+1
            return self.send({'query':'CI synthetic source','results':[{'url':SOURCE_URL,'title':'Controlled CI report CI-FIXTURE-001',
                'content':'Synthetic test report CI-FIXTURE-001, published 2026-10-25T00:00:00Z by the BOTMODE qualification fixture: three recorded checks passed. Scope: fixture only.'}]})
        if self.path == "/health": return self.send({"status":"ok","configured":bool(child_id)})
        if self.path == "/metrics":
            with lock: snapshot=dict(calls)
            return self.send(snapshot)
        if self.path in ("/v1/models","/models"):
            return self.send({"object":"list","data":[{"id":MODEL,"object":"model","created":1700000000,"owned_by":"ci"}]})
        return self.send({"error":"not_found"},404)
    def do_POST(self):
        global child_id, child_ids, hold_second_child, held_baseline
        if self.path == "/release-second-child":
            second_child_release.set()
            return self.send({"ok": True})
        if self.path.rstrip('/').endswith('/scrape'):
            length=int(self.headers.get('Content-Length','0'))
            if length < 2 or length > 1048576: return self.send({'error':'size'},400)
            self.rfile.read(length)
            with lock: calls['source_scrape_calls']=calls.get('source_scrape_calls',0)+1
            return self.send({'success':True,'data':{'markdown':SOURCE_MARKDOWN,'metadata':{'sourceURL':SOURCE_URL,'title':'Controlled CI report CI-FIXTURE-001'}}})
        if self.path == "/configure":
            # A runner-local control endpoint. Expose only on ephemeral private CI runners.
            length=int(self.headers.get("Content-Length","0"))
            if length < 2 or length > 2048: return self.send({"error":"size"},400)
            try: obj=json.loads(self.rfile.read(length))
            except ValueError: return self.send({"error":"json"},400)
            if "childIds" in obj:
                proposed_ids = obj["childIds"]
                if (not isinstance(proposed_ids, list) or len(proposed_ids) != 2 or
                    len(set(map(str, proposed_ids))) != 2 or
                    any(not isinstance(item, str) or not item.strip() or len(item) > 256
                        for item in proposed_ids)):
                    return self.send({"error": "two_distinct_child_ids_required"}, 400)
                with lock:
                    child_ids = list(proposed_ids)
                    hold_second_child = obj.get("holdSecondChild") is True
                    held_baseline = calls.get("child_responses", 0)
                    calls["held_second_child_requests"] = 0
                    second_child_release.clear()
                return self.send({"ok": True, "multi": True})
            proposed=obj.get("childId")
            if not isinstance(proposed,str) or not proposed.strip(): return self.send({"error":"child"},400)
            with lock:
                child_id=proposed.strip()
                child_ids=[]
                hold_second_child=False
                second_child_release.set()
            return self.send({"ok":True})
        if not self.path.rstrip("/").endswith("/chat/completions"):
            return self.send({"error":"not_found"},404)
        length=int(self.headers.get("Content-Length","0"))
        if length<2 or length>1048576: return self.send({"error":"size"},400)
        try: req=json.loads(self.rfile.read(length))
        except ValueError: return self.send({"error":"json"},400)
        if not isinstance(req.get("messages"),list): return self.send({"error":"messages"},400)
        messages=req["messages"]
        # Tool message only appears after the runtime executed the native subagent.
        has_tool_result=any(m.get("role")=="tool" for m in messages if isinstance(m,dict))
        prior_subagent_calls=[
            tc for m in messages if isinstance(m,dict) and m.get("role")=="assistant"
            for tc in (m.get("tool_calls") or []) if isinstance(tc,dict)
            and tc.get("function",{}).get("name")=="subagent"
        ]
        already_requested=bool(prior_subagent_calls)
        advertised=tool_name(req)
        with lock:
            calls["completion_calls"]+=1
            number=calls["completion_calls"]
            # Bounded metadata only: no prompts, tokens, credentials or tool args.
            if advertised: calls["advertised_subagent_requests"]=calls.get("advertised_subagent_requests",0)+1
            if not advertised: calls["requests_without_subagent_tool"]=calls.get("requests_without_subagent_tool",0)+1
            if req.get("response_format"): calls["structured_format_requests"]=calls.get("structured_format_requests",0)+1
            # Counters only: identify whether the browser invokes a tool-capable
            # parent or a child-like request; never retain message contents.
            tools=req.get("tools") or []
            calls["last_tool_count"]=len(tools) if isinstance(tools,list) else -1
            calls["last_message_count"]=len(messages)
            calls["last_has_tool_result"]=int(has_tool_result)
            calls["last_prior_subagent_call"]=int(already_requested)
            calls["last_advertised_subagent"]=int(bool(advertised))
            calls["last_tool_choice_forced"]=int(isinstance(req.get("tool_choice"),dict))
            # Name of an explicitly forced tool, restricted to a small allowlist.
            choice=req.get("tool_choice")
            chosen=choice.get("function",{}).get("name") if isinstance(choice,dict) and isinstance(choice.get("function"),dict) else ""
            allowed={"subagent","web_search","file_search","execute_code","terminal"}
            calls["last_forced_tool_class"]=chosen if chosen in allowed else ("other" if chosen else "none")
            calls["last_advertised_web_search"]=int(any(isinstance(t,dict) and isinstance(t.get("function"),dict) and t["function"].get("name")=="web_search" for t in tools))
            if not advertised and not has_tool_result and not already_requested:
                calls["unclassified_no_tool_turns"]=calls.get("unclassified_no_tool_turns",0)+1
        if FALLBACK_MODE:
            try:
                if req.get('model') != MODEL:
                    bounded_real_request(req)
                if observe_fallback_request(req):
                    return self.send({'error': {'message': 'Controlled CI primary quota; no upstream request',
                                               'type': 'rate_limit_exceeded'}}, 429)
            except ValueError as error:
                with lock:
                    if len(local_rejections) < 8:
                        local_rejections.append({'completion_call': number, 'code': str(error)})
                return self.send({'error': str(error)}, 400)
        if REAL_MODE:
            if not SOURCE_MODE or len(REAL_KEY) <= 16:
                return self.send({'error': 'REAL_PROVIDER_NOT_AUTHORIZED'}, 400)
            try:
                bounded = bounded_real_request(req)
                provider_number = reserve_real_request()
            except ValueError as error:
                with lock:
                    if len(local_rejections) < 8:
                        local_rejections.append({'completion_call': number, 'code': str(error)})
                return self.send({'error': str(error)}, 400)
            start_provider_request(provider_number, bounded)
            transport_error_type = None
            request = Request(REAL_URL, data=json.dumps(bounded).encode(), method='POST',
                headers={'Authorization': 'Bearer ' + REAL_KEY, 'Content-Type': 'application/json',
                         'Accept': 'text/event-stream' if req.get('stream') else 'application/json'})
            try:
                with provider_opener.open(request, timeout=90) as response:
                    status, content_type = response.status, response.headers.get('Content-Type', 'application/json')
                    update_provider_phase(provider_number, 'reading_body', status)
                    payload = response.read(1048577)
            except HTTPError as error:
                update_provider_phase(provider_number, 'reading_body', error.code)
                try:
                    status, content_type, payload = error.code, 'application/json', error.read(65536)
                except (URLError, TimeoutError, OSError, HTTPException) as read_error:
                    cause = read_error.reason if isinstance(read_error, URLError) else read_error
                    transport_error_type = type(cause).__name__
                    status, content_type, payload = 502, 'application/json', b'{"error":"UPSTREAM_TRANSPORT_FAILED"}'
                finally:
                    error.close()
            except (URLError, TimeoutError, OSError, HTTPException) as error:
                cause = error.reason if isinstance(error, URLError) else error
                transport_error_type = type(cause).__name__
                status, content_type, payload = 502, 'application/json', b'{"error":"UPSTREAM_TRANSPORT_FAILED"}'
            if 300 <= status < 400:
                record_provider_response(provider_number, status, b'{"error":"UPSTREAM_REDIRECT_REFUSED"}', bounded)
                return self.send({'error': 'UPSTREAM_REDIRECT_REFUSED'}, 502)
            if len(payload) > 1048576:
                status, content_type, payload = 502, 'application/json', b'{"error":"UPSTREAM_RESPONSE_TOO_LARGE"}'
            record_provider_response(provider_number, status, payload, bounded)
            if transport_error_type is not None:
                update_provider_phase(provider_number, 'transport_error', error_type=transport_error_type)
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
            self.close_connection = True
            return
        web_advertised=any(item.get('function',{}).get('name')=='web_search' for item in req.get('tools',[]) if isinstance(item,dict))
        web_calls={tc.get('id') for m in messages if isinstance(m,dict) for tc in m.get('tool_calls',[]) if isinstance(tc,dict) and tc.get('function',{}).get('name')=='web_search'}
        web_completed=any(m.get('role')=='tool' and m.get('tool_call_id') in web_calls for m in messages if isinstance(m,dict))
        planned_contract=planned_output_contract(messages)
        research_contract=planned_contract=='research-v1' or planned_contract is None and any(re.search(r'"outputContract"\s*:\s*"research-v1"',message_text(m)) for m in messages if isinstance(m,dict))
        choice=req.get('tool_choice')
        forced_web=isinstance(choice,dict) and choice.get('type')=='function' and isinstance(choice.get('function'),dict) and choice['function'].get('name')=='web_search'
        if forced_web and not web_advertised:
            return self.send({'error':'fixture_tool_choice_schema_mismatch'},400)
        if planned_contract=='result-v1' and not forced_web:
            with lock: calls['planned_final']=calls.get('planned_final',0)+1
            message={'role':'assistant','content':SOURCE_RESULT}
            reason='stop'
        elif web_advertised and (forced_web or (SOURCE_MODE and research_contract and not web_completed)):
            with lock: calls['source_tool_requests']=calls.get('source_tool_requests',0)+1
            message={'role':'assistant','content':None,'tool_calls':[{'id':'call_ci_search_'+str(number),'type':'function','function':{'name':'web_search','arguments':json.dumps({'query':'CI synthetic source'})}}]}
            reason='tool_calls'
        elif research_contract and web_advertised and web_completed:
            with lock: calls['source_final']=calls.get('source_final',0)+1
            message={'role':'assistant','content':SOURCE_RESULT}
            reason='stop'
        elif advertised and len(child_ids) == 2 and len(prior_subagent_calls) < 2 and (
                not prior_subagent_calls or has_tool_result):
            # OpenAI-compatible hosts may disable parallel tool calls. Issue one
            # native delegated call per parent turn and do not publish until both
            # distinct child result tool messages have been observed.
            selected = child_ids[len(prior_subagent_calls)]
            with lock:
                calls["parent_tool_requests"] += 1
                calls["last_multi_prior_calls"] = len(prior_subagent_calls)
                calls["last_parallel_tool_calls_flag"] = str(req.get("parallel_tool_calls"))
            message={"role":"assistant","content":None,"tool_calls":[{
                "id":"call_ci_child_"+str(number)+"_"+str(len(prior_subagent_calls)),
                "type":"function",
                "function":{"name":"subagent","arguments":json.dumps({
                    "description":"Independent synthetic delegated task "+str(len(prior_subagent_calls)+1),
                    "subagent_type":selected,
                    "run_in_background":True
                })}
            }]}
            reason="tool_calls"
        elif has_tool_result and already_requested:
            with lock: calls["parent_final"]+=1
            message={"role":"assistant","content":'{"ok":true}'}
            reason="stop"
        elif advertised and child_id and not already_requested:
            with lock:
                selected_children = list(child_ids) if child_ids else [child_id]
                calls["parent_tool_requests"] += len(selected_children)
            message={"role":"assistant","content":None,"tool_calls":[
                {
                    "id":"call_ci_child_"+str(number)+"_"+str(index),"type":"function",
                    "function":{"name":"subagent","arguments":json.dumps({
                        "description":"Complete independent synthetic specialist task "+str(index+1)+
                                      " and return an evidence receipt.",
                        "subagent_type":selected,
                        "run_in_background":True
                    })}
                }
                for index,selected in enumerate(selected_children)
            ]}
            reason="tool_calls"
        elif not advertised and child_id and not already_requested and not has_tool_result:
            # The authorized child has no nested subagent tool; its first model turn returns the receipt.
            with lock:
                block = (hold_second_child and len(child_ids) == 2 and
                         calls["child_responses"] - held_baseline == 1)
                if block:
                    calls["held_second_child_requests"] += 1
            if block and not second_child_release.wait(timeout=120):
                return self.send({"error":"CI_SECOND_CHILD_BOUNDED_HOLD_EXPIRED"},503)
            with lock: calls["child_responses"]+=1
            message={"role":"assistant","content":"CI_DELEGATED_CHILD_RECEIPT"}
            reason="stop"
        else:
            with lock: calls["missing_tool"]+=1
            # No eligible parent tool or recognizable child continuation: fail closed.
            message={"role":"assistant","content":"CI_SUBAGENT_UNRECOGNIZED_MODEL_TURN"}
            reason="stop"
        if SOURCE_MODE and message.get('content') is not None and reason=='stop' and message['content']!='CI_SUBAGENT_UNRECOGNIZED_MODEL_TURN':
            message['content']=SOURCE_RESULT
        model=str(req.get("model") or MODEL)
        usage={"prompt_tokens":8,"completion_tokens":8,"total_tokens":16}
        if not req.get("stream"):
            return self.send({"id":"chatcmpl-ci-"+str(number),"object":"chat.completion",
                "created":int(time.time()),"model":model,
                "choices":[{"index":0,"message":message,"finish_reason":reason}],"usage":usage})
        self.send_response(200)
        self.send_header("Content-Type","text/event-stream")
        self.send_header("Connection","close")
        self.end_headers()
        def event(delta,finish=None):
            item={"id":"chatcmpl-ci-"+str(number),"object":"chat.completion.chunk",
                "created":int(time.time()),"model":model,
                "choices":[{"index":0,"delta":delta,"finish_reason":finish}]}
            self.wfile.write(("data: "+json.dumps(item,separators=(",",":"))+"\n\n").encode())
            self.wfile.flush()
        try:
            event({"role":"assistant"})
            if message.get("tool_calls"):
                tc=message["tool_calls"][0]
                event({"tool_calls":[{"index":0,"id":tc["id"],"type":"function",
                    "function":{"name":tc["function"]["name"],"arguments":tc["function"]["arguments"]}}]})
            else:
                event({"content":message["content"]})
            event({},reason)
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError):
            pass

if __name__=="__main__":
    ThreadingHTTPServer(("0.0.0.0",8088),Handler).serve_forever()
