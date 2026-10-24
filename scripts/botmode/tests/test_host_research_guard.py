import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('host_research', Path(__file__).resolve().parents[1] / 'ci-host-research.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HostResearchTargetTests(unittest.TestCase):
    def target(self):
        sha = 'a' * 40
        return sha, {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted',
                     'CANDIDATE_SHA': sha, 'CANDIDATE_IMAGE': 'botmode-native-research:' + sha,
                     'HOST_RESEARCH_PROJECT': 'botmode-research-123-1'}

    def test_accepts_only_exact_local_candidate_in_isolated_hosted_project(self):
        sha, env = self.target()
        self.assertEqual(MODULE.validate_target(env, sha),
                         (sha, env['CANDIDATE_IMAGE'], 'botmode-research-123-1'))

    def test_refuses_local_computer(self):
        sha, env = self.target()
        env.pop('GITHUB_ACTIONS')
        with self.assertRaisesRegex(RuntimeError, 'HOSTED_RUNNER_REQUIRED'):
            MODULE.validate_target(env, sha)

    def test_refuses_self_hosted_runner(self):
        sha, env = self.target()
        env['RUNNER_ENVIRONMENT'] = 'self-hosted'
        with self.assertRaisesRegex(RuntimeError, 'HOSTED_RUNNER_REQUIRED'):
            MODULE.validate_target(env, sha)

    def test_refuses_source_drift(self):
        sha, env = self.target()
        with self.assertRaisesRegex(RuntimeError, 'EXACT_SOURCE_REQUIRED'):
            MODULE.validate_target(env, 'b' * 40)

    def test_refuses_registry_or_floating_image(self):
        sha, env = self.target()
        for image in ['ghcr.io/arkos77/librechat-botmode-v1:latest', 'botmode-native-research:latest']:
            env['CANDIDATE_IMAGE'] = image
            with self.assertRaisesRegex(RuntimeError, 'LOCAL_IMAGE_REQUIRED'):
                MODULE.validate_target(env, sha)

    def test_refuses_production_or_ambiguous_project(self):
        sha, env = self.target()
        for project in ['librechat-botmode', 'botmode-v100-test', '', 'botmode-research-../1']:
            env['HOST_RESEARCH_PROJECT'] = project
            with self.assertRaisesRegex(RuntimeError, 'ISOLATED_PROJECT_REQUIRED'):
                MODULE.validate_target(env, sha)


if __name__ == '__main__':
    unittest.main()
