#!/usr/bin/env python3
"""Local, deterministic OpenAI Chat Completions fixture for PR14 CI only.

Runs inside an ephemeral GitHub Actions container. No network egress, API
secrets, user data, dynamic model inference or persistent state.
The fixed response exercises the REAL LibreChat runtime, Oracle and publication
barrier without claiming to test a real hosted model.
"""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FIXTURE = '{"ok":true}'
MODEL = "openrouter/free"
counter = 0
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Never print prompts, request headers, bearer tokens or content.
        pass

    def send_json(self, obj, status=200):
        raw = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path in ("/health", "/v1/health"):
            return self.send_json({"status": "ok"})
        if self.path in ("/v1/models", "/models"):
            return self.send_json({"object": "list", "data": [{
                "id": MODEL, "object": "model", "created": 1700000000,
                "owned_by": "ci-local-fixture"
            }]})
        if self.path == "/metrics":
            with lock:
                value = counter
            return self.send_json({"completion_calls": value})
        return self.send_json({"error": {"message": "not found", "type": "invalid_request_error"}}, 404)

    def do_POST(self):
        global counter
        if not self.path.rstrip("/").endswith("/chat/completions"):
            return self.send_json({"error": {"message": "not found", "type": "invalid_request_error"}}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 1024 * 1024:
                return self.send_json({"error": {"message": "invalid size"}}, 400)
            req = json.loads(self.rfile.read(length))
            if not isinstance(req, dict) or not isinstance(req.get("messages"), list):
                return self.send_json({"error": {"message": "missing messages"}}, 400)
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.send_json({"error": {"message": "invalid json"}}, 400)
        with lock:
            counter += 1
            number = counter
        model = str(req.get("model") or MODEL)
        created = int(time.time())
        usage = {"prompt_tokens": 8, "completion_tokens": 5, "total_tokens": 13}
        if not req.get("stream"):
            return self.send_json({
                "id": "chatcmpl-ci-" + str(number), "object": "chat.completion",
                "created": created, "model": model,
                "choices": [{"index": 0, "message": {
                    "role": "assistant", "content": FIXTURE}, "finish_reason": "stop"}],
                "usage": usage
            })
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        def send(chunk):
            raw = ("data: " + json.dumps(chunk, separators=(",", ":")) + "\n\n").encode()
            self.wfile.write(raw)
            self.wfile.flush()
        def chunk(delta, reason=None):
            return {
                "id": "chatcmpl-ci-" + str(number), "object": "chat.completion.chunk",
                "created": created, "model": model,
                "choices": [{"index": 0, "delta": delta, "finish_reason": reason}]
            }
        try:
            send(chunk({"role": "assistant"}))
            send(chunk({"content": FIXTURE}))
            send(chunk({}, "stop"))
            send({
                "id": "chatcmpl-ci-" + str(number),
                "object": "chat.completion.chunk",
                "created": created, "model": model, "choices": [], "usage": usage
            })
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
