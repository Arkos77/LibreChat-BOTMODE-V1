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

if __name__ == '__main__':
    unittest.main()
