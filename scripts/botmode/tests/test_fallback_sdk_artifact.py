import base64
import hashlib
import importlib.util
import io
import json
import subprocess
import tarfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('sdk_build', ROOT / 'scripts/botmode/build-fallback-context-sdk.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FallbackSDKArtifactTests(unittest.TestCase):
    def test_dependency_and_lock_use_the_exact_local_archive(self):
        archive = ROOT / MODULE.OUTPUT
        data = archive.read_bytes()
        name = archive.name
        package = json.loads((ROOT / 'api/package.json').read_text())
        lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']
        self.assertEqual(package['dependencies']['@librechat/agents'], 'file:../vendor/librechat-agents/' + name)
        self.assertEqual(lock['api']['dependencies']['@librechat/agents'], package['dependencies']['@librechat/agents'])
        entry = lock['node_modules/@librechat/agents']
        self.assertEqual(entry['resolved'], 'file:' + MODULE.OUTPUT)
        self.assertEqual(entry['integrity'], 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode())

    def test_source_both_runtime_formats_and_declarations_are_shipped_together(self):
        with tarfile.open(ROOT / MODULE.OUTPUT) as archive:
            files = {m.name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
        manifest = json.loads(files['package/package.json'])
        self.assertEqual(manifest['version'], '3.7.17')
        self.assertEqual(manifest['botmodePatch']['baseSha256'], MODULE.BASE_SHA)
        self.assertEqual(manifest['botmodePatch']['id'], 'fallback-context-cold-child-v2')
        for module in ['graphs/Graph', 'llm/invoke']:
            self.assertIn(b'prepareTools', files['package/src/' + module + '.ts'])
            self.assertIn(b'prepareModel', files['package/src/' + module + '.ts'])
            for fmt, extension in [('cjs', '.cjs'), ('esm', '.mjs')]:
                name = 'package/dist/' + fmt + '/' + module + extension
                self.assertIn(b'prepareTools', files[name])
                self.assertIn(b'prepareModel', files[name])
                self.assertNotIn(b'sourceMappingURL', files[name])
                self.assertNotIn(name + '.map', files)
        self.assertIn(b'clientOptions?: t.ClientOptions', files['package/dist/types/llm/invoke.d.ts'])
        for name in ['package/src/tools/subagent/SubagentExecutor.ts',
                     'package/dist/cjs/tools/subagent/SubagentExecutor.cjs',
                     'package/dist/esm/tools/subagent/SubagentExecutor.mjs']:
            self.assertIn(b'nativeMissionColdChild', files[name])
            self.assertIn(b'__librechat_mission_sync', files[name])
            self.assertIn(b'__librechat_checkpoint_ns', files[name])
            self.assertIn(b'durability:', files[name])
            if '/dist/' in name:
                self.assertNotIn(b'sourceMappingURL', files[name])
                self.assertNotIn(name + '.map', files)

    def test_regeneration_matches_the_committed_archive_without_unrelated_byte_changes(self):
        try:
            base = subprocess.check_output(['git', 'show', '4bbd799:' + MODULE.BASE], cwd=ROOT, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            self.skipTest('Exact historical base not present; fetch history or pass --base to generator')
        expected = (ROOT / MODULE.OUTPUT).read_bytes()
        self.assertEqual(MODULE.build(base), expected)
        self.assertEqual(MODULE.build(base), expected)
        with tarfile.open(fileobj=io.BytesIO(base), mode='r:gz') as archive:
            before = {m.name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
        with tarfile.open(fileobj=io.BytesIO(expected), mode='r:gz') as archive:
            after = {m.name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
        allowed = {'package/package.json', 'package/src/graphs/Graph.ts', 'package/src/llm/invoke.ts', 'package/dist/types/llm/invoke.d.ts'}
        allowed.add('package/src/tools/subagent/SubagentExecutor.ts')
        for fmt, extension in [('cjs', '.cjs'), ('esm', '.mjs')]:
            for module in ['graphs/Graph', 'llm/invoke', 'tools/subagent/SubagentExecutor']:
                allowed.update({'package/dist/' + fmt + '/' + module + extension, 'package/dist/' + fmt + '/' + module + extension + '.map'})
        changed = {name for name in before.keys() | after.keys() if before.get(name) != after.get(name)}
        self.assertEqual(changed, allowed)

    def test_unknown_base_is_rejected_before_any_patch(self):
        with self.assertRaisesRegex(RuntimeError, 'SDK_BASE_SHA_MISMATCH'):
            MODULE.build(b'not the pinned SDK')


if __name__ == '__main__':
    unittest.main()
