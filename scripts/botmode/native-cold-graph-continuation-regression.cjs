'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const src = fs.readFileSync('/work/packages/api/src/agents/nativeMissionColdGraphContinuation.ts', 'utf8');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:mod,exports:mod.exports});
const { continueColdNativeMissionGraph } = mod.exports;
(async () => {
  const calls = [];
  const config = { streamId:'mission',checkpointNamespace:'generation',expectedCheckpointId:'head',plannedNodeIds:['worker'],signal:new AbortController().signal };
  const graph = {
    invoke: async (value, options) => { assert.equal(value,null); assert.equal(options.durability,'sync');
      assert.equal(options.configurable.nativeMissionEffectFenceRequired,true);
      assert.equal(options.configurable.__librechat_checkpoint_ns,'generation'); calls.push('invoke'); },
    getState: async () => { calls.push('state'); return calls.includes('invoke') ? { next: [], tasks: [] } : { config: { configurable: {checkpoint_id:'head',thread_id:'mission'} }, next:['worker'], tasks:[{ name:'worker', interrupts:[] }] }; },
  };
  await continueColdNativeMissionGraph({ ...config, graph });
  assert.deepEqual(calls,['state','invoke','state']);
  await assert.rejects(continueColdNativeMissionGraph({ ...config, graph,
    signal:(() => { const x=new AbortController();x.abort();return x.signal; })(),
  }), /DENIED/);
  assert.deepEqual(calls,['state','invoke','state']);
  await assert.rejects(continueColdNativeMissionGraph({ ...config, graph: {
    invoke: graph.invoke, getState: async () => ({next:['worker'],tasks:[{name:'worker'}]}),
  }}), /HEAD_MISMATCH/);
  await assert.rejects(continueColdNativeMissionGraph({ ...config, expectedCheckpointId:'other', graph }), /HEAD_MISMATCH/);
  await assert.rejects(continueColdNativeMissionGraph({ ...config, plannedNodeIds:['specialist'], graph }), /HEAD_MISMATCH/);
  console.log('BOTMODE_COLD_GRAPH_NON_HITL_FENCED_CONTINUATION=PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
