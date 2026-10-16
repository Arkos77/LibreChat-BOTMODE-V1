'use strict';
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');
const { MongoDBSaver } = require('@langchain/langgraph-checkpoint-mongodb');
const { Run, Providers, FakeChatModel } = require('@librechat/agents');
const { Command } = require('@langchain/langgraph');
const { HumanMessage } = require('@langchain/core/messages');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const snapshotModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync('/work/packages/api/src/agents/nativeMissionRecoverySnapshot.ts', 'utf8'),
    { fileName: 'nativeMissionRecoverySnapshot.ts',
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { module: snapshotModule, exports: snapshotModule.exports },
);
const { qualifyNativeMissionRecoverySnapshot } = snapshotModule.exports;


async function main() {
  const phase = process.argv[2];
  assert.ok(['seed','resume','retry'].includes(phase));
  const client = new MongoClient(process.env.BOTMODE_TEST_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const checkpointer = new MongoDBSaver({
      client,
      dbName: 'botmode_sdk_cold_checkpoint_qualification',
      checkpointCollectionName: 'isolated_checkpoints',
      checkpointWritesCollectionName: 'isolated_checkpoint_writes',
    });
    const config = {
      version: 'v2',
      durability: 'sync',
      configurable: { thread_id: 'botmode-test-cold-restart-thread' },
      recursionLimit: 12,
    };
    const run = await Run.create({
      runId: 'botmode-sdk-mongo-cold-restart',
      graphConfig: {
        type: 'standard',
        compileOptions: { checkpointer, interruptBefore: ['worker'] },
        agents: [{ agentId: 'worker', provider: Providers.OPENAI, instructions: 'Return done.' }],
      },
    });
    assert.ok(run.Graph);
    run.Graph.overrideModel = new FakeChatModel({ responses: ['done'] });
    run.graphRunnable = run.Graph.createWorkflow();
    if (phase === 'seed') await run.processStream({ messages: [new HumanMessage('test')] }, config);
    else await run.processStream(new Command({}), config);
    const state = await run.graphRunnable.getState(config);
    assert.deepEqual(state.next, phase === 'seed' ? ['worker'] : []);
    assert.ok((await checkpointer.getTuple(config))?.checkpoint?.id);
    const durableId = (await checkpointer.getTuple(config))?.checkpoint?.id;
    const qualified = qualifyNativeMissionRecoverySnapshot(state, durableId);
    if (phase === 'seed') {
      assert.deepEqual(Array.from(qualified?.pendingNodes ?? []), ['worker']);
      assert.equal(qualifyNativeMissionRecoverySnapshot(state, 'another-generation-id'), null);
    } else {
      assert.equal(qualified, null, 'completed graph is not recoverable');
    }

    assert.equal(state.tasks?.some((task) => task.interrupts?.length > 0), false);
    assert.equal(state.values.messages.length, phase === 'seed' ? 1 : 2);
    console.log('BOTMODE_MONGO_SDK_' + phase.toUpperCase() + '=PASS');
  } finally {
    await client.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
