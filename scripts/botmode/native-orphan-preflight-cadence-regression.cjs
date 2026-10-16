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
const names = ['initialize', 'inspectCheckpointedOrphanedNativeMissions'];
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
  const manager = new Harness();
  manager._isRedis = true;
  manager.shuttingDown = false;
  manager.jobStore = { initialize: async () => {}, getJob: async () => null };
  manager.heartbeatOwnedMissionProviders = async () => {};
  manager.cleanup = async () => {};
  manager.activateDrainedMissionRecovery = () => {
    throw Error('inspection may never activate a provider');
  };
  manager.inspectCheckpointedOrphanedNativeMissions = async () => { scans++; return []; };
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
  assert.equal(warnings.length, 0);
  console.log('BOTMODE_NATIVE_RECOVERY_PREFLIGHT_CADENCE=PASS');

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
