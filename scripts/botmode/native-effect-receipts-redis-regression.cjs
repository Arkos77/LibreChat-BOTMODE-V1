'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const Redis = require('ioredis');

const src = fs.readFileSync('/work/packages/api/src/stream/nativeMissionEffectReceipts.ts','utf8');
const output = ts.transpileModule(src,{fileName:'nativeMissionEffectReceipts.ts',
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m = {exports:{}};
vm.runInNewContext(output,{module:m,exports:m.exports});
const {MISSION_EFFECT_RESERVE_LUA:reserveLua,MISSION_EFFECT_COMMIT_LUA:commitLua,
  MISSION_EFFECT_READ_LUA:readLua} = m.exports;
// Exercise the actual RedisJobStore adapter methods, not just their Lua.
const storeSource = '/work/packages/api/src/stream/implementations/RedisJobStore.ts';
const storeText = fs.readFileSync(storeSource, 'utf8');
const storeAst = ts.createSourceFile(storeSource, storeText, ts.ScriptTarget.Latest, true);
const storeClass = storeAst.statements.find((x) => ts.isClassDeclaration(x) &&
  x.name?.text === 'RedisJobStore');
assert.ok(storeClass);
const methodNames = new Set([
  'reserveNativeMissionEffect', 'commitNativeMissionEffect',
  'readNativeMissionEffect', 'assertNativeMissionEffectIdentity',
  'parseNativeMissionEffectOutcome',
]);
const methods = storeClass.members.filter((x) => ts.isMethodDeclaration(x) &&
  methodNames.has(x.name.getText(storeAst))).map((x) => x.getText(storeAst));
assert.equal(methods.length, methodNames.size);
const adapterJs = ts.transpileModule(
  'class EffectStoreHarness {' + methods.join('\n') + '}\nmodule.exports=EffectStoreHarness',
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}},
).outputText;
const adapterMod = {exports:{}};
vm.runInNewContext(adapterJs,{
  module:adapterMod, exports:adapterMod.exports, Buffer,
  KEYS:{job:(stream) => 'stream:{' + stream + '}:job'},
  MISSION_EFFECT_RESERVE_LUA:reserveLua,
  MISSION_EFFECT_COMMIT_LUA:commitLua,
  MISSION_EFFECT_READ_LUA:readLua,
});
const r = new Redis(process.env.BOTMODE_TEST_REDIS_URI,{maxRetriesPerRequest:1});
const stream = 'effect-receipt-qualification-' + process.pid;
const key = 'stream:{' + stream + '}:job';
const claimKey = 'stream:{' + stream + '}:mission-recovery-claim';
const epoch = String(Date.now() - 36000), ns = epoch;
const original = 'provider-original-qualification';
const recovered = 'provider-recovered-qualification';
const owner = 'recovery-owner-qualification';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const op = hash('plan/task/node/toolCall/operation');
const argsDigest = hash('normalized arguments');
const resultDigest = hash('durable-result-bytes');
const resultRef = 'private://evidence/checkpointed-effect/123';

const evalLua = (lua,args) => r.eval(lua,2,key,claimKey,...args.map(String));
const reserve = (options={}) => evalLua(reserveLua,[
  options.epoch || epoch,ns,options.provider || original,
  options.owner || '',options.op || op,options.digest || argsDigest]);
const commit = (options={}) => evalLua(commitLua,[
  options.epoch || epoch,ns,options.provider || original,options.owner || '',
  options.op || op,options.digest || argsDigest,
  options.ref || resultRef,options.resultDigest || resultDigest]);
const read = (options={}) => evalLua(readLua,[options.epoch || epoch, ns,
  options.op || op, options.digest || argsDigest]);
async function seed(recovery=false) {
  await r.del(key,claimKey);
  const provider = recovery ? recovered : original;
  await r.hset(key,{
    createdAt:epoch, status:'running', generationProtocolVersion:'2',
    checkpointNamespace:ns, providerExecutionId:provider,
    providerExecutionStartedId:provider, providerDrained:'0',
    orchestratorPlan:'{"tasks":[{"nodeId":"worker"}]}',
    __missionProviderLeaseIdentity:provider,
    __missionProviderLeaseUntil:String(Date.now()+45000),
    ...(recovery?{__missionRecoveryOwner:owner}:{})
  });
  if(recovery)await r.set(claimKey,owner,'PX',45000);
}
(async()=>{
  try{
    await seed();
    assert.deepEqual(await commit(),[0,'missing_intent']);
    assert.deepEqual(await reserve(),[1,'reserved']);
    assert.deepEqual(await read(),[0,'uncertain']);
    assert.deepEqual(await reserve(),[0,'uncertain']);
    assert.deepEqual(await reserve({digest:hash('changed args')}),[0,'mismatch_or_corrupt']);
    assert.deepEqual(await reserve({op:'not-hex'}),[0,'identity']);
    assert.deepEqual(await commit({ref:'x'.repeat(257)}),[0,'identity']);
    assert.deepEqual(await commit(),[1,'committed']);
    assert.deepEqual(await commit(),[1,'already_committed']);
    assert.deepEqual(await reserve(),[0,'already_committed']);
    assert.deepEqual(await read(),[1,'committed',resultRef,resultDigest]);
    assert.deepEqual(await commit({ref:'private://different'}),[0,'result_conflict']);
    assert.deepEqual(await read({epoch:String(Number(epoch)+1)}),[0,'generation']);
    assert.deepEqual(await read({digest:hash('different')}),[0,'mismatch_or_corrupt']);
    assert.equal(await r.hget(key,'__nativeEffectCount'),'1');
    console.log('BOTMODE_EFFECT_ORIGINAL_RESERVE_COMMIT_NO_REPLAY=PASS');

    await seed(true);
    assert.deepEqual(await reserve({provider:recovered}),[0,'owner']);
    assert.deepEqual(await reserve({provider:original,owner}),[0,'provider']);
    assert.deepEqual(await reserve({provider:recovered,owner}),[1,'reserved']);
    await r.del(claimKey);
    assert.deepEqual(await commit({provider:recovered,owner}),[0,'owner']);
    await r.set(claimKey,owner,'PX',45000);
    assert.deepEqual(await commit({provider:recovered,owner}),[1,'committed']);
    assert.deepEqual(await reserve({provider:recovered,owner}),[0,'already_committed']);
    console.log('BOTMODE_EFFECT_RECOVERED_OWNER_CLAIM_FENCE=PASS');

    await seed();
    assert.deepEqual(await reserve(),[1,'reserved']);
    // Simulate external side-effect completed, but SIGKILL before receipt COMMIT.
    await r.hset(key,{providerExecutionId:recovered,
      providerExecutionStartedId:recovered,
      __missionProviderLeaseIdentity:recovered,
      __missionProviderLeaseUntil:String(Date.now()+45000),
      __missionRecoveryOwner:owner});
    await r.set(claimKey,owner,'PX',45000);
    assert.deepEqual(await reserve({provider:recovered,owner}),[0,'uncertain']);
    assert.deepEqual(await commit({provider:recovered,owner}),[0,'uncertain']);
    assert.deepEqual(await commit(),[0,'provider']);
    assert.deepEqual(await read(),[0,'uncertain']);
    console.log('BOTMODE_EFFECT_UNCERTAIN_AFTER_OWNER_ROTATION_FAIL_CLOSED=PASS');

    await seed();
    await r.hset(key,'__missionProviderLeaseUntil',String(Date.now()-1));
    assert.deepEqual(await reserve(),[0,'lease']);
    await seed();
    await r.hset(key,'status','aborted');
    assert.deepEqual(await reserve(),[0,'status']);
    await seed();
    await r.hset(key,'createdAt',String(Number(epoch)+1));
    assert.deepEqual(await reserve(),[0,'epoch']);
    console.log('BOTMODE_EFFECT_STALE_LEASE_STATUS_EPOCH_FENCES=PASS');

    await seed();
    for(let i=0;i<256;i++){
      assert.deepEqual(await reserve({op:hash('bounded-'+i)}),[1,'reserved']);
    }
    assert.deepEqual(await reserve({op:hash('bounded-overflow')}),[0,'capacity']);
    assert.equal(await r.hget(key,'__nativeEffectCount'),'256');
    console.log('BOTMODE_EFFECT_BOUNDED_STORAGE=PASS');

    await seed();
    const adapter = new adapterMod.exports();
    adapter.redis = r;
    const identity = {
      streamId:stream,createdAt:Number(epoch),checkpointNamespace:ns,
      providerExecutionId:original,recoveryOwnerToken:'',
      operationKey:op,argumentsDigest:argsDigest,
    };
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.reserveNativeMissionEffect(identity))),
      {accepted:true,reason:'reserved'});
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.readNativeMissionEffect(identity))),
      {accepted:false,reason:'uncertain'});
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.commitNativeMissionEffect({
      ...identity,resultRef,resultDigest,
    }))),{accepted:true,reason:'committed'});
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.readNativeMissionEffect(identity))),
      {accepted:true,reason:'committed',resultRef,resultDigest});
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.reserveNativeMissionEffect(identity))),
      {accepted:false,reason:'already_committed'});
    await assert.rejects(
      adapter.reserveNativeMissionEffect({...identity,operationKey:'not-sha'}),
      /Invalid mission side-effect identity/,
    );
    await assert.rejects(
      adapter.commitNativeMissionEffect({...identity,resultRef:'x'.repeat(257),resultDigest}),
      /Invalid mission side-effect result reference/,
    );
    console.log('BOTMODE_EFFECT_REDIS_JOB_STORE_ADAPTER=PASS');
  } finally {
    await r.del(key,claimKey);
    r.disconnect();
  }
})().catch((error)=>{console.error(error);process.exitCode=1});
