'use strict';
// Exercises the production CAS Lua against isolated Redis without running a provider.
// Success here is NOT proof that host Oracle approval or publication is wired.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Redis = require('ioredis');
const file = '/work/packages/api/src/stream/implementations/RedisJobStore.ts';
const source = fs.readFileSync(file, 'utf8');
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const names = ['JOB_CAS_CORE_LUA', 'JOB_CAS_LUA', 'JOB_RECOVERED_CAS_LUA'];
const statements = [];
for (const name of names) {
  const s = tree.statements.find((stmt) => ts.isVariableStatement(stmt) &&
    stmt.declarationList.declarations.some((decl) => decl.name.getText(tree) === name));
  assert.ok(s, name + ' not found');
  statements.push(s.getText(tree));
}
const context = { module: { exports: {} } };
vm.runInNewContext(statements.join('\n') +
  '\nmodule.exports = {JOB_CAS_LUA,JOB_RECOVERED_CAS_LUA};', context, { timeout: 1000 });
const lua = context.module.exports;
const redis = new Redis(process.env.BOTMODE_TEST_REDIS_URI, { maxRetriesPerRequest: 1 });
const stream = 'recovered-terminal-cas-' + process.pid;
const prefix = 'stream:{' + stream + '}:';
const keys = ['job','sequence','chunks','run-steps','steers','claimed-steers',
  'parked-steers','generation-epoch','steer-receipts','steer-receipt-order'].map((s) => prefix + s);
const claim = prefix + 'mission-recovery-claim';
const epoch = String(Date.now() - 120000);
const owner = 'owner-recovery-0123456789';
const oldOwner = 'owner-recovery-9876543210';
const provider = 'provider-recovered-123456';
const scope = 'generation-scope-immutable';
const now = String(Date.now());
const args = ['running', '', epoch, '', '3600', '1', '3600', '3600', '3600',
  '3600', '0', '0', '0', 'status', 'complete', 'completedAt', now];
const runRecovered = (o = owner, p = provider, ns = scope, e = epoch) =>
  redis.eval(lua.JOB_RECOVERED_CAS_LUA, 11, ...keys, claim, o, p, ns, e, ...args);
const ordinary = () => redis.eval(lua.JOB_CAS_LUA, 10, ...keys, ...args);

async function main() {
  try {
    await redis.hset(keys[0], {
      status: 'running', createdAt: epoch, providerExecutionId: provider,
      providerExecutionStartedId: provider, providerDrained: '0',
      __missionRecoveryOwner: owner,
      __missionProviderLeaseIdentity: provider,
      __missionProviderLeaseUntil: String(Date.now() + 60000),
      checkpointNamespace: scope, orchestratorPlan: '{"tasks":[]}', userId: 'test-owner',
    });
    await redis.set(claim, owner, 'PX', 60000);
    assert.equal(await ordinary(), 0);
    assert.equal(await runRecovered(oldOwner), 0);
    assert.equal(await runRecovered(owner, 'other-provider'), 0);
    assert.equal(await runRecovered(owner, provider, 'wrong-namespace'), 0);
    assert.equal(await runRecovered(owner, provider, scope, String(Number(epoch) + 1)), 0);
    assert.equal(await redis.hget(keys[0], 'status'), 'running');
    assert.equal(await runRecovered(), 1);
    assert.equal(await runRecovered(), 0);
    assert.equal(await redis.hget(keys[0], 'status'), 'complete');
    assert.equal(await redis.hget(keys[0], 'completedAt'), now);
    console.log('BOTMODE_RECOVERED_TERMINAL_SINGLE_WINNER=PASS');
    // Reset a fresh running job with identical coordinates; lost claim is rejected.
    await redis.hset(keys[0], { status: 'running', providerDrained: '0' });
    await redis.del(claim);
    assert.equal(await runRecovered(), 0);
    console.log('BOTMODE_RECOVERED_TERMINAL_EXPIRED_OWNER=PASS');
    // Two identical recovered callers race over the same status/epoch:
    // the terminal CAS must commit at most once.
    await redis.hset(keys[0], {
      status: 'running', __missionRecoveryOwner: owner, providerDrained: '0',
      __missionProviderLeaseUntil: String(Date.now() + 60000),
    });
    await redis.set(claim, owner, 'PX', 60000);
    const races = await Promise.all([runRecovered(), runRecovered()]);
    assert.equal(races.filter((value) => value === 1).length, 1);
    assert.equal(await redis.hget(keys[0], 'status'), 'complete');
    console.log('BOTMODE_RECOVERED_TERMINAL_RACE=PASS');

    // The ordinary terminal path must continue to work when no recovery
    // ownership exists; sharing the core CAS must not regress it.
    await redis.hset(keys[0], { status: 'running' });
    await redis.hdel(keys[0], '__missionRecoveryOwner');
    assert.equal(await ordinary(), 1);
    assert.equal(await ordinary(), 0);
    assert.equal(await redis.hget(keys[0], 'status'), 'complete');
    console.log('BOTMODE_ORDINARY_TERMINAL_REGRESSION=PASS');
  } finally {
    await redis.del(...keys, claim);
    redis.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
