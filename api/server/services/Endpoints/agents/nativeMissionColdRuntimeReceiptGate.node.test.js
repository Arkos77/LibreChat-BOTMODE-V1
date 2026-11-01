'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNativeMissionColdRuntimeHost } = require('./nativeMissionColdRuntimeHost');

function fixture(proveColdGraphReceipt, withTransport = true, installResult) {
  const candidate = {
    streamId: 'conversation', createdAt: 1700000000000,
    checkpointNamespace: 'generation', checkpointId: 'checkpoint',
  };
  const claim = { ...candidate, ownerToken: 'original-owner-token-123456' };
  const actions = [];
  const graph = { invoke: async () => actions.push('invoke'), getState: async () => ({}) };
  const job = {
    streamId: candidate.streamId, createdAt: candidate.createdAt,
    checkpointNamespace: candidate.checkpointNamespace, checkpointId: candidate.checkpointId,
    tenantId: 'tenant', status: 'running', userId: 'owner',
    responseMessageId: 'response', userMessage: { messageId: 'user-message' },
    agent_id: 'worker', orchestratorPlan: { tasks: [{ nodeId: 'analysis' }] },
  };
  const client = {
    options: {
      agentRuntime: { user: { id: 'owner', tenantId: 'tenant' },
        requestBody: { conversationId: candidate.streamId } },
      agent: { id: 'worker' },
      ...(withTransport ? { nativeGraphModelFetchFactory: () => async () => {
        throw new Error('DIRECT_DISPATCH_DENIED');
      } } : {}),
    },
    conversationId: candidate.streamId,
    publicationBarrier: { activate: () => true },
  };
  const run = createNativeMissionColdRuntimeHost({
    initializeAuthorizedClient: async () => ({ client, job }),
    normalizeOracleState: () => null,
    reconstructGraph: async () => graph,
    replaySafety: async () => { actions.push('replay'); return async () => true; },
    effectFences: async () => { actions.push('fences'); return async () => true; },
    oracle: async () => { actions.push('oracle'); return async () => true; },
    publication: async () => {
      actions.push('publication');
      return { getCandidate: async () => null, publishTerminal: async () => true };
    },
    ...(installResult === undefined ? {} : {
      installRecoveryTransport: async ({ client: actual }) => {
        actions.push('install');
        assert.equal(actual, client);
        return installResult;
      },
    }),
    proveColdGraphReceipt: async (context) => {
      actions.push('proof');
      assert.equal(context.graph, graph);
      assert.equal(context.candidate, candidate);
      return proveColdGraphReceipt;
    },
  });
  return { run, candidate, claim, actions };
}

test('rejected original receipt cannot reach replay, oracle or publication', async () => {
  const f = fixture(false);
  await assert.rejects(
    f.run({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true }),
    /NATIVE_COLD_RUNTIME_RECEIPT_PROOF_DENIED/,
  );
  assert.deepEqual(f.actions, ['proof']);
});

test('verified receipt reaches existing fences, replay and oracle callbacks', async () => {
  const f = fixture(true);
  const result = await f.run({
    candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true,
  });
  assert.deepEqual(f.actions, ['proof', 'fences', 'replay', 'oracle', 'publication']);
  assert.equal(typeof result.assertReplaySafe, 'function');
});

test('revoked authorization during original receipt verification cannot continue', async () => {
  const f = fixture(true);
  let checks = 0;
  await assert.rejects(
    f.run({
      candidate: f.candidate, claim: f.claim,
      assertAuthorized: async () => {
        if (++checks === 4) throw new Error('ACL_REVOKED');
      },
    }),
    /ACL_REVOKED/,
  );
  assert.deepEqual(f.actions, ['proof']);
});

test('receipt recovery cannot reconstruct a graph without broker transport', async () => {
  const f = fixture(true, false);
  await assert.rejects(
    f.run({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true }),
    /NATIVE_COLD_GRAPH_RECOVERY_ONLY_TRANSPORT_MISSING/,
  );
  assert.deepEqual(f.actions, []);
});

test('auth-bound read-only transport installer runs before graph proof', async () => {
  const f = fixture(true, true, true);
  await f.run({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true });
  assert.deepEqual(f.actions.slice(0, 2), ['install', 'proof']);
});
test('refused transport installer blocks graph, proof and publication', async () => {
  const f = fixture(true, true, false);
  await assert.rejects(
    f.run({ candidate: f.candidate, claim: f.claim, assertAuthorized: async () => true }),
    /NATIVE_COLD_RUNTIME_TRANSPORT_INSTALL_DENIED/,
  );
  assert.deepEqual(f.actions, ['install']);
});
