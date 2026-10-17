#!/usr/bin/env python3
"""Real Redis qualification of the recovered provider's terminal CAS and
same-epoch durable-finalization barrier. Uses production Lua, not a fake store.
"""
from pathlib import Path
import json
import os
import re
import subprocess

source = Path('packages/api/src/stream/implementations/RedisJobStore.ts').read_text()

def extract(name):
    body = source.split('const ' + name + ' =', 1)[1].split(';', 1)[0]
    return ''.join(re.findall(r"'([^']*)'", body))

cas = extract('JOB_RECOVERED_CAS_LUA') + extract('JOB_CAS_CORE_LUA')
finalize = extract('TERMINAL_PERSISTENCE_FINALIZE_LUA')
assert '__missionProviderLeaseUntil' in cas
assert 'terminalPersistencePending' in source.split('async transitionRecoveredMissionToComplete(', 1)[1].split('return result === true;', 1)[0]
name = 'botmode-terminal-cas-' + str(os.getpid())

def docker(*args):
    return subprocess.run(['docker', *args], capture_output=True, check=True, text=True).stdout.strip()

def redis(*args):
    return docker('exec', name, 'redis-cli', '--raw', *map(str, args))

docker('run', '--rm', '--detach', '--name', name, 'redis:7-alpine')
try:
    prefix = 'stream:{recovered-terminal-ci}'
    keys = [prefix + suffix for suffix in (
        ':job', ':sequence', ':chunks', ':run-steps', ':steers', ':steers-claimed',
        ':parked', ':generation-epoch', ':steer-receipts', ':steer-receipt-order',
        ':mission-recovery-claim',
    )]
    owner, provider, namespace, epoch = 'recovery-owner-123456789', 'recovery-provider-123456789', 'scope-001', '1700000000000'
    now = int(redis('TIME').splitlines()[0]) * 1000

    def reset(**updates):
        redis('DEL', *keys)
        fields = {
            'createdAt': epoch, 'userId': 'user', 'status': 'running',
            'generationProtocolVersion': '2', 'orchestratorPlan': '{}',
            'checkpointNamespace': namespace, 'providerDrained': '0',
            'providerExecutionId': provider, 'providerExecutionStartedId': provider,
            '__missionRecoveryOwner': owner, '__missionProviderLeaseIdentity': provider,
            '__missionProviderLeaseUntil': str(now + 60000),
            'missionCandidateContent': '[{"type":"text","text":"approved"}]',
            'missionOracleState': '{"evidence":{},"results":{"mission/worker":{"verdicts":[{"status":"VERIFIED"}]}}}',
        }
        fields.update(updates)
        redis('HSET', keys[0], *[v for item in fields.items() for v in item])
        redis('SET', keys[10], owner, 'PX', 60000)

    def complete():
        completed_at = str(now)
        patch = [
            'status', 'complete', 'completedAt', completed_at,
            'terminalPersistencePending', '1', 'terminalPersistenceStartedAt', completed_at,
        ]
        args = [
            owner, provider, namespace, epoch, 'running', '', epoch, '',
            '300', '1', '0', '0', '3600', '300', '0', '0', '0',
            *patch,
        ]
        return redis('EVAL', cas, 11, *keys, *args)

    reset()
    assert complete() == '1'
    assert redis('HGET', keys[0], 'status') == 'complete'
    assert redis('HGET', keys[0], 'terminalPersistencePending') == '1'
    assert int(redis('TTL', keys[0])) > 0
    assert complete() == '0', 'terminal transition MUST be unique'
    assert redis('HGET', keys[0], 'terminalPersistencePending') == '1'
    print('RECOVERED_TERMINAL_CAS_SINGLE_WINNER_AND_PENDING_BARRIER=PASS')

    event = json.dumps({'final': True, 'responseMessage': {'text': 'approved'}})
    assert redis('EVAL', finalize, 1, keys[0], epoch, event) == '1'
    assert redis('HGET', keys[0], 'terminalPersistencePending') == '0'
    assert json.loads(redis('HGET', keys[0], 'finalEvent'))['final'] is True
    assert redis('EVAL', finalize, 1, keys[0], epoch, event) == '0'
    print('RECOVERED_TERMINAL_FINAL_EVENT_EXACT_EPOCH_IDEMPOTENCY=PASS')

    for label, fields, claim in (
        ('WRONG_OWNER', {'__missionRecoveryOwner': 'other-owner-123456789'}, owner),
        ('WRONG_PROVIDER', {'providerExecutionId': 'other-provider-123456789'}, owner),
        ('WRONG_NAMESPACE', {'checkpointNamespace': 'other-scope'}, owner),
        ('EXPIRED_PROVIDER', {'__missionProviderLeaseUntil': str(now - 10000)}, owner),
        ('LOST_CLAIM', {}, 'other-owner-123456789'),
        ('OTHER_EPOCH', {'createdAt': '1700000000001'}, owner),
    ):
        reset(**fields)
        redis('SET', keys[10], claim, 'PX', 60000)
        assert complete() == '0', label
        assert redis('HGET', keys[0], 'status') == 'running', label
        assert not redis('HGET', keys[0], 'terminalPersistencePending'), label
        print('RECOVERED_TERMINAL_' + label + '_DENIED=PASS')
finally:
    docker('rm', '--force', name)
