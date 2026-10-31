'use strict';

const {
  createNativeMissionOriginalGraphBrokerHost,
  bindNativeMissionOriginalGraphBrokerForAcceptedMission,
} = require('./nativeMissionOriginalGraphBrokerHost');

const tasks = [
  { key: 'research', nodeId: 'research-node', taskId: 'research-task', agentId: 'researcher' },
  { key: 'analysis', nodeId: 'analysis-node', taskId: 'analysis-task', agentId: 'analyst' },
];
const plan = { planId: 'p1', tasks };
const capabilityAttestation = { planId: 'p1', mode: 'receipts_required' };
const original = {
  userId: 'owner',
  tenantId: 'tenant',
  conversationId: 'conversation',
  parentResponseMessageId: 'response',
  originalCreatedAt: 1700000000000,
  checkpointNamespace: 'generation',
  agentId: 'worker',
  planId: 'p1',
  plan,
  capabilityAttestation,
  fingerprint: 'a'.repeat(64),
};
const binding = {
  agentId: 'analyst',
  nodeId: 'analysis-node',
  taskId: 'analysis-task',
  provider: 'OpenRouter',
  model: 'ci-free',
};
const reader = jest.fn(async (scope) => ({
  threadId: scope.streamId,
  checkpointId: 'original-analysis-checkpoint',
  checkpointNamespace: scope.checkpointNamespace,
  pendingNodes: ['analysis-node'],
}));
function setup(changes = {}) {
  const readOriginalGraphCheckpoint = jest.fn(async (...args) => reader(...args));
  const resolveModelBinding = jest.fn(() => ({
    agentId: 'analyst',
    provider: 'openrouter',
    model: 'ci-free',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  }));
  const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
    status: 'result_committed',
    resultAvailable: true,
    response: {
      choices: [{
        index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: 'original result' },
      }],
    },
  }), { status: 200 }));
  const host = createNativeMissionOriginalGraphBrokerHost({
    readOriginalGraphCheckpoint,
    resolveModelBinding,
    brokerUrl: 'http://ci-original-provider-broker:8096/',
    secret: 'ci-original-native-graph-transport-secret-32-plus-chars',
    fetchImpl,
    ...changes,
  });
  return { host, readOriginalGraphCheckpoint, resolveModelBinding, fetchImpl };
}
const newClient = () => ({
  user: 'owner',
  conversationId: 'conversation',
  jobCreatedAt: 1700000000000,
  checkpointNamespace: 'generation',
  orchestratorPlan: plan,
  options: { agent: { id: 'worker' } },
});
describe('original native graph host binding (opt-in only)', () => {
  it('binds saved original mission once, not an SDK model-supplied node or epoch', async () => {
    const { host, fetchImpl, readOriginalGraphCheckpoint } = setup();
    const client = newClient();
    expect(bindNativeMissionOriginalGraphBrokerForAcceptedMission({
      client, brokerHost: host, original, plan, capabilityAttestation,
    })).toBe(true);
    expect(typeof client.options.nativeGraphModelFetchFactory).toBe('function');
    const fetch = client.options.nativeGraphModelFetchFactory(binding);
    const result = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'ci-free', stream: false, messages: [{ role: 'user', content: 'original' }],
      }),
    });
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readOriginalGraphCheckpoint).toHaveBeenCalledWith({
      userId: 'owner', tenantId: 'tenant', streamId: 'conversation',
      responseMessageId: 'response', generationCreatedAt: 1700000000000,
      checkpointNamespace: 'generation', nodeId: 'analysis-node',
      taskId: 'analysis-task', agentId: 'analyst',
    });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.identity).toMatchObject({
      mode: 'native_graph', streamId: 'conversation',
      responseMessageId: 'response', nodeId: 'analysis-node',
      graphCheckpointId: 'original-analysis-checkpoint',
      agentId: 'analyst',
    });
    expect(payload.identity).not.toHaveProperty('operationKey');
  });

  it('denies foreign tasks, revised model and a replacement mission', () => {
    const { host } = setup();
    const factory = host.makeMissionFetchFactory({ original, plan, capabilityAttestation });
    expect(() => factory({ ...binding, nodeId: 'foreign-node' }))
      .toThrow('NATIVE_GRAPH_BROKER_ORIGINAL_ACTOR_NOT_SELECTED');
    expect(() => factory({ ...binding, agentId: 'worker' }))
      .toThrow('NATIVE_GRAPH_BROKER_ORIGINAL_ACTOR_NOT_SELECTED');
    expect(() => factory({ ...binding, model: 'other-model' }))
      .toThrow('NATIVE_GRAPH_FETCH_FACTORY_MODEL_UNAUTHORIZED');
    for (const modified of [
      { ...original, fingerprint: 'forged' },
      { ...original, checkpointNamespace: 'another-generation' },
      { ...original, originalCreatedAt: 1700000000001 },
      { ...original, planId: 'another-plan' },
      { ...original, plan: { ...plan, tasks: [tasks[0]] } },
    ]) {
      if (modified.checkpointNamespace !== original.checkpointNamespace &&
          modified.fingerprint === original.fingerprint &&
          modified.planId === original.planId &&
          modified.plan === plan &&
          modified.originalCreatedAt === original.originalCreatedAt) {
        // Epoch is compared by the CLIENT binder (not a mutable input).
        const client = newClient();
        expect(() => bindNativeMissionOriginalGraphBrokerForAcceptedMission({
          client, brokerHost: host, original: modified, plan, capabilityAttestation,
        })).toThrow('NATIVE_GRAPH_BROKER_CLIENT_ORIGINAL_MISSION_MISMATCH');
      } else {
        expect(() => host.makeMissionFetchFactory({
          original: modified, plan, capabilityAttestation,
        })).toThrow('NATIVE_GRAPH_BROKER_ORIGINAL_MISSION_UNVERIFIED');
      }
    }
  });

  it('leaves the client unchanged when no host is configured or admission is denied', () => {
    const client = newClient();
    expect(bindNativeMissionOriginalGraphBrokerForAcceptedMission({
      client, brokerHost: undefined, original, plan, capabilityAttestation,
    })).toBe(false);
    expect(client.options.nativeGraphModelFetchFactory).toBeUndefined();
    const { host } = setup();
    for (const partial of [
      { ...client, user: 'foreign-owner' },
      { ...client, jobCreatedAt: 1700000000002 },
      { ...client, checkpointNamespace: 'replaced' },
      { ...client, orchestratorPlan: { ...plan, tasks: [tasks[0]] } },
    ]) {
      expect(() => bindNativeMissionOriginalGraphBrokerForAcceptedMission({
        client: partial, brokerHost: host, original, plan, capabilityAttestation,
      })).toThrow('NATIVE_GRAPH_BROKER_CLIENT_ORIGINAL_MISSION_MISMATCH');
      expect(partial.options.nativeGraphModelFetchFactory).toBeUndefined();
    }
    expect(() => createNativeMissionOriginalGraphBrokerHost({
      resolveModelBinding: () => null,
    })).toThrow('NATIVE_GRAPH_BROKER_HOST_DEPENDENCIES_MISSING');
  });
});
