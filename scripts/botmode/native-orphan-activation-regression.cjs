'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const managerPath = '/work/packages/api/src/stream/GenerationJobManager.ts';
const managerTree = ts.createSourceFile(managerPath, fs.readFileSync(managerPath, 'utf8'), ts.ScriptTarget.Latest, true);
const klass = managerTree.statements.find((n) => ts.isClassDeclaration(n) &&
  n.name?.text === 'GenerationJobManagerClass');
assert.ok(klass);
const method = klass.members.find((n) => ts.isMethodDeclaration(n) &&
  n.name.getText(managerTree) === 'activateCheckpointedOrphanAfterGraphQualification');
assert.ok(method);
const snapshotSource = fs.readFileSync(
  '/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts', 'utf8',
);
const compiled = ts.transpileModule(
  'class Harness {' + method.getText(managerTree) + '}\nmodule.exports=Harness;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
const scope = {
  module: { exports: {} },
  randomUUID: () => '12345678-1234-1234-1234-123456789abc',
  inspectDurableNativeMissionCheckpoint: async () => ({ checkpointId: 'head-123' }),
  logger: { warn: () => {} },
};
const snapMod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(snapshotSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: snapMod, exports: snapMod.exports },
);
scope.qualifyNativeMissionRecoverySnapshot = snapMod.exports.qualifyNativeMissionRecoverySnapshot;
vm.runInNewContext(compiled, scope);
const Harness = scope.module.exports;
const claim = {
  streamId: 'orphan-123', createdAt: 1700000000000,
  checkpointNamespace: 'generation-ns', checkpointId: 'head-123',
  ownerToken: 'mission-valid-owner-1234',
};
const snapshot = {
  config: { configurable: { checkpoint_id: 'head-123', thread_id: claim.streamId } },
  next: ['worker'],
  tasks: [{ name: 'worker', interrupts: [] }],
};

async function runCase({ mutateSnapshot, invalidJob, denyPolicy, activated = true,
  swapStore = false, shutdown = false, denyReplay = false,
  omitReplayGate = false, switchPlan = false, invalidPlan = false } = {}) {
  const calls = { auth: 0, replay: 0, promote: 0, release: 0 };
  const manager = new Harness();
  let planReads = 0;
  manager._isRedis = true;
  manager.shuttingDown = shutdown;
  const store = {
    activateDrainedMissionRecovery: async (streamId, createdAt, token, nextId) => {
      calls.promote++;
      assert.equal(streamId, claim.streamId);
      assert.equal(createdAt, claim.createdAt);
      assert.equal(token, claim.ownerToken);
      assert.match(nextId, /^recovered-/);
      return activated;
    },
    releaseDrainedMissionRecovery: async (_stream, _created, owner) => {
      calls.release++;
      assert.equal(owner, claim.ownerToken);
      return true;
    },
    getJob: async () => {
      planReads++;
      return {
        createdAt: claim.createdAt,
        status: invalidJob ? 'complete' : 'running',
        checkpointNamespace: claim.checkpointNamespace,
        orchestratorPlan: {
          tasks: invalidPlan
            ? [{ nodeId: '', agentId: 'agent-A' }]
            : switchPlan && planReads > 1
              ? [{ nodeId: 'specialist', agentId: 'agent-B' }]
              : [{ nodeId: 'worker', agentId: 'agent-A' }],
        },
        providerDrained: false,
        providerExecutionId: 'original-provider',
        providerExecutionStartedId: 'original-provider',
      };
    },
  };
  manager.jobStore = store;
  const authorize = async () => {
    calls.auth++;
    if (swapStore) manager.jobStore = { ...store };
    if (denyPolicy) throw new Error('authorization denied');
  };
  const verifyReplay = async (pendingNodes) => {
    calls.replay++;
    assert.deepEqual(Array.from(pendingNodes), ['worker']);
    if (denyReplay) throw new Error('unsafe pending tool replay');
  };
  let result = null;
  let error = null;
  try {
    result = await manager.activateCheckpointedOrphanAfterGraphQualification(
      claim, mutateSnapshot ?? snapshot, authorize,
      omitReplayGate ? undefined : verifyReplay,
    );
  } catch (e) { error = e; }
  return { result, calls, error };
}
(async () => {
  const ok = await runCase();
  assert.ok(ok.result?.providerExecutionId.startsWith('recovered-'));
  assert.deepEqual(ok.calls, { auth: 1, replay: 1, promote: 1, release: 0 });

  for (const invalidSnapshot of [
    { ...snapshot, next: [] },
    { ...snapshot, config: { configurable: { checkpoint_id: 'other' } } },
    { ...snapshot, tasks: [{ name: 'worker', interrupts: [{ id: 'human' }] }] },
    { ...snapshot, config: { configurable: { checkpoint_id: 'head-123', thread_id: 'foreign-user-thread' } } },
    { ...snapshot, next: ['unknown-agent'], tasks: [{ name: 'unknown-agent', interrupts: [] }] },
  ]) {
    const bad = await runCase({ mutateSnapshot: invalidSnapshot });
    assert.equal(bad.result, null);
    assert.deepEqual(bad.calls, { auth: 0, replay: 0, promote: 0, release: 1 });
  }
  for (const opts of [
    { invalidJob: true }, { invalidPlan: true },
    { activated: false }, { swapStore: true }, { switchPlan: true },
  ]) {
    const bad = await runCase(opts);
    assert.equal(bad.result, null);
    const earlyDenied = opts.invalidJob === true || opts.invalidPlan === true;
    assert.deepEqual(bad.calls, {
      auth: earlyDenied ? 0 : 1,
      replay: earlyDenied ? 0 : 1,
      promote: opts.activated === false ? 1 : 0,
      release: 1,
    });
  }
  const denied = await runCase({ denyPolicy: true });
  assert.match(denied.error?.message ?? '', /authorization denied/);
  assert.deepEqual(denied.calls, { auth: 1, replay: 0, promote: 0, release: 1 });
  const deniedReplay = await runCase({ denyReplay: true });
  assert.match(deniedReplay.error?.message ?? '', /unsafe pending tool replay/);
  assert.deepEqual(deniedReplay.calls, { auth: 1, replay: 1, promote: 0, release: 1 });
  const missingReplay = await runCase({ omitReplayGate: true });
  assert.equal(missingReplay.result, null);
  assert.deepEqual(missingReplay.calls, { auth: 0, replay: 0, promote: 0, release: 0 });
  const stopped = await runCase({ shutdown: true });
  assert.equal(stopped.result, null);
  assert.deepEqual(stopped.calls, { auth: 0, replay: 0, promote: 0, release: 0 });
  console.log('BOTMODE_ORPHAN_GRAPH_ACTIVATION=PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
