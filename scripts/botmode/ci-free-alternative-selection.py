#!/usr/bin/env python3
"""CI-only zero-price OpenRouter alternative selection. No API secrets, model text or raw errors logged.

At most SIX generation requests total: one native-tool call and one strict-JSON
verification per candidate. No fallback to unapproved or paid models.
"""
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://openrouter.ai/api/v1"
CANDIDATES = (
    "xingchen-agi/xing4.0-29b-a4b:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3.5-super-vl:free",
)
MAX_CALLS = 6
call_count = 0
key = os.environ.get("OPENROUTER_API_KEY", "")


def die(code):
    raise SystemExit("CI_FREE_ALTERNATIVE_FAIL=" + code)


def get(path, authenticated=False):
    headers = {"Accept": "application/json"}
    if authenticated:
        headers["Authorization"] = "Bearer " + key
    with urlopen(Request(BASE + path, headers=headers), timeout=25) as response:
        return json.load(response)


def zero_price(model):
    price = model.get("pricing") or {}
    try:
        return all(Decimal(str(price.get(k, "not-listed"))) == 0 for k in ("prompt", "completion"))
    except (InvalidOperation, ValueError, TypeError):
        return False


def probe(model, payload, kind):
    global call_count
    if model not in CANDIDATES or call_count >= MAX_CALLS:
        die("REQUEST_BUDGET_OR_MODEL_ALLOWLIST")
    if payload.get("model") != model or not model.endswith(":free") or payload.get("models"):
        die("MODEL_ROUTING_NOT_EXACT")
    call_count += 1
    req = Request(
        BASE + "/chat/completions",
        data=json.dumps(payload, separators=(",", ":")).encode(),
        method="POST",
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=95) as response:
            if response.status != 200:
                die("PROVIDER_HTTP_UNEXPECTED")
            body = response.read(65537)
            if len(body) > 65536:
                die("RESPONSE_TOO_LARGE")
            result = json.loads(body)
        print("CI_FREE_ALTERNATIVE_" + kind + "_HTTP=200", flush=True)
        return result
    except HTTPError as exc:
        print("CI_FREE_ALTERNATIVE_" + kind + "_HTTP=" + str(exc.code), flush=True)
        if exc.code == 429:
            # Never print Retry-After value or raw provider error, only presence.
            print("CI_FREE_ALTERNATIVE_429_RETRY_AFTER_PRESENT="
                  + str(bool(exc.headers.get("Retry-After"))).upper(), flush=True)
        return None
    except (URLError, TimeoutError, ValueError, OSError) as exc:
        print("CI_FREE_ALTERNATIVE_" + kind + "_ERROR_CLASS="
              + type(exc).__name__, flush=True)
        return None


def tool_works(model):
    body = {
        "model": model, "stream": False, "max_tokens": 256, "temperature": 0,
        "messages": [{"role": "user", "content":
                      "Use the subagent tool exactly once. Do not reply in plain text."}],
        "tools": [{"type": "function", "function": {
            "name": "subagent", "description": "Delegate to the authorized CI child",
            "parameters": {"type": "object", "properties": {
                "description": {"type": "string"},
                "subagent_type": {"type": "string", "enum": ["ci-authorized-child"]},
                "run_in_background": {"type": "boolean"},
            }, "required": ["description", "subagent_type"],
                "additionalProperties": False},
        }}],
        "tool_choice": {"type": "function", "function": {"name": "subagent"}},
        "provider": {"require_parameters": True},
    }
    result = probe(model, body, "TOOL")
    if not isinstance(result, dict):
        return False
    options = result.get("choices") or []
    msg = (options[0].get("message") or {}) if options and isinstance(options[0], dict) else {}
    calls = msg.get("tool_calls") or []
    if len(calls) != 1 or (calls[0].get("function") or {}).get("name") != "subagent":
        return False
    try:
        args = json.loads(calls[0]["function"]["arguments"])
    except (TypeError, ValueError, KeyError):
        return False
    return (args.get("subagent_type") == "ci-authorized-child"
            and isinstance(args.get("description"), str)
            and bool(args["description"].strip()))


def json_works(model):
    schema = {
        "name": "botmode_ci_oracle",
        "strict": True,
        "schema": {"type": "object", "properties": {"ok": {"type": "boolean"}},
                   "required": ["ok"], "additionalProperties": False},
    }
    body = {
        "model": model, "stream": False, "max_tokens": 120, "temperature": 0,
        "messages": [{"role": "system", "content": "Reply using the specified JSON schema."},
                     {"role": "user", "content": "Return ok=true."}],
        "response_format": {"type": "json_schema", "json_schema": schema},
        "provider": {"require_parameters": True},
    }
    result = probe(model, body, "JSON")
    if not isinstance(result, dict):
        return False
    options = result.get("choices") or []
    msg = (options[0].get("message") or {}) if options and isinstance(options[0], dict) else {}
    raw = msg.get("content")
    try:
        return isinstance(raw, str) and json.loads(raw) == {"ok": True}
    except (TypeError, ValueError):
        return False


def main():
    if os.environ.get("CI_FREE_ALTERNATIVES_OPT_IN") != "1":
        die("EXPLICIT_OPT_IN_REQUIRED")
    if len(key) < 17:
        die("SECRET_MISSING")
    before = get("/key", True).get("data") or {}
    remaining = (before.get("free_model_daily_requests") or {}).get("remaining")
    if before.get("is_management_key") or type(remaining) is not int or remaining < MAX_CALLS:
        die("FREE_QUOTA_NOT_CONFIRMED_FOR_SIX")
    catalog = get("/models").get("data") or []
    models = {item.get("id"): item for item in catalog if isinstance(item, dict)}
    print("CI_FREE_ALTERNATIVE_MAX_GENERATIONS=" + str(MAX_CALLS), flush=True)
    for index, model_id in enumerate(CANDIDATES, 1):
        model = models.get(model_id)
        if not model or not zero_price(model):
            print("CI_FREE_ALTERNATIVE_" + str(index) + "_CATALOG=SKIP_NOT_ZERO_PRICE", flush=True)
            continue
        supported = set(model.get("supported_parameters") or [])
        if not {"tools", "tool_choice", "response_format", "structured_outputs"}.issubset(supported):
            print("CI_FREE_ALTERNATIVE_" + str(index) + "_CATALOG=SKIP_CAPABILITY", flush=True)
            continue
        print("CI_FREE_ALTERNATIVE_" + str(index) + "_CATALOG=ZERO_PRICE_STRUCTURED_TOOLS", flush=True)
        ok_tool = tool_works(model_id)
        print("CI_FREE_ALTERNATIVE_" + str(index) + "_SUBAGENT_SHAPE="
              + ("PASS" if ok_tool else "FAIL"), flush=True)
        if not ok_tool:
            continue
        ok_json = json_works(model_id)
        print("CI_FREE_ALTERNATIVE_" + str(index) + "_STRICT_JSON="
              + ("PASS" if ok_json else "FAIL"), flush=True)
        if ok_json:
            after = get("/key", True).get("data") or {}
            for field in ("usage", "usage_daily"):
                if before.get(field) is not None and after.get(field) is not None:
                    if Decimal(str(after[field])) > Decimal(str(before[field])):
                        die("POSITIVE_ACCOUNT_SPEND_DETECTED")
            print("CI_FREE_ALTERNATIVE_SELECTED_MODEL=" + model_id, flush=True)
            print("CI_FREE_ALTERNATIVE_GENERATIONS=" + str(call_count), flush=True)
            print("CI_FREE_ALTERNATIVE_NO_POSITIVE_SPEND=PASS", flush=True)
            print("BOTMODE_FREE_ALTERNATIVE_PROBE=PASS", flush=True)
            return
    print("CI_FREE_ALTERNATIVE_GENERATIONS=" + str(call_count), flush=True)
    die("NO_FREE_STRUCTURED_TOOL_MODEL_VERIFIED")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, InvalidOperation) as exc:
        print("CI_FREE_ALTERNATIVE_INFRA_ERROR=" + type(exc).__name__, flush=True)
        die("PREFLIGHT_OR_NETWORK_ERROR")
