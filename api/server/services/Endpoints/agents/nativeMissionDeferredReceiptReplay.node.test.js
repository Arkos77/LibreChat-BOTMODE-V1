'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createNativeMissionColdGraphBuilder,
  proveDeferredNativeMissionColdReplayFences,
} = require('./nativeMissionColdGraphBuilder');

function fixture({ receipts = true, verified = true } = {}) {
  const candidate = {
    streamId: 'original-stream', createdAt: 1700000000000,
    checkpointNamespace: 'generation', checkpointId: 'durable-head',
  };
  const claim = { ...candidate, ownerToken: 'original-claim-owner-12345' };
  const actions = [];
  const plan = { tasks: [{ nodeId: 'analysis', agentId: 'analyst' }] };
  const agents = [{ id: 'worker' }, { id: 'analyst' }];
  const principal = { id: 'owner', tenantId: 'tenant' };
  const factory = () => { throw new Error('MODEL_DISPATCH_MUST_NOT_HAPPEN'); };
  const options = {
    agents, orchestratorPlan: plan, conversationId: candidate.streamId,
    runId: 'response', messages: [], hitlCapable: false,
    signal: new AbortController().signal,
    appConfig: {}, user: { ...principal }, tenantId: 'tenant',
    modelCallbacks: [() => {}],
    requestBody: { conversationId: candidate.streamId },
    toolExecution: {}, resolveMissionOracleEvidence: () => [],
    persistMissionOracleResult: () => {},
    nativeGraphModelFetchFactory: factory,
    assertNativeMissionReplayFences: ({ candidate: actual, claim: owner }) => {
      actions.push('verify-replay-fences');
      assert.equal(actual, candidate);
      assert.equal(owner, claim);
      return verified;
    },
  };
  const client = {
    conversationId: candidate.streamId, jobCreatedAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace,
    orchestratorPlan: plan, responseMessageId: options.runId,
    options: {
      agent: { id: 'worker' }, agentRuntime: { user: principal },
      nativeGraphModelFetchFactory: factory,
      ...(receipts ? { nativeMissionRecoveryRequiresReceipts: true } : {}),
    },
    createNativeMissionColdRunOptions: async () => options,
    getReachableMissionAgents: () => agents,
  };
  const graph = {
    getState: () => { actions.push('read-state'); return {}; },
    invoke: () => { throw new Error('GRAPH_INVOKE_MUST_NOT_HAPPEN'); },
  };
  const build = createNativeMissionColdGraphBuilder({
    createRun: async (runOptions) => {
      actions.push('compile');
      assert.equal(runOptions.nativeGraphModelFetchFactory, factory);
      return { Graph: { createWorkflow: () => graph } };
    },
  });
  return { build, client, candidate, claim, graph, actions };
}

test('receipts-required compiles without premature replay proof; proof runs after broker inspection', async () => {
  const f = fixture();
  assert.equal(await f.build({ ...f, assertAuthorized: async () => true }), f.graph);
  assert.deepEqual(f.actions, ['compile']);
  f.actions.push('broker-verified');
  await proveDeferredNativeMissionColdReplayFences(f);
  assert.deepEqual(f.actions, ['compile', 'broker-verified', 'verify-replay-fences']);
  await assert.rejects(proveDeferredNativeMissionColdReplayFences(f), /DEFERRED_REPLAY_PROOF_MISSING/);
});
test('model-only still requires receipt proof before any graph compilation', async () => {
  const f = fixture({ receipts: false, verified: false });
  await assert.rejects(f.build({ ...f, assertAuthorized: async () => true }), /REPLAY_PROOFS_MISSING/);
  assert.deepEqual(f.actions, ['verify-replay-fences']);
});
test('receipts-required rejects changed owner after compilation and never checks receipts', async () => {
  const f = fixture();
  await f.build({ ...f, assertAuthorized: async () => true });
  await assert.rejects(
    proveDeferredNativeMissionColdReplayFences({
      ...f, claim: { ...f.claim, ownerToken: 'attacker-owner-1234567890' },
    }), /DEFERRED_REPLAY_OWNER_MISMATCH/,
  );
  assert.deepEqual(f.actions, ['compile']);
});
test('receipts-required rejects false original replay receipt proof', async () => {
  const f = fixture({ verified: false });
  await f.build({ ...f, assertAuthorized: async () => true });
  await assert.rejects(proveDeferredNativeMissionColdReplayFences(f), /DEFERRED_REPLAY_PROOF_DENIED/);
  assert.deepEqual(f.actions, ['compile', 'verify-replay-fences']);
});
test('receipts-required rejects compilation with direct-provider fallback', async () => {
  const f = fixture();
  f.client.options.nativeGraphModelFetchFactory = () => null;
  await assert.rejects(f.build({ ...f, assertAuthorized: async () => true }), /RECEIPTS_TRANSPORT_UNVERIFIED/);
  assert.deepEqual(f.actions, []);
});
