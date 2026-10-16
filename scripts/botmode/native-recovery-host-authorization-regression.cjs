'use strict';
const assert = require('node:assert/strict');
const { authorizeNativeMissionRecovery } = require(
  '/work/api/server/services/Endpoints/agents/nativeMissionRecoveryAuthorization.js'
);

const id = '507f1f77bcf86cd799439011';
const worker = 'worker-agent-123';
const specialist = 'specialist-agent-321';
const streamId = 'recovery-convo-1';
const candidate = {
  streamId, createdAt: 1700000000000,
  checkpointNamespace: 'job-1700000000000',
  checkpointId: 'checkpoint-1',
};
const job = {
  ...candidate,
  status: 'running',
  providerDrained: false,
  providerExecutionId: 'provider-original',
  providerExecutionStartedId: 'provider-original',
  metadata: {
    userId: id, tenantId: 'tenant-1', endpoint: 'agents',
    agent_id: worker, checkpointNamespace: candidate.checkpointNamespace,
  },
  orchestratorPlan: {
    tasks: [
      { key: 'worker', agentId: worker },
      { key: 'specialist', agentId: specialist },
    ],
  },
};
function defaultDeps(calls) {
  return {
    getUserById: async (userId) => {
      calls.users++;
      assert.equal(userId, id);
      return { _id: id, role: 'USER', tenantId: 'tenant-1' };
    },
    isOwnerAdmissible: async (userId) => {
      calls.owner++;
      assert.equal(userId, id);
      return true;
    },
    getConvo: async (userId, conversationId) => {
      calls.convos++;
      assert.equal(userId, id);
      assert.equal(conversationId, streamId);
      return {
        conversationId, tenantId: 'tenant-1',
        agent_id: worker, subagentThread: undefined,
      };
    },
    getAgent: async ({ id: agentId }) => {
      calls.agents.push(agentId);
      return { id: agentId, _id: 'mongo-' + agentId };
    },
    canViewAgent: async ({ user, agent }) => {
      calls.view.push(agent.id);
      assert.equal(user.role, 'USER');
      return true;
    },
  };
}
async function trial(change, mutate = () => {}) {
  const calls = { users: 0, owner: 0, convos: 0, agents: [], view: [] };
  const copy = structuredClone(job);
  const coord = structuredClone(candidate);
  const deps = defaultDeps(calls);
  mutate({ job: copy, candidate: coord, deps });
  const result = await authorizeNativeMissionRecovery({
    job: copy, candidate: coord, deps,
  });
  assert.equal(result === null, !change, 'unexpected admission result');
  return { result, calls };
}
(async () => {
  const valid = await trial(true);
  assert.equal(valid.result.userId, id);
  assert.deepEqual(Array.from(valid.result.agentIds), [worker, specialist]);
  assert.deepEqual(valid.calls.agents, [worker, specialist]);
  assert.ok(Object.isFrozen(valid.result) && Object.isFrozen(valid.result.agentIds));

  for (const [name, mutation] of [
    ['replacement generation', ({ candidate }) => { candidate.createdAt++; }],
    ['checkpoint namespace swapped', ({ candidate }) => { candidate.checkpointNamespace = 'other'; }],
    ['provider drained', ({ job }) => { job.providerDrained = true; }],
    ['provider identity swapped', ({ job }) => { job.providerExecutionStartedId = 'older'; }],
    ['wrong endpoint', ({ job }) => { job.metadata.endpoint = 'openAI'; }],
    ['unknown owner', ({ job }) => { delete job.metadata.userId; }],
    ['missing mission topology', ({ job }) => { job.orchestratorPlan.tasks = []; }],
    ['malformed task', ({ job }) => { job.orchestratorPlan.tasks[1].agentId = ''; }],
    ['HITL in progress', ({ job }) => { job.metadata.pendingAction = { actionId: 'pending' }; }],
    ['inactive owner', ({ deps }) => { deps.isOwnerAdmissible = async () => false; }],
    ['deleted owner', ({ deps }) => { deps.getUserById = async () => null; }],
    ['identity substitution', ({ deps }) => { deps.getUserById = async () => ({ _id: 'attacker' }); }],
    ['tenant moved', ({ deps }) => { deps.getUserById = async () => ({ _id: id, tenantId: 'other' }); }],
    ['conversation removed', ({ deps }) => { deps.getConvo = async () => null; }],
    ['conversation agent replaced', ({ deps }) => { deps.getConvo = async () => ({ conversationId: streamId, tenantId: 'tenant-1', agent_id: 'other' }); }],
    ['conversation moved to different tenant', ({ deps }) => { deps.getConvo = async () => ({ conversationId: streamId, tenantId: 'other', agent_id: worker }); }],
    ['subagent thread impersonated', ({ deps }) => { deps.getConvo = async () => ({ conversationId: streamId, tenantId: 'tenant-1', agent_id: worker, subagentThread: {} }); }],
    ['worker revoked', ({ deps }) => { deps.canViewAgent = async ({ agent }) => agent.id !== worker; }],
    ['specialist revoked', ({ deps }) => { deps.canViewAgent = async ({ agent }) => agent.id !== specialist; }],
    ['specialist deleted', ({ deps }) => { deps.getAgent = async ({ id: agentId }) => agentId === specialist ? null : { id: agentId, _id: 'mongo-' + agentId }; }],
    ['agent identity mismatch', ({ deps }) => { deps.getAgent = async () => ({ id: 'other', _id: 'mongo' }); }],
    ['authorization dependency missing', ({ deps }) => { delete deps.canViewAgent; }],
  ]) {
    const trialResult = await trial(false, mutation);
    assert.equal(trialResult.result, null, name);
  }
  console.log('BOTMODE_HOST_RECOVERY_AUTHORIZATION=PASS (1 admitted; 22 denied)');
})().catch((error) => { console.error(error); process.exitCode = 1; });
