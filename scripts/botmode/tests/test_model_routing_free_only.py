"""Free-by-default static contract: no paid/unknown automatic host fallback."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class DefaultHostRoutingPolicyTests(unittest.TestCase):
    def test_all_native_roles_are_free_only_and_bound_only_to_explicit_free_models(self):
        config = json.loads((ROOT / 'librechat.yaml').read_text())
        policies = config['endpoints']['agents']['hostModelRouting']
        self.assertEqual(
            {p['agentName'] for p in policies},
            {'BOT MODE Worker', 'RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'},
        )
        for policy in policies:
            with self.subTest(agent=policy['agentName']):
                self.assertEqual(policy['routingConstraints']['spendingPolicy'], 'free_only')
                bindings = policy['bindings']
                self.assertGreaterEqual(len(bindings), 2)
                self.assertLessEqual(len(bindings), 4)
                self.assertIn(policy['preferredBindingId'], {b['id'] for b in bindings})
                for binding in bindings:
                    self.assertEqual(binding['provider'], 'OpenRouter')
                    self.assertEqual(binding['signals']['pricingTier'], 'free')
                    self.assertTrue(
                        binding['model'] == 'openrouter/free' or binding['model'].endswith(':free'),
                        binding['model'],
                    )


if __name__ == '__main__':
    unittest.main()
