'use strict';
// C2 bounded process-level SIGKILL integration. Uses the source-built manager,
// production RedisJobStore and LibreChat Mongo checkpoint adapter, no API model.
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { StateGraph, Annotation, START, END } = require('@langchain/langgraph');
const {
  RedisJobStore, InMemoryEventTransport, GenerationJobManagerClass,
  getAgentCheckpointer, inspectDurableNativeMissionCheckpoint,
  LIBRECHAT_MISSION_SYNC_KEY, LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
} = require('@librechat/api');

const phase = process.argv[2] || 'orchestrate';
const streamId = process.env.C2_STREAM;
const checkpointNamespace = process.env.C2_SCOPE;
const mongoUri = process.env.C2_MONGO_URI || 'mongodb://127.0.0.1:27017/botmode_c2_isolated';
const redisUri = process.env.C2_REDIS_URI || 'redis://127.0.0.1:6379';
const providerExecutionId = 'c2-provider-original-12345';
const checkpointConfig = {
  configurable: {
    thread_id: streamId,
    checkpoint_ns: '',
    [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: checkpointNamespace,
    [LIBRECHAT_MISSION_SYNC_KEY]: true,
  },
  durability: 'sync',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connections() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const redis = new Redis(redisUri, { maxRetriesPerRequest: 1 });
  await redis.ping();
  return { redis, store: new RedisJobStore(redis, { completedTtl: 300, runningTtl: 300 }) };
}
async function close(redis) {
  await redis.quit();
  await mongoose.disconnect();
}
async function seed() {
  const { redis, store } = await connections();
  const job = await store.createJob(streamId, 'c2-test-user', streamId, 'c2-test-tenant', {
    providerExecutionId,
    checkpointNamespace,
    generationProtocolVersion: 2,
  });
  assert.equal(job.status, 'running');
  await store.updateJob(streamId, {
    orchestratorPlan: {
      tasks: [
        { key: 'research', taskId: 'c2/research', nodeId: 'first', agentId: 'research', validation: [] },
        { key: 'analysis', taskId: 'c2/analysis', nodeId: 'second', agentId: 'analysis', validation: [] },
      ],
    },
  }, job.createdAt);
  assert.equal(await store.beginProviderExecution(streamId, job.createdAt, providerExecutionId), true);
  const persisted = await store.getJob(streamId);
  assert.equal(persisted.status, 'running');
  assert.ok(persisted.checkpointNamespace, 'Redis must establish the durable generation scope');
  const durableScope = persisted.checkpointNamespace;
  const durableConfig = {
    ...checkpointConfig,
    configurable: { ...checkpointConfig.configurable, [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: durableScope },
  };
  console.log('C2_DURABLE_NAMESPACE_ALIGNED=' + String(durableScope === checkpointNamespace));
  const saver = await getAgentCheckpointer();
  assert.ok(saver);
  const state = Annotation.Root({ value: Annotation() });
  let entered;
  const secondStarted = new Promise((resolve) => { entered = resolve; });
  const graph = new StateGraph(state)
    .addNode('first', () => ({ value: 7 }))
    .addNode('second', async () => {
      await redis.incr(`c2:${streamId}:second_entered`);
      entered();
      await new Promise(() => {});
      return { value: 8 };
    })
    .addEdge(START, 'first')
    .addEdge('first', 'second')
    .addEdge('second', END)
    .compile({ checkpointer: saver });
  void graph.invoke({ value: 0 }, durableConfig).catch((error) => {
    console.error('UNEXPECTED_SEED_GRAPH_ERROR', error);
    process.exitCode = 1;
  });
  await secondStarted;
  const tuple = await inspectDurableNativeMissionCheckpoint(streamId, durableScope);
  assert.ok(tuple?.checkpointId, 'real durable Mongo checkpoint required before SIGKILL');
  const snapshot = await graph.getState(durableConfig);
  assert.deepEqual(snapshot.next, ['second']);
  assert.equal(snapshot.values.value, 7);
  assert.equal(await redis.get(`c2:${streamId}:second_entered`), '1');
  console.log('C2_SEED_CHECKPOINT_READY=' + tuple.checkpointId);
  // Remain alive until the parent sends a genuine SIGKILL.
  setInterval(() => {}, 1000);
}
async function recover() {
  const { redis, store } = await connections();
  try {
    const prior = await store.getJob(streamId);
    assert.ok(prior?.checkpointNamespace, 'Redis namespace must survive SIGKILL');
    const durableScope = prior.checkpointNamespace;
    const cp = await inspectDurableNativeMissionCheckpoint(streamId, durableScope);
    assert.ok(cp?.checkpointId, 'Mongo checkpoint must outlive the killed process');
    assert.equal(prior.status, 'running');
    assert.equal(prior.providerExecutionId, providerExecutionId);
    assert.equal(await redis.get(`c2:${streamId}:second_entered`), '1');
    const manager = new GenerationJobManagerClass({ jobStore: store, eventTransport: new InMemoryEventTransport() });
    manager.configure({ jobStore: store, eventTransport: new InMemoryEventTransport(), isRedis: true });
    manager.initialize();
    // Production manager retries its orphan preflight on its existing 5s loop.
    let settled;
    for (let n = 0; n < 55; n++) {
      settled = await store.getJob(streamId);
      if (settled?.error === 'OUTCOME_UNKNOWN') break;
      await sleep(1000);
    }
    if (settled?.status !== 'error') {
      const candidates = await manager.inspectOrphanedNativeMissions();
      const eligible = await manager.inspectCheckpointedOrphanedNativeMissions();
      const current = await store.getJob(streamId);
      const raw = await redis.hmget(`stream:{${streamId}}:job`,
        'lastActiveAt', '__missionProviderLeaseUntil', 'providerDrained',
        'providerExecutionStartedId', 'checkpointNamespace');
      console.log('C2_FAIL_CLOSED_DIAG=' + JSON.stringify({
        candidates: candidates.length, eligible: eligible.length,
        status: current?.status, providerDrained: current?.providerDrained,
        sameScope: current?.checkpointNamespace === durableScope,
        raw,
      }));
    }
    assert.equal(settled?.status, 'error', 'orphan must exit running');
    assert.equal(settled.error, 'OUTCOME_UNKNOWN');
    assert.equal(settled.providerExecutionId, providerExecutionId, 'no new provider');
    assert.equal(settled.finalEvent, undefined, 'no final P6');
    assert.equal(await redis.get(`c2:${streamId}:second_entered`), '1', 'uncertain node was not retried');
    const cpAfter = await inspectDurableNativeMissionCheckpoint(streamId, durableScope);
    assert.equal(cpAfter?.checkpointId, cp.checkpointId, 'saved completed stage retained');
    assert.equal(await store.transitionStatus(streamId, {
      from: 'running', to: 'error', expectCreatedAt: prior.createdAt,
      patch: { error: 'OUTCOME_UNKNOWN' },
    }), false, 'single final CAS');
    console.log('BOTMODE_C2_REAL_SIGKILL_MONGO_REDIS_UNKNOWN_NO_REPLAY=PASS');
    console.log('BOTMODE_C2_COMPLETED_STAGE_CHECKPOINT_PRESERVED=PASS');
    await manager.destroy();
  } finally {
    await close(redis);
  }
}
async function orchestrate() {
  const id = 'c2-' + crypto.randomBytes(6).toString('hex');
  const scope = 'scope-' + crypto.randomBytes(6).toString('hex');
  const env = { ...process.env, C2_STREAM: id, C2_SCOPE: scope };
  const child = fork(__filename, ['seed'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let childOutput = '';
  child.stdout.on('data', (chunk) => { const t = String(chunk); childOutput += t; process.stdout.write(t); });
  child.stderr.on('data', (chunk) => { process.stderr.write(chunk); });
  let exit;
  const stopped = new Promise((resolve) => { child.once('exit', (code, signal) => { exit = { code, signal }; resolve(); }); });
  const ready = async () => {
    for (let i = 0; i < 150; i++) {
      if (childOutput.includes('C2_SEED_CHECKPOINT_READY=')) return;
      if (exit) throw new Error('seed process exited without checkpoint: ' + JSON.stringify(exit));
      await sleep(200);
    }
    throw new Error('seed did not reach durable boundary');
  };
  try {
    await ready();
    assert.equal(child.kill('SIGKILL'), true);
    await stopped;
    assert.equal(exit.signal, 'SIGKILL', 'must kill the real seed process');
    console.log('BOTMODE_C2_REAL_SIGKILL=PASS');
    // A fresh process will load the persisted job, Mongo saver and manager.
    const next = fork(__filename, ['recover'], { env, stdio: 'inherit' });
    const status = await new Promise((resolve) => next.once('exit', (code, signal) => resolve({ code, signal })));
    assert.deepEqual(status, { code: 0, signal: null });
  } finally {
    if (!exit) { child.kill('SIGKILL'); await stopped; }
  }
}
const tasks = { seed, recover, orchestrate };
(tasks[phase] ?? (() => { throw new Error('invalid mode'); }))().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
