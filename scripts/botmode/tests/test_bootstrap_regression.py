#!/usr/bin/env python3
"""Regression checks for the real BOTMODE bootstrap without starting Docker."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "bootstrap.sh"


class BootstrapRegression(unittest.TestCase):
    def run_bootstrap(self, *, root_mode=False, image=None, check_only=False,
                      existing_env=None, shell_image=None, restart=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts" / "botmode").mkdir(parents=True)
            (root / "scripts" / "botmode" / "bootstrap.sh").write_bytes(SCRIPT.read_bytes())
            (root / ".env.example").write_text("BOTMODE_MONGO_PASSWORD=existing-mongo\nPOSTGRES_PASSWORD=existing-pg\n")
            if existing_env is not None:
                (root / ".env").write_text(existing_env)
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
            if shell_image is not None:
                env["BOTMODE_IMAGE"] = shell_image
            args = ["bash", str(root / "scripts" / "botmode" / "bootstrap.sh"),
                    "--lite", "--no-start", "--no-pull"]
            if check_only:
                args.append("--check-only")
            if image:
                args += ["--image", image]
            done = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
            if restart and done.returncode == 0:
                # Simulate a routine start on the SAME installation, without
                # the original --image or shell override.
                before = (root / ".env").read_bytes()
                restart_env = dict(env)
                restart_env.pop("BOTMODE_IMAGE", None)
                restart_args = ["bash", str(root / "scripts" / "botmode" / "bootstrap.sh"),
                                "--lite", "--no-start", "--no-pull"]
                done = subprocess.run(restart_args, cwd=root, env=restart_env,
                                      capture_output=True, text=True, timeout=30)
                after = (root / ".env").read_bytes()
                if done.returncode == 0:
                    self.assertEqual(before, after, "restart must preserve the complete dotenv")
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

    def test_check_only_does_not_create_missing_env(self):
        done, dotenv, chown = self.run_bootstrap(root_mode=True, check_only=True)
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("BOTMODE_ENV_MISSING", done.stderr)
        self.assertEqual(dotenv, "")
        self.assertFalse(chown)

    def test_check_only_preserves_existing_env(self):
        original = ("BOTMODE_MONGO_PASSWORD=existing-mongo\n"
                    "POSTGRES_PASSWORD=existing-pg\n"
                    "BOTMODE_IMAGE=ghcr.io/test/image@sha256:deadbeef\n")
        done, dotenv, chown = self.run_bootstrap(root_mode=True, check_only=True,
                                                 existing_env=original)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(dotenv, original)
        self.assertFalse(chown)

    def test_installed_digest_survives_routine_restart(self):
        digest = "ghcr.io/arkos77/librechat-botmode-v1@sha256:" + "a" * 64
        done, dotenv, _ = self.run_bootstrap(root_mode=True, image=digest, restart=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("BOTMODE_IMAGE=" + digest + "\n", dotenv)
        self.assertEqual(dotenv.count("BOTMODE_IMAGE="), 1)

    def test_existing_digest_is_reused_without_explicit_image(self):
        digest = "ghcr.io/arkos77/librechat-botmode-v1@sha256:" + "b" * 64
        original = ("BOTMODE_MONGO_PASSWORD=existing-mongo\n"
                    "POSTGRES_PASSWORD=existing-pg\n"
                    "BOTMODE_IMAGE=" + digest + "\n")
        done, dotenv, _ = self.run_bootstrap(root_mode=True, existing_env=original)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(dotenv, original)

    def test_explicit_image_overrides_previous_digest(self):
        saved = "ghcr.io/test/saved@sha256:" + "c" * 64
        selected = "ghcr.io/test/approved@sha256:" + "d" * 64
        original = ("BOTMODE_MONGO_PASSWORD=existing-mongo\n"
                    "POSTGRES_PASSWORD=existing-pg\n"
                    "BOTMODE_IMAGE=" + saved + "\n")
        done, dotenv, _ = self.run_bootstrap(root_mode=True, existing_env=original,
                                             image=selected)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("BOTMODE_IMAGE=" + selected + "\n", dotenv)
        self.assertNotIn(saved, dotenv)

    def test_shell_override_overrides_existing_digest(self):
        original = ("BOTMODE_MONGO_PASSWORD=existing-mongo\n"
                    "POSTGRES_PASSWORD=existing-pg\n"
                    "BOTMODE_IMAGE=ghcr.io/test/saved:old\n")
        done, dotenv, _ = self.run_bootstrap(root_mode=True, existing_env=original,
                                             shell_image="ghcr.io/test/new:approved")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("BOTMODE_IMAGE=ghcr.io/test/new:approved\n", dotenv)


if __name__ == "__main__":
    unittest.main()
