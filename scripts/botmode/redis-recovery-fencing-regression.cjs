'use strict';
// This tests the actual Lua source in RedisJobStore.ts against disposable Redis.
// It deliberately does not start a provider, mutate product data, or publish.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Redis = require('ioredis');

function extractLua(name) {
  const path = '/work/packages/api/src/stream/implementations/RedisJobStore.ts';
  const root = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  function flatten(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return flatten(node.left) + flatten(node.right);
    }
    throw new Error('Unexpected Lua expression in ' + name + ': ' + ts.SyntaxKind[node.kind]);
  }
  for (const statement of root.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(root) === name && declaration.initializer) {
        return flatten(declaration.initializer);
      }
    }
  }
  throw new Error('Lua constant not found: ' + name);
}

async function main() {
  const scripts = Object.fromEntries(
    ['CLAIM_DRAINED_MISSION_RECOVERY_LUA', 'ACTIVATE_DRAINED_MISSION_RECOVERY_LUA',
      'RENEW_DRAINED_MISSION_RECOVERY_LUA', 'RELEASE_DRAINED_MISSION_RECOVERY_LUA',
      'RECOVERED_MISSION_METADATA_UPDATE_LUA', 'JOB_UPDATE_LUA', 'PROVIDER_BEGIN_LUA',
      'BEGIN_RECOVERED_MISSION_PROVIDER_LUA', 'HEARTBEAT_RECOVERED_MISSION_PROVIDER_LUA']
      .map((name) => [name, extractLua(name)]),
  );
  const redis = new Redis(process.env.BOTMODE_TEST_REDIS_URI, { maxRetriesPerRequest: 1 });
  const stream = 'recovery-qualification-' + process.pid;
  const key = 'stream:{' + stream + '}:job';
  const lease = 'stream:{' + stream + '}:mission-recovery-claim';
  const chunks = 'stream:{' + stream + '}:chunks';
  const steps = 'stream:{' + stream + '}:run-steps';
  const steers = 'stream:{' + stream + '}:steers';
  const created = String(Date.now() - 120000);
  const ownerA = 'test-recovery-owner-A-12345';
  const ownerB = 'test-recovery-owner-B-67890';
  const providerA = 'test-provider-identity-A-12345';
  const providerB = 'test-provider-identity-B-67890';
  const originalProvider = 'test-original-provider-abc123';
  const evalLua = (name, keys, argv) => redis.eval(scripts[name], keys.length, ...keys, ...argv.map(String));
  const staleBefore = () => String(Date.now() + 500);
  try {
    await redis.hset(key, {
      createdAt: created, status: 'running', providerDrained: '0',
      providerExecutionId: originalProvider, providerExecutionStartedId: originalProvider,
      orchestratorPlan: '{"tasks":[]}', lastActiveAt: created, checkpointNamespace: 'qual-namespace',
      __missionProviderLeaseUntil: String(Date.now() + 60000),
    });
    const claim = (owner, ttl = 5000) => evalLua('CLAIM_DRAINED_MISSION_RECOVERY_LUA',
      [key, lease], [created, staleBefore(), owner, ttl]);
    // A still-live original provider must never be stolen.
    assert.equal(await claim(ownerA), 0);
    await redis.hset(key, '__missionProviderLeaseUntil', String(Date.now() - 1));
    const results = await Promise.all([claim(ownerA), claim(ownerB)]);
    assert.equal(results.filter((value) => value === 1).length, 1);
    const winner = results[0] === 1 ? ownerA : ownerB;
    const loser = winner === ownerA ? ownerB : ownerA;
    assert.equal(await claim(loser), 0);
    const activate = (owner, provider) => evalLua('ACTIVATE_DRAINED_MISSION_RECOVERY_LUA',
      [key, lease], [created, owner, provider, Date.now()]);
    assert.equal(await activate(loser, providerA), 0);
    assert.equal(await activate(winner, providerA), 1);
    assert.equal(await activate(winner, providerA), 0);
    assert.equal(await redis.hget(key, '__missionRecoveryOwner'), winner);
    assert.equal(await redis.hget(key, 'providerExecutionId'), providerA);

    // Epoch-only writes and provider starts must stay forbidden, including for
    // the new provider identity, until an owner-aware protocol is implemented.
    const ordinaryWrite = (generation) => evalLua('JOB_UPDATE_LUA',
      [key, chunks, steps, steers, steers], [generation, 0, 3600, 3600, 3600,
        'missionCandidateContent', 'STALE-OVERWRITE']);
    assert.equal(await ordinaryWrite(created), 0);
    assert.equal(await evalLua('PROVIDER_BEGIN_LUA', [key], [created, providerA, 20000]), 0);

    const began = (token, provider, namespace = 'qual-namespace') =>
      evalLua('BEGIN_RECOVERED_MISSION_PROVIDER_LUA', [key, lease],
        [created, token, provider, namespace, 5000]);
    const beat = (token, provider) =>
      evalLua('HEARTBEAT_RECOVERED_MISSION_PROVIDER_LUA', [key, lease],
        [created, token, provider, 'qual-namespace', 5000]);
    const evidence = (owner, provider, field, value) =>
      evalLua('RECOVERED_MISSION_METADATA_UPDATE_LUA',
        [key, lease], [created, owner, provider, field, value]);
    assert.equal(await evidence(loser, providerA, 'missionOracleState', 'LOSER'), 0);
    assert.equal(await evidence(winner, originalProvider, 'missionOracleState', 'OLD'), 0);
    assert.equal(await evidence(winner, providerA, 'status', 'complete'), 0);
    assert.equal(await evidence(winner, providerA, 'missionOracleState', 'EARLY-UNSTARTED'), 0);
    assert.equal(await began(winner, providerA), 1);
    assert.equal(await began(winner, providerA), 0);
    assert.equal(await evidence(winner, providerA, 'missionOracleState', 'OWNER-EVIDENCE'), 1);
    assert.equal(await redis.hget(key, 'missionOracleState'), 'OWNER-EVIDENCE');
    assert.equal(await redis.hget(key, 'status'), 'running');

    // The preflight-only renewal is unavailable once provider execution starts.
    // Only the recovered provider heartbeat may renew the active execution.
    assert.equal(await evalLua('RENEW_DRAINED_MISSION_RECOVERY_LUA',
      [key, lease], [created, loser, 3000]), 0);
    assert.equal(await evalLua('RENEW_DRAINED_MISSION_RECOVERY_LUA',
      [key, lease], [created, winner, 2000]), 0);
    assert.equal(await beat(loser, providerA), 0);
    assert.equal(await beat(winner, providerA), 1);
    assert.equal(await evalLua('RELEASE_DRAINED_MISSION_RECOVERY_LUA',
      [key, lease], [created, loser]), 0);

    // The provider's server-time deadline fences stale Oracle evidence even
    // if the recovery claim itself is still alive.
    await redis.hset(key, '__missionProviderLeaseUntil', String(Date.now() - 1));
    assert.equal(await evidence(winner, providerA, 'missionOracleState', 'PROVIDER-EXPIRED'), 0);
    // Simulated claim loss: a formerly authorized owner loses every permission.
    await redis.del(lease);
    assert.equal(await evidence(winner, providerA, 'missionOracleState', 'AFTER-EXPIRY'), 0);
    assert.equal(await redis.hget(key, 'missionOracleState'), 'OWNER-EVIDENCE');
    assert.equal(await claim(loser), 1);
    assert.equal(await activate(loser, providerB), 1);
    assert.equal(await evidence(winner, providerA, 'missionOracleState', 'OLD-OWNER'), 0);
    assert.equal(await evidence(loser, providerB, 'missionOracleState', 'NEW-OWNER-EARLY'), 0);
    assert.equal(await redis.hget(key, 'missionOracleState'), 'OWNER-EVIDENCE');
    assert.equal(await began(winner, providerA), 0);
    assert.equal(await began(loser, providerA), 0);
    assert.equal(await began(loser, providerB, 'wrong-namespace'), 0);
    assert.equal(await evalLua('BEGIN_RECOVERED_MISSION_PROVIDER_LUA',
      [key, lease], [String(Number(created) + 1), loser, providerB, 'qual-namespace', 5000]), 0);
    assert.equal(await began(loser, providerB), 1);
    assert.equal(await began(loser, providerB), 0);
    assert.equal(await evidence(loser, providerB, 'missionOracleState', 'NEW-OWNER'), 1);
    assert.equal(await redis.hget(key, 'missionOracleState'), 'NEW-OWNER');
    assert.equal(await beat(winner, providerA), 0);
    assert.equal(await beat(loser, providerA), 0);
    assert.equal(await beat(loser, providerB), 1);
    assert.equal(await redis.hget(key, 'status'), 'running');
    await redis.del(lease);
    assert.equal(await beat(loser, providerB), 0);
    console.log('BOTMODE_RECOVERED_PROVIDER_START_FENCE=PASS');
    console.log('BOTMODE_REDIS_RECOVERY_FENCING=PASS');
  } finally {
    await redis.del(key, lease, chunks, steps, steers);
    redis.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
