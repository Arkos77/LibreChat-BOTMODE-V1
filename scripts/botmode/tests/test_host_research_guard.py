import importlib.util
import copy
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('host_research', Path(__file__).resolve().parents[1] / 'ci-host-research.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HostResearchConfigTests(unittest.TestCase):
    def source(self):
        return json.loads((MODULE.ROOT / 'librechat.yaml').read_text())

    def test_keeps_only_the_saved_synthetic_provider_without_mutating_source(self):
        source = self.source()
        original = copy.deepcopy(source)
        config = MODULE.build_config(source)
        self.assertEqual(source, original)
        self.assertEqual([e['name'] for e in config['endpoints']['custom']], ['OpenRouter'])
        endpoint = config['endpoints']['custom'][0]
        self.assertEqual(endpoint['baseURL'], 'http://fixture:8088/v1')
        self.assertEqual(endpoint['models'], {'fetch': False, 'default': ['openrouter/free']})
        self.assertEqual(config['webSearch']['allowedAddresses'], ['fixture:8088'])

    def test_missing_saved_provider_is_refused(self):
        source = self.source()
        source['endpoints']['custom'] = []
        with self.assertRaisesRegex(RuntimeError, 'SAVED_PROVIDER_MISSING'):
            MODULE.build_config(source)

    def test_duplicate_saved_provider_is_refused(self):
        source = self.source()
        endpoint = next(e for e in source['endpoints']['custom'] if e['name'] == 'OpenRouter')
        source['endpoints']['custom'].append(copy.deepcopy(endpoint))
        with self.assertRaisesRegex(RuntimeError, 'SAVED_PROVIDER_AMBIGUOUS'):
            MODULE.build_config(source)


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

    def test_schema_refusal_stops_before_any_docker_command(self):
        sha, env = self.target()
        failure = subprocess.CalledProcessError(1, ['node', 'schema-validator'])
        with patch.dict(MODULE.os.environ, env), patch.object(
            MODULE, 'run', side_effect=[sha, failure]
        ) as runner:
            with self.assertRaises(subprocess.CalledProcessError):
                MODULE.main()
        commands = [call.args[0] for call in runner.call_args_list]
        self.assertEqual([command[0] for command in commands], ['git', 'node'])
        self.assertTrue(commands[1][1].endswith('/validate-host-research-config.cjs'))


if __name__ == '__main__':
    unittest.main()
