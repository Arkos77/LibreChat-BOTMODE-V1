#!/usr/bin/env python3
"""Real Redis read-only recovered-owner phase admission. No model, private
content, mutation or host permissions implied by this narrow liveness proof."""
from pathlib import Path
import re
import subprocess
import os

src = Path('packages/api/src/stream/implementations/RedisJobStore.ts').read_text()
part = src.split('const INSPECT_LIVE_RECOVERED_OWNER_LUA =', 1)[1].split(';', 1)[0]
script = ''.join(re.findall(r"'([^']*)'", part))
assert 'terminalPersistencePending' in script and 'PTTL' in script
assert 'redis.call("TIME")' in script and 'HSET' not in script
container = 'botmode-owner-phase-' + str(os.getpid())

def docker(*args):
    return subprocess.run(['docker', *args], check=True, capture_output=True, text=True).stdout.strip()

def redis(*args):
    return docker('exec', container, 'redis-cli', '--raw', *map(str, args))

docker('run', '-d', '--rm', '--name', container, 'redis:7-alpine')
try:
    job = 'stream:{owner-phase}:job'
    claim = 'stream:{owner-phase}:mission-recovery-claim'
    owner = 'owner-phase-123456789'
    provider = 'recovered-provider-123456789'
    namespace = 'isolated-epoch'
    epoch = '1700000000000'
    now = int(redis('TIME').splitlines()[0]) * 1000

    def reset(**overrides):
        fields = {
            'status': 'running', 'createdAt': epoch,
            'checkpointNamespace': namespace,
            '__missionRecoveryOwner': owner,
            'providerExecutionId': provider,
            'providerExecutionStartedId': 'previous-provider',
            'providerDrained': '1',
            'terminalPersistencePending': '0',
        }
        fields.update(overrides)
        redis('DEL', job, claim)
        redis('HSET', job, *[v for kv in fields.items() for v in kv])
        redis('SET', claim, owner, 'PX', 60000)

    def check(name, passed, input_owner=owner, input_provider=provider,
              input_namespace=namespace, input_epoch=epoch):
        before = redis('HGETALL', job)
        result = redis('EVAL', script, 2, job, claim, input_epoch,
                       input_owner, input_provider, input_namespace)
        assert result == ('1' if passed else '0'), (name, result)
        assert redis('HGETALL', job) == before, name + ': must be read-only'
        print('RECOVERY_OWNER_PHASE_' + name + '=PASS')

    reset()
    check('PROMOTED_NOT_STARTED', True)
    reset(providerDrained='0', providerExecutionStartedId=provider,
          __missionProviderLeaseIdentity=provider,
          __missionProviderLeaseUntil=str(now + 60000))
    check('PROVIDER_RUNNING', True)
    reset(status='complete', providerDrained='0',
          providerExecutionStartedId=provider,
          terminalPersistencePending='1',
          __missionProviderLeaseIdentity=provider,
          __missionProviderLeaseUntil=str(now + 60000))
    check('TERMINAL_PENDING', True)
    redis('HSET', job, 'terminalPersistencePending', '0')
    check('TERMINAL_SETTLED_DENIED', False)
    reset(status='aborted')
    check('ABORTED_DENIED', False)
    reset(status='requires_action')
    check('HITL_DENIED', False)
    reset(__missionRecoveryOwner='other-owner-123456789')
    check('FOREIGN_RECOVERY_OWNER_DENIED', False)
    reset()
    check('WRONG_CLAIM_INPUT_DENIED', False, input_owner='other-owner-123456789')
    reset()
    redis('DEL', claim)
    check('EXPIRED_CLAIM_DENIED', False)
    reset(providerDrained='0', providerExecutionStartedId=provider,
          __missionProviderLeaseIdentity=provider,
          __missionProviderLeaseUntil=str(now - 10000))
    check('EXPIRED_PROVIDER_DENIED', False)
    reset(providerDrained='0', providerExecutionStartedId='old-provider',
          __missionProviderLeaseIdentity=provider,
          __missionProviderLeaseUntil=str(now + 60000))
    check('UNSTARTED_WRONG_PHASE_DENIED', False)
    reset()
    check('PROVIDER_MISMATCH_DENIED', False, input_provider='different-provider')
    reset()
    check('NAMESPACE_MISMATCH_DENIED', False, input_namespace='another-epoch')
    reset()
    check('EPOCH_MISMATCH_DENIED', False, input_epoch='1700000000001')
    print('BOTMODE_RECOVERY_PROMOTED_OWNER_REAL_REDIS=PASS')
finally:
    docker('rm', '-f', container)
