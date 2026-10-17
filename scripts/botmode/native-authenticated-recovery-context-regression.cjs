'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionAuthenticatedRecoveryContext,
} = require('../../api/server/services/Endpoints/agents/nativeMissionAuthenticatedRecoveryContext');
const candidate = {
  streamId: 'conversation',
  createdAt: 1700000000000,
  checkpointNamespace: 'epoch',
  checkpointId: 'head',
};
const job = {
  ...candidate,
  status: 'running',
  providerDrained: false,
  providerExecutionId: 'provider',
  providerExecutionStartedId: 'provider',
  endpoint: 'agents',
  userId: 'owner',
  tenantId: 'tenant',
  agent_id: 'primary',
  orchestratorPlan: { tasks: [{ agentId: 'specialist', key: 'task' }] },
};
(async () => {
  let reads = 0;
  const deps = {
    getUserById: async () => {
      reads++;
      return { _id: 'owner', tenantId: 'tenant', role: 'USER' };
    },
    isOwnerAdmissible: async () => true,
    getConvo: async () => {
      reads++;
      return { conversationId: 'conversation', tenantId: 'tenant', agent_id: 'primary' };
    },
    getAgent: async ({ id }) => {
      reads++;
      return { id, _id: 'mongo-' + id };
    },
    canViewAgent: async () => true,
  };
  const resolve = createNativeMissionAuthenticatedRecoveryContext(deps);
  const context = await resolve({ candidate, job });
  assert.equal(context.user._id, 'owner');
  assert.equal(context.conversation.conversationId, 'conversation');
  assert.deepEqual(
    context.agents.map((agent) => agent.id),
    ['primary', 'specialist'],
  );
  assert.equal(reads, 4, 'do not fetch documents twice with a second authority pass');
  assert.ok(Object.isFrozen(context) && Object.isFrozen(context.agents));
  for (const [changed, alternate] of [
    [{ tenantId: 'other' }, deps],
    [{ pendingAction: { actionId: 'pause' } }, deps],
    [{}, { ...deps, canViewAgent: async ({ agent }) => agent.id !== 'specialist' }],
    [{}, { ...deps, getConvo: async () => null }],
  ]) {
    await assert.rejects(
      createNativeMissionAuthenticatedRecoveryContext(alternate)({
        candidate,
        job: { ...job, ...changed },
      }),
      /AUTHORITY_DENIED/,
    );
  }
  console.log('BOTMODE_NATIVE_AUTHENTICATED_RECOVERY_DOCUMENT_CONTEXT=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
