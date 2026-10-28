#!/usr/bin/env python3
"""No-Docker CI probe: does a zero-price model autonomously choose native subagent?

Two explicit, isolated task types. Never force tool_choice. Never execute tools
or expose generated content, credentials or tool arguments in logs.
"""
import json
import os
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = "nvidia/nemotron-3.5-super-vl:free"
API = "https://openrouter.ai/api/v1"
KEY = os.environ.get("OPENROUTER_API_KEY", "")
BUDGET = 2


def fail(reason):
    raise SystemExit("CI_FREE_AUTO_FAIL=" + reason)


def read_json(path, auth=False):
    headers = {"Accept": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + KEY
    with urlopen(Request(API + path, headers=headers), timeout=25) as resp:
        return json.load(resp)


def call_model(mode, messages):
    tool = {"type": "function", "function": {
        "name": "subagent",
        "description": "Delegate an analysis step to an authorized specialist",
        "parameters": {
            "type": "object",
            "properties": {
                "description": {"type": "string"},
                "subagent_type": {"type": "string", "enum": ["ci-authorized-child"]},
                "run_in_background": {"type": "boolean"},
            },
            "required": ["description", "subagent_type"],
            "additionalProperties": False,
        },
    }}
    body = {
        "model": MODEL,
        "messages": messages,
        "tools": [tool],
        "tool_choice": "auto",
        "stream": False,
        "max_tokens": 512,
        "temperature": 0,
        "provider": {"require_parameters": True},
    }
    if body["tool_choice"] != "auto":
        fail("FORCED_TOOL_CHOICE_NOT_ALLOWED")
    req = Request(API + "/chat/completions",
                  data=json.dumps(body, separators=(",", ":")).encode(),
                  method="POST", headers={
                      "Authorization": "Bearer " + KEY,
                      "Accept": "application/json",
                      "Content-Type": "application/json",
                  })
    try:
        with urlopen(req, timeout=95) as resp:
            if resp.status != 200:
                fail("UNEXPECTED_PROVIDER_STATUS")
            blob = resp.read(65537)
            if len(blob) > 65536:
                fail("RESPONSE_TOO_LARGE")
            answer = json.loads(blob)
        print("CI_FREE_AUTO_" + mode + "_HTTP=200", flush=True)
    except HTTPError as exc:
        print("CI_FREE_AUTO_" + mode + "_HTTP=" + str(exc.code), flush=True)
        fail("PROVIDER_HTTP_FAILURE")
    choices = answer.get("choices") or []
    msg = choices[0].get("message") if choices and isinstance(choices[0], dict) else {}
    calls = (msg or {}).get("tool_calls") or []
    valid = []
    for item in calls[:3]:
        fn = item.get("function") if isinstance(item, dict) else None
        if not isinstance(fn, dict) or fn.get("name") != "subagent":
            continue
        try:
            args = json.loads(fn.get("arguments", ""))
        except (TypeError, ValueError):
            continue
        if (args.get("subagent_type") == "ci-authorized-child"
                and isinstance(args.get("description"), str)
                and bool(args["description"].strip())):
            valid.append(item)
    print("CI_FREE_AUTO_" + mode + "_TOOL_CALL_COUNT="
          + str(len(calls)), flush=True)
    print("CI_FREE_AUTO_" + mode + "_VALID_SUBAGENT_COUNT="
          + str(len(valid)), flush=True)
    if mode == "SIMPLE":
        return len(calls) == 0
    return len(calls) == 1 and len(valid) == 1


def main():
    if os.environ.get("CI_FREE_AUTONOMOUS_OPT_IN") != "1":
        fail("EXPLICIT_OPT_IN_REQUIRED")
    if len(KEY) < 17:
        fail("KEY_MISSING")
    before = read_json("/key", True).get("data") or {}
    quota = (before.get("free_model_daily_requests") or {}).get("remaining")
    if before.get("is_management_key") or type(quota) is not int or quota < BUDGET:
        fail("FREE_QUOTA_NOT_CONFIRMED")
    matches = [m for m in read_json("/models").get("data", []) if m.get("id") == MODEL]
    if len(matches) != 1:
        fail("NAMED_FREE_MODEL_MISSING")
    m = matches[0]
    try:
        price = m.get("pricing") or {}
        if not all(Decimal(str(price.get(field, "unknown"))) == 0
                   for field in ("prompt", "completion")):
            fail("POSITIVE_PRICE")
    except (InvalidOperation, ValueError):
        fail("PRICE_UNVERIFIED")
    if not {"tools", "tool_choice"}.issubset(set(m.get("supported_parameters") or [])):
        fail("MODEL_LACKS_TOOL_SUPPORT")
    print("CI_FREE_AUTO_MODEL_PRICE_AND_QUOTA=PASS", flush=True)
    simple = call_model("SIMPLE", [
        {"role": "system", "content": "You may delegate only when a specialist is needed."},
        {"role": "user", "content": "What is 2+2? Return 4 directly; no specialist needed."},
    ])
    delegated = call_model("DELEGATE", [
        {"role": "system", "content":
         "You are an orchestrator. Delegate verification tasks to authorized specialists "
         "using the subagent tool, then synthesize their result."},
        {"role": "user", "content":
         "Verify a separate specialist's assessment of the CI task before final synthesis. "
         "Delegate the verification now to the authorized specialist. Do not guess its result."},
    ])
    after = read_json("/key", True).get("data") or {}
    for field in ("usage", "usage_daily"):
        if before.get(field) is not None and after.get(field) is not None:
            if Decimal(str(after[field])) > Decimal(str(before[field])):
                fail("POSITIVE_ACCOUNT_SPEND_DETECTED")
    print("CI_FREE_AUTO_NO_POSITIVE_SPEND=PASS", flush=True)
    print("CI_FREE_AUTO_SIMPLE=" + ("PASS" if simple else "FAIL"), flush=True)
    print("CI_FREE_AUTO_DELEGATE=" + ("PASS" if delegated else "FAIL"), flush=True)
    if not simple or not delegated:
        fail("AUTONOMOUS_ZERO_OR_ONE_SELECTION_NOT_VERIFIED")
    print("BOTMODE_FREE_AUTONOMOUS_ZERO_ONE=PASS", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, InvalidOperation) as err:
        print("CI_FREE_AUTO_INFRA_ERROR=" + type(err).__name__, flush=True)
        fail("PREFLIGHT_OR_NETWORK_ERROR")
