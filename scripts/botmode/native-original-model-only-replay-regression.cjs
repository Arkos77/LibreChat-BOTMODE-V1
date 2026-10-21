'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionOriginalModelOnlyReplay,
} = require('../../api/server/services/Endpoints/agents/nativeMissionOriginalModelOnlyReplay');
const {
  createNativeMissionCapabilityAttestation,
} = require('../../api/server/services/Endpoints/agents/nativeMissionCapabilityAttestation');

(async () => {
  const candidate = {
    streamId: 'conversation-epoch',
    createdAt: 1700000000000,
    checkpointNamespace: 'scope-1',
    checkpointId: 'head-1',
  };
  const claim = { ...candidate, ownerToken: 'claim-owner-123456789' };
  const agent = { id: 'worker', provider: 'openai', model: 'gpt-4o', tools: [] };
  const plan = { planId: 'plan-1', tasks: [{ agentId: 'worker', nodeId: 'task-worker' }] };
  const attestation = createNativeMissionCapabilityAttestation({ plan, agents: [agent] });
  let job = {
    ...candidate,
    status: 'running',
    agent_id: 'worker',
    orchestratorPlan: plan,
    nativeMissionCapabilityAttestation: attestation,
  };
  let authorized = true;
  let storeReplaced = false;
  let receiptReads = 0;
  const store = {
    getJob: async () => structuredClone(job),
    readNativeMissionEffect: async () => {
      receiptReads++;
      throw Error('unexpected effect');
    },
  };
  const manager = { getJobStore: () => (storeReplaced ? {} : store) };
  const gate = createNativeMissionOriginalModelOnlyReplay({ manager });
  const client = {
    options: { agent, subagentTasks: undefined },
    orchestratorPlan: plan,
    getReachableMissionAgents: () => [agent],
    conversationId: candidate.streamId,
    jobCreatedAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace,
  };
  const assertAuthorized = async () => {
    if (!authorized) throw Error('OWNER_PERMISSION_REVOKED');
  };
  const context = { client, candidate, claim, assertAuthorized };
  assert.equal(await gate.proveNoOriginalEffects(context), true);
  assert.equal(await (await gate.effectFences(context))(), true);
  assert.equal(await (await gate.replaySafety(context))(['task-worker']), true);
  assert.equal(receiptReads, 0, 'proven empty inventory cannot read arbitrary receipts');
  await assert.rejects(
    (await gate.replaySafety(context))(['unknown-tool']),
    /PENDING_NODES_DENIED/,
  );
  await assert.rejects((await gate.replaySafety(context))([]), /PENDING_NODES_DENIED/);
  console.log('BOTMODE_ORIGINAL_MODEL_ONLY_ZERO_EFFECT_INVENTORY=PASS');

  const previous = job;
  for (const patch of [
    { nativeMissionCapabilityAttestation: undefined },
    { nativeMissionCapabilityAttestation: { ...attestation, mode: 'receipts_required' } },
    { nativeMissionCapabilityAttestation: { ...attestation, digest: 'f'.repeat(64) } },
    { orchestratorPlan: { ...plan, planId: 'changed' } },
    { pendingAction: { actionId: 'review' } },
    { createdAt: candidate.createdAt + 1 },
    { checkpointNamespace: 'other' },
    { status: 'aborted' },
    { status: 'complete', terminalPersistencePending: false },
  ]) {
    job = { ...previous, ...patch };
    await assert.rejects(gate.proveNoOriginalEffects(context), /REPLAY|ATTESTATION|CAPABILITY/);
  }
  job = previous;
  job = { ...previous, status: 'complete', terminalPersistencePending: true };
  assert.equal(await gate.proveNoOriginalEffects(context), true);
  job = previous;
  authorized = false;
  await assert.rejects(gate.proveNoOriginalEffects(context), /PERMISSION_REVOKED/);
  authorized = true;
  storeReplaced = true;
  await assert.rejects(gate.proveNoOriginalEffects(context), /RECEIPTS_UNAVAILABLE/);
  storeReplaced = false;
  const changedClient = {
    ...client,
    getReachableMissionAgents: () => [{ ...agent, tools: ['remote-write'] }],
  };
  await assert.rejects(
    gate.proveNoOriginalEffects({ ...context, client: changedClient }),
    /BASELINE_CHANGED/,
  );
  console.log('BOTMODE_ORIGINAL_REPLAY_PERMISSION_EFFECT_DRIFT_DENIAL=PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
