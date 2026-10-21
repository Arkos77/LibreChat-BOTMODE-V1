#!/usr/bin/env python3
"""CI-only Redis Lua fencing/TTL regression for long model-only missions."""
import ast
import os
import re
import subprocess
import sys
import time
from pathlib import Path

if os.environ.get("CI") != "true" or not os.environ.get("GITHUB_RUN_ID"):
    raise SystemExit("CI_DISPOSABLE_ONLY_REFUSED")
container = os.environ.get("HEARTBEAT_CI_REDIS_CONTAINER", "")
if not re.fullmatch(r"ci-heartbeat-[A-Za-z0-9_-]{1,55}", container):
    raise SystemExit("CI_REDIS_CONTAINER_SCOPE_INVALID")
source = Path("packages/api/src/stream/implementations/RedisJobStore.ts").read_text()

def lua_const(name):
    header = "const " + name + " ="
    start = source.index(header) + len(header)
    ending = source.index(";", start)
    expression = source[start:ending]
    tokens = re.findall(r"'(?:\\.|[^'\\])*'|LIVE_PROVIDER_ACTIVITY_RENEWAL_LUA", expression)
    return "".join(
        lua_const("LIVE_PROVIDER_ACTIVITY_RENEWAL_LUA")
        if token == "LIVE_PROVIDER_ACTIVITY_RENEWAL_LUA"
        else ast.literal_eval(token)
        for token in tokens
    )

original = lua_const("HEARTBEAT_MISSION_PROVIDER_LUA")
recovered = lua_const("HEARTBEAT_RECOVERED_MISSION_PROVIDER_LUA")
assert all(x in original for x in ('"lastActiveAt"', '"TTL"', '"EXPIRE"'))
assert all(x in recovered for x in ('"lastActiveAt"', '"TTL"', '"EXPIRE"'))

def cmd(*args):
    result = subprocess.run(
        ["docker", "exec", container, "redis-cli", "--raw", *map(str, args)],
        check=True, capture_output=True, text=True, timeout=15
    )
    return result.stdout.strip()

def seed(key, now, owner=False):
    cmd("HSET", key,
        "createdAt", "1730000000000",
        "status", "running",
        "providerDrained", "0",
        "providerExecutionId", "executor-new",
        "providerExecutionStartedId", "executor-new",
        "__missionProviderLeaseIdentity", "executor-new",
        "__missionProviderLeaseUntil", str(now + 12000),
        "checkpointNamespace", "soak-namespace",
        "lastActiveAt", str(now - 1300000))
    cmd("EXPIRE", key, "20")
    if owner:
        cmd("HSET", key, "__missionRecoveryOwner", "owner-12345678901234567890")
    return key

def check_recent(key, last):
    new = int(cmd("HGET", key, "lastActiveAt"))
    if new <= last or abs(new-int(time.time()*1000)) > 10000:
        raise AssertionError("heartbeat did not advance live timestamp")
    if int(cmd("TTL", key)) < 1100:
        raise AssertionError("job retention was not extended")
    return new

now = int(time.time() * 1000)
job = "stream:{ci-heartbeat-original}:job"
seed(job, now)
before = int(cmd("HGET", job, "lastActiveAt"))
assert cmd("EVAL", original, "1", job, "1730000000000", "executor-new", "15000", "1200") == "1"
after = check_recent(job, before)
time.sleep(0.12)
assert cmd("EVAL", original, "1", job, "1730000000000", "executor-new", "15000", "1200") == "1"
check_recent(job, after)
print("CI_LONG_MISSION_ORIGINAL_OWNER_ACTIVITY_AND_TTL=PASS", flush=True)

def denied(script, key, args):
    prior = cmd("HGET", key, "lastActiveAt")
    ttl = int(cmd("TTL", key))
    assert cmd("EVAL", script, str(len(args[0])), *args[0], *args[1]) == "0"
    assert cmd("HGET", key, "lastActiveAt") == prior
    assert int(cmd("TTL", key)) <= ttl

denied(original, job, [[job], ["1730000000001", "executor-new", "15000", "1200"]])
denied(original, job, [[job], ["1730000000000", "old-executor", "15000", "1200"]])
cmd("HSET", job, "status", "complete")
denied(original, job, [[job], ["1730000000000", "executor-new", "15000", "1200"]])
cmd("HSET", job, "status", "running", "__missionProviderLeaseUntil", str(now-100))
denied(original, job, [[job], ["1730000000000", "executor-new", "15000", "1200"]])
print("CI_LONG_MISSION_TERMINAL_PREDECESSOR_EXPIRED_DENIED=PASS", flush=True)

recovered_job = "stream:{ci-heartbeat-recovered}:job"
claim = "stream:{ci-heartbeat-recovered}:mission-recovery-claim"
seed(recovered_job, int(time.time()*1000), True)
cmd("SET", claim, "owner-12345678901234567890", "PX", "12000")
prior = int(cmd("HGET", recovered_job, "lastActiveAt"))
assert cmd("EVAL", recovered, "2", recovered_job, claim,
           "1730000000000", "owner-12345678901234567890", "executor-new",
           "soak-namespace", "15000", "1200") == "1"
check_recent(recovered_job, prior)
print("CI_LONG_MISSION_RECOVERED_OWNER_ACTIVITY_AND_TTL=PASS", flush=True)
denied(original, recovered_job, [[recovered_job], ["1730000000000", "executor-new", "15000", "1200"]])
denied(recovered, recovered_job,
       [[recovered_job, claim], ["1730000000000", "wrong-owner-token-12345", "executor-new", "soak-namespace", "15000", "1200"]])
cmd("DEL", claim)
denied(recovered, recovered_job,
       [[recovered_job, claim], ["1730000000000", "owner-12345678901234567890", "executor-new", "soak-namespace", "15000", "1200"]])
print("CI_LONG_MISSION_RECOVERY_CAS_FENCES=PASS", flush=True)
print("CI_LONG_MISSION_HEARTBEAT_REDIS_CONTRACT=PASS", flush=True)
