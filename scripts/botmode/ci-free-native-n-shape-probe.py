#!/usr/bin/env python3
"""No-Docker two-turn probe. Simulated tool receipts are not native execution proof."""
import json
import os
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://openrouter.ai/api/v1"
MODEL = "nvidia/nemotron-3.5-super-vl:free"
KEY = os.environ.get("OPENROUTER_API_KEY", "")

def fail(code):
    raise SystemExit("CI_FREE_N_SHAPE_FAIL=" + code)

def get(path, auth=False):
    headers = {"Accept": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + KEY
    with urlopen(Request(BASE + path, headers=headers), timeout=25) as response:
        return json.load(response)

TOOL = {"type": "function", "function": {
    "name": "subagent", "description": "Delegate an independent task to an authorized specialist",
    "parameters": {"type": "object", "properties": {
        "subagent_type": {"type": "string", "enum": ["research", "analysis"]},
        "description": {"type": "string"},
        "run_in_background": {"type": "boolean"}},
        "required": ["subagent_type", "description"], "additionalProperties": False}}}

def call(messages, phase):
    body = {"model": MODEL, "stream": False, "max_tokens": 512,
            "temperature": 0, "messages": messages, "tools": [TOOL],
            "tool_choice": "auto", "provider": {"require_parameters": True}}
    if "response_format" in body or body["tool_choice"] != "auto":
        fail("FORCED_OR_FORMAT_REQUEST")
    request = Request(BASE + "/chat/completions",
                      headers={"Authorization": "Bearer " + KEY,
                               "Content-Type": "application/json", "Accept": "application/json"},
                      data=json.dumps(body).encode(), method="POST")
    try:
        with urlopen(request, timeout=95) as response:
            if response.status != 200:
                fail(phase + "_HTTP_NOT_200")
            raw = response.read(65537)
            if len(raw) > 65536:
                fail(phase + "_OVERSIZE")
            data = json.loads(raw)
    except HTTPError as exc:
        print("CI_FREE_N_SHAPE_" + phase + "_HTTP=" + str(exc.code), flush=True)
        fail(phase + "_HTTP_FAILURE")
    except (URLError, TimeoutError, ValueError, TypeError):
        fail(phase + "_TRANSPORT_OR_JSON_FAILURE")
    try:
        if Decimal(str((data.get("usage") or {}).get("cost", 0))) > 0:
            fail("POSITIVE_SPEND")
    except (ValueError, TypeError, InvalidOperation):
        fail("UNVERIFIABLE_USAGE")
    choices = data.get("choices") or []
    msg = choices[0].get("message") if len(choices) == 1 else None
    if not isinstance(msg, dict):
        fail(phase + "_MESSAGE_MISSING")
    print("CI_FREE_N_SHAPE_" + phase + "_HTTP=200", flush=True)
    return msg

def main():
    if os.environ.get("CI_FREE_N_SHAPE_OPT_IN") != "1" or len(KEY) < 17:
        fail("OPT_IN_OR_KEY_MISSING")
    quota = get("/key", True).get("data") or {}
    remaining = (quota.get("free_model_daily_requests") or {}).get("remaining")
    if quota.get("is_management_key") or type(remaining) is not int or remaining < 2:
        fail("FREE_QUOTA_NOT_VERIFIED")
    models = [m for m in (get("/models").get("data") or []) if m.get("id") == MODEL]
    if len(models) != 1:
        fail("MODEL_MISSING")
    try:
        pricing = models[0].get("pricing") or {}
        if any(Decimal(str(pricing.get(k, "invalid"))) != 0 for k in ("prompt", "completion")):
            fail("NOT_ZERO_PRICE")
    except (ValueError, TypeError, InvalidOperation):
        fail("PRICE_UNVERIFIED")
    if not {"tools", "tool_choice"}.issubset(set(models[0].get("supported_parameters") or [])):
        fail("TOOLS_UNSUPPORTED")
    print("CI_FREE_N_SHAPE_PRICE_QUOTA=PASS", flush=True)

    messages = [
        {"role": "system", "content":
         "Tu es le Worker autonome. Délègue obligatoirement deux tâches distinctes, puis termine avec le seul objet JSON brut {\"ok\":true}. Ne génère aucune explication finale."},
        {"role": "user", "content":
         "Dans un même tour, lance deux appels subagent distincts, RECHERCHE et ANALYSE, avec run_in_background=true. Après réception des deux résultats terminés, renvoie exactement {\"ok\":true}, sans Markdown ni autre texte."},
    ]
    first = call(messages, "FIRST")
    calls = first.get("tool_calls") or []
    print("CI_FREE_N_SHAPE_FIRST_TOOL_COUNT=" +
          str(len(calls) if isinstance(calls, list) else 0), flush=True)
    if not isinstance(calls, list) or len(calls) != 2:
        fail("FIRST_NOT_TWO_TOOLS")
    ids, roles = [], []
    for tc in calls:
        fn = tc.get("function") if isinstance(tc, dict) else None
        if not isinstance(fn, dict) or fn.get("name") != "subagent":
            fail("FIRST_NOT_NATIVE_SUBAGENT")
        try:
            args = json.loads(fn.get("arguments", ""))
        except (ValueError, TypeError):
            fail("FIRST_ARGUMENTS_INVALID")
        if (args.get("subagent_type") not in ("research", "analysis") or
                not isinstance(args.get("description"), str) or not args["description"].strip()):
            fail("FIRST_UNAUTHORIZED_OR_EMPTY")
        ids.append(tc.get("id"))
        roles.append(args["subagent_type"])
    if (len(set(ids)) != 2 or not all(isinstance(i, str) and i for i in ids) or
            set(roles) != {"research", "analysis"}):
        fail("FIRST_NOT_DISTINCT")
    print("CI_FREE_N_SHAPE_TWO_AUTONOMOUS_TOOL_CALLS=PASS", flush=True)
    messages.append({"role": "assistant", "content": first.get("content"), "tool_calls": calls})
    for ident, role in zip(ids, roles):
        messages.append({"role": "tool", "tool_call_id": ident,
                         "content": "completed: usable independent specialist result; role=" + role})
    second = call(messages, "SECOND")
    if second.get("tool_calls"):
        fail("SECOND_REQUESTED_MORE_TOOLS")
    content = second.get("content")
    if not isinstance(content, str):
        fail("SECOND_NOT_TEXT")
    try:
        value = json.loads(content)
    except (ValueError, TypeError):
        print("CI_FREE_N_SHAPE_FINAL_CLASS=INVALID_CANDIDATE", flush=True)
        fail("SECOND_JSON_INVALID")
    scalar = (str, int, float, bool, type(None))
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, scalar)
                                               for k, v in value.items()):
        fail("SECOND_NOT_SCALAR_OBJECT")
    if value.get("ok") is not True:
        fail("SECOND_OK_CRITERION_FAILED")
    print("CI_FREE_N_SHAPE_FINAL_ORACLE_JSON=PASS", flush=True)
    print("CI_FREE_N_SHAPE_SYNTHETIC_RECEIPTS_ONLY=TRUE", flush=True)
    print("CI_FREE_N_SHAPE_NO_POSITIVE_SPEND=PASS", flush=True)

if __name__ == "__main__":
    main()
