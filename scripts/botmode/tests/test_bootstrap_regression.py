#!/usr/bin/env python3
"""Regression checks for the real BOTMODE bootstrap without starting Docker."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "bootstrap.sh"


class BootstrapRegression(unittest.TestCase):
    def run_bootstrap(self, *, root_mode=False, image=None, check_only=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts" / "botmode").mkdir(parents=True)
            (root / "scripts" / "botmode" / "bootstrap.sh").write_bytes(SCRIPT.read_bytes())
            (root / ".env.example").write_text("BOTMODE_MONGO_PASSWORD=existing-mongo\nPOSTGRES_PASSWORD=existing-pg\n")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            (bin_dir / "git").write_text("#!/bin/sh\necho abcdef123456\n")
            (bin_dir / "docker").write_text(
                "#!/bin/sh\n"
                "case \"$1 $2\" in\n"
                "  'volume inspect') exit 1;;\n"
                "esac\n"
                "exit 0\n"
            )
            (bin_dir / "id").write_text("#!/bin/sh\nif [ \"$1\" = -u ]; then echo " + ("0" if root_mode else "12345") + "; else /usr/bin/id \"$@\"; fi\n")
            (bin_dir / "chown").write_text("#!/bin/sh\necho \"$@\" >> \"$BOTMODE_TEST_CHOWN\"\n")
            for p in bin_dir.iterdir():
                p.chmod(0o755)
            env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                       BOTMODE_TEST_CHOWN=str(root / "chown.log"))
            env.pop("BOTMODE_IMAGE", None)
            args = ["bash", str(root / "scripts" / "botmode" / "bootstrap.sh"),
                    "--lite", "--no-start", "--no-pull"]
            if check_only:
                args.append("--check-only")
            if image:
                args += ["--image", image]
            done = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
            dotenv = (root / ".env").read_text() if (root / ".env").exists() else ""
            chown = (root / "chown.log").read_text() if (root / "chown.log").exists() else ""
            return done, dotenv, chown

    def test_root_install_pins_image_and_preserves_database_passwords(self):
        done, dotenv, chown = self.run_bootstrap(root_mode=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("BOTMODE_IMAGE=ghcr.io/arkos77/librechat-botmode-v1:sha-abcdef123456", dotenv)
        self.assertIn("BOTMODE_MONGO_PASSWORD=existing-mongo", dotenv)
        self.assertIn("POSTGRES_PASSWORD=existing-pg", dotenv)
        self.assertIn("1000:1000 .env", chown)

    def test_explicit_image_is_persisted(self):
        done, dotenv, _ = self.run_bootstrap(root_mode=True, image="example.invalid/botmode:test")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("BOTMODE_IMAGE=example.invalid/botmode:test", dotenv)

    def test_incompatible_unprivileged_owner_fails_safely(self):
        done, _, chown = self.run_bootstrap(root_mode=False)
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("cannot read this private .env", done.stderr)
        self.assertFalse(chown)

    def test_check_only_does_not_change_env(self):
        done, dotenv, chown = self.run_bootstrap(root_mode=True, check_only=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertNotIn("BOTMODE_IMAGE=", dotenv)
        self.assertFalse(chown)


if __name__ == "__main__":
    unittest.main()
