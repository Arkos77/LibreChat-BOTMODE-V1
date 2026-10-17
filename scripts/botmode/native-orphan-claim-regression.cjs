'use strict';
/**
 * Executes the real claimCheckpointedOrphanForInspection method extracted
 * from the manager source, with deterministic storage/checkpoint doubles.
 * This isolates the fail-closed control logic without booting production services.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sourcePath = '/work/packages/api/src/stream/GenerationJobManager.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === 'GenerationJobManagerClass',
);
assert.ok(cls, 'manager class missing');
const method = cls.members.find(
  (node) => ts.isMethodDeclaration(node) &&
    node.name.getText(ast) === 'claimCheckpointedOrphanForInspection',
);
assert.ok(method, 'recovery claim method missing');
const compiled = ts.transpileModule(
  'class Harness {' + method.getText(ast) + '}\nmodule.exports=Harness;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

const generation = 1700000000000;
const candidate = {
  streamId: 'qualification-orphan', createdAt: generation,
  checkpointNamespace: 'qualification-scope', checkpointId: 'qualified-head',
};
let checkpoint = { checkpointId: candidate.checkpointId };
let logCount = 0;
const context = {
  module: { exports: {} },
  randomUUID: () => 'abcdef01-2345-6789-abcd-ef0123456789',
  inspectDurableNativeMissionCheckpoint: async () => checkpoint,
  logger: { warn: () => { logCount++; } },
};
vm.runInNewContext(compiled, context, { timeout: 1000 });
const Harness = context.module.exports;

async function scenario({ claimed = true, status = 'running', nextHead = candidate.checkpointId,
                          crashOnRead = false, swapStore = false, missingCapability = false } = {}) {
  const calls = { claim: 0, release: 0, activation: 0 };
  checkpoint = nextHead ? { checkpointId: nextHead } : null;
  const job = {
    ...candidate, status, orchestratorPlan: { tasks: [] },
    providerDrained: false, providerExecutionStartedId: 'run-A', providerExecutionId: 'run-A',
  };
  const manager = new Harness();
  manager._isRedis = true;
  manager.shuttingDown = false;
  const store = {
    claimDrainedMissionRecovery: async (_stream, epoch, stale, token, ttl) => {
      calls.claim++;
      assert.equal(epoch, generation);
      assert.equal(ttl, 15000);
      assert.ok(stale <= Date.now() - 19000 && stale >= Date.now() - 21000);
      assert.match(token, /^mission-[\da-f-]{36}$/);
      if (swapStore) manager.jobStore = { getJob: async () => job };
      return claimed;
    },
    releaseDrainedMissionRecovery: async (_stream, epoch, _token) => {
      calls.release++;
      assert.equal(epoch, generation);
      return true;
    },
    getJob: async () => {
      if (crashOnRead) throw new Error('database-offline');
      return job;
    },
    activateDrainedMissionRecovery: () => { calls.activation++; throw Error('activation forbidden'); },
  };
  if (missingCapability) delete store.claimDrainedMissionRecovery;
  manager.jobStore = store;
  manager.inspectCheckpointedOrphanedNativeMissions = async () => [candidate];
  return { manager, calls };
}

async function main() {
  {
    const { manager, calls } = await scenario();
    const result = await manager.claimCheckpointedOrphanForInspection(candidate.streamId, generation);
    assert.equal(result.checkpointId, candidate.checkpointId);
    assert.match(result.ownerToken, /^mission-/);
    assert.deepEqual(calls, { claim: 1, release: 0, activation: 0 });
  }
  {
    const { manager, calls } = await scenario({ claimed: false });
    assert.equal(await manager.claimCheckpointedOrphanForInspection(candidate.streamId, generation), null);
    assert.deepEqual(calls, { claim: 1, release: 0, activation: 0 });
  }
  for (const options of [{ nextHead: 'different' }, { status: 'complete' }, { nextHead: null },
                         { swapStore: true }]) {
    const { manager, calls } = await scenario(options);
    assert.equal(await manager.claimCheckpointedOrphanForInspection(candidate.streamId, generation), null);
    assert.deepEqual(calls, { claim: 1, release: 1, activation: 0 });
  }
  {
    const { manager, calls } = await scenario({ crashOnRead: true });
    await assert.rejects(manager.claimCheckpointedOrphanForInspection(candidate.streamId, generation),
      /database-offline/);
    assert.deepEqual(calls, { claim: 1, release: 1, activation: 0 });
  }
  {
    const { manager, calls } = await scenario({ missingCapability: true });
    assert.equal(await manager.claimCheckpointedOrphanForInspection(candidate.streamId, generation), null);
    assert.deepEqual(calls, { claim: 0, release: 0, activation: 0 });
  }
  console.log('BOTMODE_NATIVE_ORPHAN_CLAIM_REGRESSION=PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
