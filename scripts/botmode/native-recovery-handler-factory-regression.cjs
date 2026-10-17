'use strict';
const assert = require('node:assert/strict');
const {
  createNativeMissionRecoveryHandlerFactory,
} = require('../../api/server/services/Endpoints/agents/nativeMissionRecoveryHandlerFactory');
const candidate = {
  streamId: 'conv',
  createdAt: 1700000000000,
  checkpointNamespace: 'epoch',
  checkpointId: 'head',
};
const claim = { ...candidate, ownerToken: 'owner-claim' };
const job = {
  ...candidate,
  status: 'running',
  pendingAction: null,
  userId: 'user',
  tenantId: 'tenant',
  agent_id: 'primary',
  responseMessageId: 'response',
  userMessage: { messageId: 'user-msg' },
  orchestratorPlan: { tasks: [{ nodeId: 'worker', agentId: 'primary', key: 'task' }] },
};
(async () => {
  let issued = 0,
    ran = 0,
    released = 0,
    checks = 0;
  const store = {
    getJob: async () => job,
    renewDrainedMissionRecovery: async () => true,
    releaseDrainedMissionRecovery: async () => {
      released++;
      return true;
    },
  };
  const graph = { getState: async () => ({}), invoke: async () => {} };
  const client = {
    conversationId: candidate.streamId,
    options: {
      req: { user: { id: 'user', tenantId: 'tenant' }, body: { conversationId: 'conv' } },
      agent: { id: 'primary' },
    },
    publicationBarrier: { activate: () => {} },
    getReachableMissionAgents: () => [client.options.agent],
    createNativeMissionColdRunOptions: async () => ({
      agents: [client.options.agent],
      orchestratorPlan: job.orchestratorPlan,
      conversationId: 'conv',
      runId: 'response',
      messages: [],
      signal: new AbortController().signal,
      appConfig: {},
      user: { id: 'user' },
      tenantId: 'tenant',
      modelCallbacks: [() => {}],
      resolveMissionOracleEvidence: async () => [],
      persistMissionOracleResult: async () => {},
      requestBody: { conversationId: 'conv' },
      toolExecution: {},
      assertNativeMissionReplayFences: async () => true,
    }),
  };
  const opts = {
    manager: { getJobStore: () => store, claimCheckpointedOrphanForInspection: async () => claim },
    authorizeCandidate: async () => {
      checks++;
      return true;
    },
    initializeAuthorizedClient: async () => ({ client, job }),
    normalizeOracleState: (x) => x,
    createRun: async () => {
      assert.equal(typeof client.options.nativeMissionRecoverySignal?.addEventListener, 'function');
      assert.equal(client.options.nativeMissionRecoverySignal.aborted, false);
      issued++;
      return { Graph: { createWorkflow: () => graph } };
    },
    replaySafety: async () => async () => {},
    effectFences: async () => async () => {},
    oracle: async () => async () => {},
    publication: async () => ({ getCandidate: async () => ({}), publishTerminal: async () => {} }),
    qualifyAndExecuteRecoveredMissionSegment: async (args) => {
      ran++;
      assert.equal(args.claim.ownerToken, claim.ownerToken);
      assert.equal(args.graph, graph);
      assert.equal(typeof args.continueGraph, 'function');
      // The real SDK qualifier releases a refused, unpromoted claim itself.
      // The coordinator must never perform a second release after entering it.
      await store.releaseDrainedMissionRecovery(claim.streamId, claim.createdAt, claim.ownerToken);
      return false;
    },
    continueColdNativeMissionGraph: async () => {},
    log: { warn: () => {} },
  };
  assert.equal(await createNativeMissionRecoveryHandlerFactory(opts)(candidate), false);
  assert.equal(issued, 1);
  assert.equal(ran, 1);
  assert.equal(released, 1);
  assert.equal(client.options.nativeMissionRecoverySignal.aborted, true);
  assert.ok(checks >= 4);
  for (const missing of [
    'initializeAuthorizedClient',
    'effectFences',
    'publication',
    'qualifyAndExecuteRecoveredMissionSegment',
    'continueColdNativeMissionGraph',
  ]) {
    assert.throws(
      () => createNativeMissionRecoveryHandlerFactory({ ...opts, [missing]: undefined }),
      /UNAVAILABLE|MISSING/,
    );
  }
  console.log('BOTMODE_NATIVE_RECOVERY_REAL_SDK_ASSEMBLY_CONTRACT=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
