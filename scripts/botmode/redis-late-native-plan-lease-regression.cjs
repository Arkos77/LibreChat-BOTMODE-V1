'use strict';
// Real Redis qualification for a native plan persisted AFTER provider begin.
// Zero side-effecting tools, no LibreChat DB, no publishing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Redis = require('ioredis');

const p = '/work/packages/api/src/stream/implementations/RedisJobStore.ts';
const s = fs.readFileSync(p, 'utf8');
const ast = ts.createSourceFile(p, s, ts.ScriptTarget.Latest, true);
const names = [
  'JOB_UPDATE_LUA', 'PROVIDER_BEGIN_LUA', 'HEARTBEAT_MISSION_PROVIDER_LUA',
  'CLAIM_DRAINED_MISSION_RECOVERY_LUA', 'RELEASE_DRAINED_MISSION_RECOVERY_LUA',
];
function flatten(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return flatten(node.left) + flatten(node.right);
  }
  // Heartbeat's bounded active-job renewal is a single named Lua fragment.
  // Resolve only this exact source constant, never evaluate arbitrary code.
  if (ts.isIdentifier(node) && node.text === 'LIVE_PROVIDER_ACTIVITY_RENEWAL_LUA') {
    const activity = ast.statements
      .filter(ts.isVariableStatement)
      .flatMap((v) => [...v.declarationList.declarations])
      .find((v) => v.name.getText(ast) === node.text);
    assert.ok(activity, 'Missing bounded activity renewal source');
    return flatten(activity.initializer);
  }
  throw Error('Unexpected Lua expression');
}
const lua = {};
for (const name of names) {
  const declaration = ast.statements
    .filter(ts.isVariableStatement)
    .flatMap((v) => [...v.declarationList.declarations])
    .find((v) => v.name.getText(ast) === name);
  assert.ok(declaration, name);
  lua[name] = flatten(declaration.initializer);
}
const redis = new Redis(process.env.BOTMODE_TEST_REDIS_URI, { maxRetriesPerRequest: 1 });
const stream = 'late-plan-qualification-' + process.pid;
const base = 'stream:{' + stream + '}:';
const job = base + 'job';
const claimKey = base + 'mission-recovery-claim';
const keys = [job, base + 'chunks', base + 'run-steps', base + 'steers'];
const nowMs = () => Date.now();
const epoch = String(nowMs() - 40_000);
const provider = 'provider-original-123456789';
const owner = 'mission-recovery-test-owner-123456';
const invoke = (name, ks, args) => redis.eval(lua[name], ks.length, ...ks, ...args.map(String));
const update = (generation, fields) =>
  invoke('JOB_UPDATE_LUA', keys, [generation, '0', '3600', '3600', '3600', ...Object.entries(fields).flat()]);
const begin = () => invoke('PROVIDER_BEGIN_LUA', [job], [epoch, provider, 15_000]);
const heartbeat = () => invoke('HEARTBEAT_MISSION_PROVIDER_LUA', [job], [epoch, provider, 15_000, 1200]);
const claim = () => invoke('CLAIM_DRAINED_MISSION_RECOVERY_LUA', [job, claimKey],
  [epoch, nowMs() - 20_000, owner, 5_000]);
async function seed(overrides = {}) {
  await redis.del(job, claimKey, ...keys.slice(1));
  await redis.hset(job, {
    createdAt: epoch, status: 'running',
    providerExecutionId: provider, providerDrained: '1',
    lastActiveAt: epoch, generationProtocolVersion: '2',
    checkpointNamespace: epoch,
    ...overrides,
  });
}
async function assertLeasePresent() {
  assert.equal(await redis.hget(job, '__missionProviderLeaseIdentity'), provider);
  const until = Number(await redis.hget(job, '__missionProviderLeaseUntil'));
  assert.ok(until >= nowMs() + 12_000 && until <= nowMs() + 15_000);
  return until;
}
(async () => {
  try {
    await seed();
    assert.equal(await begin(), 1);
    assert.equal(await redis.hget(job, '__missionProviderLeaseUntil'), null);
    assert.equal(await update(epoch, { orchestratorPlan: '{"tasks":[{"key":"worker"}]}' }), 1);
    const firstDeadline = await assertLeasePresent();
    assert.equal(await claim(), 0, 'live provider cannot be claimed');
    assert.equal(await heartbeat(), 1);
    const renewed = Number(await redis.hget(job, '__missionProviderLeaseUntil'));
    assert.ok(renewed >= firstDeadline);

    await redis.hset(job, '__missionProviderLeaseUntil', String(nowMs() - 1));
    assert.equal(await heartbeat(), 0, 'old provider must not revive an expired lease');
    assert.equal(await update(epoch, { orchestratorPlan: '{"tasks":[{"key":"worker"}]}' }), 1);
    assert.ok(Number(await redis.hget(job, '__missionProviderLeaseUntil')) < nowMs(),
      'duplicate plan HSET must never remint an expired lease');
    // The new live heartbeat correctly advances lastActiveAt. Claim is NOT
    // allowed immediately after that evidence, even if we force an expired
    // lease. Simulate a later truly-stale period for the takeover contract.
    assert.equal(await claim(), 0, 'recent heartbeat must block premature claim');
    await redis.hset(job, 'lastActiveAt', String(nowMs() - 40_000));
    assert.equal(await claim(), 1, 'truly stale expired provider remains reclaimable');
    assert.equal(await invoke('RELEASE_DRAINED_MISSION_RECOVERY_LUA', [job, claimKey],
      [epoch, owner]), 1);
    console.log('BOTMODE_LATE_NATIVE_PLAN_INITIAL_LEASE_AND_CLAIM=PASS');

    await seed();
    assert.equal(await begin(), 1);
    assert.equal(await update(String(Number(epoch) + 1),
      { orchestratorPlan: '{"tasks":[]}' }), 0);
    assert.equal(await redis.hget(job, '__missionProviderLeaseUntil'), null);
    assert.equal(await update('', { orchestratorPlan: '{"tasks":[]}' }), 1);
    assert.equal(await redis.hget(job, '__missionProviderLeaseUntil'), null);
    console.log('BOTMODE_LATE_NATIVE_PLAN_EPOCH_GUARD=PASS');

    for (const override of [
      { generationProtocolVersion: '1' },
      { checkpointNamespace: '' },
      { providerDrained: '1', providerExecutionStartedId: provider },
      { providerExecutionId: 'new-provider', providerExecutionStartedId: provider, providerDrained: '0' },
      { status: 'requires_action', providerExecutionStartedId: provider, providerDrained: '0' },
    ]) {
      await seed(override);
      if (override.providerDrained !== '1' && override.providerExecutionStartedId == null) {
        assert.equal(await begin(), 1);
      }
      assert.equal(await update(epoch, { orchestratorPlan: '{"tasks":[]}' }), 1);
      assert.equal(await redis.hget(job, '__missionProviderLeaseUntil'), null,
        'nonrunning or unscoped/foreign-provider must not receive lease');
    }
    console.log('BOTMODE_LATE_NATIVE_PLAN_UNAUTHORIZED_CASES=PASS');

    await seed();
    assert.equal(await update(epoch, { orchestratorPlan: '{"tasks":[]}' }), 1);
    assert.equal(await begin(), 1, 'plan-first initialization remains supported');
    await assertLeasePresent();
    console.log('BOTMODE_EARLY_NATIVE_PLAN_PROVIDER_BEGIN_NONREGRESSION=PASS');
  } finally {
    await redis.del(job, claimKey, ...keys.slice(1));
    redis.disconnect();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
