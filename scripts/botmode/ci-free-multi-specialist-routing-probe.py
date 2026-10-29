#!/usr/bin/env python3
"""Isolated, bounded 2-specialist routing test (NO real child execution).

The zero-price free model must choose research then analysis with tool_choice=auto
over two turns. A synthetic tool receipt tests routing continuation only; this
does NOT prove durable native LibreChat subagent execution or Oracle/P6.
Never log prompts, generated text, tool arguments, secret or raw provider errors.
"""
import json
import os
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://openrouter.ai/api/v1"
MODEL = "nvidia/nemotron-3.5-super-vl:free"
ALLOW = ("research", "analysis")
KEY = os.environ.get("OPENROUTER_API_KEY", "")


def fail(code):
    raise SystemExit("CI_FREE_MULTI_FAIL=" + code)


def get(path, auth=False):
    headers = {"Accept": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + KEY
    with urlopen(Request(BASE + path, headers=headers), timeout=25) as response:
        return json.load(response)


def call(messages, phase):
    tool = {
        "type": "function",
        "function": {
            "name": "subagent",
            "description": "Delegate an authorized specialist's independent mission task",
            "parameters": {
                "type": "object",
                "properties": {
                    "subagent_type": {"type": "string", "enum": list(ALLOW)},
                    "description": {"type": "string"},
                    "run_in_background": {"type": "boolean"},
                },
                "required": ["subagent_type", "description"],
                "additionalProperties": False,
            },
        },
    }
    data = {
        "model": MODEL, "stream": False, "max_tokens": 512,
        "temperature": 0, "messages": messages, "tools": [tool],
        "tool_choice": "auto", "provider": {"require_parameters": True},
    }
    if "response_format" in data or data["tool_choice"] != "auto":
        fail("UNEXPECTED_FORCED_OR_FORMAT_REQUEST")
    req = Request(BASE + "/chat/completions",
                  headers={"Authorization": "Bearer " + KEY,
                           "Content-Type": "application/json", "Accept": "application/json"},
                  data=json.dumps(data, separators=(",", ":")).encode(), method="POST")
    try:
        with urlopen(req, timeout=95) as resp:
            if resp.status != 200:
                fail("UNEXPECTED_PROVIDER_HTTP")
            body = resp.read(65537)
            if len(body) > 65536:
                fail("PROVIDER_REPLY_TOO_LARGE")
            result = json.loads(body)
    except HTTPError as error:
        print("CI_FREE_MULTI_" + phase + "_HTTP=" + str(error.code), flush=True)
        fail("PROVIDER_HTTP_FAILURE")
    print("CI_FREE_MULTI_" + phase + "_HTTP=200", flush=True)
    choices = result.get("choices") or []
    msg = choices[0].get("message") if choices and isinstance(choices[0], dict) else {}
    calls = msg.get("tool_calls") if isinstance(msg, dict) else []
    if not isinstance(calls, list) or len(calls) != 1:
        print("CI_FREE_MULTI_" + phase + "_TOOL_CALL_COUNT="
              + str(len(calls) if isinstance(calls, list) else 0), flush=True)
        fail("EXACTLY_ONE_SUBAGENT_CALL_REQUIRED")
    selected = calls[0]
    fun = selected.get("function") if isinstance(selected, dict) else None
    if not isinstance(fun, dict) or fun.get("name") != "subagent":
        fail("INVALID_TOOL_SELECTION")
    try:
        args = json.loads(fun.get("arguments", ""))
    except (ValueError, TypeError):
        fail("INVALID_TOOL_ARGUMENTS")
    if (args.get("subagent_type") != phase.lower()
            or not isinstance(args.get("description"), str)
            or not args["description"].strip()):
        fail("WRONG_OR_UNAUTHORIZED_SPECIALIST")
    if not isinstance(selected.get("id"), str) or not selected["id"]:
        fail("TOOL_CALL_ID_MISSING")
    print("CI_FREE_MULTI_" + phase + "_AUTHORIZED_SUBAGENT=PASS", flush=True)
    return {"role": "assistant", "tool_calls": calls}, selected["id"]


def main():
    if os.environ.get("CI_FREE_MULTI_OPT_IN") != "1":
        fail("EXPLICIT_OPT_IN_REQUIRED")
    if len(KEY) < 17:
        fail("KEY_MISSING")
    before = get("/key", True).get("data") or {}
    remaining = (before.get("free_model_daily_requests") or {}).get("remaining")
    if before.get("is_management_key") or type(remaining) is not int or remaining < 2:
        fail("FREE_QUOTA_NOT_CONFIRMED")
    model = [m for m in get("/models").get("data", []) if m.get("id") == MODEL]
    if len(model) != 1:
        fail("MODEL_MISSING")
    try:
        if any(Decimal(str((model[0].get("pricing") or {}).get(k, "invalid"))) != 0
               for k in ("prompt", "completion")):
            fail("POSITIVE_MODEL_PRICE")
    except (InvalidOperation, ValueError):
        fail("PRICE_NOT_VERIFIED")
    if not {"tools", "tool_choice"}.issubset(set(model[0].get("supported_parameters") or [])):
        fail("MODEL_LACKS_TOOL_CHOICES")
    print("CI_FREE_MULTI_PRICE_QUOTA_TOOLS=PASS", flush=True)
    history = [
        {"role": "system", "content":
         "You are an orchestrator. Delegate independently to an authorized research "
         "specialist and then to an authorized analysis specialist before finalizing. "
         "Use the subagent tool with the matching subagent_type; never fake a specialist result."},
        {"role": "user", "content":
         "First delegate evidence gathering to research. After its tool receipt, "
         "delegate independent assessment to analysis."},
    ]
    first, call_id = call(history, "RESEARCH")
    history += [first, {
        "role": "tool", "tool_call_id": call_id,
        "content": "CI SYNTHETIC receipt: research tool completed. "
                   "The independent analysis specialist has NOT been called.",
    }, {
        "role": "user", "content":
         "Now delegate the independent assessment to the authorized analysis specialist. "
         "Do not finish without the analysis tool call.",
    }]
    call(history, "ANALYSIS")
    after = get("/key", True).get("data") or {}
    for field in ("usage", "usage_daily"):
        if before.get(field) is not None and after.get(field) is not None:
            if Decimal(str(after[field])) > Decimal(str(before[field])):
                fail("POSITIVE_ACCOUNT_SPEND")
    print("CI_FREE_MULTI_NO_POSITIVE_SPEND=PASS", flush=True)
    print("CI_FREE_MULTI_TWO_DIFFERENT_SPECIALISTS_AUTO=PASS", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, InvalidOperation) as exc:
        print("CI_FREE_MULTI_INFRA_ERROR=" + type(exc).__name__, flush=True)
        fail("PREFLIGHT_OR_NETWORK")
