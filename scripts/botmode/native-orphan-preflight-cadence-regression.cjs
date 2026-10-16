'use strict';
// Execute actual manager initialize() / checkpoint preflight methods under a
// deterministic clock. No provider or task is ever started in this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const filename = '/work/packages/api/src/stream/GenerationJobManager.ts';
const source = fs.readFileSync(filename, 'utf8');
const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
const managerClass = tree.statements.find((s) => ts.isClassDeclaration(s) &&
  s.name?.text === 'GenerationJobManagerClass');
assert.ok(managerClass);
const names = ['initialize', 'inspectCheckpointedOrphanedNativeMissions',
  'setNativeMissionRecoveryHandler', 'dispatchCheckpointedOrphanedNativeMissions'];
const methods = names.map((name) => {
  const node = managerClass.members.find((m) => ts.isMethodDeclaration(m) &&
    m.name.getText(tree) === name);
  assert.ok(node, name);
  return node.getText(tree);
});
const callbacks = [];
let now = 1700000000000;
let checkpointBarrier = null;
const warnings = [];
const moduleBox = { exports: null };
const src = ts.transpileModule('class Harness {' + methods.join('\n') +
  '}\nmodule.exports=Harness;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(src, {
  module: moduleBox,
  Date: { now: () => now },
  setInterval: (cb, period) => {
    const timer = { cb, period, unref() {} };
    callbacks.push(timer);
    return timer;
  },
  logger: { debug() {}, warn: (...args) => warnings.push(args) },
  inspectDurableNativeMissionCheckpoint: async () => {
    if (checkpointBarrier) return checkpointBarrier;
    return { checkpointId: 'checkpoint-1' };
  },
});
const Harness = moduleBox.exports;
const flush = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  let scans = 0;
  let delivered = 0;
  const startupCandidate = {
    streamId: 'orphan-startup', createdAt: 1700000000000,
    checkpointNamespace: 'scoped', checkpointId: 'head-1',
  };
  const manager = new Harness();
  manager._isRedis = true;
  manager.shuttingDown = false;
  manager.jobStore = { initialize: async () => {}, getJob: async () => null };
  manager.heartbeatOwnedMissionProviders = async () => {};
  manager.cleanup = async () => {};
  manager.activateDrainedMissionRecovery = () => {
    throw Error('inspection may never activate a provider');
  };
  manager.nativeMissionRecoveryInFlight = new Set();
  manager.inspectCheckpointedOrphanedNativeMissions = async () => {
    scans++;
    return [startupCandidate];
  };
  manager.setNativeMissionRecoveryHandler(async (candidate) => {
    assert.ok(Object.isFrozen(candidate));
    assert.equal(candidate.streamId, startupCandidate.streamId);
    delivered++;
  });
  manager.initialize();
  await flush();
  assert.equal(scans, 1);
  const heartbeat = callbacks.find((timer) => timer.period === 5000);
  const cleanup = callbacks.find((timer) => timer.period === 60000);
  assert.ok(heartbeat && cleanup);
  for (let i = 1; i <= 6; i++) {
    now += 5000;
    heartbeat.cb();
    await flush();
    assert.equal(scans, 1 + Math.floor(i / 3));
  }
  assert.equal(scans, 3);
  assert.equal(delivered, 3);
  assert.equal(warnings.length, 0);
  console.log('BOTMODE_NATIVE_RECOVERY_PREFLIGHT_CADENCE=PASS');

  const noHost = new Harness();
  noHost.shuttingDown = false;
  noHost._isRedis = true;
  noHost.nativeMissionRecoveryInFlight = new Set();
  noHost.inspectCheckpointedOrphanedNativeMissions = async () => {
    throw Error('no host must never trigger orphan claim');
  };
  await noHost.dispatchCheckpointedOrphanedNativeMissions();
  console.log('BOTMODE_NATIVE_RECOVERY_NO_HOST_FAIL_CLOSED=PASS');

  let unblock;
  let blockers = 0;
  manager.setNativeMissionRecoveryHandler(async () => {
    blockers++;
    await new Promise((resolve) => { unblock = resolve; });
  });
  const firstDispatch = manager.dispatchCheckpointedOrphanedNativeMissions();
  await flush();
  const secondDispatch = manager.dispatchCheckpointedOrphanedNativeMissions();
  await flush();
  assert.equal(blockers, 1);
  unblock();
  await Promise.all([firstDispatch, secondDispatch]);
  assert.equal(manager.nativeMissionRecoveryInFlight.size, 0);
  console.log('BOTMODE_NATIVE_RECOVERY_DISPATCH_SINGLE_FLIGHT=PASS');

  manager.setNativeMissionRecoveryHandler(async () => {
    throw new Error('host authorization failure');
  });
  await manager.dispatchCheckpointedOrphanedNativeMissions();
  assert.equal(manager.nativeMissionRecoveryInFlight.size, 0);
  assert.equal(warnings.length, 1);
  console.log('BOTMODE_NATIVE_RECOVERY_HOST_FAILURE_ISOLATED=PASS');

  const candidate = {
    streamId: 'orphan', createdAt: 1700000000000,
    checkpointNamespace: 'scoped', checkpointId: 'checkpoint-1',
  };
  const scanner = new Harness();
  scanner.shuttingDown = false;
  scanner.missionCheckpointPreflightBusy = false;
  scanner.inspectOrphanedNativeMissions = async () => [candidate];
  scanner.jobStore = { getJob: async () => ({
    ...candidate, status: 'running', orchestratorPlan: { tasks: [] }, providerDrained: false,
  }) };
  let resolveCheckpoint;
  checkpointBarrier = new Promise((resolve) => { resolveCheckpoint = resolve; });
  const slow = scanner.inspectCheckpointedOrphanedNativeMissions();
  await flush();
  const overlapping = await scanner.inspectCheckpointedOrphanedNativeMissions();
  assert.equal(Array.from(overlapping).length, 0);
  resolveCheckpoint({ checkpointId: candidate.checkpointId });
  const first = await slow;
  assert.equal(first.length, 1);
  assert.equal(first[0].checkpointNamespace, 'scoped');
  assert.equal(scanner.missionCheckpointPreflightBusy, false);
  console.log('BOTMODE_NATIVE_PREFLIGHT_SINGLE_FLIGHT=PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
