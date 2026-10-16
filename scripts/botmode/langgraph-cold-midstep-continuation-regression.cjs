'use strict';
// Characterize raw LangGraph (no HITL interruptBefore) over a real Mongo saver.
// The first process hangs in phase B *after* phase A is durably checkpointed.
// A new process must resume from the latest checkpoint without repeating A.
const assert = require('node:assert/strict');
const { StateGraph, Annotation, START, END, Command } = require('@langchain/langgraph');
const { MongoDBSaver } = require('@langchain/langgraph-checkpoint-mongodb');
const { MongoClient } = require('mongodb');
const phase = process.argv[2];
const message = phase === 'seed' ? 'x' : undefined;
assert.ok(['seed', 'resume', 'verify'].includes(phase));

const base = Annotation.Root({
  countA: Annotation({ reducer: (a, b) => (a || 0) + b, default: () => 0 }),
  countB: Annotation({ reducer: (a, b) => (a || 0) + b, default: () => 0 }),
});
const mongo = new MongoClient(process.env.BOTMODE_TEST_MONGO_URI, {
  serverSelectionTimeoutMS: 8000,
});
const config = {
  configurable: { thread_id: 'cold-middle-of-graph' },
  durability: 'sync',
};
async function main() {
  await mongo.connect();
  const saver = new MongoDBSaver({
    client: mongo,
    dbName: 'cold_middle_graph_qualification',
    checkpointCollectionName: 'checkpoint',
    checkpointWritesCollectionName: 'writes',
  });
  let calledA = 0;
  const graph = new StateGraph(base)
    .addNode('phaseA', async () => {
      calledA++;
      console.log('MIDDLE_GRAPH_PHASE_A_CALLED=' + calledA);
      return { countA: 1 };
    })
    .addNode('phaseB', async () => {
      if (phase === 'seed') {
        console.log('MIDDLE_GRAPH_PHASE_B_ENTERED=PASS');
        await new Promise(() => {});
      }
      return { countB: 1 };
    })
    .addEdge(START, 'phaseA')
    .addEdge('phaseA', 'phaseB')
    .addEdge('phaseB', END)
    .compile({ checkpointer: saver });
  try {
    if (phase === 'seed') {
      // Do not await -- this intentionally hangs in phase B.
      void graph.invoke({ countA: 0, countB: 0 }, config);
      let checkpoint;
      for (let i = 0; i < 80; i++) {
        checkpoint = await graph.getState(config);
        if (checkpoint?.next?.includes('phaseB')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(checkpoint?.next?.includes('phaseB'), 'durable pre-B checkpoint not found');
      assert.equal(checkpoint.values.countA, 1);
      assert.equal(checkpoint.values.countB, 0);
      console.log('MIDDLE_GRAPH_PRE_KILL_DURABLE=PASS');
      await new Promise(() => {});
    } else if (phase === 'resume') {
      const pre = await graph.getState(config);
      assert.deepEqual(pre.next, ['phaseB']);
      assert.equal(pre.values.countA, 1);
      assert.equal(pre.values.countB, 0);
      // LangGraph graph API (not Run.processStream or Run.resume): explicit
      // continuation without a fresh user input, never overwrite the state.
      await assert.rejects(
        () => graph.invoke(new Command({}), config),
        /Received empty Command input/,
      );
      const pending = await graph.getState(config);
      assert.deepEqual(pending.next, ['phaseB']);
      const result = await graph.invoke(null, config);
      assert.equal(result.countA, 1);
      assert.equal(result.countB, 1);
      assert.equal(calledA, 0, 'Phase A must not be reexecuted after SIGKILL');
      const after = await graph.getState(config);
      assert.deepEqual(after.next, []);
      console.log('MIDDLE_GRAPH_NULL_COLD_CONTINUATION=PASS');
    } else {
      const after = await graph.getState(config);
      assert.deepEqual(after.next, []);
      assert.equal(after.values.countA, 1);
      assert.equal(after.values.countB, 1);
      console.log('MIDDLE_GRAPH_DURABLE_TERMINAL=PASS');
    }
  } finally {
    await mongo.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
