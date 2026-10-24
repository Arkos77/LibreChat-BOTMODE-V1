import importlib.util
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

FIXTURE = Path(__file__).resolve().parents[1] / 'ci-openai-subagent-fixture.py'


class SourceFixtureTests(unittest.TestCase):
    def start(self, source=True):
        spec = importlib.util.spec_from_file_location('isolated_source_fixture', FIXTURE)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {'CI_MISSION_SOURCE_MODE': '1' if source else '0'}):
            spec.loader.exec_module(module)
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

    def body(self):
        return {'model': 'openrouter/free', 'stream': False,
                'messages': [{'role': 'system', 'content': 'Internal web observation phase: call web_search.'}],
                'tool_choice': {'type': 'function', 'function': {'name': 'web_search'}},
                'tools': [{'type': 'function', 'function': {'name': 'web_search', 'parameters': {'type': 'object'}}}]}

    def assert_search(self, response):
        status, body = response
        self.assertEqual(status, 200)
        choice = body['choices'][0]
        self.assertEqual(choice['finish_reason'], 'tool_calls')
        self.assertEqual(choice['message']['tool_calls'][0]['function']['name'], 'web_search')

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


if __name__ == '__main__':
    unittest.main()
