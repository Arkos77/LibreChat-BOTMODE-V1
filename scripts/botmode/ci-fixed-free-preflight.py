"""Opt-in two-request capability probe; synthetic data, no application mission."""
import json
import math
import os
import re
import subprocess
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

MODEL = 'nvidia/nemotron-3.5-super-vl:free'
SOURCE = 'https://ci-source.invalid/report'
CATALOG_URL = 'https://openrouter.ai/api/v1/models'
API_URL = 'https://openrouter.ai/api/v1/chat/completions'
CATALOG_LIMIT = 4 * 1024 * 1024
GENERATION_LIMIT = 65536
TOOL = {'type': 'function', 'function': {'name': 'web_search',
        'description': 'Request the controlled synthetic report.',
        'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}},
                       'required': ['query'], 'additionalProperties': False}}}
FORMAT = {'type': 'json_schema', 'json_schema': {'name': 'botmode_research_v1', 'strict': True,
    'schema': {'type': 'object', 'properties': {
        'result': {'type': 'string', 'description': 'Report the actual findings, limitations and uncertainty honestly. Cite observed source URLs when research is required.'},
        'sources': {'type': 'string', 'description': 'Newline-separated absolute URLs returned by completed web_search calls, cited in result. Never invent sources.'},
        'ok': {'type': ['boolean', 'null']}},
        'required': ['result', 'sources', 'ok'], 'additionalProperties': False}}}


class ProbeError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_): return None


class Transport:
    def __init__(self, token):
        self.token, self.requests = token, 0
        self.opener = build_opener(ProxyHandler({}), NoRedirect())

    def _json(self, url, payload=None):
        limit = CATALOG_LIMIT if payload is None else GENERATION_LIMIT
        headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
        if payload is not None: headers['Authorization'] = 'Bearer ' + self.token
        request = Request(url, data=None if payload is None else json.dumps(payload).encode(),
                          headers=headers, method='GET' if payload is None else 'POST')
        try:
            with self.opener.open(request, timeout=30) as response:
                if response.status != 200: raise ProbeError('HTTP_' + str(response.status))
                data = response.read(limit + 1)
        except HTTPError as error:
            code = error.code
            error.close()
            raise ProbeError('HTTP_' + str(code)) from None
        except (URLError, TimeoutError, OSError):
            raise ProbeError('TRANSPORT_FAILED') from None
        if len(data) > limit:
            raise ProbeError('CATALOG_TOO_LARGE' if payload is None else 'RESPONSE_TOO_LARGE')
        try: value = json.loads(data)
        except (ValueError, UnicodeError): raise ProbeError('RESPONSE_INVALID_JSON') from None
        if not isinstance(value, dict): raise ProbeError('RESPONSE_INVALID_OBJECT')
        return value

    def catalog(self): return self._json(CATALOG_URL)

    def complete(self, payload):
        if (payload.get('model') != MODEL or payload.get('max_tokens') != 512
                or payload.get('n', 1) != 1 or any(k in payload for k in ('models', 'plugins', 'web_search_options'))):
            raise ProbeError('FREE_ROUTE_OR_TOKEN_CAP_REQUIRED')
        if self.requests >= 2: raise ProbeError('REQUEST_BUDGET_EXHAUSTED')
        self.requests += 1
        return self._json(API_URL, payload)


def common_payload():
    return {'model': MODEL, 'max_tokens': 512, 'stream': False,
            'reasoning': {'enabled': False}, 'provider': {'require_parameters': True}, 'tools': [TOOL]}


def new_report(sha):
    return {'source_sha': sha, 'model': MODEL, 'passed': False, 'request_count': 0,
            'max_requests': 2, 'max_output_tokens': 512, 'records': [],
            'scope': 'Fixed-model capabilities only; synthetic tool result; no BOTMODE mission or publication.'}


def generate(transport, report, phase, payload):
    record = {'phase': phase, 'request_parameters': {
        'model': payload['model'], 'max_tokens': payload['max_tokens'], 'stream': False,
        'reasoning_enabled': False, 'require_parameters': True,
        'tool_choice': payload['tool_choice'], 'response_format': payload.get('response_format')}}
    report['records'].append(record)
    try:
        value = transport.complete(payload)
    except ProbeError as error:
        record['error'] = str(error)
        raise
    finally:
        report['request_count'] = transport.requests
    record['http_status'] = 200
    model = value.get('model')
    record['model'] = model if isinstance(model, str) else None
    if model != MODEL: raise ProbeError('RESPONSE_MODEL_MISMATCH')
    usage = value.get('usage')
    record['usage'] = {k: v for k, v in (usage.items() if isinstance(usage, dict) else [])
                       if k in ('prompt_tokens', 'completion_tokens', 'total_tokens', 'cost')
                       and type(v) in (int, float) and math.isfinite(v)}
    if not isinstance(usage, dict): raise ProbeError('USAGE_REQUIRED')
    completion = usage.get('completion_tokens')
    if type(completion) is not int or not 0 <= completion <= 512:
        raise ProbeError('REPORTED_TOKEN_USAGE_INVALID')
    for field in ('prompt_tokens', 'total_tokens'):
        if field in usage and (type(usage[field]) is not int or usage[field] < 0):
            raise ProbeError('REPORTED_TOKEN_USAGE_INVALID')
    cost = usage.get('cost')
    if type(cost) not in (int, float) or not math.isfinite(cost): raise ProbeError('USAGE_COST_INVALID')
    if cost != 0: raise ProbeError('UNEXPECTED_NONZERO_COST')
    choices = value.get('choices')
    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
        raise ProbeError('SINGLE_CHOICE_REQUIRED')
    choice = choices[0]
    record['finish_reason'] = choice.get('finish_reason')
    message = choice.get('message')
    if not isinstance(message, dict): raise ProbeError('MESSAGE_REQUIRED')
    if isinstance(message.get('content'), str): record['candidate_text'] = message['content'][:8192]
    return choice.get('finish_reason'), message, record


def run_probe(transport, report):
    models = transport.catalog().get('data')
    if not isinstance(models, list): raise ProbeError('CATALOG_INVALID')
    matches = [m for m in models if isinstance(m, dict) and m.get('id') == MODEL]
    if len(matches) != 1: raise ProbeError('EXACT_FREE_MODEL_NOT_LISTED')
    entry = matches[0]
    price = entry.get('pricing')
    report['catalog'] = {'id': MODEL, 'pricing_observed': {
        k: price[k] for k in ('prompt', 'completion', 'request') if isinstance(price, dict) and k in price}}
    # The observed :free catalog omits request. Free-variant policy supplies the
    # no-cost contract; never invent an observed zero for an absent price field.
    # https://openrouter.ai/docs/guides/routing/model-variants/free
    try:
        fields = ('prompt', 'completion') + (('request',) if isinstance(price, dict) and 'request' in price else ())
        if (not MODEL.endswith(':free') or not isinstance(price, dict) or any(
                Decimal(str(price.get(k, 'unknown'))) != 0 for k in fields)):
            raise ProbeError('NONZERO_OR_UNKNOWN_PRICE')
    except InvalidOperation: raise ProbeError('NONZERO_OR_UNKNOWN_PRICE') from None
    parameters = entry.get('supported_parameters')
    if not isinstance(parameters, list) or not {'tools', 'tool_choice', 'response_format', 'reasoning'}.issubset(parameters):
        raise ProbeError('REQUIRED_CAPABILITIES_MISSING')
    report['catalog'].update({'prompt_price': 0, 'completion_price': 0,
        'request_price': 0 if 'request' in price else None, 'request_price_declared': 'request' in price,
        'free_variant_policy': 'https://openrouter.ai/docs/guides/routing/model-variants/free',
        'required_parameters': ['tools', 'tool_choice', 'response_format', 'reasoning']})
    messages = [{'role': 'system', 'content': 'Use the named tool for the controlled report. Keep requests and answers brief.'},
                {'role': 'user', 'content': 'Find the controlled CI report using web_search.'}]
    finish, message, record = generate(transport, report, 'named_tool', {
        **common_payload(), 'messages': messages,
        'tool_choice': {'type': 'function', 'function': {'name': 'web_search'}}})
    calls = message.get('tool_calls')
    if finish != 'tool_calls' or not isinstance(calls, list) or len(calls) != 1 or not isinstance(calls[0], dict):
        raise ProbeError('NAMED_TOOL_NOT_COMPLETED')
    call = calls[0]
    function = call.get('function')
    if (call.get('type') != 'function' or not isinstance(call.get('id'), str) or not call['id']
            or not isinstance(function, dict) or function.get('name') != 'web_search'):
        raise ProbeError('NAMED_TOOL_NOT_COMPLETED')
    try: arguments = json.loads(function.get('arguments', ''))
    except (ValueError, TypeError): raise ProbeError('TOOL_ARGUMENTS_INVALID') from None
    if not isinstance(arguments, dict) or not isinstance(arguments.get('query'), str) or not arguments['query'].strip():
        raise ProbeError('TOOL_ARGUMENTS_INVALID')
    record['tool_call'] = {'name': 'web_search', 'arguments': function['arguments']}
    messages = messages + [
        {'role': 'assistant', 'content': None, 'tool_calls': [call]},
        {'role': 'tool', 'tool_call_id': call['id'], 'content': 'Controlled synthetic report: ' + SOURCE + '\nFinding: fixture ready.'},
        {'role': 'user', 'content': 'Return one compact JSON object, under 80 words. Use scalar result, sources, ok. Cite the observed URL in result and sources. Report the controlled finding honestly. No further tool calls or extra whitespace.'}]
    finish, message, _ = generate(transport, report, 'structured_result', {
        **common_payload(), 'messages': messages, 'tool_choice': 'auto', 'response_format': FORMAT})
    if finish != 'stop' or message.get('tool_calls'): raise ProbeError('RESULT_NOT_COMPLETED')
    try: candidate = json.loads(message.get('content', ''))
    except (ValueError, TypeError): raise ProbeError('RESULT_INVALID_JSON') from None
    if (not isinstance(candidate, dict) or set(candidate) != {'result', 'sources', 'ok'}
            or candidate.get('ok') is not True or not isinstance(candidate.get('result'), str)
            or SOURCE not in candidate['result'] or not isinstance(candidate.get('sources'), str)
            or candidate['sources'].strip() != SOURCE):
        raise ProbeError('RESULT_CONTRACT_FAILED')
    report['passed'] = True


def write_report(path, report, token):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    path.write_text(text.replace(token, '[redacted]') if token else text)


def main():
    token = os.environ.get('OPENROUTER_API_KEY', '')
    sha = os.environ.get('PREFLIGHT_SOURCE_SHA', '')
    report = new_report(sha)
    try:
        if (os.environ.get('CI_FIXED_FREE_PREFLIGHT') != 'true' or os.environ.get('GITHUB_ACTIONS') != 'true'
                or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted'):
            raise ProbeError('EXPLICIT_HOSTED_PREFLIGHT_REQUIRED')
        if len(token) <= 16: raise ProbeError('PROVIDER_KEY_REQUIRED')
        if not re.fullmatch('[0-9a-f]{40}', sha) or subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() != sha:
            raise ProbeError('EXACT_SOURCE_REQUIRED')
        run_probe(Transport(token), report)
    except ProbeError as error:
        report['error'] = str(error)
    except Exception as error:
        report['error'] = type(error).__name__
    finally:
        write_report(Path('candidate-evidence/fixed-free-preflight.json'), report, token)
    print('FIXED_FREE_PREFLIGHT=' + ('PASS' if report['passed'] else 'FAIL ' + report.get('error', 'UNKNOWN')))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
