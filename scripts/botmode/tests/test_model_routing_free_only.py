"""Free-only host configuration regression: reject unsupported/potentially paid fallbacks."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class FreeOnlyNativeAgentRouteTests(unittest.TestCase):
    def test_lite_routes_use_only_explicit_free_models_with_no_host_fallback(self):
        config = json.loads((ROOT / 'librechat.yaml').read_text(encoding='utf-8'))
        agents = config['endpoints']['agents']
        self.assertNotIn('hostModelRouting', agents)
        self.assertIn('subagents', agents.get('capabilities', []))

        openrouter = [
            endpoint for endpoint in config['endpoints']['custom']
            if endpoint.get('name') == 'OpenRouter'
        ]
        self.assertEqual(len(openrouter), 1)
        route = openrouter[0]
        self.assertEqual(route['baseURL'].rstrip('/'), 'https://openrouter.ai/api/v1')
        models = route['models']['default']
        self.assertTrue(models)
        self.assertEqual(len(models), len(set(models)))
        for model in models:
            with self.subTest(model=model):
                self.assertTrue(model.endswith(':free'), model)
                self.assertNotEqual(model, 'openrouter/free')


if __name__ == '__main__':
    unittest.main()
