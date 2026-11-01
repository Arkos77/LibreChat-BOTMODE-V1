'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let createNativeMissionOriginalGraphBrokerHost;
try {
  Module._load = function(request, parent, isMain) {
    if (request === './nativeMissionWakeupOriginStore' &&
        parent?.filename?.endsWith('/nativeMissionOriginalGraphBrokerHost.js')) {
      return { canonicalMissionJson: (value) => JSON.stringify(value) };
    }
    return originalLoad.apply(this, arguments);
  };
  ({ createNativeMissionOriginalGraphBrokerHost } =
    require('./nativeMissionOriginalGraphBrokerHost'));
} finally {
  Module._load = originalLoad;
}
const plan = { planId: 'p1', tasks: [
  { key: 'research', nodeId: 'research', taskId: 't1', agentId: 'researcher' },
  { key: 'analysis', nodeId: 'analysis', taskId: 't2', agentId: 'analyst' },
]};
const attestation = { mode: 'receipts_required', planId: 'p1' };
const original = { userId: 'owner', tenantId: 'tenant', conversationId: 'conversation',
  parentResponseMessageId: 'response', originalCreatedAt: 1700000000000,
  checkpointNamespace: 'generation', fingerprint: 'a'.repeat(64),
  planId: 'p1', plan, capabilityAttestation: attestation };
const binding = { nodeId: 'analysis', taskId: 't2', agentId: 'analyst',
  provider: 'openrouter', model: 'free' };
function fixture(includeRecoveredReader) {
  const requests = [];
  let dispatched = 0;
  const checkpoint = ({ scope }) => ({
    threadId: scope.streamId, checkpointNamespace: scope.checkpointNamespace,
    checkpointId: 'checkpoint', pendingNodes: ['analysis'],
  });
  const host = createNativeMissionOriginalGraphBrokerHost({
    readOriginalGraphCheckpoint: checkpoint,
    ...(includeRecoveredReader ? { readRecoveredGraphCheckpoint: checkpoint } : {}),
    recordOriginalModelRequest: async () => { dispatched++; return true; },
    resolveModelBinding: () => ({ agentId: 'analyst', provider: 'openrouter',
      model: 'free', endpoint: 'https://openrouter.ai/api/v1/chat/completions' }),
    brokerUrl: 'http://ci-original-provider-broker:8096/',
    secret: 'ci-very-long-secret-longer-than-32-characters',
    fetchImpl: async (url, init) => {
      requests.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ status: 'result_committed',
        resultAvailable: true, response: { choices: [{ index: 0, finish_reason: 'stop',
          message: { role: 'assistant', content: 'saved' } }] } }), { status: 200 });
    },
  });
  return { host, requests, getDispatches: () => dispatched };
}
test('cold transport checks only the original broker status and never dispatches', async () => {
  const f = fixture(true);
  const client = { orchestratorPlan: plan };
  const factory = f.host.makeRecoveryFetchFactory({ original, plan,
    capabilityAttestation: attestation, client });
  const transport = factory(binding);
  const response = await transport('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'free', stream: false, messages: [] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(f.requests.map((request) => request.path), ['/status-native-graph']);
  assert.equal(f.getDispatches(), 0);
});
test('cold factory rejects missing reconstructed checkpoint reader', () => {
  const f = fixture(false);
  assert.throws(() => f.host.makeRecoveryFetchFactory({ original, plan,
    capabilityAttestation: attestation, client: { orchestratorPlan: plan } }),
  /NATIVE_GRAPH_BROKER_COLD_CHECKPOINT_READER_MISSING/);
});

test('cold reader can be bound from authenticated reconstructed graph context', async () => {
  const f = fixture(false);
  let reads = 0;
  const client = { orchestratorPlan: plan };
  const factory = f.host.makeRecoveryFetchFactoryWithReader({ original, plan,
    capabilityAttestation: attestation, client }, ({ scope }) => {
      reads++;
      assert.equal(scope.recoveryOnly, true);
      return { threadId: scope.streamId, checkpointNamespace: scope.checkpointNamespace,
        checkpointId: 'checkpoint', pendingNodes: ['analysis'] };
    });
  const transport = factory(binding);
  const result = await transport('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'free', stream: false, messages: [] }),
  });
  assert.equal(result.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(f.requests.map((request) => request.path), ['/status-native-graph']);
  assert.equal(f.getDispatches(), 0);
});
