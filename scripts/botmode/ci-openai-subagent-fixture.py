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

lock = threading.Lock()
calls = {"parent_tool_requests": 0, "child_responses": 0, "parent_final": 0,
         "missing_tool": 0, "completion_calls": 0}
child_id = os.environ.get("CI_AUTHORIZED_CHILD_ID", "").strip()
MODEL = "openrouter/free"
SOURCE_MODE = os.environ.get("CI_MISSION_SOURCE_MODE") == "1"
SOURCE_URL = "https://ci-source.invalid/report"
SOURCE_RESULT = json.dumps({"ok":True,"result":"Synthetic CI observation: "+SOURCE_URL,"sources":SOURCE_URL})

def tool_name(request):
    for item in request.get("tools") or []:
        if not isinstance(item, dict):
            continue
        f = item.get("function") if item.get("type") == "function" else None
        if isinstance(f, dict) and f.get("name") == "subagent":
            return "subagent"
    return None

def planned_output_contract(messages):
    marker='Mission planning context (not execution permission):'
    for message in reversed(messages):
        if not isinstance(message,dict) or message.get('role') not in ('system','developer'): continue
        content=message.get('content')
        if not isinstance(content,str) or marker not in content: continue
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
        web_advertised=any(item.get('function',{}).get('name')=='web_search' for item in req.get('tools',[]) if isinstance(item,dict))
        web_calls={tc.get('id') for m in messages if isinstance(m,dict) for tc in m.get('tool_calls',[]) if isinstance(tc,dict) and tc.get('function',{}).get('name')=='web_search'}
        web_completed=any(m.get('role')=='tool' and m.get('tool_call_id') in web_calls for m in messages if isinstance(m,dict))
        planned_contract=planned_output_contract(messages)
        research_contract=planned_contract=='research-v1' or planned_contract is None and any(isinstance(m.get('content'),str) and re.search(r'"outputContract"\s*:\s*"research-v1"',m['content']) for m in messages if isinstance(m,dict))
        if SOURCE_MODE and planned_contract=='result-v1':
            with lock: calls['planned_final']=calls.get('planned_final',0)+1
            message={'role':'assistant','content':SOURCE_RESULT}
            reason='stop'
        elif SOURCE_MODE and research_contract and web_advertised and not web_completed:
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
