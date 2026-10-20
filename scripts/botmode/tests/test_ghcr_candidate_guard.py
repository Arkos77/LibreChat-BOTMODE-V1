import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'guard-candidate-ghcr.sh'
SHA = 'a' * 40
TAG = f'candidate-botmode-v1-{SHA[:12]}'


class CandidateTagGuardTests(unittest.TestCase):
    def invoke(self, **changes):
        with tempfile.TemporaryDirectory(prefix='botmode-tag-guard-') as temp:
            stub_bin = Path(temp) / 'bin'
            stub_bin.mkdir()
            gh_stub = stub_bin / 'gh'
            gh_stub.write_text(
                '#!/bin/sh\n'
                '[ "${FAKE_GH_FAIL:-0}" = 1 ] && exit 6\n'
                'printf "%s\\n" "${FAKE_GH_TAGS:-}"\n'
            )
            gh_stub.chmod(0o755)
            env = {
                **os.environ,
                'PATH': str(stub_bin) + os.pathsep + os.environ.get('PATH', ''),
                'GITHUB_SHA': SHA,
                'GITHUB_REF_TYPE': 'branch',
                'GITHUB_REPOSITORY_OWNER': 'Arkos77',
                'CANDIDATE_TAG': TAG,
                'FAKE_GH_TAGS': '',
                'FAKE_GH_FAIL': '0',
                'RUNNER_TEMP': temp,
                **changes,
            }
            return subprocess.run(
                ['bash', str(SCRIPT)],
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

    def test_unused_exact_sha_tag_passes_without_publication(self):
        result = self.invoke(FAKE_GH_TAGS='sha-0123456789ab')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('BOTMODE_GHCR_TAG_PREPUBLICATION_GUARD=PASS', result.stdout)

    def test_rejects_ambiguous_or_mutable_tag(self):
        for tag in ['edge', 'latest', 'candidate-anything', '', f'candidate-botmode-v1-{"b" * 12}']:
            with self.subTest(tag=tag):
                self.assertNotEqual(self.invoke(CANDIDATE_TAG=tag).returncode, 0)

    def test_rejects_existing_primary_or_sha_alias(self):
        for tag in [TAG, f'sha-{SHA[:12]}']:
            with self.subTest(tag=tag):
                result = self.invoke(FAKE_GH_TAGS=tag)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('IMMUTABLE_TAG_ALREADY_PRESENT', result.stderr)

    def test_fails_closed_on_registry_unavailable(self):
        result = self.invoke(FAKE_GH_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('CANNOT_VERIFY_EXISTING_TAGS', result.stderr)

    def test_refuses_tag_dispatch_and_invalid_sha(self):
        self.assertNotEqual(self.invoke(GITHUB_REF_TYPE='tag').returncode, 0)
        self.assertNotEqual(self.invoke(GITHUB_SHA='not-a-sha').returncode, 0)


if __name__ == '__main__':
    unittest.main()
