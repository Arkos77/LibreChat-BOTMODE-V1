'use strict';
const assert = require('node:assert/strict');
const {
  authorizeNativeMissionRecovery,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveryAuthorization');
(async () => {
  const candidate = {
    streamId: 'conversation',
    createdAt: 1700000000000,
    checkpointNamespace: 'epoch',
    checkpointId: 'checkpoint',
  };
  const job = {
    ...candidate,
    status: 'running',
    providerDrained: true,
    providerExecutionId: 'recovered-provider-123456789',
    providerExecutionStartedId: 'previous-provider',
    endpoint: 'agents',
    userId: 'owner-user',
    tenantId: 'tenant',
    agent_id: 'worker',
    orchestratorPlan: {
      tasks: [
        { key: 'worker', agentId: 'worker' },
        { key: 'specialist', agentId: 'specialist' },
      ],
    },
  };
  const proof = {
    streamId: candidate.streamId,
    createdAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace,
    providerExecutionId: job.providerExecutionId,
    ownerToken: 'recovery-owner-123456789',
  };
  let revoke = null;
  const deps = {
    getUserById: async () =>
      revoke === 'user'
        ? null
        : {
            _id: 'owner-user',
            tenantId: revoke === 'tenant' ? 'foreign' : 'tenant',
          },
    isOwnerAdmissible: async () => revoke !== 'owner',
    getConvo: async () => ({
      conversationId: candidate.streamId,
      agent_id: 'worker',
      tenantId: 'tenant',
    }),
    getAgent: async ({ id }) => ({
      id,
      _id: 'mongo-' + id,
    }),
    canViewAgent: async ({ agent }) => agent.id !== revoke,
  };
  const admit = (inputJob, ownerProof) =>
    authorizeNativeMissionRecovery({
      candidate,
      job: inputJob,
      deps,
      promotedOwnerProof: ownerProof,
    });
  assert.equal(await admit(job, undefined), null, 'rotated provider is NOT an original owner');
  let result = await admit(job, proof);
  assert.equal(result?.promotedOwnerToken, proof.ownerToken);
  assert.deepEqual(Array.from(result.agentIds), ['worker', 'specialist']);
  result = await admit(
    { ...job, providerDrained: false, providerExecutionStartedId: job.providerExecutionId },
    proof,
  );
  assert.equal(result?.promotedOwnerToken, proof.ownerToken);
  result = await admit(
    {
      ...job,
      status: 'complete',
      providerDrained: false,
      providerExecutionStartedId: job.providerExecutionId,
      terminalPersistencePending: true,
    },
    proof,
  );
  assert.equal(result?.promotedOwnerToken, proof.ownerToken);
  console.log('BOTMODE_PROMOTED_OWNER_MODEL_RUNNING_TERMINAL_AUTH=PASS');

  const denied = [
    [{ ...job, status: 'complete' }, proof],
    [{ ...job, status: 'aborted' }, proof],
    [{ ...job, pendingAction: { actionId: 'HITL' } }, proof],
    [job, { ...proof, ownerToken: '' }],
    [job, { ...proof, streamId: 'other' }],
    [job, { ...proof, createdAt: candidate.createdAt + 1 }],
    [job, { ...proof, checkpointNamespace: 'other' }],
    [job, { ...proof, providerExecutionId: 'other-provider' }],
    [{ ...job, providerExecutionId: 'other-provider' }, proof],
  ];
  for (const [j, p] of denied) {
    assert.equal(await admit(j, p), null);
  }
  for (const deniedResource of ['user', 'tenant', 'owner', 'worker', 'specialist']) {
    revoke = deniedResource;
    assert.equal(await admit(job, proof), null, deniedResource);
  }
  console.log('BOTMODE_PROMOTED_OWNER_HITL_PERMISSION_IDENTITY_DENIAL=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
