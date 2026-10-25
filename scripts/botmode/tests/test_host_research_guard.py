import importlib.util
import copy
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

SPEC = importlib.util.spec_from_file_location('host_research', Path(__file__).resolve().parents[1] / 'ci-host-research.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HostResearchReadinessTests(unittest.TestCase):
    def test_api_uses_the_isolated_project_address(self):
        project = 'botmode-research-123-1'
        networks = {project + '_default': {'IPAddress': '172.20.0.4'}}
        self.assertEqual(MODULE.api_base_from_networks(networks, project), 'http://172.20.0.4:3080')

    def test_foreign_or_additional_network_is_refused(self):
        project = 'botmode-research-123-1'
        for networks in ({'production_default': {'IPAddress': '172.20.0.4'}},
                         {project + '_default': {'IPAddress': '172.20.0.4'}, 'bridge': {}}):
            with self.assertRaisesRegex(RuntimeError, 'ISOLATED_API_NETWORK_REQUIRED'):
                MODULE.api_base_from_networks(networks, project)

    def test_invalid_or_external_addresses_are_refused(self):
        project = 'botmode-research-123-1'
        for address in ('', '127.0.0.1', '0.0.0.0', '169.254.1.1', '8.8.8.8', 'example.com', '::1'):
            with self.assertRaisesRegex(RuntimeError, 'PRIVATE_API_ADDRESS_REQUIRED'):
                MODULE.api_base_from_networks({project + '_default': {'IPAddress': address}}, project)

    def test_http_statuses_survive_until_success(self):
        observations = {}
        request = unittest.mock.Mock(side_effect=[(503, 'not ready'), (200, '{}')])
        with patch.object(MODULE.time, 'sleep'):
            MODULE.wait_for_api(request, observations)
        self.assertEqual(observations['attempts'], 2)
        self.assertEqual([x['status'] for x in observations['recent']], [503, 200])
        self.assertNotIn('body', observations['recent'][0])
        self.assertEqual([call.args[0] for call in request.call_args_list], ['/readyz', '/readyz'])

    def test_transport_error_records_type_and_errno_without_private_text(self):
        observations = {}
        error = URLError(ConnectionRefusedError(111, 'private text must not be archived'))
        request = unittest.mock.Mock(side_effect=[error, (200, '{}')])
        with patch.object(MODULE.time, 'sleep'):
            MODULE.wait_for_api(request, observations)
        sample = observations['recent'][0]
        self.assertEqual(sample['error_type'], 'ConnectionRefusedError')
        self.assertEqual(sample['errno'], 111)
        self.assertNotIn('private', json.dumps(observations))

    def test_timeout_preserves_observation_and_does_not_admit_a_mission(self):
        observations = {}
        request = unittest.mock.Mock(return_value=(403, 'private body'))
        with patch.object(MODULE.time, 'monotonic', side_effect=[0, 181]):
            with self.assertRaisesRegex(RuntimeError, 'HOST_RESEARCH_API_NOT_READY'):
                MODULE.wait_for_api(request, observations)
        self.assertEqual(observations['recent'][0]['status'], 403)
        request.assert_called_once_with('/readyz', authenticated=False, timeout=3)


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
        self.assertEqual(config['webSearch']['searxngInstanceUrl'], '${BOTMODE_CI_WEB_URL}')
        self.assertEqual(config['webSearch']['firecrawlApiUrl'], '${BOTMODE_CI_WEB_URL}')
        self.assertEqual(config['webSearch']['searxngApiKey'], '${BOTMODE_CI_WEB_KEY}')
        self.assertEqual(config['webSearch']['firecrawlApiKey'], '${BOTMODE_CI_WEB_KEY}')
        self.assertEqual(MODULE.FIXTURE_WEB_ENV, {
            'BOTMODE_CI_WEB_URL': 'http://fixture:8088', 'BOTMODE_CI_WEB_KEY': 'ci-fixture'})

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

    def test_real_mode_requires_explicit_flag_and_key(self):
        self.assertFalse(MODULE.real_provider_mode({}))
        self.assertFalse(MODULE.real_provider_mode({'CI_REAL_OPENROUTER_KEY': 'fake-key-not-authorization'}))
        for env in ({'CI_REAL_FREE_PROVIDER': 'yes'}, {'CI_REAL_FREE_PROVIDER': 'true'}):
            with self.assertRaises(RuntimeError): MODULE.real_provider_mode(env)
        self.assertTrue(MODULE.real_provider_mode({
            'CI_REAL_FREE_PROVIDER': 'true', 'CI_REAL_OPENROUTER_KEY': 'fake-key-long-enough-for-ci'}))

    def test_only_the_relay_has_egress_and_receives_the_secret(self):
        override = MODULE.compose_override(True)
        self.assertEqual(override['networks']['default'], {'internal': True})
        self.assertEqual(override['networks']['provider_egress'], {'internal': False})
        fixture = override['services']['fixture']
        self.assertEqual(fixture['networks'], ['default', 'provider_egress'])
        self.assertNotIn('ports', fixture)
        self.assertIn('CI_OPENROUTER_KEY', fixture['environment'])
        for name in ('api', 'redis'):
            service = override['services'][name]
            self.assertNotIn('networks', service)
            self.assertNotIn('CI_OPENROUTER_KEY', service.get('environment', {}))
        synthetic = MODULE.compose_override(False)
        self.assertNotIn('provider_egress', synthetic['networks'])
        self.assertNotIn('CI_OPENROUTER_KEY', synthetic['services']['fixture']['environment'])

    def test_real_binding_keeps_native_provider_and_fixed_profile(self):
        source = self.source()
        original = copy.deepcopy(source)
        config = MODULE.build_config(source, real=True)
        self.assertEqual(source, original)
        endpoint = config['endpoints']['custom'][0]
        self.assertEqual(endpoint['name'], 'OpenRouter')
        self.assertEqual(endpoint['baseURL'], 'http://fixture:8088/v1')
        self.assertEqual(endpoint['apiKey'], 'ci-local-fixture-no-real-key')
        self.assertEqual(endpoint['models']['default'], ['nvidia/nemotron-3.5-super-vl:free'])
        self.assertEqual(endpoint['addParams']['maxRetries'], 0)
        self.assertEqual(endpoint['addParams']['maxTokens'], 2048)
        self.assertEqual(endpoint['addParams']['reasoning'], {'enabled': False})
        self.assertEqual(MODULE.setup_binding(True), {
            'provider': 'OpenRouter', 'model': 'nvidia/nemotron-3.5-super-vl:free'})
        self.assertEqual(MODULE.setup_binding(False), {'provider': 'OpenRouter', 'model': 'openrouter/free'})

    def test_saved_binding_mismatch_stops_before_mission(self):
        agents = [{'name': 'RECHERCHE', **MODULE.setup_binding(True)}]
        MODULE.validate_agent_bindings(agents, real=True)
        for change in ({'provider': 'other'}, {'model': 'openrouter/free'}, {'model': 'paid/model'}):
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, 'SAVED_BINDING_MISMATCH'):
                MODULE.validate_agent_bindings([{**agents[0], **change}], real=True)

    def test_actual_provider_evidence_requires_fixed_profile_zero_cost_and_bounded_usage(self):
        model = 'nvidia/nemotron-3.5-super-vl:free'
        record = {'http_status': 200, 'models': [model], 'usage': {'cost': 0, 'completion_tokens': 40},
                  'request_parameters': {'model': model, 'reasoning_enabled': False}}
        evidence = {'records': [copy.deepcopy(record) for _ in range(4)]}
        MODULE.validate_provider_evidence(evidence)
        for cost in (None, '0', False, 0.01, float('nan')):
            broken = copy.deepcopy(evidence)
            broken['records'][0]['usage']['cost'] = cost
            with self.subTest(cost=cost), self.assertRaisesRegex(RuntimeError, 'PROVIDER_PROFILE_MISMATCH'):
                MODULE.validate_provider_evidence(broken)
        for changed in ({'models': ['other:free']}, {'http_status': 429},
                        {'usage': {'cost': 0, 'completion_tokens': 2049}},
                        {'request_parameters': {'model': model, 'reasoning_enabled': True}}):
            broken = copy.deepcopy(evidence)
            broken['records'][0].update(changed)
            with self.subTest(changed=changed), self.assertRaises(RuntimeError):
                MODULE.validate_provider_evidence(broken)
        with self.assertRaises(RuntimeError): MODULE.validate_provider_evidence({'records': []})



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

    def test_reused_image_records_a_separate_exact_harness_identity(self):
        sha, env = self.target()
        env['HARNESS_SHA'] = 'b' * 40
        self.assertEqual(MODULE.validate_target(env, 'b' * 40)[0], sha)
        with self.assertRaisesRegex(RuntimeError, 'EXACT_SOURCE_REQUIRED'):
            MODULE.validate_target(env, 'c' * 40)

    def test_reuse_rejects_any_product_config_or_lock_change(self):
        MODULE.validate_reused_files(['scripts/botmode/ci-host-research.py'])
        for path in ('api/server/index.js', 'librechat.yaml', 'package-lock.json',
                     'Dockerfile', '.env.example', 'docker-compose.botmode.yml'):
            with self.assertRaisesRegex(RuntimeError, 'REUSED_PRODUCT_SOURCE_DRIFT'):
                MODULE.validate_reused_files(['scripts/botmode/ci-host-research.py', path])

    def test_fixed_preflight_files_are_test_only_and_do_not_require_a_new_product_image(self):
        MODULE.validate_reused_files([
            '.github/workflows/botmode-v1-live-provider-preflight.yml',
            'scripts/botmode/ci-fixed-free-preflight.py',
            'scripts/botmode/tests/test_fixed_free_preflight.py',
        ])

    def test_reuse_product_drift_stops_before_schema_or_docker(self):
        sha, env = self.target()
        env['HARNESS_SHA'] = 'b' * 40
        with patch.dict(MODULE.os.environ, env, clear=True), patch.object(
            MODULE, 'run', side_effect=['b' * 40, 'api/server/index.js\n']
        ) as runner:
            with self.assertRaisesRegex(RuntimeError, 'REUSED_PRODUCT_SOURCE_DRIFT'):
                MODULE.main()
        self.assertEqual([call.args[0][0] for call in runner.call_args_list], ['git', 'git'])

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
        with patch.dict(MODULE.os.environ, env, clear=True), patch.object(
            MODULE, 'run', side_effect=[sha, failure]
        ) as runner:
            with self.assertRaises(subprocess.CalledProcessError):
                MODULE.main()
        commands = [call.args[0] for call in runner.call_args_list]
        self.assertEqual([command[0] for command in commands], ['git', 'node'])
        self.assertTrue(commands[1][1].endswith('/validate-host-research-config.cjs'))


if __name__ == '__main__':
    unittest.main()
