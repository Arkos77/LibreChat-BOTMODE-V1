'use strict';

const {
  createNativeMissionOriginalChildCheckpointReader,
} = require('./nativeMissionOriginalChildCheckpointReader');

const scope = {
  userId: 'owner',
  tenantId: 'tenant',
  parentConversationId: 'parent',
  parentRunId: 'parent-response',
  parentToolCallId: 'original-call',
  childThreadId: 'child-conversation',
  taskId: 'original-task',
  attemptKey: 'original-attempt',
  agentId: 'analysis',
  provider: 'openrouter',
  model: 'free-ci',
  checkpointId: 'saved-checkpoint',
  checkpointNs: '',
  generationNamespace: 'original-generation',
};
scope.graphThreadId =
  'subagent:' +
  Buffer.from(
    JSON.stringify([
      scope.parentConversationId,
      'parent-graph-checkpoint',
      'worker',
      scope.parentToolCallId,
      'batch-id',
    ]),
  ).toString('base64url');

function setup(overrides = {}) {
  const getConvo = jest.fn(async (_owner, id) =>
    id === scope.parentConversationId
      ? { conversationId: id, tenantId: 'tenant', agent_id: 'worker' }
      : {
          conversationId: id,
          tenantId: 'tenant',
          agent_id: 'analysis',
          endpoint: 'agents',
          subagentThread: {
            parentConversationId: 'parent',
            rootConversationId: 'parent',
            parentMessageId: 'parent-response',
            parentToolCallId: 'original-call',
            parentAgentId: 'worker',
            subagentKind: 'agent',
            subagentType: 'analysis',
          },
        },
  );
  const getStartReceipt = jest.fn(async () => ({
    conversationId: 'child-conversation',
    messageId: 'original-task:user',
    subagentTask: {
      status: 'running',
      attemptKey: 'original-attempt',
      parentRunId: 'parent-response',
    },
  }));
  const getTuple = jest.fn(async (config) => ({
    checkpoint: { id: 'saved-checkpoint' },
    config: {
      configurable: { ...config.configurable },
    },
  }));
  const getCheckpointer = jest.fn(async () => ({ getTuple }));
  const assertGenerationNamespace = jest.fn(async () => true);
  return {
    read: createNativeMissionOriginalChildCheckpointReader({
      getConvo,
      getStartReceipt,
      getCheckpointer,
      assertGenerationNamespace,
      ...overrides,
    }),
    getTuple,
    getStartReceipt,
  };
}

describe('durable original SDK child checkpoint proof', () => {
  it('reads the exact persisted LangGraph checkpoint in the sealed original generation', async () => {
    const { read, getTuple } = setup();
    await expect(read(scope)).resolves.toMatchObject({
      graphThreadId: scope.graphThreadId,
      checkpointId: scope.checkpointId,
      generationNamespace: scope.generationNamespace,
      taskId: scope.taskId,
    });
    expect(getTuple).toHaveBeenCalledWith({
      configurable: expect.objectContaining({
        thread_id: scope.graphThreadId,
        checkpoint_id: scope.checkpointId,
        __librechat_checkpoint_ns: scope.generationNamespace,
      }),
    });
  });
  it('blocks a graph belonging to another original tool call before Mongo checkpoint IO', async () => {
    const { read, getTuple } = setup();
    await expect(read({ ...scope, parentToolCallId: 'foreign-tool' })).rejects.toThrow(
      'NATIVE_ORIGINAL_CHECKPOINT_GRAPH_ADDRESS_INVALID',
    );
    expect(getTuple).not.toHaveBeenCalled();
  });
  it('blocks an absent exact checkpoint and a mismatched generation namespace', async () => {
    const absent = setup({ getCheckpointer: async () => ({ getTuple: async () => null }) });
    await expect(absent.read(scope)).rejects.toThrow('NATIVE_ORIGINAL_CHECKPOINT_NOT_DURABLE');
    const changed = setup({
      getCheckpointer: async () => ({
        getTuple: async (config) => ({
          checkpoint: { id: scope.checkpointId },
          config: {
            configurable: {
              ...config.configurable,
              __librechat_checkpoint_ns: 'foreign-generation',
            },
          },
        }),
      }),
    });
    await expect(changed.read(scope)).rejects.toThrow('NATIVE_ORIGINAL_CHECKPOINT_NOT_DURABLE');
  });
  it('blocks a changed parent, revoked job generation, and a different task attempt', async () => {
    const changed = setup({
      getConvo: async (_u, id) =>
        id === scope.parentConversationId
          ? { conversationId: id, tenantId: 'tenant', agent_id: 'other-worker' }
          : null,
    });
    await expect(changed.read(scope)).rejects.toThrow(
      'NATIVE_ORIGINAL_CHECKPOINT_OWNER_LINEAGE_DENIED',
    );
    const revoked = setup({ assertGenerationNamespace: async () => false });
    await expect(revoked.read(scope)).rejects.toThrow(
      'NATIVE_ORIGINAL_CHECKPOINT_OWNER_LINEAGE_DENIED',
    );
    const attempted = setup({
      getStartReceipt: async () => ({
        conversationId: scope.childThreadId,
        messageId: scope.taskId + ':user',
        subagentTask: { status: 'running', attemptKey: 'other', parentRunId: scope.parentRunId },
      }),
    });
    await expect(attempted.read(scope)).rejects.toThrow(
      'NATIVE_ORIGINAL_CHECKPOINT_OWNER_LINEAGE_DENIED',
    );
  });
});
