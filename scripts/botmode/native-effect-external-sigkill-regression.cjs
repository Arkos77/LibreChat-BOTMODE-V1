'use strict';
// Two real process deaths (exit 137), each followed by a fresh Node process.
// The "external effect" is a separate durable counter, NOT a LibreChat tool.
// Fixture owner rotation is deliberately not a production recovery claim.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const Redis=require('ioredis');
const phase=process.argv[2];
assert.ok(['seed_uncertain','resume_uncertain','seed_committed','resume_committed'].includes(phase));
const uncertain=phase.endsWith('uncertain');
const seed=phase.startsWith('seed');
function transpile(path){
  const src=fs.readFileSync(path,'utf8');
  return ts.transpileModule(src,{fileName:path,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  }}).outputText;
}
const luaMod={exports:{}};
vm.runInNewContext(transpile('/work/packages/api/src/stream/nativeMissionEffectReceipts.ts'),
  {module:luaMod,exports:luaMod.exports});
const execMod={exports:{}};
vm.runInNewContext(transpile('/work/packages/api/src/agents/nativeMissionEffectExecution.ts'),
  {module:execMod,exports:execMod.exports});
const {executeNativeMissionEffectFenced}=execMod.exports;
const redis=new Redis(process.env.BOTMODE_TEST_REDIS_URI,{maxRetriesPerRequest:1});
const prefix=uncertain?'uncertain':'committed';
const stream='effect-external-sigkill-'+prefix;
const key='stream:{'+stream+'}:job';
const claim='stream:{'+stream+'}:mission-recovery-claim';
const counter='external-side-effect:'+prefix;
const outputKey='external-private-result:'+prefix;
const epoch=1700000000000,ns=String(epoch);
const original='original-provider-qualified',recovered='recovered-provider-qualified';
const owner='recovered-owner-qualified';
const hash=(x)=>crypto.createHash('sha256').update(x).digest('hex');
const identity={
  streamId:stream,createdAt:epoch,checkpointNamespace:ns,
  providerExecutionId:seed?original:recovered,
  recoveryOwnerToken:seed?'':owner,
  operationKey:hash('mission-task-canonical-operation'),
  argumentsDigest:hash('filtered-args'),
};
async function runLua(lua,args,read=false){
  const keys=read?[key]:[key,claim];
  const raw=await redis.eval(lua,keys.length,...keys,...args.map(String));
  return {
    accepted:raw[0]===1,reason:raw[1],
    ...(raw[2]?{resultRef:raw[2],resultDigest:raw[3]}:{}),
  };
}
const base=()=>[
  epoch,ns,identity.providerExecutionId,identity.recoveryOwnerToken,
  identity.operationKey,identity.argumentsDigest
];
const store={
  reserveNativeMissionEffect:()=>runLua(luaMod.exports.MISSION_EFFECT_RESERVE_LUA,base()),
  commitNativeMissionEffect:(result)=>runLua(luaMod.exports.MISSION_EFFECT_COMMIT_LUA,
    [...base(),result.resultRef,result.resultDigest]),
  readNativeMissionEffect:()=>runLua(luaMod.exports.MISSION_EFFECT_READ_LUA,
    [epoch,ns,identity.operationKey,identity.argumentsDigest],true),
};
async function main(){
  try {
    if(seed){
      await redis.del(key,claim,counter,outputKey);
      await redis.hset(key,{
        createdAt:String(epoch),status:'running',providerDrained:'0',
        orchestratorPlan:'{"tasks":[{"nodeId":"worker"}]}',
        checkpointNamespace:ns,providerExecutionId:original,
        providerExecutionStartedId:original,
        __missionProviderLeaseIdentity:original,
        __missionProviderLeaseUntil:String(Date.now()+120000),
      });
      const first=await store.reserveNativeMissionEffect(identity);
      assert.deepEqual(first,{accepted:true,reason:'reserved'});
      assert.equal(await redis.incr(counter),1);
      const result='durable-fake-external-output';
      if(!uncertain){
        await redis.set(outputKey,result);
        const saved=await store.commitNativeMissionEffect({
          ...identity,resultRef:'private://external/result/committed',
          resultDigest:hash(result),
        });
        assert.deepEqual(saved,{accepted:true,reason:'committed'});
      }
      console.log('EXTERNAL_EFFECT_PRE_KILL_'+prefix.toUpperCase()+'=PASS');
      await new Promise(()=>{});
    }else{
      // Simulate authorized, fenced recovery ownership after the hard crash.
      // This test focuses on receipts; claim Lua is tested separately.
      await redis.hset(key,{
        providerExecutionId:recovered,providerExecutionStartedId:recovered,
        __missionProviderLeaseIdentity:recovered,
        __missionProviderLeaseUntil:String(Date.now()+120000),
        __missionRecoveryOwner:owner,
      });
      await redis.set(claim,owner,'PX',90000);
      let attempts=0;
      const options={
        store,identity,assertAuthorized:async()=>{},
        execute:async()=>{attempts++;await redis.incr(counter);
          return 'unacceptable-duplicate';},
        persistResult:async()=>{throw Error('should not persist again');},
        loadCommittedResult:async(ref,digest)=>{
          assert.equal(ref,'private://external/result/committed');
          const result=await redis.get(outputKey);
          assert.ok(result);
          assert.equal(hash(result),digest);
          return result;
        },
      };
      if(uncertain){
        await assert.rejects(executeNativeMissionEffectFenced(options),
          /NATIVE_MISSION_EFFECT_UNCERTAIN_RECONCILIATION_REQUIRED/);
      }else{
        assert.equal(await executeNativeMissionEffectFenced(options),
          'durable-fake-external-output');
      }
      assert.equal(attempts,0);
      assert.equal(await redis.get(counter),'1');
      console.log('EXTERNAL_EFFECT_COLD_RESTART_'+prefix.toUpperCase()+'_NO_DUPLICATE=PASS');
    }
  }finally{
    if(!seed)await redis.del(key,claim,counter,outputKey);
    redis.disconnect();
  }
}
main().catch((error)=>{console.error(error);process.exitCode=1});
