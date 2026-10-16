'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
const file = '/work/packages/api/src/agents/nativeMissionEffectExecution.ts';
const source = fs.readFileSync(file, 'utf8');
const output = ts.transpileModule(source, {
  fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { module: mod, exports: mod.exports });
const { executeNativeMissionEffectFenced, NativeMissionEffectUncertainError } = mod.exports;
const digest = (v) => crypto.createHash('sha256').update(v).digest('hex');
const identity = {
  streamId:'mission-test', createdAt:1700000000000,
  checkpointNamespace:'1700000000000', providerExecutionId:'provider-qualified-1',
  recoveryOwnerToken:'owner-qualified-1',
  operationKey:digest('plan/task/node/call/tool'), argumentsDigest:digest('canonical-args'),
};
function makeCase({ denyAt = 0, failPersist = false, failCommit = false, failExecute = false,
  brokenLoad = false, missing = false } = {}) {
  let authorized = 0, executions = 0, writes = 0, loads = 0;
  const receipts = new Map();
  const results = new Map();
  const store = {
    async reserveNativeMissionEffect(id) {
      const record = receipts.get(id.operationKey);
      if (record) return {accepted:false,reason:record.state==='started'?'uncertain':'already_committed'};
      receipts.set(id.operationKey, {state:'started'});
      return {accepted:true,reason:'reserved'};
    },
    async commitNativeMissionEffect(record) {
      if (failCommit) return {accepted:false,reason:'owner'};
      const receipt = receipts.get(record.operationKey);
      if (!receipt || receipt.state!=='started') return {accepted:false,reason:'missing_intent'};
      receipts.set(record.operationKey, {...record,state:'committed'});
      return {accepted:true,reason:'committed'};
    },
    async readNativeMissionEffect(id) {
      const receipt = receipts.get(id.operationKey);
      return receipt?.state==='committed'
        ? { accepted:true,reason:'committed',resultRef:receipt.resultRef,
            resultDigest:receipt.resultDigest }
        : {accepted:false,reason:'uncertain'};
    },
  };
  const opts = {
    store: missing ? null : store,
    identity,
    assertAuthorized: async () => {
      authorized++;
      if (authorized === denyAt) throw new Error('CURRENT_AUTH_DENIED');
    },
    execute: async () => {
      executions++;
      if (failExecute) throw new Error('EFFECT_RESPONSE_UNKNOWN');
      return {content:'success',executionIndex:executions};
    },
    persistResult: async (result) => {
      writes++;
      if (failPersist) throw new Error('RESULT_PERSISTENCE_UNKNOWN');
      const output = JSON.stringify(result);
      const resultDigest = digest(output), resultRef = 'private://result/' + resultDigest;
      results.set(resultRef, output);
      return {resultDigest,resultRef};
    },
    loadCommittedResult: async (ref,hash) => {
      loads++;
      const output = results.get(ref);
      if (brokenLoad || !output || digest(output)!==hash) throw new Error('RESULT_HASH_DENIED');
      return JSON.parse(output);
    },
  };
  return {opts,reads:()=>({authorized,executions,writes,loads}),receipts,results};
}
(async()=>{
  let x=makeCase();
  let first=await executeNativeMissionEffectFenced(x.opts);
  assert.deepEqual(first,{content:'success',executionIndex:1});
  assert.deepEqual(x.reads(),{authorized:3,executions:1,writes:1,loads:0});
  let again=await executeNativeMissionEffectFenced(x.opts);
  assert.deepEqual(again,first);
  assert.deepEqual(x.reads(),{authorized:5,executions:1,writes:1,loads:1});
  console.log('BOTMODE_EXECUTION_ADAPTER_REUSES_ONLY_DURABLE_OUTPUT=PASS');

  for(const options of [
    {failPersist:true}, {failCommit:true}, {failExecute:true}, {denyAt:2},
  ]) {
    x=makeCase(options);
    await assert.rejects(executeNativeMissionEffectFenced(x.opts));
    assert.ok(x.receipts.has(identity.operationKey),'intent must survive every ambiguous failure');
    await assert.rejects(
      executeNativeMissionEffectFenced(x.opts),
      (error)=>error instanceof NativeMissionEffectUncertainError,
    );
    assert.equal(x.reads().executions, options.denyAt === 2 ? 0 : 1);
  }
  console.log('BOTMODE_EXECUTION_ADAPTER_CRASH_AND_DENIAL_NEVER_REPLAY=PASS');

  x=makeCase({denyAt:1});
  await assert.rejects(executeNativeMissionEffectFenced(x.opts),/CURRENT_AUTH_DENIED/);
  assert.equal(x.reads().executions,0);
  assert.equal(x.receipts.size,0);
  x=makeCase({missing:true});
  await assert.rejects(
    executeNativeMissionEffectFenced(x.opts),
    (error)=>error instanceof NativeMissionEffectUncertainError,
  );
  assert.equal(x.reads().executions,0);
  console.log('BOTMODE_EXECUTION_ADAPTER_MISSING_GRANT_FAILS_CLOSED=PASS');

  x=makeCase();
  first=await executeNativeMissionEffectFenced(x.opts);
  x.results.clear();
  await assert.rejects(executeNativeMissionEffectFenced(x.opts),/RESULT_HASH_DENIED/);
  assert.equal(x.reads().executions,1);
  console.log('BOTMODE_EXECUTION_ADAPTER_MISSING_PRIVATE_RESULT_NO_REEXECUTION=PASS');
})().catch((error)=>{console.error(error);process.exitCode=1});
