#!/usr/bin/env python3
"""Deterministic OpenAI-compatible fixture with an *observed* native subagent tool call.

CI-only; not an LLM or a source of delegated authority. A real agent's advertised
tool schema and a configured authorized child ID are required. No secrets logged.
"""
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

lock = threading.Lock()
calls = {"parent_tool_requests": 0, "child_responses": 0, "parent_final": 0,
         "missing_tool": 0, "completion_calls": 0}
child_id = os.environ.get("CI_AUTHORIZED_CHILD_ID", "").strip()
MODEL = "openrouter/free"
SOURCE_MODE = os.environ.get("CI_MISSION_SOURCE_MODE") == "1"
REAL_MODE = os.environ.get('CI_REAL_FREE_PROVIDER') == '1'
REAL_KEY = os.environ.get('CI_OPENROUTER_KEY', '')
REAL_URL = 'https://openrouter.ai/api/v1/chat/completions'
provider_records = []
local_rejections = []
class NoProviderRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

provider_opener = build_opener(ProxyHandler({}), NoProviderRedirect())
SOURCE_URL = "https://ci-source.invalid/report"
SOURCE_RESULT = json.dumps({"ok":True,"result":"Synthetic CI observation: "+SOURCE_URL,"sources":SOURCE_URL})

def bounded_real_request(request):
    if request.get('model') != 'openrouter/free' or any(k in request for k in ('models', 'plugins', 'web_search_options')):
        raise ValueError('REAL_FREE_ROUTE_REQUIRED')
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
        if value is not None and (type(value) is not int or not 1 <= value <= 2048):
            raise ValueError('REAL_TOKEN_LIMIT_REQUIRED')
    if result.get('max_tokens') is None and result.get('max_completion_tokens') is None:
        result['max_tokens'] = 2048
    return result

def reserve_real_request():
    with lock:
        count = calls.get('provider_requests', 0)
        if count >= 4:
            raise ValueError('REAL_REQUEST_BUDGET_EXHAUSTED')
        calls['provider_requests'] = count + 1
        return count + 1

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
            for call in message.get('tool_calls', []):
                name = call.get('function', {}).get('name')
                if isinstance(name, str): tools.add(name)
    candidate = ''.join(content)
    record = {'request': number, 'http_status': status, 'models': sorted(models),
              'finish_reasons': sorted(finishes), 'tool_names': sorted(tools), 'usage': usage,
              'candidate_text': candidate[:8192], 'candidate_truncated': len(candidate) > 8192,
              'errors': errors[:2]}
    if request is not None:
        def object_value(value):
            return value if isinstance(value, dict) else {}
        fmt = object_value(request.get('response_format'))
        structured = object_value(fmt.get('json_schema'))
        schema = object_value(structured.get('schema'))
        required = schema.get('required')
        record['request_parameters'] = {
            'response_format': fmt.get('type') if fmt.get('type') in ('json_object', 'json_schema') else None,
            'strict': structured.get('strict') is True,
            'required_output_fields': [name for name in ('result', 'sources', 'ok')
                                       if isinstance(required, list) and name in required],
            'require_parameters': object_value(request.get('provider')).get('require_parameters') is True,
            'max_tokens': request.get('max_tokens'),
            'max_completion_tokens': request.get('max_completion_tokens')}
    with lock:
        provider_records.append(record)
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
        if REAL_MODE and self.path == '/provider-diagnostics':
            with lock:
                snapshot = list(provider_records)
                rejections = list(local_rejections)
            return self.send({'route': 'openrouter/free', 'limit_requests': 4,
                              'limit_output_tokens': 2048, 'records': snapshot,
                              'local_rejections': rejections})
        if SOURCE_MODE and self.path.startswith('/search?'):
            with lock: calls['source_search_calls']=calls.get('source_search_calls',0)+1
            return self.send({'query':'CI synthetic source','results':[{'url':SOURCE_URL,'title':'Synthetic CI source','content':'This is controlled fixture data, not a real-world financial claim.'}]})
        if self.path == "/health": return self.send({"status":"ok","configured":bool(child_id)})
        if self.path == "/metrics":
            with lock: snapshot=dict(calls)
            return self.send(snapshot)
        if self.path in ("/v1/models","/models"):
            return self.send({"object":"list","data":[{"id":MODEL,"object":"model","created":1700000000,"owned_by":"ci"}]})
        return self.send({"error":"not_found"},404)
    def do_POST(self):
        global child_id
        if SOURCE_MODE and self.path.rstrip('/').endswith('/scrape'):
            length=int(self.headers.get('Content-Length','0'))
            if length < 2 or length > 1048576: return self.send({'error':'size'},400)
            self.rfile.read(length)
            with lock: calls['source_scrape_calls']=calls.get('source_scrape_calls',0)+1
            return self.send({'success':True,'data':{'markdown':'Controlled synthetic CI evidence only.','metadata':{'sourceURL':SOURCE_URL,'title':'Synthetic CI source'}}})
        if self.path == "/configure":
            # A runner-local control endpoint. Expose only on ephemeral private CI runners.
            length=int(self.headers.get("Content-Length","0"))
            if length < 2 or length > 2048: return self.send({"error":"size"},400)
            try: obj=json.loads(self.rfile.read(length))
            except ValueError: return self.send({"error":"json"},400)
            proposed=obj.get("childId")
            if not isinstance(proposed,str) or not proposed.strip(): return self.send({"error":"child"},400)
            child_id=proposed.strip()
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
        already_requested=any(
            any(tc.get("function",{}).get("name")=="subagent" for tc in (m.get("tool_calls") or []))
            for m in messages if isinstance(m,dict) and m.get("role")=="assistant"
        )
        advertised=tool_name(req)
        with lock:
            calls["completion_calls"]+=1
            number=calls["completion_calls"]
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
            request = Request(REAL_URL, data=json.dumps(bounded).encode(), method='POST',
                headers={'Authorization': 'Bearer ' + REAL_KEY, 'Content-Type': 'application/json',
                         'Accept': 'text/event-stream' if req.get('stream') else 'application/json'})
            try:
                with provider_opener.open(request, timeout=90) as response:
                    status, content_type = response.status, response.headers.get('Content-Type', 'application/json')
                    payload = response.read(1048577)
            except HTTPError as error:
                status, content_type, payload = error.code, 'application/json', error.read(65536)
            except (URLError, TimeoutError):
                status, content_type, payload = 502, 'application/json', b'{"error":"UPSTREAM_TRANSPORT_FAILED"}'
            if 300 <= status < 400:
                record_provider_response(provider_number, status, b'{"error":"UPSTREAM_REDIRECT_REFUSED"}', bounded)
                return self.send({'error': 'UPSTREAM_REDIRECT_REFUSED'}, 502)
            if len(payload) > 1048576:
                status, content_type, payload = 502, 'application/json', b'{"error":"UPSTREAM_RESPONSE_TOO_LARGE"}'
            record_provider_response(provider_number, status, payload, bounded)
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
        if SOURCE_MODE and forced_web and not web_advertised:
            return self.send({'error':'fixture_tool_choice_schema_mismatch'},400)
        if SOURCE_MODE and planned_contract=='result-v1' and not forced_web:
            with lock: calls['planned_final']=calls.get('planned_final',0)+1
            message={'role':'assistant','content':SOURCE_RESULT}
            reason='stop'
        elif SOURCE_MODE and web_advertised and (forced_web or research_contract and not web_completed):
            with lock: calls['source_tool_requests']=calls.get('source_tool_requests',0)+1
            message={'role':'assistant','content':None,'tool_calls':[{'id':'call_ci_search_'+str(number),'type':'function','function':{'name':'web_search','arguments':json.dumps({'query':'CI synthetic source'})}}]}
            reason='tool_calls'
        elif SOURCE_MODE and research_contract and web_advertised and web_completed:
            with lock: calls['source_final']=calls.get('source_final',0)+1
            message={'role':'assistant','content':SOURCE_RESULT}
            reason='stop'
        elif has_tool_result and already_requested:
            with lock: calls["parent_final"]+=1
            message={"role":"assistant","content":'{"ok":true}'}
            reason="stop"
        elif advertised and child_id and not already_requested:
            with lock: calls["parent_tool_requests"]+=1
            message={"role":"assistant","content":None,"tool_calls":[{
                "id":"call_ci_child_"+str(number),"type":"function",
                "function":{"name":"subagent","arguments":json.dumps({
                    "description":"Return the delegated fixture result for parent verification.",
                    "subagent_type":child_id,
                    "run_in_background":True
                })}
            }]}
            reason="tool_calls"
        elif not advertised and child_id and not already_requested and not has_tool_result:
            # The authorized child has no nested subagent tool; its first model turn returns the receipt.
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
