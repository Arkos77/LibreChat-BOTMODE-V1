'use strict';
// Integration characterization: real SDK, Mongo saver and Redis Lua, fake model.
// Does not execute external tools or the complete LibreChat HTTP server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const { MongoDBSaver } = require('@langchain/langgraph-checkpoint-mongodb');
const { Run, Providers, FakeChatModel } = require('@librechat/agents');
const { Command } = require('@langchain/langgraph');
const { HumanMessage } = require('@langchain/core/messages');

const phase = process.argv[2];
assert.ok(['seed', 'resume', 'retry'].includes(phase));
const stream = 'isolated-recovered-graph';
const epoch = '1700000000000';
const oldProvider = 'original-provider-123456';
const nextProvider = 'recovered-provider-123456';
const owner = 'recovered-owner-123456';
const namespace = 'qualified-native-namespace';
const redisPrefix = 'stream:{' + stream + '}:';
const keys = [
  'job',
  'sequence',
  'chunks',
  'run-steps',
  'steers',
  'claimed-steers',
  'parked-steers',
  'generation-epoch',
  'steer-receipts',
  'steer-receipt-order',
].map((s) => redisPrefix + s);
const claimKey = redisPrefix + 'mission-recovery-claim';

const luaSource = fs.readFileSync(
  '/work/packages/api/src/stream/implementations/RedisJobStore.ts',
  'utf8',
);
const luaTree = ts.createSourceFile('RedisJobStore.ts', luaSource, ts.ScriptTarget.Latest, true);
const luaNames = [
  'LIVE_PROVIDER_ACTIVITY_RENEWAL_LUA',
  'CLAIM_DRAINED_MISSION_RECOVERY_LUA',
  'ACTIVATE_DRAINED_MISSION_RECOVERY_LUA',
  'BEGIN_RECOVERED_MISSION_PROVIDER_LUA',
  'HEARTBEAT_RECOVERED_MISSION_PROVIDER_LUA',
  'RECOVERED_MISSION_METADATA_UPDATE_LUA',
  'JOB_CAS_CORE_LUA',
  'JOB_CAS_LUA',
  'JOB_RECOVERED_CAS_LUA',
];
const luaExpressions = luaNames.map((name) => {
  const stmt = luaTree.statements.find(
    (s) =>
      ts.isVariableStatement(s) &&
      s.declarationList.declarations.some((d) => d.name.getText(luaTree) === name),
  );
  assert.ok(stmt, name + ' is missing');
  return stmt.getText(luaTree);
});
const luaBox = { module: { exports: {} } };
vm.runInNewContext(
  luaExpressions.join('\n') + '\nmodule.exports={' + luaNames.join(',') + '};',
  luaBox,
  { timeout: 1000 },
);
const lua = luaBox.module.exports;

const snapshotText = fs.readFileSync(
  '/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts',
  'utf8',
);
const snapshotBox = { module: { exports: {} } };
vm.runInNewContext(
  ts.transpileModule(snapshotText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: snapshotBox, exports: snapshotBox.module.exports },
);
const { qualifyNativeMissionRecoverySnapshot } = snapshotBox.module.exports;

async function createSdkRun(checkpointer) {
  const run = await Run.create({
    runId: 'isolated-recovered-graph',
    graphConfig: {
      type: 'standard',
      compileOptions: { checkpointer, interruptBefore: ['worker'] },
      agents: [{ agentId: 'worker', provider: Providers.OPENAI, instructions: 'Return done.' }],
    },
  });
  run.Graph.overrideModel = new FakeChatModel({ responses: ['done'] });
  run.graphRunnable = run.Graph.createWorkflow();
  return run;
}
const config = {
  version: 'v2',
  durability: 'sync',
  configurable: { thread_id: 'isolated-recovered-graph' },
  recursionLimit: 12,
};

async function main() {
  const redis = new Redis(process.env.BOTMODE_TEST_REDIS_URI, { maxRetriesPerRequest: 1 });
  const mongo = new MongoClient(process.env.BOTMODE_TEST_MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  await mongo.connect();
  try {
    const saver = new MongoDBSaver({
      client: mongo,
      dbName: 'isolated_recovered_mission_integration',
      checkpointCollectionName: 'checkpoint',
      checkpointWritesCollectionName: 'writes',
    });
    const run = await createSdkRun(saver);
    const invoke = (name, arr, argv) =>
      redis.eval(lua[name], arr.length, ...arr, ...argv.map(String));
    const take = () =>
      invoke(
        'CLAIM_DRAINED_MISSION_RECOVERY_LUA',
        [keys[0], claimKey],
        [epoch, Date.now() - 60000, owner, 20000],
      );
    const promote = () =>
      invoke(
        'ACTIVATE_DRAINED_MISSION_RECOVERY_LUA',
        [keys[0], claimKey],
        [epoch, owner, nextProvider, Date.now()],
      );
    const begin = () =>
      invoke(
        'BEGIN_RECOVERED_MISSION_PROVIDER_LUA',
        [keys[0], claimKey],
        [epoch, owner, nextProvider, namespace, 20000],
      );
    const beat = () =>
      invoke(
        'HEARTBEAT_RECOVERED_MISSION_PROVIDER_LUA',
        [keys[0], claimKey],
        [epoch, owner, nextProvider, namespace, 20000, 1200],
      );
    const evidence = (who, value) =>
      invoke(
        'RECOVERED_MISSION_METADATA_UPDATE_LUA',
        [keys[0], claimKey],
        [epoch, who, nextProvider, 'missionOracleState', value],
      );
    const args = [
      'running',
      '',
      epoch,
      '',
      '3600',
      '1',
      '3600',
      '3600',
      '3600',
      '3600',
      '0',
      '0',
      '0',
      'status',
      'complete',
      'completedAt',
      Date.now(),
    ];
    const settle = (token = owner, provider = nextProvider, scope = namespace) =>
      invoke(
        'JOB_RECOVERED_CAS_LUA',
        [...keys, claimKey],
        [token, provider, scope, epoch, ...args],
      );
    if (phase === 'seed') {
      await redis.hset(keys[0], {
        createdAt: epoch,
        status: 'running',
        lastActiveAt: epoch,
        checkpointNamespace: namespace,
        orchestratorPlan: '{"tasks":[]}',
        providerExecutionId: oldProvider,
        providerExecutionStartedId: oldProvider,
        providerDrained: '0',
        __missionProviderLeaseUntil: String(Date.now() - 1000),
      });
      await run.processStream({ messages: [new HumanMessage('test')] }, config);
      const before = await run.graphRunnable.getState(config);
      const tuple = await saver.getTuple(config);
      assert.ok(qualifyNativeMissionRecoverySnapshot(before, tuple?.checkpoint?.id));
      console.log('RECOVERED_MISSION_SEED_DURABLE=PASS');
      await new Promise(() => {
        setInterval(() => {}, 1000);
      });
    } else if (phase === 'resume') {
      const before = await run.graphRunnable.getState(config);
      const tuple = await saver.getTuple(config);
      assert.deepEqual(before.next, ['worker']);
      assert.ok(qualifyNativeMissionRecoverySnapshot(before, tuple?.checkpoint?.id));
      assert.equal(await take(), 1);
      assert.equal(await promote(), 1);
      assert.equal(await begin(), 1);
      assert.equal(await beat(), 1);
      assert.equal(await evidence('stale-owner-123456', 'STALE'), 0);
      await run.processStream(new Command({}), config);
      const after = await run.graphRunnable.getState(config);
      assert.deepEqual(after.next, []);
      assert.equal(after.values.messages.length, 2);
      assert.equal(await evidence(owner, '{"evidence":{},"results":{}}'), 1);
      assert.equal(await settle('stale-owner-123456'), 0);
      assert.equal(await settle(owner, oldProvider), 0);
      assert.equal(await settle(owner, nextProvider, 'wrong-namespace'), 0);
      assert.equal(await settle(), 1);
      assert.equal(await settle(), 0);
      assert.equal(await redis.hget(keys[0], 'status'), 'complete');
      console.log('RECOVERED_MISSION_MONGO_REDIS_TERMINAL=PASS');
    } else {
      const state = await run.graphRunnable.getState(config);
      assert.deepEqual(state.next, []);
      assert.equal(state.values.messages.length, 2);
      assert.equal(
        qualifyNativeMissionRecoverySnapshot(state, (await saver.getTuple(config))?.checkpoint?.id),
        null,
      );
      assert.equal(await redis.hget(keys[0], 'status'), 'complete');
      assert.equal(await take(), 0);
      assert.equal(await settle(), 0);
      console.log('RECOVERED_MISSION_RETRY_NO_DUPLICATE=PASS');
    }
  } finally {
    if (phase !== 'seed') {
      await mongo.close();
      redis.disconnect();
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
