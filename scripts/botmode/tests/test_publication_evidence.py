import copy
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('host_publication', Path(__file__).resolve().parents[1] / 'ci-host-research.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicationEvidenceTests(unittest.TestCase):
    def fixture(self):
        text = 'Controlled synthesis.\n\nSources\n- <https://ci-source.invalid/report>'
        content = [{'type': 'text', 'text': text}]
        event = {'final': True, 'responseMessage': {
            'conversationId': 'thread', 'messageId': 'answer', 'content': content}}
        mongo = {'conversation': True, 'count': 1, 'complete': True, 'content': copy.deepcopy(content)}
        return event, mongo, text

    def test_retains_exact_observed_content_and_identity_when_all_checks_pass(self):
        event, mongo, text = self.fixture()
        actual = MODULE.validate_publication(event, mongo, 'thread', 'answer', text)
        self.assertEqual(actual['content'], mongo['content'])
        self.assertTrue(actual['sse_mongo_content_equal'])
        self.assertTrue(actual['rendered_sources_checked'])

    def test_refuses_mismatch_missing_sources_wrong_identity_and_raw_json(self):
        for mode in ['mismatch', 'missing-render', 'foreign-thread', 'foreign-message', 'two-texts', 'unfinished', 'duplicate-mongo', 'oversized']:
            with self.subTest(mode=mode):
                event, mongo, text = self.fixture()
                if mode == 'mismatch': event['responseMessage']['content'][0]['text'] += 'different'
                if mode == 'missing-render':
                    event['responseMessage']['content'][0]['text'] = '{"ok":true,"result":"Controlled synthesis."}'
                    mongo['content'] = copy.deepcopy(event['responseMessage']['content'])
                if mode == 'foreign-thread': event['responseMessage']['conversationId'] = 'foreign'
                if mode == 'foreign-message': event['responseMessage']['messageId'] = 'foreign'
                if mode == 'two-texts':
                    event['responseMessage']['content'].append({'type': 'text', 'text': 'extra'})
                    mongo['content'] = copy.deepcopy(event['responseMessage']['content'])
                if mode == 'unfinished': mongo['complete'] = False
                if mode == 'duplicate-mongo': mongo['count'] = 2
                if mode == 'oversized':
                    event['responseMessage']['content'].append({'type': 'tool_call', 'data': 'x' * 65536})
                    mongo['content'] = copy.deepcopy(event['responseMessage']['content'])
                with self.assertRaisesRegex(RuntimeError, 'HOST_RESEARCH_PUBLICATION_EVIDENCE'):
                    MODULE.validate_publication(event, mongo, 'thread', 'answer', text)


if __name__ == '__main__':
    unittest.main()
