#!/usr/bin/env python3
"""Read-only provenance for a SOURCE-BUILT CI composition, not for any published OCI.

The published-digest provenance guard is separate and intentionally unchanged.
"""
import os
import subprocess
from pathlib import Path

BASE = "bde77b8eb0999cf8507f36505f6cc2356e752b9d"
HEADS = {
    32: "37469c8b803898a8473cf30157b6ccbd20379b01",
    33: "d7f5075d65032443d61f7afcc989ecd25600184c",
    34: "7f2b6b86a085f147b482b1d0687119baf3ba546e",
    35: "a972d82884960e9edc53b597f2d6c6c4b7d60a4e",
    36: "b7802cbf16b7f1b30811ba4e38b8121ebc38d66d",
    38: "ddc9a2b124429806af29110aa2f3b033d4692413",
    39: "6da38ba1b70655c7a6266c6648f6734bdb8c9c85",
    40: "92ee72f0817f9613e9ba1ceb686c32324900f11c",
}


def git(*args):
    return subprocess.check_output(("git",) + args, text=True).strip()


def fail(label):
    raise SystemExit("CI_COMPOSITION_SOURCE_REFUSED=" + label)


head = git("rev-parse", "HEAD")
if os.environ.get("GITHUB_SHA") and head != os.environ["GITHUB_SHA"]:
    fail("WRONG_CHECKOUT_SHA")
if git("status", "--porcelain"):
    fail("UNCLEAN_CHECKOUT")
for number, sha in [(29, BASE), *HEADS.items()]:
    if subprocess.run(["git", "merge-base", "--is-ancestor", sha, head], check=False).returncode:
        fail("MISSING_PR_" + str(number))
print("CI_COMPOSITION_REQUIRED_PR_ANCESTRY=PASS")

guard_paths = {
    ".github/workflows/botmode-v1-real-oci-idea-projection-e2e.yml",
    "scripts/botmode/ci-release-composition-source-guard.py",
}
allowed = set(guard_paths)
for sha in HEADS.values():
    allowed.update(git("diff", "--name-only", BASE, sha).splitlines())
changed = set(git("diff", "--name-only", BASE, head).splitlines())
if unexpected := (changed - allowed):
    print("CI_COMPOSITION_UNEXPECTED_FILE_COUNT=" + str(len(unexpected)))
    fail("UNAPPROVED_PATHS")
print("CI_COMPOSITION_ONLY_APPROVED_PATHS=PASS")

if git("rev-parse", head + ":package-lock.json") != git(
    "rev-parse", BASE + ":package-lock.json"
):
    fail("NPM_LOCK_CHANGED")
print("CI_COMPOSITION_PRODUCTION_LOCK_UNCHANGED=PASS")

for filepath, source in (
    ("api/server/services/Projects/botModeProjectProjection.js", HEADS[39]),
    ("docker-compose.botmode.yml", HEADS[36]),
):
    if git("rev-parse", head + ":" + filepath) != git("rev-parse", source + ":" + filepath):
        fail("CRITICAL_SOURCE_DRIFT")
print("CI_COMPOSITION_CRITICAL_SOURCE_EXACT=PASS")

oci_guard = Path(".github/workflows/botmode-v1-ghcr-subagent-oracle-probe.yml").read_text()
for marker in (
    "CI_PUBLISHED_OCI_RUNTIME_DRIFT_NOT_ALLOWED",
    "scripts/botmode/tests/test_ci_live_free_sse_resume.py",
    "e2e/specs/mock/ideas-botmode-results.spec.ts",
    "docs/BOTMODE_V1_RELEASE_TRAIN_20261019.md",
):
    if marker not in oci_guard:
        fail("OCI_SAFETY_OR_CONCURRENT_CI_CHANGE_DROPPED")
print("CI_COMPOSITION_OLD_OCI_GUARD_AND_CONCURRENT_PR_EDITS_PRESERVED=PASS")
print("CI_COMPOSITION_SOURCE_ONLY_NO_GHCR_PUBLICATION=PASS")
