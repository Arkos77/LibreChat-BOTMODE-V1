#!/usr/bin/env python3
"""Exercise the production TS renewal CAS directly against disposable Redis.

No mock Redis replies: the same Lua that ships in RedisJobStore is EVALed.
The container, job hash and claim live only for this test invocation.
"""
from pathlib import Path
import re
import subprocess
import os

source = Path('packages/api/src/stream/implementations/RedisJobStore.ts').read_text()
section = source.split('const RENEW_DRAINED_MISSION_RECOVERY_LUA =', 1)[1].split(';', 1)[0]
script = ''.join(re.findall(r"'([^']*)'", section))
assert 'redis.call("TIME")' in script and 'PEXPIRE' in script
container = f'botmode-recovery-renew-{os.getpid()}'


def docker(*args):
    return subprocess.run(['docker', *args], check=True, capture_output=True, text=True).stdout.strip()


def redis(*args):
    return docker('exec', container, 'redis-cli', '--raw', *map(str, args))


docker('run', '--detach', '--rm', '--name', container, 'redis:7-alpine')
try:
    job = 'stream:{recovery-renew-ci}:job'
    claim = 'stream:{recovery-renew-ci}:mission-recovery-claim'
    owner = 'native-recovery-owner-123456789'
    server_time = redis('TIME').splitlines()[0]
    now = int(server_time) * 1000

    def reset(**overrides):
        fields = {
            'createdAt': '123456',
            'status': 'running',
            'providerDrained': '0',
            'providerExecutionId': 'original-provider',
            'providerExecutionStartedId': 'original-provider',
            '__missionProviderLeaseUntil': str(now - 10_000),
            'orchestratorPlan': '{}',
        }
        fields.update(overrides)
        redis('DEL', job, claim)
        redis('HSET', job, *[value for item in fields.items() for value in item])
        redis('SET', claim, owner, 'PX', 15_000)

    def expect(case, permitted):
        observed = redis('EVAL', script, 2, job, claim, '123456', owner, 15_000)
        assert observed == str(int(permitted)), (case, observed)
        print(f'RECOVERY_CLAIM_{case}=PASS')

    reset()
    expect('CRASHED_PROVIDER_RENEW', True)
    reset(providerDrained='1')
    expect('DRAINED_PROVIDER_RENEW', True)
    reset(__missionProviderLeaseUntil=str(now + 60_000))
    expect('LIVE_PROVIDER_DENIED', False)
    reset(providerExecutionStartedId='wrong-provider')
    expect('DIFFERENT_PROVIDER_DENIED', False)
    reset(__missionRecoveryOwner=owner)
    expect('PROMOTED_OWNER_DENIED', False)
    reset(status='complete')
    expect('TERMINAL_JOB_DENIED', False)
    reset(createdAt='123457')
    expect('REPLACED_GENERATION_DENIED', False)
    reset()
    redis('SET', claim, 'different-owner-123456789')
    expect('OTHER_OWNER_DENIED', False)
    reset()
    redis('DEL', claim)
    expect('EXPIRED_CLAIM_DENIED', False)
finally:
    docker('rm', '--force', container)
