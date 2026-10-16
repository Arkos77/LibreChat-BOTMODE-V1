'use strict';

// Run in a disposable container with @librechat/agents v3.7.17 installed.
// This is a characterization gate, NOT proof of SIGKILL or external side-effect safety.
const assert = require('node:assert/strict');
const { Run, Providers, FakeChatModel } = require('@librechat/agents');
const { MemorySaver, Command } = require('@langchain/langgraph');
const { HumanMessage } = require('@langchain/core/messages');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const snapshotSource = fs.readFileSync(
  '/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts', 'utf8',
);
const snapshotModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(snapshotSource, {
    fileName: 'nativeMissionRecoverySnapshot.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module: snapshotModule, exports: snapshotModule.exports },
);
const { qualifyNativeMissionRecoverySnapshot } = snapshotModule.exports;

async function main() {
  const checkpointer = new MemorySaver();
  const config = {
    version: 'v2',
    durability: 'sync',
    configurable: { thread_id: 'botmode-sdk-cold-checkpoint-regression' },
    recursionLimit: 12,
  };
  const createRun = async () => {
    const run = await Run.create({
      runId: 'botmode-sdk-cold-checkpoint-regression',
      graphConfig: {
        type: 'standard',
        compileOptions: { checkpointer, interruptBefore: ['worker'] },
        agents: [{ agentId: 'worker', provider: Providers.OPENAI, instructions: 'Return done.' }],
      },
    });
    assert.ok(run.Graph);
    run.Graph.overrideModel = new FakeChatModel({ responses: ['done'] });
    run.graphRunnable = run.Graph.createWorkflow();
    return run;
  };

  const first = await createRun();
  await first.processStream({ messages: [new HumanMessage('test')] }, config);
  const interrupted = await first.graphRunnable.getState(config);
  assert.deepEqual(interrupted.next, ['worker']);
  assert.equal(interrupted.values.messages.length, 1);
  const checkpointId = interrupted.config?.configurable?.checkpoint_id;
  assert.equal(typeof checkpointId, 'string');
  const admission = qualifyNativeMissionRecoverySnapshot(interrupted, checkpointId);
  assert.deepEqual(Array.from(admission?.pendingNodes ?? []), ['worker']);
  assert.equal(qualifyNativeMissionRecoverySnapshot(interrupted, 'wrong-generation'), null);
  assert.equal(qualifyNativeMissionRecoverySnapshot(
    { ...interrupted, tasks: [{ name: 'worker', interrupts: [{ id: 'human-decision' }] }] },
    checkpointId,
  ), null);

  const second = await createRun();
  await second.processStream(new Command({}), config);
  const resumed = await second.graphRunnable.getState(config);
  assert.deepEqual(resumed.next, []);
  assert.equal(resumed.values.messages.length, 2);
  assert.equal(qualifyNativeMissionRecoverySnapshot(
    resumed, resumed.config?.configurable?.checkpoint_id,
  ), null);

  const third = await createRun();
  await third.processStream(new Command({}), config);
  const retried = await third.graphRunnable.getState(config);
  assert.deepEqual(retried.next, []);
  assert.equal(retried.values.messages.length, 2);
  console.log('BOTMODE_SDK_COLD_CHECKPOINT_REGRESSION=PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
