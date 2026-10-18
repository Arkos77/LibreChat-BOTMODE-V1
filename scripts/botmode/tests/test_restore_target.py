"""Fail-closed data safety tests: all Docker commands are intercepted."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
RESTORE = ROOT / 'scripts/botmode/restore.sh'
BACKUP = ROOT / 'scripts/botmode/backup.sh'


def fake_docker_env(sandbox, *, mongo_on=True, dump_fail=False, dump_empty=False):
    bin_dir = sandbox / 'bin'
    bin_dir.mkdir()
    script = bin_dir / 'docker'
    script.write_text(
        '#!/bin/sh\n'
        'printf "PWD=%s ARGS=%s\\n" "$PWD" "$*" >> "$FAKE_DOCKER_LOG"\n'
        'case "$*" in\n'
        ' *" ps --status running --services")\n'
        '   [ "$FAKE_MONGO_ON" = "1" ] && echo mongodb\n'
        '   ;;\n'
        ' *" mongodump --db LibreChat --archive")\n'
        '   [ "$FAKE_DUMP_EMPTY" = "1" ] || printf "FAKE-DATABASE-ARCHIVE"\n'
        '   [ "$FAKE_DUMP_FAIL" = "1" ] && exit 6\n'
        '   ;;\n'
        'esac\n'
        'exit 0\n'
    )
    script.chmod(0o755)
    log = sandbox / 'docker-invocations.txt'
    env = {
        **os.environ,
        'PATH': str(bin_dir) + os.pathsep + os.environ.get('PATH', ''),
        'FAKE_DOCKER_LOG': str(log),
        'FAKE_MONGO_ON': '1' if mongo_on else '0',
        'FAKE_DUMP_FAIL': '1' if dump_fail else '0',
        'FAKE_DUMP_EMPTY': '1' if dump_empty else '0',
    }
    env.pop('BOTMODE_CONFIRM_RESTORE', None)
    return env, log


class RestoreTargetTests(unittest.TestCase):
    def invoke(self, approve, archive_kind='relative', corrupt_checksum=False, empty_archive=False):
        with tempfile.TemporaryDirectory(prefix='botmode-restore-preflight-') as temp:
            sandbox = Path(temp)
            archive = sandbox / 'backup' / 'mongodb-LibreChat.archive'
            archive.parent.mkdir()
            payload = b'' if empty_archive else b'TEST ARCHIVE ONLY. NEVER A REAL DATABASE.'
            archive.write_bytes(payload)
            if corrupt_checksum:
                checksum = '0' * 64
            else:
                checksum = hashlib.sha256(payload).hexdigest()
            (archive.parent / 'mongodb-LibreChat.archive.sha256').write_text(
                checksum + '  mongodb-LibreChat.archive\n'
            )
            env, log = fake_docker_env(sandbox)
            if approve:
                env['BOTMODE_CONFIRM_RESTORE'] = 'YES'
            archive_arg = str(archive) if archive_kind == 'absolute' else 'backup/mongodb-LibreChat.archive'
            result = subprocess.run(
                ['bash', str(RESTORE), archive_arg],
                cwd=sandbox, env=env, capture_output=True, text=True, check=False,
            )
            calls = log.read_text().splitlines() if log.exists() else []
            return result, calls

    def test_caller_directory_does_not_change_compose_target(self):
        result, calls = self.invoke(approve=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('BOTMODE_RESTORE=PASS', result.stdout)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(f'PWD={ROOT} ARGS=compose -f docker-compose.botmode.yml' in c for c in calls))
        self.assertIn(' mongorestore --db LibreChat --archive --drop', calls[-1])

    def test_absolute_archive_still_targets_repository(self):
        result, calls = self.invoke(approve=True, archive_kind='absolute')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(f'PWD={ROOT} ' in c for c in calls))

    def test_refuses_destructive_restore_without_explicit_approval(self):
        result, calls = self.invoke(approve=False)
        self.assertEqual(result.returncode, 3)
        self.assertIn('BOTMODE_CONFIRM_RESTORE=YES', result.stderr)
        self.assertEqual(len(calls), 1)

    def test_corrupted_archive_never_reaches_docker(self):
        result, calls = self.invoke(approve=True, corrupt_checksum=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('checksum mismatch', result.stderr)
        self.assertEqual(calls, [])

    def test_empty_archive_never_reaches_docker(self):
        result, calls = self.invoke(approve=True, empty_archive=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('missing or empty archive', result.stderr)
        self.assertEqual(calls, [])


class BackupTargetTests(unittest.TestCase):
    def invoke(self, *, mongo_on, dump_fail=False, dump_empty=False, prior_archive=None, prior_skipped=False):
        with tempfile.TemporaryDirectory(prefix='botmode-backup-preflight-') as temp:
            sandbox = Path(temp)
            env, log = fake_docker_env(
                sandbox, mongo_on=mongo_on, dump_fail=dump_fail, dump_empty=dump_empty
            )
            target = sandbox / 'my-backups' / 'first'
            target.mkdir(parents=True)
            if prior_archive is not None:
                (target / 'mongodb-LibreChat.archive').write_bytes(prior_archive)
            if prior_skipped:
                (target / 'mongodb.SKIPPED').write_text('previous incomplete attempt')
            result = subprocess.run(
                ['bash', str(BACKUP), 'my-backups/first'],
                cwd=sandbox, env=env, capture_output=True, text=True, check=False,
            )
            calls = log.read_text().splitlines() if log.exists() else []
            return {
                'result': result,
                'calls': calls,
                'archive': (target / 'mongodb-LibreChat.archive').read_bytes()
                if (target / 'mongodb-LibreChat.archive').exists() else None,
                'checksum': (target / 'mongodb-LibreChat.archive.sha256').read_text()
                if (target / 'mongodb-LibreChat.archive.sha256').exists() else None,
                'metadata': (target / 'git-head.txt').is_file(),
                'marker': (target / 'mongodb.SKIPPED').is_file(),
                'part_files': list(target.glob('*.partial.*')) +
                              list(target.glob('.*.partial.*')),
                'target': target,
            }

    def test_relative_destination_stays_with_caller_and_uses_repo_compose(self):
        r = self.invoke(mongo_on=False)
        self.assertEqual(r['result'].returncode, 3)
        self.assertIn('BOTMODE_BACKUP_DB=UNAVAILABLE', r['result'].stderr)
        self.assertNotIn('BOTMODE_BACKUP=', r['result'].stdout)
        self.assertTrue(r['metadata'])
        self.assertTrue(r['marker'])
        self.assertIsNone(r['archive'])
        self.assertFalse((ROOT / 'my-backups' / 'first').exists())
        self.assertEqual(len(r['calls']), 1)
        self.assertIn(f'PWD={ROOT} ARGS=compose -f docker-compose.botmode.yml ps', r['calls'][0])

    def test_successful_dump_is_atomically_published_with_checksum(self):
        r = self.invoke(mongo_on=True, prior_skipped=True)
        self.assertEqual(r['result'].returncode, 0, r['result'].stderr)
        self.assertFalse(r['marker'])
        self.assertIn('BOTMODE_BACKUP_DB=COMPLETE', r['result'].stdout)
        self.assertIn('BOTMODE_BACKUP=' + str(r['target']), r['result'].stdout)
        self.assertEqual(r['archive'], b'FAKE-DATABASE-ARCHIVE')
        self.assertIn(hashlib.sha256(r['archive']).hexdigest(), r['checksum'])
        self.assertEqual(len(r['calls']), 2)
        self.assertTrue(all(f'PWD={ROOT} ' in c for c in r['calls']))
        self.assertEqual(r['part_files'], [])

    def test_interrupted_dump_never_leaves_a_restore_ready_archive(self):
        r = self.invoke(mongo_on=True, dump_fail=True)
        self.assertEqual(r['result'].returncode, 4)
        self.assertIn('BOTMODE_BACKUP_DB=DUMP_FAILED', r['result'].stderr)
        self.assertIsNone(r['archive'])
        self.assertEqual(r['part_files'], [])

    def test_zero_byte_dump_is_refused(self):
        r = self.invoke(mongo_on=True, dump_empty=True)
        self.assertEqual(r['result'].returncode, 4)
        self.assertIn('BOTMODE_BACKUP_DB=EMPTY_ARCHIVE', r['result'].stderr)
        self.assertIsNone(r['archive'])
        self.assertEqual(r['part_files'], [])

    def test_existing_archive_is_not_overwritten(self):
        r = self.invoke(mongo_on=True, prior_archive=b'PREVIOUS-COMPLETE-BACKUP')
        self.assertEqual(r['result'].returncode, 2)
        self.assertIn('BOTMODE_BACKUP_REFUSED=ARCHIVE_EXISTS', r['result'].stderr)
        self.assertEqual(r['archive'], b'PREVIOUS-COMPLETE-BACKUP')
        self.assertEqual(r['calls'], [])


if __name__ == '__main__':
    unittest.main()
