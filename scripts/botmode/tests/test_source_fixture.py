import importlib.util
import json
import os
import threading
import time
import unittest
from http.client import IncompleteRead
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

FIXTURE = Path(__file__).resolve().parents[1] / 'ci-openai-subagent-fixture.py'


class SourceFixtureTests(unittest.TestCase):
    def test_native_fallback_simulation_never_calls_upstream_or_requires_key(self):
        base = self.start(real=False, fallback=True)
        body = self.body(real=True)
        with patch.object(self.last_module.provider_opener, 'open') as upstream:
            self.assertEqual(self.post(base, {**body, 'model': 'openrouter/free'})[0], 429)
            self.assert_search(self.post(base, body))
            upstream.assert_not_called()
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        self.assertTrue(evidence['simulated'])
        self.assertEqual(evidence['records'], [])
        self.assertEqual(len(evidence['fallback']['records']), 2)
        with urlopen(base + '/metrics') as reply: metrics = json.load(reply)
        self.assertEqual(metrics.get('provider_requests', 0), 0)

    def test_context_refusal_preserves_selected_raw_diff_bounded_and_redacted(self):
        base = self.start(real=True, fallback=True)
        body = self.body(real=True)
        secret = self.last_module.REAL_KEY
        body['messages'][0]['content'] += ' ' + secret
        primary = {**body, 'model': 'openrouter/free'}
        changed = {**body, 'tool_choice': 'auto'}
        with patch.object(self.last_module.provider_opener, 'open') as upstream:
            self.assertEqual(self.post(base, primary)[0], 429)
            self.assertEqual(self.post(base, changed)[0], 400)
            upstream.assert_not_called()
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        mismatch = evidence['fallback']['mismatches'][0]
        self.assertEqual(mismatch['changed_fields'], ['tool_choice'])
        self.assertEqual(mismatch['primary']['value']['tool_choice'], body['tool_choice'])
        self.assertEqual(mismatch['secondary']['value']['tool_choice'], 'auto')
        self.assertNotIn(secret, json.dumps(evidence))
        self.assertEqual(set(mismatch['primary']['value']), {'messages', 'tools', 'tool_choice', 'response_format'})

    def test_oversized_context_diagnostics_fail_closed_without_unbounded_body(self):
        base = self.start(real=False, fallback=True)
        body = self.body(real=True)
        body['messages'][0]['content'] = 'x' * 20000
        self.assertEqual(self.post(base, {**body, 'model': 'openrouter/free'})[0], 429)
        self.assertEqual(self.post(base, {**body, 'tool_choice': 'auto'})[0], 400)
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        mismatch = evidence['fallback']['mismatches'][0]
        self.assertEqual(mismatch['primary']['omitted'], 'size_limit')
        self.assertEqual(mismatch['secondary']['omitted'], 'size_limit')
        self.assertLess(len(json.dumps(evidence)), 10000)

    def start(self, source=True, real=False, upstream=None, fallback=False):
        spec = importlib.util.spec_from_file_location('isolated_source_fixture', FIXTURE)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {'CI_MISSION_SOURCE_MODE': '1' if source else '0',
            'CI_REAL_FREE_PROVIDER': '1' if real else '0',
            'CI_NATIVE_FALLBACK': '1' if fallback else '0',
            'CI_OPENROUTER_KEY': 'fake-ci-provider-key-not-a-real-secret' if real else ''}):
            spec.loader.exec_module(module)
        if real:
            module.REAL_URL = upstream or 'http://127.0.0.1:1/refuse-network'
        elif upstream is not None:
            module.REAL_URL = upstream
        self.last_module = module
        server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f'http://127.0.0.1:{server.server_port}'

    def post(self, base, body, route='/v1/chat/completions'):
        req = Request(base + route, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_controlled_primary_429_never_reaches_provider(self):
        base = self.start(real=True, fallback=True)
        primary = {**self.body(real=True), 'model': 'openrouter/free'}
        with patch.object(self.last_module.provider_opener, 'open') as upstream:
            status, body = self.post(base, primary)
        self.assertEqual(status, 429)
        self.assertEqual(body['error']['type'], 'rate_limit_exceeded')
        upstream.assert_not_called()
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        self.assertEqual(evidence['records'], [])
        self.assertEqual(evidence['fallback']['records'][0]['kind'], 'primary_429')
        self.assertNotIn('messages', json.dumps(evidence))

    def test_secondary_requires_matching_primary_context_and_cannot_skip_or_repeat(self):
        base = self.start(real=True, fallback=True)
        secondary = self.body(real=True)
        primary = {**secondary, 'model': 'openrouter/free'}
        with patch.object(self.last_module.provider_opener, 'open') as upstream:
            self.assertEqual(self.post(base, secondary)[0], 400)
            self.assertEqual(self.post(base, primary)[0], 429)
            self.assertEqual(self.post(base, primary)[0], 400)
            for change in ({'messages': []}, {'tools': []}, {'tool_choice': 'none'},
                           {'response_format': {'type': 'json_object'}}):
                self.assertEqual(self.post(base, {**secondary, **change})[0], 400)
            upstream.assert_not_called()

    def test_four_fallback_pairs_forward_only_secondary_over_local_http(self):
        received = []
        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                payload = json.dumps({'model': 'nvidia/nemotron-3.5-super-vl:free',
                    'choices': [{'message': {'role': 'assistant', 'content': 'controlled'}, 'finish_reason': 'stop'}],
                    'usage': {'completion_tokens': 2, 'cost': 0}}).encode()
                self.send_response(200)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        server = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = self.start(real=True, fallback=True, upstream=f'http://127.0.0.1:{server.server_port}/v1/chat/completions')
        secondary = self.body(real=True)
        primary = {**secondary, 'model': 'openrouter/free'}
        for _ in range(4):
            self.assertEqual(self.post(base, primary)[0], 429)
            self.assertEqual(self.post(base, secondary)[0], 200)
        self.assertEqual(self.post(base, primary)[0], 400)
        self.assertEqual(self.post(base, secondary)[0], 400)
        self.assertEqual(len(received), 4)
        self.assertTrue(all(r['model'] == secondary['model'] for r in received))
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        self.assertEqual(len(evidence['fallback']['records']), 8)
        self.assertEqual(len(evidence['records']), 4)

    def body(self, real=False):
        return {'model': 'nvidia/nemotron-3.5-super-vl:free' if real else 'openrouter/free',
                **({'reasoning': {'enabled': False}} if real else {}), 'stream': False,
                'messages': [{'role': 'system', 'content': 'Internal web observation phase: call web_search.'}],
                'tool_choice': {'type': 'function', 'function': {'name': 'web_search'}},
                'tools': [{'type': 'function', 'function': {'name': 'web_search', 'parameters': {'type': 'object'}}}]}

    def assert_search(self, response):
        status, body = response
        self.assertEqual(status, 200)
        choice = body['choices'][0]
        self.assertEqual(choice['finish_reason'], 'tool_calls')
        self.assertEqual(choice['message']['tool_calls'][0]['function']['name'], 'web_search')

    def test_observed_source_contains_a_dated_substantive_controlled_report(self):
        base = self.start()
        with urlopen(base + '/search?q=CI-report', timeout=3) as response:
            search = json.load(response)['results'][0]
        self.assertEqual(search['url'], 'https://ci-source.invalid/report')
        self.assertIn('CI-FIXTURE-001', search['content'])
        status, scraped = self.post(base, {'url': search['url']}, '/scrape')
        self.assertEqual(status, 200)
        self.assertEqual(scraped['data']['metadata']['sourceURL'], search['url'])
        markdown = scraped['data']['markdown']
        facts = json.loads(markdown.split('```json\n', 1)[1].split('```', 1)[0])
        self.assertEqual(facts['report_id'], 'CI-FIXTURE-001')
        self.assertEqual(facts['published_at'], '2026-10-25T00:00:00Z')
        self.assertEqual(len(facts['checks']), 3)
        self.assertTrue(all(c['status'] == 'passed' for c in facts['checks']))
        self.assertTrue(facts['synthetic'])
        self.assertIn('fixture', facts['publisher'].lower())
        self.assertIn('test', facts['scope'].lower())

    def test_named_search_without_json_contract(self):
        self.assert_search(self.post(self.start(), self.body()))

    def test_named_search_streaming_protocol(self):
        body = self.body()
        body['stream'] = True
        request = Request(self.start() + '/v1/chat/completions', data=json.dumps(body).encode(),
                          headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=3) as response:
            frames = [line[5:].strip() for line in response.read().decode().splitlines() if line.startswith('data:')]
        chunks = [json.loads(frame) for frame in frames if frame != '[DONE]']
        self.assertTrue(any(c['choices'][0]['finish_reason'] == 'tool_calls' for c in chunks))
        tools = [t for c in chunks for t in c['choices'][0]['delta'].get('tool_calls', [])]
        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]['function']['name'], 'web_search')

    def test_named_search_is_not_satisfied_by_historical_tool_result(self):
        body = self.body()
        body['messages'] += [
            {'role': 'assistant', 'tool_calls': [{'id': 'old', 'function': {'name': 'web_search'}}]},
            {'role': 'tool', 'tool_call_id': 'old', 'content': 'old observation'},
        ]
        self.assert_search(self.post(self.start(), body))

    def test_named_search_overrides_historical_result_contract(self):
        body = self.body()
        body['messages'].insert(0, {'role': 'system', 'content':
            'Mission planning context (not execution permission):' +
            json.dumps({'validation': [{'outputContract': 'result-v1'}]})})
        self.assert_search(self.post(self.start(), body))

    def test_named_search_requires_its_advertised_schema(self):
        body = self.body()
        body['tools'] = []
        status, response = self.post(self.start(), body)
        self.assertEqual(status, 400)
        self.assertEqual(response['error'], 'fixture_tool_choice_schema_mismatch')

    def test_result_contract_still_returns_scalar_json(self):
        body = self.body()
        body['tool_choice'] = 'auto'
        body['messages'] = [{'role': 'system', 'content':
            'Mission planning context (not execution permission):' +
            json.dumps({'validation': [{'outputContract': 'result-v1'}]})}]
        status, response = self.post(self.start(), body)
        self.assertEqual(status, 200)
        self.assertEqual(response['choices'][0]['finish_reason'], 'stop')
        self.assertTrue(json.loads(response['choices'][0]['message']['content'])['result'])

    def test_cached_research_contract_accepts_text_blocks_and_completed_search(self):
        body = self.body()
        body['tool_choice'] = 'auto'
        body['messages'] = [
            {'role': 'system', 'content': [{'type': 'text', 'cache_control': {'type': 'ephemeral'},
                'text': 'Mission planning context (not execution permission):\n' +
                    json.dumps({'validation': [{'outputContract': 'research-v1'}]})}]},
            {'role': 'assistant', 'tool_calls': [{'id': 'observed', 'function': {'name': 'web_search'}}]},
            {'role': 'tool', 'tool_call_id': 'observed', 'content': [{'type': 'text', 'text': 'observation'}]},
        ]
        status, response = self.post(self.start(), body)
        self.assertEqual(status, 200)
        self.assertEqual(response['choices'][0]['finish_reason'], 'stop')
        self.assertEqual(json.loads(response['choices'][0]['message']['content'])['sources'],
                         'https://ci-source.invalid/report')

    def test_cached_result_contract_accepts_split_text_blocks(self):
        body = self.body()
        body['tool_choice'] = 'auto'
        body['messages'] = [{'role': 'system', 'content': [
            {'type': 'text', 'text': 'Mission planning context (not execution permission):'},
            {'type': 'text', 'text': json.dumps({'validation': [{'outputContract': 'result-v1'}]})},
        ]}]
        status, response = self.post(self.start(), body)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(response['choices'][0]['message']['content'])['ok'])

    def test_legacy_delegation_outside_source_mode(self):
        base = self.start(source=False)
        self.assertEqual(self.post(base, {'childId': 'authorized-child'}, '/configure')[0], 200)
        body = self.body()
        body['tool_choice'] = 'auto'
        body['tools'][0]['function']['name'] = 'subagent'
        status, response = self.post(base, body)
        self.assertEqual(status, 200)
        tool = response['choices'][0]['message']['tool_calls'][0]
        self.assertEqual(tool['function']['name'], 'subagent')
        self.assertEqual(json.loads(tool['function']['arguments'])['subagent_type'], 'authorized-child')

    def test_real_request_refuses_paid_models_and_plugins(self):
        spec = importlib.util.spec_from_file_location('bounded_relay', FIXTURE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        valid = self.body(real=True)
        self.assertEqual(module.bounded_real_request(valid)['max_tokens'], 2048)
        for changes in ({'model': 'openai/gpt-4'}, {'models': ['openrouter/free']},
                        {'plugins': [{'id': 'web'}]}, {'max_tokens': 2049},
                        {'max_completion_tokens': 2049}, {'n': 2},
                        {'tools': [{'type': 'web_search'}]},
                        {'tools': [{'type': 'code_interpreter'}]},
                        {'tools': [{'type': 'function', 'function': {'name': ''}}]}):
            with self.assertRaises(ValueError):
                module.bounded_real_request({**valid, **changes})

    def test_local_refusals_are_preserved_without_request_content_or_provider_calls(self):
        base = self.start(real=True)
        cases = [({'model': 'paid-secret-marker'}, 'REAL_FREE_ROUTE_REQUIRED'),
                 ({'model': 'openrouter/free'}, 'REAL_FREE_ROUTE_REQUIRED'),
                 ({'reasoning': {'enabled': True}}, 'REAL_REASONING_DISABLED_REQUIRED'),
                 ({'reasoning': None}, 'REAL_REASONING_DISABLED_REQUIRED'),
                 ({'n': 2}, 'REAL_SINGLE_CHOICE_REQUIRED'),
                 ({'tools': [{'type': 'web_search'}]}, 'REAL_FUNCTION_SCHEMA_REQUIRED'),
                 ({'tools': [{'type': 'function', 'function': None}]},
                  'REAL_FUNCTION_SCHEMA_REQUIRED'),
                 ({'max_tokens': 2049}, 'REAL_TOKEN_LIMIT_REQUIRED')]
        for changes, expected in cases:
            status, response = self.post(base, {**self.body(real=True), **changes})
            self.assertEqual((status, response['error']), (400, expected))
        with urlopen(base + '/provider-diagnostics') as response:
            diagnostics = json.load(response)
        self.assertEqual(diagnostics['local_rejections'], [
            {'completion_call': i + 1, 'code': code} for i, (_, code) in enumerate(cases)])
        self.assertEqual(diagnostics['records'], [])
        self.assertNotIn('paid-secret-marker', json.dumps(diagnostics))
        with urlopen(base + '/metrics') as response:
            self.assertEqual(json.load(response).get('provider_requests', 0), 0)

    def test_pending_provider_requests_are_visible_before_and_after_response_headers(self):
        for waiting_phase in ('waiting_headers', 'reading_body'):
            with self.subTest(waiting_phase=waiting_phase):
                release, arrived = threading.Event(), threading.Event()
                class Provider(BaseHTTPRequestHandler):
                    def log_message(self, *_): pass
                    def do_POST(self):
                        self.rfile.read(int(self.headers['Content-Length']))
                        arrived.set()
                        if waiting_phase == 'waiting_headers': release.wait(2)
                        payload = b'{"model":"local","choices":[],"usage":{"cost":0}}'
                        self.send_response(200)
                        self.send_header('Content-Length', str(len(payload)))
                        self.end_headers()
                        if waiting_phase == 'reading_body': release.wait(2)
                        self.wfile.write(payload)
                upstream = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
                thread = threading.Thread(target=upstream.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
                thread.start()
                self.addCleanup(thread.join)
                self.addCleanup(upstream.server_close)
                self.addCleanup(upstream.shutdown)
                base = self.start(real=True, upstream=f'http://127.0.0.1:{upstream.server_port}/v1/chat/completions')
                results = []
                client = threading.Thread(target=lambda: results.append(self.post(base, self.body(real=True))), daemon=True)
                client.start()
                try:
                    self.assertTrue(arrived.wait(1))
                    deadline = time.monotonic() + 1
                    while True:
                        with urlopen(base + '/provider-diagnostics', timeout=1) as response: snapshot = json.load(response)
                        records = snapshot['records']
                        if records and records[0].get('phase') == waiting_phase: break
                        if time.monotonic() >= deadline: self.fail('Pending request lifecycle was not captured')
                        time.sleep(0.01)
                    self.assertEqual(len(records), 1)
                    self.assertEqual(records[0]['upstream_headers_status'], None if waiting_phase == 'waiting_headers' else 200)
                    self.assertGreaterEqual(records[0]['elapsed_ms'], 0)
                    self.assertEqual(records[0]['usage'], {})
                    self.assertNotIn('fake-ci-provider-key', json.dumps(snapshot))
                    self.assertNotIn('messages', json.dumps(snapshot))
                finally:
                    release.set()
                    client.join(2)
                self.assertEqual(results[0][0], 200)
                with urlopen(base + '/provider-diagnostics', timeout=1) as response: final = json.load(response)
                self.assertEqual(len(final['records']), 1)
                self.assertEqual(final['records'][0]['phase'], 'response_complete')

    def test_transport_error_retains_only_error_type_and_no_retry(self):
        http_error = HTTPError('http://127.0.0.1/fake', 429, 'controlled', {}, None)
        http_error.read = unittest.mock.Mock(side_effect=TimeoutError('private-provider-detail'))
        chunk_error = HTTPError('http://127.0.0.1/fake', 429, 'controlled', {}, None)
        chunk_error.read = unittest.mock.Mock(side_effect=IncompleteRead(b'private-provider-detail', 10))
        for failure in (URLError(TimeoutError('private-provider-detail')), http_error, chunk_error):
            with self.subTest(failure=type(failure).__name__):
                base = self.start(real=True)
                with patch.object(self.last_module.provider_opener, 'open', side_effect=failure):
                    status, _ = self.post(base, self.body(real=True))
                self.assertEqual(status, 502)
                with urlopen(base + '/provider-diagnostics') as response: evidence = json.load(response)
                self.assertEqual(len(evidence['records']), 1)
                self.assertEqual(evidence['records'][0]['phase'], 'transport_error')
                self.assertEqual(evidence['records'][0]['transport_error_type'],
                                 'IncompleteRead' if failure is chunk_error else 'TimeoutError')
                self.assertNotIn('private-provider-detail', json.dumps(evidence))

    def test_truncated_success_response_becomes_terminal_transport_error(self):
        base = self.start(real=True)
        response = unittest.mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = {'Content-Type': 'application/json'}
        response.read.side_effect = IncompleteRead(b'private-partial-body', 10)
        with patch.object(self.last_module.provider_opener, 'open', return_value=response):
            status, _ = self.post(base, self.body(real=True))
        self.assertEqual(status, 502)
        with urlopen(base + '/provider-diagnostics') as reply: evidence = json.load(reply)
        self.assertEqual(len(evidence['records']), 1)
        record = evidence['records'][0]
        self.assertEqual(record['phase'], 'transport_error')
        self.assertEqual(record['transport_error_type'], 'IncompleteRead')
        self.assertEqual(record['upstream_headers_status'], 200)
        self.assertNotIn('private-partial-body', json.dumps(evidence))

    def test_real_budget_reservation_stops_at_four(self):
        spec = importlib.util.spec_from_file_location('bounded_relay_budget', FIXTURE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for expected in range(1, 5):
            self.assertEqual(module.reserve_real_request(), expected)
        with self.assertRaisesRegex(ValueError, 'BUDGET_EXHAUSTED'):
            module.reserve_real_request()
        self.assertEqual(module.calls['provider_requests'], 4)

    def test_real_relay_forwards_local_http_and_enforces_budget_without_leaking_key(self):
        received = []
        key = 'fake-ci-provider-key-not-a-real-secret'
        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append((self.headers['Authorization'], body))
                message = {'role': 'assistant', 'content': json.dumps({'ok': True, 'result': key})}
                payload = json.dumps({'model': 'upstream-fixture',
                    'choices': [{'message': message, 'finish_reason': 'stop'}],
                    'usage': {'prompt_tokens': 1, 'completion_tokens': 2, 'cost': 0}}).encode()
                self.send_response(200)
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(payload)
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=upstream.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(upstream.server_close)
        self.addCleanup(upstream.shutdown)
        base = self.start(real=True, upstream=f'http://127.0.0.1:{upstream.server_port}/v1/chat/completions')
        body = self.body(real=True)
        body['messages'][0]['content'] += ' PRIVATE_INPUT_NOT_FOR_DIAGNOSTICS'
        self.assertEqual(self.post(base, {**body, 'model': 'paid/model'})[0], 400)
        self.assertEqual(received, [])
        for index in range(4):
            request_body = body if index == 0 else {**body, 'tool_choice': 'auto',
                'response_format': {'type': 'json_schema', 'json_schema': {'name': 'ci-result',
                    'strict': True, 'schema': {'type': 'object', 'required': ['result', 'sources', 'ok'],
                        'additionalProperties': False}}},
                'provider': {'require_parameters': True},
                'tools': body['tools'] + [{'type': 'function', 'function': {
                    'name': ('subagent', 'current_state', 'tool_search')[index - 1],
                    'description': 'Application-side native function schema',
                    'parameters': {'type': 'object'}}}]}
            status, response = self.post(base, request_body)
            self.assertEqual(status, 200)
            self.assertEqual(response['model'], 'upstream-fixture')
        status, response = self.post(base, body)
        self.assertEqual(status, 400)
        self.assertEqual(response['error'], 'REAL_REQUEST_BUDGET_EXHAUSTED')
        self.assertEqual(len(received), 4)
        self.assertEqual([t['function']['name'] for t in received[1][1]['tools']],
                         ['web_search', 'subagent'])
        self.assertEqual(received[2][1]['tools'][-1]['function']['name'], 'current_state')
        self.assertEqual(received[3][1]['tools'][-1]['function']['name'], 'tool_search')
        self.assertEqual(received[1][1]['tool_choice'], 'auto')
        self.assertEqual(received[1][1]['response_format']['type'], 'json_schema')
        self.assertTrue(all(auth == 'Bearer ' + key and b['max_tokens'] == 2048 for auth, b in received))
        self.assertTrue(all(b['model'] == 'nvidia/nemotron-3.5-super-vl:free'
                            and b['reasoning'] == {'enabled': False} for _, b in received))
        with urlopen(base + '/provider-diagnostics', timeout=3) as response:
            evidence = json.load(response)
        self.assertEqual(len(evidence['records']), 4)
        self.assertEqual(evidence['records'][0]['request_parameters']['response_format'], None)
        self.assertEqual(evidence['records'][1]['request_parameters'], {
            'response_format': 'json_schema', 'strict': True,
            'required_output_fields': ['result', 'sources', 'ok'],
            'require_parameters': True, 'max_tokens': 2048, 'max_completion_tokens': None,
            'model': 'nvidia/nemotron-3.5-super-vl:free', 'reasoning_enabled': False})
        self.assertNotIn('PRIVATE_INPUT_NOT_FOR_DIAGNOSTICS', json.dumps(evidence))
        self.assertNotIn(key, json.dumps(evidence))
        self.assertEqual(evidence['records'][0]['candidate_text'], '{"ok": true, "result": "[redacted]"}')

    def test_stream_evidence_keeps_final_content_but_excludes_reasoning(self):
        spec = importlib.util.spec_from_file_location('relay_evidence', FIXTURE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        payload = b'data: {"model":"local","choices":[{"delta":{"reasoning":"PRIVATE_REASONING","content":"{\\"ok\\":true}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
        module.record_provider_response(1, 200, payload)
        record = module.provider_records[0]
        self.assertEqual(record['candidate_text'], '{"ok":true}')
        self.assertNotIn('PRIVATE_REASONING', json.dumps(record))

    def test_real_relay_preserves_sse_and_does_not_retry_upstream_errors(self):
        received = []
        wire = b'data: {"model":"local-upstream","choices":[{"delta":{"content":"{\\"ok\\":true}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append(body)
                error = len(received) == 2
                payload = b'{"error":{"message":"controlled rate limit"}}' if error else wire
                self.send_response(429 if error else 200)
                self.send_header('Content-Type', 'application/json' if error else 'text/event-stream')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=upstream.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(upstream.server_close)
        self.addCleanup(upstream.shutdown)
        base = self.start(real=True, upstream=f'http://127.0.0.1:{upstream.server_port}/v1/chat/completions')
        body = self.body(real=True)
        body['stream'] = True
        body['messages'][0]['content'] = [{'type': 'text', 'text': 'cached input', 'cache_control': {'type': 'ephemeral'}}]
        request = Request(base + '/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=3) as response:
            self.assertEqual(response.read(), wire)
        self.assertEqual(received[0]['messages'], body['messages'])
        status, response = self.post(base, body)
        self.assertEqual(status, 429)
        self.assertEqual(response['error']['message'], 'controlled rate limit')
        self.assertEqual(len(received), 2)
        with urlopen(base + '/provider-diagnostics', timeout=3) as response:
            records = json.load(response)['records']
        self.assertEqual([r['http_status'] for r in records], [200, 429])
        self.assertEqual(records[0]['candidate_text'], '{"ok":true}')

    def test_real_relay_refuses_cross_host_redirect_without_forwarding_the_key(self):
        leaked = []
        class Destination(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                leaked.append(self.headers.get('Authorization'))
                payload = b'{"choices":[{"message":{"content":"unexpected destination"}}]}'
                self.send_response(200)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        destination = ThreadingHTTPServer(('127.0.0.1', 0), Destination)
        class Redirect(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(302)
                self.send_header('Location', f'http://127.0.0.1:{destination.server_port}/other')
                self.send_header('Content-Length', '0')
                self.end_headers()
        origin = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        for server in (destination, origin):
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
            thread.start()
            self.addCleanup(thread.join)
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
        base = self.start(real=True, upstream=f'http://127.0.0.1:{origin.server_port}/v1/chat/completions')
        status, response = self.post(base, self.body(real=True))
        self.assertEqual(status, 502)
        self.assertEqual(response['error'], 'UPSTREAM_REDIRECT_REFUSED')
        self.assertEqual(leaked, [])
        with urlopen(base + '/provider-diagnostics', timeout=3) as response:
            records = json.load(response)['records']
        self.assertEqual([r['http_status'] for r in records], [302])


if __name__ == '__main__':
    unittest.main()
