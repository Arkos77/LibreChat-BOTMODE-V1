'use strict';

const { createHash, createHmac } = require('node:crypto');
const {
  createNativeMissionIndependentOriginalBrokerServer,
} = require('./nativeMissionIndependentOriginalBrokerServer');
const { requestDigest } = require('./nativeMissionProviderBrokerHttp');

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const secret = 'isolated-true-original-broker-secret-64-characters-minimum';
const identity = {
  userId:'owner',tenantId:'tenant',parentConversationId:'parent',
  parentRunId:'response',childThreadId:'child',taskId:'task',
  attemptKey:'attempt',agentId:'analysis',provider:'openrouter',model:'ci-free',
  operationKey:'a'.repeat(64),
};
const authorizedRequest = {
  model:'ci-free',stream:false,messages:[{role:'user',content:'original'}],
};
const digest = requestDigest(authorizedRequest);
const graphThreadId = 'subagent:' +
  Buffer.from(JSON.stringify(['parent','fork','worker','tool','batch'])).toString('base64url');
const originalSlotKey = sha({
  ...Object.fromEntries(Object.entries(identity).filter(([key])=>key!=='operationKey')),
  parentToolCallId:'tool',graphThreadId,checkpointId:'checkpoint',
  checkpointNs:'',generationNamespace:'generation',
});
function fixture() {
  const row = {
    callKey:sha(identity),identity,requestDigest:digest,
    originFingerprint:'c'.repeat(64),parentToolCallId:'tool',
    checkpointId:'checkpoint',graphThreadId,originalSlotKey,
    checkpointNs:'',generationNamespace:'generation',status:'prepared',
  };
  let original = structuredClone(row);
  let lease = true;
  let owner = true;
  const records = new Map([[row.callKey,original]]);
  const clone = (x) => x == null ? null : structuredClone(x);
  const collection = {
    createIndex: jest.fn(async()=>{}),
    insertOne: jest.fn(async(doc)=>{
      if (records.has(doc.callKey)) {
        const error=new Error('duplicate');error.code=11000;throw error;
      }
      records.set(doc.callKey,clone(doc));
    }),
    findOne: jest.fn(async(query)=>clone(records.get(query.callKey))),
    findOneAndUpdate: jest.fn(async(filter,update)=>{
      const current=records.get(filter.callKey);
      if (!current ||
        Object.entries(filter).some(([key,wanted])=>
          wanted?.$in ? !wanted.$in.includes(current[key]) : current[key]!==wanted
        )) return null;
      const next={...current,...update.$set};
      records.set(filter.callKey,next);
      return clone(next);
    }),
  };
  const sender=jest.fn(async()=>({
    choices:[{index:0,finish_reason:'stop',
      message:{role:'assistant',content:'durable-response'}}],
  }));
  const server=createNativeMissionIndependentOriginalBrokerServer({
    collection,secret,provider:'openrouter',sendProvider:sender,
    findOriginalOperation:async({callKey})=>collection.findOne({callKey}),
    getMissionOrigin:async()=>({
      userId:'owner',tenantId:'tenant',conversationId:'parent',
      parentResponseMessageId:'response',agentId:'worker',
      fingerprint:'c'.repeat(64),checkpointNamespace:'generation',
      capabilityAttestation:{mode:'receipts_required'},
      plan:{tasks:[{agentId:'worker'},{agentId:'analysis'}]},
    }),
    getConvo:async(_user,id)=>id==='parent'
      ? {conversationId:'parent',tenantId:'tenant',agent_id:'worker'}
      : {conversationId:'child',tenantId:'tenant',agent_id:'analysis',endpoint:'agents',
        subagentThread:{
          parentConversationId:'parent',rootConversationId:'parent',
          parentMessageId:'response',parentToolCallId:'tool',
          parentAgentId:'worker',subagentKind:'agent',subagentType:'analysis',
        }},
    getStartReceipt:async()=>({
      conversationId:'child',messageId:'task:user',
      subagentTask:{status:'running',attemptKey:'attempt',parentRunId:'response'},
    }),
    readOriginalCheckpoint:async()=>({
      graphThreadId,checkpointId:'checkpoint',checkpointNs:'',
      generationNamespace:'generation',taskId:'task',attemptKey:'attempt',
      childThreadId:'child',
    }),
    authorizeCurrentOwner:async()=>owner,
    canViewAgent:async()=>owner,
    inspectOriginalChildOwner:async()=>lease,
    getCurrentModelBinding:async()=>({provider:'openrouter',model:'ci-free'}),
  });
  return {
    server, sender, records,
    revokeLease:()=>{lease=false;},
    revokeOwner:()=>{owner=false;},
    replaceOriginal:(changes)=>{original={...original,...changes};records.set(row.callKey,original);},
  };
}
async function signed(port,path,payload) {
  const raw=JSON.stringify(payload);
  const timestamp=String(Date.now());
  const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
  return fetch('http://127.0.0.1:'+port+path,{
    method:'POST',
    headers:{'x-botmode-broker-ts':timestamp,'x-botmode-broker-hmac':signature},
    body:raw,
  });
}
describe('independent original-child broker: dispatch once and read after SIGKILL',()=>{
  let ctx,port;
  beforeEach(async()=>{
    ctx=fixture();
    await new Promise((resolve)=>ctx.server.listen(0,'127.0.0.1',resolve));
    port=ctx.server.address().port;
  });
  afterEach(async()=>{
    ctx.server.closeAllConnections();
    await new Promise((resolve)=>ctx.server.close(resolve));
  });
  it('dispatches once and reuses its durable committed answer with no renewed lease',async()=>{
    const payload={identity,requestDigest:digest,authorizedRequest};
    const first=await signed(port,'/execute',payload);
    expect(first.status).toBe(200);
    expect((await first.json()).response.choices[0].message.content).toBe('durable-response');
    expect(ctx.sender).toHaveBeenCalledTimes(1);
    ctx.revokeLease();
    const recovered=await signed(port,'/status',{identity,requestDigest:digest});
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).response.choices[0].message.content).toBe('durable-response');
    expect((await signed(port,'/execute',payload)).status).toBe(403);
    expect(ctx.sender).toHaveBeenCalledTimes(1);
  });
  it('never returns a receipt to a revoked owner, or dispatches an altered original grant',async()=>{
    ctx.revokeOwner();
    expect((await signed(port,'/status',{identity,requestDigest:digest})).status).toBe(403);
    expect(ctx.sender).not.toHaveBeenCalled();
    ctx.replaceOriginal({originFingerprint:'f'.repeat(64)});
    expect((await signed(port,'/execute',{identity,requestDigest:digest,authorizedRequest})).status)
      .toBe(403);
    expect(ctx.sender).not.toHaveBeenCalled();
  });
});
