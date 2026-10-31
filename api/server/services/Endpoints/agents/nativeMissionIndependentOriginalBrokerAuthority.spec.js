'use strict';

const { createHash } = require('node:crypto');
const {
  createNativeMissionIndependentOriginalBrokerAuthority: create,
} = require('./nativeMissionIndependentOriginalBrokerAuthority');

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = {
  userId: 'owner',
  tenantId: 'tenant',
  parentConversationId: 'parent',
  parentRunId: 'response',
  childThreadId: 'child',
  taskId: 'task',
  attemptKey: 'attempt',
  agentId: 'analysis',
  provider: 'openrouter',
  model: 'ci-free',
  operationKey: 'a'.repeat(64),
};
const requestDigest = 'b'.repeat(64);
const graphThreadId =
  'subagent:' +
  Buffer.from(JSON.stringify(['parent', 'fork', 'worker', 'tool', 'batch'])).toString('base64url');
const fingerprint = 'c'.repeat(64);
const row = {
  callKey: sha(identity),
  identity,
  requestDigest,
  originFingerprint: fingerprint,
  parentToolCallId: 'tool',
  checkpointId: 'original-checkpoint',
  graphThreadId,
  checkpointNs: '',
  generationNamespace: 'generation',
  originalSlotKey: sha({
    ...Object.fromEntries(Object.entries(identity).filter(([key]) => key !== 'operationKey')),
    parentToolCallId: 'tool',
    graphThreadId,
    checkpointId: 'original-checkpoint',
    checkpointNs: '',
    generationNamespace: 'generation',
  }),
};
const origin = {
  userId: 'owner',
  tenantId: 'tenant',
  conversationId: 'parent',
  parentResponseMessageId: 'response',
  agentId: 'worker',
  fingerprint,
  checkpointNamespace: 'generation',
  capabilityAttestation: { mode: 'receipts_required' },
  plan: { tasks: [{ agentId: 'worker' }, { agentId: 'analysis' }] },
};
const checkpoint = {
  graphThreadId,
  checkpointId: 'original-checkpoint',
  checkpointNs: '',
  generationNamespace: 'generation',
  taskId: 'task',
  attemptKey: 'attempt',
  childThreadId: 'child',
};
const child = {
  conversationId: 'child',
  tenantId: 'tenant',
  agent_id: 'analysis',
  endpoint: 'agents',
  subagentThread: {
    parentConversationId: 'parent',
    rootConversationId: 'parent',
    parentMessageId: 'response',
    parentToolCallId: 'tool',
    parentAgentId: 'worker',
    subagentKind: 'agent',
    subagentType: 'analysis',
  },
};
function fixtures(changes = {}) {
  const lease = jest.fn(async () => true);
  const deps = {
    findOriginalOperation: jest.fn(async () => row),
    getMissionOrigin: jest.fn(async () => origin),
    getConvo: jest.fn(async (_user, id) =>
      id === 'parent'
        ? { conversationId: 'parent', tenantId: 'tenant', agent_id: 'worker' }
        : child,
    ),
    getStartReceipt: jest.fn(async () => ({
      conversationId: 'child',
      messageId: 'task:user',
      subagentTask: { status: 'running', attemptKey: 'attempt', parentRunId: 'response' },
    })),
    readOriginalCheckpoint: jest.fn(async () => checkpoint),
    authorizeCurrentOwner: jest.fn(async () => true),
    canViewAgent: jest.fn(async () => true),
    inspectOriginalChildOwner: lease,
    getCurrentModelBinding: jest.fn(async () => ({ provider: 'openrouter', model: 'ci-free' })),
    ...changes,
  };
  return { authority: create(deps), lease, deps };
}

describe('independent broker original persisted operation authority', () => {
  it('authorizes ONLY the exact immutable operation, original checkpoint and current owner', async () => {
    const { authority, lease, deps } = fixtures();
    await expect(authority({ identity, requestDigest, operation: 'execute' })).resolves.toBe(true);
    expect(lease).toHaveBeenCalledTimes(1);
    expect(deps.findOriginalOperation).toHaveBeenCalledWith({ callKey: sha(identity) });
    expect(deps.readOriginalCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ graphThreadId, checkpointId: 'original-checkpoint' }),
    );
  });

  it('permits a committed receipt read without resurrecting the expired execution lease', async () => {
    const { authority, lease } = fixtures({
      inspectOriginalChildOwner: jest.fn(async () => false),
    });
    await expect(authority({ identity, requestDigest, operation: 'read' })).resolves.toBe(true);
    expect(lease).not.toHaveBeenCalled();
  });

  it('never authorizes another tenant, digest, model, checkpoint or mission', async () => {
    for (const different of [
      { identity: { ...identity, tenantId: 'another-tenant' } },
      { requestDigest: 'f'.repeat(64) },
    ]) {
      const { authority } = fixtures();
      await expect(
        authority({ identity, requestDigest, operation: 'execute', ...different }),
      ).resolves.toBe(false);
    }
    for (const deps of [
      { findOriginalOperation: async () => ({ ...row, originalSlotKey: 'f'.repeat(64) }) },
      { findOriginalOperation: async () => ({ ...row, graphThreadId: 'subagent:foreign' }) },
      { getMissionOrigin: async () => ({ ...origin, fingerprint: 'd'.repeat(64) }) },
      { readOriginalCheckpoint: async () => ({ ...checkpoint, checkpointId: 'foreign' }) },
      { getCurrentModelBinding: async () => ({ provider: 'openrouter', model: 'paid' }) },
      { canViewAgent: async () => false },
      { authorizeCurrentOwner: async () => false },
    ]) {
      const { authority } = fixtures(deps);
      await expect(authority({ identity, requestDigest, operation: 'execute' })).resolves.toBe(
        false,
      );
    }
  });

  it('rejects an absent current lease for dispatch, without promoting to a read-only dispatch', async () => {
    const lease = jest.fn(async () => false);
    const { authority } = fixtures({ inspectOriginalChildOwner: lease });
    await expect(authority({ identity, requestDigest, operation: 'execute' })).resolves.toBe(false);
    expect(lease).toHaveBeenCalledTimes(1);
  });

  it('does not admit unknown operations or incomplete independent broker dependencies', async () => {
    const { authority } = fixtures();
    await expect(authority({ identity, requestDigest, operation: 'guess' })).resolves.toBe(false);
    expect(() => create({})).toThrow('NATIVE_BROKER_ORIGINAL_AUTH_DEPENDENCIES');
  });
});
