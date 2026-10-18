"""Never run real Docker: this test enforces restore.sh project/data boundaries."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
RESTORE = ROOT / 'scripts/botmode/restore.sh'
BACKUP = ROOT / 'scripts/botmode/backup.sh'


class RestoreTargetTests(unittest.TestCase):
    def invoke(self, approve, archive_kind='relative'):
        with tempfile.TemporaryDirectory(prefix='botmode-restore-preflight-') as temp:
            sandbox = Path(temp)
            archive = sandbox / 'backup' / 'mongodb-LibreChat.archive'
            archive.parent.mkdir()
            archive.write_bytes(b'TEST ARCHIVE ONLY. NEVER A REAL DATABASE.')
            fake_bin = sandbox / 'bin'
            fake_bin.mkdir()
            log = sandbox / 'docker-invocations.txt'
            docker = fake_bin / 'docker'
            docker.write_text(
                '#!/bin/sh\n'
                'printf "PWD=%s ARGS=%s\\n" "$PWD" "$*" >> "$FAKE_DOCKER_LOG"\n'
                'case "$*" in *" ps --status running --services") echo mongodb;; esac\n'
                'exit 0\n'
            )
            docker.chmod(0o755)
            env = {
                **os.environ,
                'PATH': f'{fake_bin}{os.pathsep}{os.environ.get("PATH", "")}',
                'FAKE_DOCKER_LOG': str(log),
            }
            env.pop('BOTMODE_CONFIRM_RESTORE', None)
            if approve:
                env['BOTMODE_CONFIRM_RESTORE'] = 'YES'
            archive_arg = str(archive) if archive_kind == 'absolute' else 'backup/mongodb-LibreChat.archive'
            result = subprocess.run(
                ['bash', str(RESTORE), archive_arg],
                cwd=sandbox,
                env=env,
                capture_output=True,
                text=True,
                check=False,
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
        self.assertIn(' ps --status running --services', calls[0])


class BackupTargetTests(unittest.TestCase):
    def test_relative_destination_stays_with_caller_and_uses_repo_compose(self):
        with tempfile.TemporaryDirectory(prefix='botmode-backup-preflight-') as temp:
            sandbox = Path(temp)
            fake_bin = sandbox / 'bin'
            fake_bin.mkdir()
            docker = fake_bin / 'docker'
            log = sandbox / 'docker-invocations.txt'
            docker.write_text(
                '#!/bin/sh\n'
                'printf "PWD=%s ARGS=%s\\n" "$PWD" "$*" >> "$FAKE_DOCKER_LOG"\n'
                'exit 0\n'
            )
            docker.chmod(0o755)
            env = {
                **os.environ,
                'PATH': f'{fake_bin}{os.pathsep}{os.environ.get("PATH", "")}',
                'FAKE_DOCKER_LOG': str(log),
            }
            result = subprocess.run(
                ['bash', str(BACKUP), 'my-backups/first'],
                cwd=sandbox, env=env, capture_output=True, text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            target = sandbox / 'my-backups' / 'first'
            self.assertIn('BOTMODE_BACKUP=' + str(target), result.stdout)
            self.assertTrue((target / 'git-head.txt').is_file())
            self.assertTrue((target / 'mongodb.SKIPPED').is_file())
            self.assertFalse((ROOT / 'my-backups' / 'first').exists())
            calls = log.read_text().splitlines()
            self.assertEqual(len(calls), 1)
            self.assertIn(f'PWD={ROOT} ARGS=compose -f docker-compose.botmode.yml ps', calls[0])


if __name__ == '__main__':
    unittest.main()
