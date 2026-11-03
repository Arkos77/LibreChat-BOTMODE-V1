#!/usr/bin/env python3
"""One zero-price hosted model compatibility request. No paid fallback or retry.

Never print API secrets, prompts, model response content or external payloads.
A live tool call demonstrates protocol compatibility only, not end-to-end BOT MODE.
"""
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'
API = 'https://openrouter.ai/api/v1'


def outcome(name, value):
    print(f'BOTMODE_FREE_HOSTED_{name}={value}', flush=True)


def stop(kind):
    outcome('VERDICT', kind)
    sys.exit(1 if kind != 'PASS' else 0)


def main():
    key = os.environ.get('OPENROUTER_API_KEY', '')
    if not key:
        stop('NON_CONCLUANT_NO_SECRET')
    if not MODEL.endswith(':free'):
        stop('BLOCKED_PAID_MODEL')
    try:
        with urlopen(Request(API + '/models', headers={
            'Accept': 'application/json', 'User-Agent': 'botmode-v1-free-model-check',
        }), timeout=20) as resp:
            models = json.load(resp).get('data', [])
        model = next((m for m in models if m.get('id') == MODEL), None)
        if not model:
            stop('NON_CONCLUANT_MODEL_NOT_LISTED')
        pricing = model.get('pricing') or {}
        if not all(str(pricing.get(k)) in ('0', '0.0', '0.000000') for k in ('prompt', 'completion')):
            stop('BLOCKED_NONZERO_MODEL_PRICING')
        if 'tools' not in model.get('supported_parameters', []):
            stop('NON_CONCLUANT_NO_TOOL_SUPPORT')
        outcome('ZERO_PRICE_AND_TOOLS', 'PASS')
        payload = {
            'model': MODEL,
            'messages': [
                {'role': 'system', 'content': 'Call the one available function with ok=true. Do not write a text answer.'},
                {'role': 'user', 'content': 'Invoke check_result with ok=true.'},
            ],
            'tools': [{'type': 'function', 'function': {
                'name': 'check_result',
                'description': 'Report that the requested function was called.',
                'parameters': {'type': 'object', 'properties': {'ok': {'type': 'boolean'}},
                               'required': ['ok'], 'additionalProperties': False},
            }}],
            'tool_choice': 'auto',
            'max_tokens': 96,
            'temperature': 0,
        }
        req = Request(API + '/chat/completions', data=json.dumps(payload).encode(),
                      method='POST', headers={
                          'Authorization': 'Bearer ' + key,
                          'Content-Type': 'application/json',
                          'Accept': 'application/json',
                          'User-Agent': 'botmode-v1-free-model-check',
                      })
        # Exactly ONE POST. HTTP errors, 429 and provider outages are not retried.
        with urlopen(req, timeout=90) as resp:
            result = json.load(resp)
    except HTTPError as e:
        outcome('HTTP_STATUS', str(e.code))
        stop('NON_CONCLUANT_PROVIDER_HTTP')
    except (URLError, TimeoutError) as e:
        outcome('TRANSPORT_ERROR_CLASS', type(e).__name__)
        stop('NON_CONCLUANT_PROVIDER_TRANSPORT')
    except (ValueError, TypeError, StopIteration):
        stop('NON_CONCLUANT_BAD_PROVIDER_FORMAT')
    model_used = result.get('model') or ''
    if model_used and model_used != MODEL and not model_used.endswith(':free'):
        stop('BLOCKED_PROVIDER_MODEL_NOT_FREE')
    choices = result.get('choices') or []
    if not choices:
        stop('NON_CONCLUANT_NO_COMPLETION')
    message = choices[0].get('message') or {}
    calls = message.get('tool_calls') or []
    outcome('TOOL_CALLS_COUNT', str(len(calls)))
    valid = False
    for call in calls:
        func = call.get('function') or {}
        try:
            args = json.loads(func.get('arguments') or '{}')
        except ValueError:
            continue
        if func.get('name') == 'check_result' and args.get('ok') is True:
            valid = True
    if not valid:
        stop('NON_CONCLUANT_NO_EXPECTED_TOOL_CALL')
    outcome('LIVE_TOOL_CALL', 'PASS')
    stop('PASS')


if __name__ == '__main__':
    main()
