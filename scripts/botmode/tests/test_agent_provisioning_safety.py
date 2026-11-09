#!/usr/bin/env python3
"""Static safety contracts for the explicit Worker provisioning path."""
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parents[1]

class ProvisioningSafety(unittest.TestCase):
    def test_worker_provisioning_requires_explicit_apply_and_owner(self):
        script = (BASE / 'provision-worker.js').read_text()
        for fragment in ["args.includes('--apply')", "args.includes('--user-id')",
                         "findOne({ _id: author })", "accessRoleId: 'agent_owner'",
                         "resourceType: 'agent'", "$setOnInsert",
                         "Worker belongs to another user", "Worker exists without owner ACL"]:
            self.assertIn(fragment, script)
        self.assertNotIn('deleteMany(', script)
        self.assertNotIn('dropDatabase(', script)

    def test_bootstrap_does_not_implicitly_change_agents(self):
        script = (BASE / 'bootstrap.sh').read_text()
        self.assertNotIn('provision-worker.js', script)
        self.assertNotIn('seed-default-specialists.js', script)

    def test_readonly_inspection_does_not_write(self):
        script = (BASE / 'inspect-agent-bootstrap.js').read_text()
        for operation in ('insertOne(', 'updateOne(', 'deleteMany(', 'drop('):
            self.assertNotIn(operation, script)


    def test_recherche_official_sources_rule_is_documented_and_only_applied_on_explicit_seeding(self):
        seed = (BASE / 'seed-default-specialists.js').read_text()
        guide = (BASE.parents[1] / 'docs' / 'BOT_MODE_INSTALL.md').read_text()
        for phrase in ('EXIGENCE DE SOURCE OFFICIELLE', 'source officielle pertinente', 'ne présente jamais Wikipédia'):
            self.assertIn(phrase, seed)
            self.assertIn(phrase, guide)
        self.assertIn('${officialSourcePolicy}', seed)
        self.assertIn("process.argv.includes('--apply')", seed)
        self.assertIn('Never overwrite an agent', seed)
        self.assertIn('interface native LibreChat', guide)

if __name__ == '__main__':
    unittest.main()
