import importlib.util
import contextlib
import io
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'ci-fixed-free-preflight.py'


class FixedFreePreflightTests(unittest.TestCase):
    def start(self, mode='good'):
        spec = importlib.util.spec_from_file_location('fixed_free_probe', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        received = []
        key = 'fake-preflight-key-not-a-secret'

        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def send(self, value, status=200):
                data = json.dumps(value).encode()
                self.send_response(status)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                try: self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError): pass
            def do_GET(self):
                entry = {'id': module.MODEL,
                    'pricing': {'prompt': '0' if mode != 'price' else '0.1', 'completion': '0',
                                'request': '0.1' if mode == 'request_price' else '0'},
                    'supported_parameters': ['tools', 'tool_choice'] if mode == 'caps'
                        else ['tools', 'tool_choice', 'response_format', 'reasoning']}
                if mode == 'missing_request': del entry['pricing']['request']
                catalog = [entry]
                if mode == 'large_catalog':
                    catalog += [{'id': f'other/model-{i}', 'description': 'x' * 1000} for i in range(100)]
                if mode == 'oversized_catalog':
                    catalog.append({'id': 'other/huge', 'description': 'x' * (module.CATALOG_LIMIT + 1024)})
                self.send({'data': catalog})
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append((self.headers.get('Authorization'), body))
                if mode == 'redirect':
                    self.send_response(302)
                    self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/leaked')
                    self.end_headers()
                    return
                if self.path == '/leaked':
                    raise AssertionError('Credential followed a redirect')
                if mode == 'http': return self.send({'error': 'private ' + key}, 429)
                if len(received) == 1:
                    message = {'role': 'assistant', 'content': None, 'tool_calls': [{
                        'id': 'controlled-search', 'type': 'function', 'function': {
                            'name': 'foreign' if mode == 'tool' else 'web_search',
                            'arguments': '{"query":"controlled report"}'}}]}
                    finish = 'tool_calls'
                else:
                    content = json.dumps({'ok': True, 'result': 'Controlled report ' + module.SOURCE,
                                          'sources': module.SOURCE})
                    if mode == 'query': content = '{"query":"wrong output"}'
                    if mode == 'false': content = json.dumps({'ok': False, 'result': 'Unavailable', 'sources': module.SOURCE})
                    if mode == 'length': content = '{"result":"incomplete"' + ' ' * 200
                    if mode == 'secret': content = json.dumps({'ok': True, 'result': module.SOURCE + key, 'sources': module.SOURCE})
                    message = {'role': 'assistant', 'content': content, 'reasoning': 'PRIVATE_REASONING'}
                    finish = 'length' if mode == 'length' else 'stop'
                usage = {'prompt_tokens': 12, 'completion_tokens': 20, 'cost': 0.1 if mode == 'cost' else 0}
                if mode == 'overcap': usage['completion_tokens'] = 513
                if mode == 'negative_usage': usage['completion_tokens'] = -1
                if mode == 'bool_tokens': usage['completion_tokens'] = True
                if mode == 'cost_string': usage['cost'] = '0.1'
                if mode == 'missing_cost': del usage['cost']
                if mode == 'nan_cost': usage['cost'] = float('nan')
                if mode == 'missing_usage': usage = None
                model = 'paid/other' if mode == 'model' else module.MODEL
                value = {'model': model, 'choices': [{'message': message, 'finish_reason': finish}], 'usage': usage}
                if mode == 'large_response': value['padding'] = 'x' * module.GENERATION_LIMIT
                self.send(value)

        server = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        module.CATALOG_URL = f'http://127.0.0.1:{server.server_port}/models'
        module.API_URL = f'http://127.0.0.1:{server.server_port}/completions'
        transport = module.Transport(key)
        report = module.new_report('a' * 40)
        return module, transport, report, received, key

    def test_two_requests_keep_fixed_free_model_contract_and_token_bounds(self):
        module, transport, report, received, key = self.start()
        module.run_probe(transport, report)
        self.assertTrue(report['passed'])
        self.assertEqual(transport.requests, 2)
        self.assertEqual(len(received), 2)
        for auth, body in received:
            self.assertEqual(auth, 'Bearer ' + key)
            self.assertEqual(body['model'], module.MODEL)
            self.assertEqual(body['max_tokens'], 512)
            self.assertEqual(body['reasoning'], {'enabled': False})
            self.assertEqual(body['provider'], {'require_parameters': True})
            self.assertNotIn('models', body)
            self.assertNotIn('plugins', body)
        self.assertNotIn('response_format', received[0][1])
        self.assertEqual(received[0][1]['tool_choice']['function']['name'], 'web_search')
        second = received[1][1]
        self.assertEqual(second['tool_choice'], 'auto')
        self.assertEqual(second['response_format']['type'], 'json_schema')
        self.assertTrue(second['response_format']['json_schema']['strict'])
        self.assertEqual(second['response_format']['json_schema']['schema']['required'], ['result', 'sources', 'ok'])
        self.assertTrue(any(message.get('role') == 'tool' and module.SOURCE in message['content']
                            for message in second['messages']))
        with self.assertRaisesRegex(module.ProbeError, 'REQUEST_BUDGET'):
            transport.complete(received[0][1])
        self.assertEqual(len(received), 2)

    def test_price_and_capability_failures_stop_before_any_generation(self):
        for mode in ('price', 'request_price', 'missing_request', 'caps'):
            with self.subTest(mode=mode):
                module, transport, report, received, _ = self.start(mode)
                with self.assertRaises(module.ProbeError): module.run_probe(transport, report)
                self.assertEqual(transport.requests, 0)
                self.assertEqual(received, [])

    def test_first_tool_failure_or_http_error_stops_without_retry(self):
        for mode in ('tool', 'http', 'cost'):
            with self.subTest(mode=mode):
                module, transport, report, received, _ = self.start(mode)
                with self.assertRaises(module.ProbeError): module.run_probe(transport, report)
                self.assertFalse(report['passed'])
                self.assertEqual(transport.requests, 1)
                self.assertEqual(len(received), 1)

    def test_redirect_does_not_forward_credential_or_spend_an_extra_attempt(self):
        module, transport, report, received, _ = self.start('redirect')
        with self.assertRaisesRegex(module.ProbeError, 'HTTP_302'): module.run_probe(transport, report)
        self.assertEqual(len(received), 1)
        self.assertEqual(transport.requests, 1)

    def test_length_missing_fields_and_false_completion_stay_rejected(self):
        for mode in ('length', 'query', 'false'):
            with self.subTest(mode=mode):
                module, transport, report, received, _ = self.start(mode)
                with self.assertRaises(module.ProbeError): module.run_probe(transport, report)
                self.assertFalse(report['passed'])
                self.assertEqual(len(received), 2)

    def test_evidence_redacts_the_key_and_omits_private_reasoning(self):
        module, transport, report, _, key = self.start('secret')
        module.run_probe(transport, report)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'evidence.json'
            module.write_report(path, report, key)
            saved = path.read_text()
        self.assertNotIn(key, saved)
        self.assertNotIn('PRIVATE_REASONING', saved)
        self.assertIn('[redacted]', saved)

    def test_forbidden_model_and_oversized_cap_do_not_reach_the_provider(self):
        module, transport, _, received, _ = self.start()
        for change in ({'model': 'paid/model'}, {'max_tokens': 513}, {'models': ['openrouter/free']}):
            with self.assertRaises(module.ProbeError):
                transport.complete({**module.common_payload(), **change})
        self.assertEqual(received, [])
        self.assertEqual(transport.requests, 0)

    def test_entrypoint_requires_explicit_hosted_authorization_and_exact_source(self):
        module, _, _, received, key = self.start()
        env = {'CI_FIXED_FREE_PREFLIGHT': 'true', 'GITHUB_ACTIONS': 'true',
               'RUNNER_ENVIRONMENT': 'github-hosted', 'OPENROUTER_API_KEY': key,
               'PREFLIGHT_SOURCE_SHA': 'a' * 40}
        for changes in ({'CI_FIXED_FREE_PREFLIGHT': 'false'}, {'RUNNER_ENVIRONMENT': 'self-hosted'},
                        {'OPENROUTER_API_KEY': ''}, {'PREFLIGHT_SOURCE_SHA': 'b' * 40}):
            with self.subTest(changes=changes), patch.dict(module.os.environ, {**env, **changes}, clear=True), \
                 patch.object(module.subprocess, 'check_output', return_value='a' * 40), \
                 patch.object(module.Transport, '_json') as network, \
                 patch.object(module, 'write_report') as writer, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(module.main(), 1)
                network.assert_not_called()
                self.assertFalse(writer.call_args.args[1]['passed'])
        self.assertEqual(received, [])

    def test_model_and_reported_usage_violations_stop_before_second_request(self):
        for mode in ('model', 'overcap', 'negative_usage', 'bool_tokens', 'cost_string',
                     'missing_cost', 'missing_usage', 'nan_cost'):
            with self.subTest(mode=mode):
                module, transport, report, received, _ = self.start(mode)
                with self.assertRaises(module.ProbeError): module.run_probe(transport, report)
                self.assertFalse(report['passed'])
                self.assertEqual(transport.requests, 1)
                self.assertEqual(len(received), 1)

    def test_valid_catalog_can_exceed_generation_limit_and_catalog_read_stays_bounded(self):
        module, transport, report, received, _ = self.start('large_catalog')
        module.run_probe(transport, report)
        self.assertTrue(report['passed'])
        self.assertEqual(len(received), 2)
        module, transport, report, received, _ = self.start('oversized_catalog')
        with self.assertRaisesRegex(module.ProbeError, 'TOO_LARGE'): module.run_probe(transport, report)
        self.assertEqual(transport.requests, 0)
        self.assertEqual(received, [])

    def test_generation_response_keeps_its_smaller_limit(self):
        module, transport, report, received, _ = self.start('large_response')
        with self.assertRaisesRegex(module.ProbeError, 'RESPONSE_TOO_LARGE'):
            module.run_probe(transport, report)
        self.assertEqual(transport.requests, 1)
        self.assertEqual(len(received), 1)
