"""Minimal BOT MODE V1 configuration contract: no implicit paid/model router."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODEL = 'nvidia/nemotron-3.5-super-vl:free'


class LiteFreeConfigTest(unittest.TestCase):
    def test_native_lite_pins_only_explicit_free_models_without_host_router(self):
        config = json.loads((ROOT / 'librechat.yaml').read_text(encoding='utf-8'))
        agents = config['endpoints']['agents']
        self.assertNotIn('hostModelRouting', agents)
        self.assertIn('subagents', agents.get('capabilities', []))
        routes = [x for x in config['endpoints']['custom'] if x.get('name') == 'OpenRouter']
        self.assertEqual(len(routes), 1)
        self.assertTrue(routes[0].get('apiKey'))
        choices = routes[0]['models']['default']
        self.assertEqual(choices[0], MODEL)
        self.assertEqual(len(choices), len(set(choices)))
        self.assertTrue(all(x.endswith(':free') for x in choices))
        self.assertNotIn('openrouter/free', choices)


if __name__ == '__main__':
    unittest.main()
