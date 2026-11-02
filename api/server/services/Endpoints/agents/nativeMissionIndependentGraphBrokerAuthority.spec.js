'use strict';

const {
  createNativeMissionIndependentGraphBrokerAuthority,
} = require('./nativeMissionIndependentGraphBrokerAuthority');

const original = Object.freeze({
  mode: 'native_graph',
  userId: 'owner',
  tenantId: 'tenant',
  streamId: 'conversation',
  responseMessageId: 'response',
  generationCreatedAt: 1700000000000,
  checkpointNamespace: 'generation',
  graphCheckpointId: 'original-checkpoint',
  nodeId: 'mission-analysis-node',
  taskId: 'mission-analysis-task',
  agentId: 'analysis',
  provider: 'openrouter',
  model: 'ci-free',
});
const digest = 'c'.repeat(64);
const request = { model: 'ci-free', stream: false, messages: [{ role: 'user', content: 'ci' }] };
const task = { nodeId: original.nodeId, taskId: original.taskId, agentId: original.agentId };
const origin = {
  userId: original.userId,
  tenantId: original.tenantId,
  conversationId: original.streamId,
  parentResponseMessageId: original.responseMessageId,
  agentId: 'worker',
  originalCreatedAt: original.generationCreatedAt,
  checkpointNamespace: original.checkpointNamespace,
  fingerprint: 'a'.repeat(64),
  planId: 'mission-plan',
  plan: { planId: 'mission-plan', tasks: [task] },
  capabilityAttestation: { planId: 'mission-plan', mode: 'receipts_required' },
};
const proof = {
  checkpointId: original.graphCheckpointId,
  checkpointNamespace: original.checkpointNamespace,
  threadId: original.streamId,
  pendingNodes: [original.nodeId],
};
function fixture(overrides = {}) {
  const dependencies = {
    getMissionOrigin: jest.fn(async () => origin),
    getConvo: jest.fn(async () => ({
      conversationId: original.streamId, tenantId: original.tenantId, agent_id: 'worker',
    })),
    authorizeCurrentOwner: jest.fn(async () => true),
    canViewAgent: jest.fn(async () => true),
    getCurrentModelBinding: jest.fn(async () => ({ provider: 'openrouter', model: 'ci-free' })),
    readOriginalGraphCheckpoint: jest.fn(async () => proof),
    verifyOriginalModelRequest: jest.fn(async () => true),
    inspectOriginalGraphLease: jest.fn(async () => true),
    ...overrides,
  };
  return {
    deps: dependencies,
    authority: createNativeMissionIndependentGraphBrokerAuthority(dependencies),
  };
}

describe('original native graph independent broker admission', () => {
  it('checks immutable mission, original graph node and live generation lease for first dispatch', async () => {
    const { deps, authority } = fixture();
    await expect(authority({
      identity: original, requestDigest: digest,
      operation: 'reserve_native_graph', authorizedRequest: request,
    })).resolves.toBe(true);
    expect(deps.getMissionOrigin).toHaveBeenCalledWith({
      userId: 'owner', tenantId: 'tenant', conversationId: 'conversation',
      parentResponseMessageId: 'response', agentId: 'worker',
    });
    expect(deps.readOriginalGraphCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      checkpointId: 'original-checkpoint', nodeId: 'mission-analysis-node',
      checkpointNamespace: 'generation', createdAt: 1700000000000,
    }));
    expect(deps.verifyOriginalModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestDigest: digest, authorizedRequest: request,
    }));
    expect(deps.inspectOriginalGraphLease).toHaveBeenCalledTimes(1);
  });

  it('reads an original receipt without reacquiring the expired dispatch lease', async () => {
    const { deps, authority } = fixture({
      inspectOriginalGraphLease: jest.fn(async () => false),
      verifyOriginalModelRequest: jest.fn(async () => false),
    });
    await expect(authority({
      identity: original, requestDigest: digest, operation: 'read_native_graph',
    })).resolves.toBe(true);
    expect(deps.inspectOriginalGraphLease).not.toHaveBeenCalled();
    expect(deps.verifyOriginalModelRequest).not.toHaveBeenCalled();
    await expect(authority({
      identity: original, requestDigest: digest,
      operation: 'reserve_native_graph', authorizedRequest: request,
    })).resolves.toBe(false);
  });

  it('denies unknown node, substituted agent, generation and changed namespace', async () => {
    const { authority } = fixture();
    for (const patch of [
      { nodeId: 'foreign-node' }, { agentId: 'other-agent' },
      { taskId: 'other-task' }, { graphCheckpointId: 'other-checkpoint' },
      { checkpointNamespace: 'other-generation' },
      { generationCreatedAt: original.generationCreatedAt + 1 },
      { responseMessageId: 'other-response' }, { tenantId: 'foreign-tenant' },
      { streamId: 'other-conversation' }, { model: 'other-model' },
      { operationKey: 'e'.repeat(64) },
    ]) {
      await expect(authority({
        identity: { ...original, ...patch }, requestDigest: digest,
        operation: 'read_native_graph',
      })).resolves.toBe(false);
    }
  });

  it('never assumes old model-only admission, unsigned origin, or tool-capable graph proof is safe', async () => {
    for (const overrides of [
      { getMissionOrigin: async () => ({ ...origin, capabilityAttestation: { ...origin.capabilityAttestation, mode: 'model_only' } }) },
      { getMissionOrigin: async () => ({ ...origin, fingerprint: '' }) },
      { getMissionOrigin: async () => ({ ...origin, hasAttachments: true }) },
      { getMissionOrigin: async () => ({ ...origin, plan: { planId: 'mission-plan', tasks: [] } }) },
      { getConvo: async () => ({ conversationId: 'conversation', tenantId: 'tenant', agent_id: 'worker', subagentThread: {} }) },
      { getCurrentModelBinding: async () => ({ provider: 'openrouter', model: 'different' }) },
      { readOriginalGraphCheckpoint: async () => ({ ...proof, pendingNodes: [] }) },
      { readOriginalGraphCheckpoint: async () => ({ ...proof, pendingNodes: [original.nodeId, 'unplanned-effect'] }) },
      { readOriginalGraphCheckpoint: async () => ({ ...proof, checkpointId: 'different' }) },
      { authorizeCurrentOwner: async () => false },
      { canViewAgent: async () => false },
    ]) {
      const { authority } = fixture(overrides);
      await expect(authority({
        identity: original, requestDigest: digest, operation: 'read_native_graph',
      })).resolves.toBe(false);
    }
  });

  it('requires live original lease and model request proof before ANY fresh provider effect', async () => {
    for (const overrides of [
      { inspectOriginalGraphLease: async () => false },
      { verifyOriginalModelRequest: async () => false },
    ]) {
      const { authority } = fixture(overrides);
      await expect(authority({
        identity: original, requestDigest: digest,
        operation: 'reserve_native_graph', authorizedRequest: request,
      })).resolves.toBe(false);
    }
    const { authority } = fixture();
    await expect(authority({
      identity: original, requestDigest: digest, operation: 'reserve_native_graph',
    })).resolves.toBe(false);
    await expect(authority({
      identity: original, requestDigest: digest, operation: 'execute',
      authorizedRequest: request,
    })).resolves.toBe(false);
    expect(() => createNativeMissionIndependentGraphBrokerAuthority({
      getMissionOrigin: () => true,
    })).toThrow('NATIVE_GRAPH_BROKER_AUTH_DEPENDENCIES_MISSING');
  });
});
