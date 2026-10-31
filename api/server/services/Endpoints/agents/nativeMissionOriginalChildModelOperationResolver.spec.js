'use strict';

const {
  createNativeMissionOriginalChildModelOperationResolver,
} = require('./nativeMissionOriginalChildModelOperationResolver');

const HASH = 'a'.repeat(64);
const OP = 'b'.repeat(64);
const DIGEST = 'c'.repeat(64);
const original = {
  userId: 'owner',
  tenantId: 'tenant',
  parentConversationId: 'parent',
  parentRunId: 'parent-response',
  parentToolCallId: 'tool-call',
  childThreadId: 'child',
  taskId: 'task',
  attemptKey: 'attempt',
  agentId: 'analysis-agent',
};
const args = { scope: original, provider: 'openrouter', model: 'free-ci', requestDigest: DIGEST };
const receipt = {
  ...original,
  ...args,
  scope: undefined,
  originFingerprint: HASH,
  operationKey: OP,
  checkpointId: 'checkpoint-of-original-model-turn',
  status: 'result_committed',
};
const origin = {
  userId: original.userId,
  tenantId: original.tenantId,
  conversationId: original.parentConversationId,
  parentResponseMessageId: original.parentRunId,
  agentId: 'parent-agent',
  fingerprint: HASH,
  planId: 'plan-id',
  plan: {
    planId: 'plan-id',
    tasks: [{ agentId: 'parent-agent' }, { agentId: original.agentId }],
  },
  capabilityAttestation: { mode: 'receipts_required' },
};

function setup(overrides = {}) {
  const deps = {
    authorizeCurrentOwner: jest.fn(async () => true),
    canViewAgent: jest.fn(async () => true),
    inspectOriginalChildOwner: jest.fn(async () => true),
    getConvo: jest.fn(async (_user, id) =>
      id === 'parent'
        ? { conversationId: 'parent', tenantId: 'tenant', agent_id: 'parent-agent' }
        : {
            conversationId: 'child',
            tenantId: 'tenant',
            agent_id: 'analysis-agent',
            endpoint: 'agents',
            subagentThread: {
              parentConversationId: 'parent',
              rootConversationId: 'parent',
              parentMessageId: 'parent-response',
              parentToolCallId: 'tool-call',
              parentAgentId: 'parent-agent',
              subagentKind: 'agent',
              subagentType: 'analysis-agent',
            },
          },
    ),
    getMissionOrigin: jest.fn(async () => origin),
    getStartReceipt: jest.fn(async () => ({
      conversationId: original.childThreadId,
      messageId: original.taskId + ':user',
      subagentTask: {
        status: 'running',
        parentRunId: original.parentRunId,
        attemptKey: original.attemptKey,
      },
    })),
    findOriginalOperations: jest.fn(async () => [receipt]),
    getOriginalCheckpoint: jest.fn(async () => ({
      checkpointId: receipt.checkpointId,
      taskId: original.taskId,
      attemptKey: original.attemptKey,
      childThreadId: original.childThreadId,
      provider: args.provider,
      model: args.model,
      operationKey: OP,
      requestDigest: DIGEST,
    })),
    ...overrides,
  };
  return { deps, resolve: createNativeMissionOriginalChildModelOperationResolver(deps) };
}

describe('original native child model operation grant: immutable and fail closed', () => {
  it('resolves only the exact existing checkpointed operation without creating a call', async () => {
    const { deps, resolve } = setup();
    const result = await resolve(args);
    expect(result).toEqual({
      approved: true,
      scope: original,
      operationKey: OP,
      provider: args.provider,
      model: args.model,
      requestDigest: DIGEST,
      checkpointId: receipt.checkpointId,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.scope)).toBe(true);
    expect(deps.findOriginalOperations).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task', attemptKey: 'attempt', requestDigest: DIGEST }),
    );
    expect(deps.getOriginalCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: receipt.checkpointId }),
    );
  });

  it('refuses forged journal operation keys or request digests absent from the original checkpoint', async () => {
    for (const mismatch of [
      { operationKey: 'd'.repeat(64) },
      { requestDigest: 'e'.repeat(64) },
      { operationKey: undefined },
      { requestDigest: undefined },
    ]) {
      const { deps, resolve } = setup({
        getOriginalCheckpoint: async () => ({
          checkpointId: receipt.checkpointId,
          taskId: original.taskId,
          attemptKey: original.attemptKey,
          childThreadId: original.childThreadId,
          provider: args.provider,
          model: args.model,
          operationKey: OP,
          requestDigest: DIGEST,
          ...mismatch,
        }),
      });
      await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_CHECKPOINT_PROOF_DENIED');
      expect(deps.findOriginalOperations).toHaveBeenCalledTimes(1);
    }
  });

  it('accepts one checkpoint-bound Mongo reservation without pretending LangGraph stores the generated operation key', async () => {
    const graph = {
      originalSlotKey: 'f'.repeat(64),
      graphThreadId: 'subagent:original-graph',
      checkpointNs: '',
      generationNamespace: 'original-generation',
    };
    const saved = {
      checkpointId: receipt.checkpointId,
      taskId: original.taskId,
      attemptKey: original.attemptKey,
      childThreadId: original.childThreadId,
      provider: args.provider,
      model: args.model,
      graphThreadId: graph.graphThreadId,
      checkpointNs: graph.checkpointNs,
      generationNamespace: graph.generationNamespace,
    };
    const { resolve } = setup({
      findOriginalOperations: async () => [{ ...receipt, ...graph }],
      getOriginalCheckpoint: async () => saved,
    });
    await expect(resolve(args)).resolves.toMatchObject({
      approved: true,
      operationKey: OP,
      checkpointId: receipt.checkpointId,
    });
    const altered = setup({
      findOriginalOperations: async () => [{ ...receipt, ...graph }],
      getOriginalCheckpoint: async () => ({
        ...saved,
        graphThreadId: 'subagent:foreign-graph',
      }),
    });
    await expect(altered.resolve(args)).rejects.toThrow(
      'NATIVE_MODEL_OPERATION_CHECKPOINT_PROOF_DENIED',
    );
  });

  it('rejects an uncheckpointed call even if a matching child start exists', async () => {
    const { resolve } = setup({ findOriginalOperations: async () => [] });
    await expect(resolve(args)).rejects.toThrow(
      'NATIVE_MODEL_OPERATION_PROOF_MISSING_OR_AMBIGUOUS',
    );
  });

  it('never picks the most recent matching prompt if two operations exist', async () => {
    const { resolve } = setup({ findOriginalOperations: async () => [receipt, receipt] });
    await expect(resolve(args)).rejects.toThrow(
      'NATIVE_MODEL_OPERATION_PROOF_MISSING_OR_AMBIGUOUS',
    );
  });

  it('rejects altered checkpoint/model/attempt lineage', async () => {
    for (const altered of [
      { checkpointId: '' },
      { attemptKey: 'second-attempt' },
      { model: 'paid-model' },
      { originFingerprint: 'f'.repeat(64) },
      { parentToolCallId: 'foreign-call' },
      { operationKey: 'invalid' },
    ]) {
      const { resolve } = setup({
        findOriginalOperations: async () => [{ ...receipt, ...altered }],
      });
      await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_CHECKPOINT_PROOF_DENIED');
    }
  });

  it('rejects a child whose saved conversation no longer belongs to the parent', async () => {
    const { deps, resolve } = setup();
    // Capture the original implementation, not the mutable Jest mock.
    // Referencing deps.getConvo after mockImplementation calls the new
    // implementation recursively and overflows the stack.
    const previous = deps.getConvo.getMockImplementation();
    deps.getConvo.mockImplementation(async (user, id) =>
      id === 'child'
        ? { ...(await previous(user, id)), subagentThread: { parentConversationId: 'foreign' } }
        : previous(user, id),
    );
    await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_CHILD_LINEAGE_DENIED');
    expect(deps.findOriginalOperations).not.toHaveBeenCalled();
  });

  it('rejects a forged tenant and a changed original capability classification', async () => {
    const forged = setup();
    await expect(
      forged.resolve({ ...args, scope: { ...original, tenantId: 'other' } }),
    ).rejects.toThrow('NATIVE_MODEL_OPERATION_CHILD_LINEAGE_DENIED');
    const { resolve } = setup({
      getMissionOrigin: async () => ({
        ...origin,
        capabilityAttestation: { mode: 'model_only' },
      }),
    });
    await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_ORIGIN_DENIED');
  });

  it('rejects revoked owner, agent ACL or exclusive execution lease', async () => {
    for (const disabled of ['authorizeCurrentOwner', 'canViewAgent', 'inspectOriginalChildOwner']) {
      const { deps, resolve } = setup();
      deps[disabled].mockResolvedValue(false);
      await expect(resolve(args)).rejects.toThrow(
        'NATIVE_MODEL_OPERATION_CURRENT_AUTHORITY_DENIED',
      );
      expect(deps.findOriginalOperations).not.toHaveBeenCalled();
    }
  });

  it('rejects revocation occurring after Mongo and checkpoint reads', async () => {
    const { deps, resolve } = setup();
    deps.inspectOriginalChildOwner.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_AUTHORITY_CHANGED');
  });

  it('does not treat a completed child as permission to re-run its provider', async () => {
    const { resolve } = setup({
      getStartReceipt: async () => ({
        messageId: 'task:user',
        conversationId: 'child',
        subagentTask: {
          status: 'completed',
          parentRunId: 'parent-response',
          attemptKey: 'attempt',
        },
      }),
    });
    await expect(resolve(args)).rejects.toThrow('NATIVE_MODEL_OPERATION_TASK_ATTEMPT_DENIED');
  });

  it('refuses an invalid operation digest or incomplete dependencies before any I/O', async () => {
    const { resolve, deps } = setup();
    await expect(resolve({ ...args, requestDigest: 'not-a-digest' })).rejects.toThrow(
      'NATIVE_MODEL_OPERATION_SCOPE_INVALID',
    );
    expect(deps.getConvo).not.toHaveBeenCalled();
    expect(() => createNativeMissionOriginalChildModelOperationResolver({})).toThrow(
      'NATIVE_MODEL_OPERATION_RESOLVER_DEPENDENCIES',
    );
  });
});
