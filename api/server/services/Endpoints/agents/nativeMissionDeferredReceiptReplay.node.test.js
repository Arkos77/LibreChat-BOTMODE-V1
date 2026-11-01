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

test('whole cold runtime authenticates graph and original receipt before replay-fence proof or Oracle', async () => {
  const { createNativeMissionColdRuntimeHost } = require('./nativeMissionColdRuntimeHost');
  const f = fixture();
  f.client.options.agentRuntime.requestBody = { conversationId: f.candidate.streamId };
  f.client.publicationBarrier = { activate: () => true };
  const job = {
    streamId: f.candidate.streamId, createdAt: f.candidate.createdAt,
    checkpointNamespace: f.candidate.checkpointNamespace,
    checkpointId: f.candidate.checkpointId, status: 'running',
    userId: 'owner', tenantId: 'tenant', agent_id: 'worker',
    responseMessageId: 'response', userMessage: { messageId: 'original-message' },
    orchestratorPlan: f.client.orchestratorPlan,
  };
  const host = createNativeMissionColdRuntimeHost({
    initializeAuthorizedClient: async () => ({ client: f.client, job }),
    normalizeOracleState: () => ({}),
    reconstructGraph: f.build,
    installRecoveryTransport: async () => {
      f.actions.push('install-original-broker');
      return { bindGraph: async (graph) => {
        assert.equal(graph, f.graph);
        f.actions.push('bind-original-graph');
        return true;
      } };
    },
    proveColdGraphReceipt: async () => {
      f.actions.push('original-model-receipt');
      return true;
    },
    effectFences: async () => { f.actions.push('effects-fenced'); return async () => true; },
    replaySafety: async () => { f.actions.push('replay-fenced'); return async () => true; },
    oracle: async () => { f.actions.push('oracle'); return async () => true; },
    publication: async () => {
      f.actions.push('publication');
      return { getCandidate: async () => null, publishTerminal: async () => true };
    },
  });
  await host({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true });
  assert.deepEqual(f.actions, [
    'install-original-broker', 'compile', 'bind-original-graph',
    'original-model-receipt', 'verify-replay-fences', 'effects-fenced',
    'replay-fenced', 'oracle', 'publication',
  ]);
});

test('whole cold runtime refuses failed deferred proof before effects or Oracle', async () => {
  const { createNativeMissionColdRuntimeHost } = require('./nativeMissionColdRuntimeHost');
  const f = fixture({ verified: false });
  f.client.options.agentRuntime.requestBody = { conversationId: f.candidate.streamId };
  f.client.publicationBarrier = { activate: () => true };
  const job = {
    streamId: f.candidate.streamId, createdAt: f.candidate.createdAt,
    checkpointNamespace: f.candidate.checkpointNamespace,
    checkpointId: f.candidate.checkpointId, status: 'running',
    userId: 'owner', tenantId: 'tenant', agent_id: 'worker',
    responseMessageId: 'response', userMessage: { messageId: 'original-message' },
    orchestratorPlan: f.client.orchestratorPlan,
  };
  const host = createNativeMissionColdRuntimeHost({
    initializeAuthorizedClient: async () => ({ client: f.client, job }),
    normalizeOracleState: () => ({}), reconstructGraph: f.build,
    installRecoveryTransport: async () => ({ bindGraph: async () => true }),
    proveColdGraphReceipt: async () => { f.actions.push('original-model-receipt'); return true; },
    effectFences: async () => { throw Error('EFFECTS_MUST_NOT_BE_REACHED'); },
    replaySafety: async () => { throw Error('REPLAY_MUST_NOT_BE_REACHED'); },
    oracle: async () => { throw Error('ORACLE_MUST_NOT_BE_REACHED'); },
    publication: async () => { throw Error('PUBLICATION_MUST_NOT_BE_REACHED'); },
  });
  await assert.rejects(
    host({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true }),
    /DEFERRED_REPLAY_PROOF_DENIED/,
  );
  assert.deepEqual(f.actions, ['compile', 'original-model-receipt', 'verify-replay-fences']);
});
