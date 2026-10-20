#!/usr/bin/env python3
"""Fail-closed source qualification for disposable source-built Oracle/Ideas CI.

Published OCI provenance is independently enforced by the immutable-digest probe.
No unreviewed runtime differences from the D03 image are accepted here.
"""
import os
import subprocess
from pathlib import Path

SOURCE = "59598c2f4e333c256296bbb8c6f45a024832745b"
DIGEST = "sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21"
PERMITTED = {
    ".github/scripts/retarget-prs.sh",
    ".github/workflows/botmode-change-safety-gate.yml",
    ".github/workflows/botmode-v1-d03-candidate-manual.yml",
    ".github/workflows/botmode-v1-d03-fresh-lite-acceptance.yml",
    ".github/workflows/botmode-v1-d04-candidate-license.yml",
    ".github/workflows/botmode-v1-d04-full-restore.yml",
    ".github/workflows/botmode-v1-ghcr-subagent-oracle-probe.yml",
    ".github/workflows/botmode-v1-lite-rollback-smoke.yml",
    "scripts/botmode/verify-d04-candidate-license.sh",
    "scripts/botmode/ci-staging-digest-rollback.sh",
    "scripts/botmode/ci-release-composition-source-guard.py",
}

def git(*args):
    return subprocess.check_output(("git",) + args, text=True).strip()

def fail(reason):
    raise SystemExit("CI_COMPOSITION_SOURCE_REFUSED=" + reason)

head = git("rev-parse", "HEAD")
expected = os.environ.get("CI_EXPECTED_SOURCE_SHA")
if not expected or expected != head:
    fail("WRONG_CHECKOUT_SHA")
if git("status", "--porcelain"):
    fail("UNCLEAN_CHECKOUT")
if subprocess.run(["git", "merge-base", "--is-ancestor", SOURCE, head], check=False).returncode:
    fail("D03_SOURCE_NOT_ANCESTOR")
print("CI_COMPOSITION_D03_SOURCE_ANCESTRY=PASS")

changed = set(git("diff", "--name-only", SOURCE, head).splitlines())
unexpected = sorted(changed - PERMITTED)
print("CI_COMPOSITION_CHANGE_COUNT=" + str(len(changed)))
if unexpected:
    print("CI_COMPOSITION_UNEXPECTED_PATHS=" + ",".join(unexpected))
    fail("RUNTIME_DRIFT")
print("CI_COMPOSITION_RUNTIME_BLOBS_UNMODIFIED=PASS")

for path in (
    "package-lock.json",
    "api/server/services/Endpoints/agents/initialize.js",
    "api/server/services/Projects/botModeProjectProjection.js",
    "client/src/hooks/Chat/useChatFunctions.ts",
    "docker-compose.botmode.yml",
    "scripts/botmode/bootstrap.sh",
    "e2e/setup/tool-approval-hook.js",
):
    if git("rev-parse", SOURCE + ":" + path) != git("rev-parse", head + ":" + path):
        fail("PINNED_RUNTIME_BLOB_CHANGED")
print("CI_COMPOSITION_CRITICAL_SOURCE_EXACT=PASS")

oci = Path(".github/workflows/botmode-v1-ghcr-subagent-oracle-probe.yml").read_text()
for marker in (
    DIGEST,
    SOURCE,
    "CI_PUBLISHED_OCI_RUNTIME_DRIFT_NOT_ALLOWED",
    "scripts/botmode/tests/test_ci_live_free_sse_resume.py",
):
    if marker not in oci:
        fail("OCI_SAFETY_OR_SOURCE_PIN_DROPPED")
print("CI_COMPOSITION_PUBLISHED_OCI_GUARD_PRESERVED=PASS")
print("CI_COMPOSITION_SOURCE_ONLY_NO_GHCR_PUBLICATION=PASS")
