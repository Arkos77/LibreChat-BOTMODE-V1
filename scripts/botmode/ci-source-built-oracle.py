"""Reuse the existing Oracle harness against an honestly identified local image.

No published-image provenance gate is changed or executed by this adapter.
The assertion bodies are read from the same checkout used for the Docker build.
"""

import os
import re
import subprocess
from pathlib import Path

import yaml


def main():
    sha = os.environ.get('BOTMODE_CANDIDATE_SHA', '')
    image = os.environ.get('BOTMODE_IMAGE', '')
    assert re.fullmatch(r'[0-9a-f]{40}', sha), 'SOURCE_SHA_REQUIRED'
    assert image == 'botmode-source-built:' + sha, 'LOCAL_SOURCE_IMAGE_REQUIRED'
    assert os.environ.get('BOTMODE_PUBLISHED_IMAGE') == image, 'HARNESS_IMAGE_ALIAS_MISMATCH'
    assert re.fullmatch(r'botmode-oci-child-[0-9]+-[0-9]+', os.environ.get('COMPOSE_PROJECT_NAME', '')), 'RUNNER_PROJECT_REQUIRED'
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    assert actual == sha, 'SOURCE_CHECKOUT_MISMATCH'
    embedded = subprocess.check_output(
        ['docker', 'image', 'inspect', image, '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
        text=True,
    ).splitlines()
    assert 'BUILD_COMMIT=' + sha in embedded, 'EMBEDDED_SOURCE_MISMATCH'
    workflow = yaml.safe_load(Path('.github/workflows/botmode-v1-exact-candidate-oci-probe.yml').read_text())
    steps = workflow['jobs']['current-candidate-runtime']['steps']
    names = [
        'Boot current candidate with disposable MongoDB',
        'Browser acceptance — actual candidate UI and agent selector',
    ]
    for name in names:
        matches = [step for step in steps if step.get('name') == name]
        assert len(matches) == 1, 'SOURCE_HARNESS_STEP_MISMATCH'
        step = matches[0]
        script = step['run']
        assert '${{' not in script, 'UNRESOLVED_WORKFLOW_EXPRESSION'
        # Reporting only: preserve every runtime assertion, including image identity.
        script = script.replace('CI_PUBLISHED_OCI_SUBAGENT_EXACT_IMAGE_RUNNING', 'CI_SOURCE_BUILT_EXACT_IMAGE_RUNNING')
        script = script.replace('Published immutable OCI digest tested', 'Local source-built image tested')
        env = {**os.environ, **step.get('env', {})}
        assert env.get('OPENROUTER_API_KEY', 'ci-local-fixture-no-real-key') == 'ci-local-fixture-no-real-key'
        print('CI_SOURCE_BUILT_HARNESS_STEP=' + name, flush=True)
        subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script], env=env, check=True)
    print('CI_SOURCE_BUILT_SYNTHETIC_ORACLE_AND_BROWSER=PASS', flush=True)
    print('SCOPE=local exact-source AMD64 image; synthetic provider; no public OCI or real-provider proof', flush=True)


if __name__ == '__main__':
    main()
