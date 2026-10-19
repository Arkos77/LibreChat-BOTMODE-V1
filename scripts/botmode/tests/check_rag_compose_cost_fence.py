#!/usr/bin/env python3
"""Run on disposable GitHub runner. Inspect resolved Full Compose values only."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

if os.getenv('CI') != 'true' or not os.getenv('GITHUB_RUN_ID'):
    raise SystemExit('CI_ONLY_RAG_CREDENTIAL_TEST_REFUSED')

base = {
    'BOTMODE_MONGO_PASSWORD': 'ci-not-a-real-db-password',
    'POSTGRES_PASSWORD': 'ci-not-a-real-pg-password',
    'JWT_SECRET': 'ci-shared-signing-material-not-real',
    'OPENAI_API_KEY': 'CI_FORBIDDEN_GLOBAL_OPENAI',
    'RAG_OPENAI_API_KEY': 'CI_FORBIDDEN_LEGACY_RAG_KEY',
    'GOOGLE_API_KEY': 'CI_FORBIDDEN_GOOGLE',
    'AZURE_OPENAI_API_KEY': 'CI_FORBIDDEN_AZURE',
    'AWS_ACCESS_KEY_ID': 'CI_FORBIDDEN_AWS',
    'HF_TOKEN': 'CI_FORBIDDEN_HF',
    'ANTHROPIC_API_KEY': 'CI_FORBIDDEN_ANTHROPIC',
    'GROQ_API_KEY': 'CI_FORBIDDEN_GROQ',
    'EMBEDDINGS_PROVIDER': 'google_genai',
    'EMBEDDINGS_MODEL': 'some-legacy-global-model',
}

def resolved(values):
    with tempfile.TemporaryDirectory(prefix='ci-rag-env-') as temp:
        path = Path(temp) / 'fixture.env'
        path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
        result = subprocess.run(
            ['docker', 'compose', '--env-file', str(path),
             '-f', 'docker-compose.botmode.yml', 'config', '--format', 'json'],
            check=True, capture_output=True, text=True, timeout=45,
            env={**os.environ, **values}
        )
        return json.loads(result.stdout)

default = resolved(base)
sidecar = default['services']['rag_api']
assert not sidecar.get('env_file'), 'RAG must never inherit entire Chat dotenv'
assert not sidecar.get('volumes'), 'RAG must not mount the Chat dotenv'
env = sidecar['environment']
for name in (
    'OPENAI_API_KEY', 'RAG_OPENAI_API_KEY', 'GOOGLE_API_KEY',
    'AZURE_OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID', 'HF_TOKEN',
    'ANTHROPIC_API_KEY', 'GROQ_API_KEY'
):
    assert not env.get(name), f'RAG received unapproved {name}'
assert env.get('EMBEDDINGS_PROVIDER') == 'openai'
assert env.get('EMBEDDINGS_MODEL') == 'text-embedding-3-small'
assert env.get('JWT_SECRET') == base['JWT_SECRET']
print('CI_RAG_NO_IMPLICIT_PROVIDER_CREDENTIALS=PASS', flush=True)

explicit = resolved({
    **base,
    'BOTMODE_RAG_APPROVED_EMBEDDINGS_API_KEY': 'CI_EXPLICIT_APPROVED_RAG_ONLY',
    'BOTMODE_RAG_EMBEDDINGS_BASEURL': 'http://ci-embeddings:8118/v1',
    'BOTMODE_RAG_EMBEDDINGS_PROVIDER': 'openai',
})
approved = explicit['services']['rag_api']['environment']
assert approved['OPENAI_API_KEY'] == ''
assert approved['RAG_OPENAI_API_KEY'] == 'CI_EXPLICIT_APPROVED_RAG_ONLY'
assert approved['RAG_OPENAI_BASEURL'] == 'http://ci-embeddings:8118/v1'
assert all(forbidden not in json.dumps(approved) for forbidden in (
    'CI_FORBIDDEN_GLOBAL_OPENAI', 'CI_FORBIDDEN_LEGACY_RAG_KEY',
    'CI_FORBIDDEN_GOOGLE', 'CI_FORBIDDEN_HF', 'CI_FORBIDDEN_ANTHROPIC'
))
print('CI_RAG_ONLY_EXPLICIT_APPROVED_CREDENTIAL=PASS', flush=True)
print('CI_RAG_COST_AND_SECRET_ISOLATION=PASS', flush=True)
