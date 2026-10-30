'use strict';
const {
  inspectNativeMissionDetachedChildColdInventory: inspect,
} = require('./nativeMissionDetachedChildColdInventory');

const scope = {
  userId: 'ci-user',
  tenantId: 'ci-tenant',
  parentConversationId: 'ci-parent-conversation',
  parentResponseMessageId: 'ci-parent-response',
  parentAgentId: 'ci-parent-agent',
};
const origin = {
  userId: scope.userId,
  tenantId: scope.tenantId,
  conversationId: scope.parentConversationId,
  parentResponseMessageId: scope.parentResponseMessageId,
  agentId: scope.parentAgentId,
  planId: 'ci-plan',
  plan: {
    planId: 'ci-plan',
    tasks: [
      { nodeId: 'worker', agentId: scope.parentAgentId },
      { nodeId: 'specialist', agentId: 'ci-specialist-agent' },
    ],
  },
  capabilityAttestation: { mode: 'receipts_required' },
};
const start = (taskId, threadId, attemptKey = 'attempt-1') => ({
  messageId: taskId + ':user',
  conversationId: threadId,
  subagentTask: {
    status: 'running',
    attemptKey,
    parentRunId: scope.parentResponseMessageId,
  },
});
const terminal = (taskId, threadId, status = 'completed', attemptKey = 'attempt-1') => ({
  messageId: taskId + ':assistant',
  conversationId: threadId,
  subagentTask: { status, attemptKey, parentRunId: scope.parentResponseMessageId },
});
const convo = (id) =>
  id === scope.parentConversationId
    ? { conversationId: id, agent_id: scope.parentAgentId, tenantId: scope.tenantId }
    : {
        conversationId: id,
        tenantId: scope.tenantId,
        endpoint: 'agents',
        agent_id: 'ci-specialist-agent',
        subagentThread: {
          subagentKind: 'agent',
          subagentType: 'ci-specialist-agent',
          parentConversationId: scope.parentConversationId,
          rootConversationId: scope.parentConversationId,
          parentMessageId: scope.parentResponseMessageId,
          parentToolCallId: 'ci-tool-call',
          parentAgentId: scope.parentAgentId,
        },
      };
const run = (rows, overrides = {}) => {
  const getMissionOrigin = jest.fn().mockResolvedValue(origin);
  const getConvo = jest.fn(async (_user, id) => convo(id));
  const getMessages = jest.fn().mockResolvedValue(rows);
  const deps = { getMissionOrigin, getConvo, getMessages, ...overrides };
  return { result: inspect({ ...scope, ...deps }), ...deps };
};

describe('read-only native detached child cold inventory', () => {
  it('reports the incomplete child without ever granting execution', async () => {
    const rows = [
      start('research', 'thread-1'),
      terminal('research', 'thread-1'),
      start('analysis', 'thread-2'),
    ];
    const { result, getMessages } = run(rows);
    await expect(result).resolves.toMatchObject({
      status: 'blocked_pending_effect_proof',
      executionAuthorized: false,
      completed: 1,
      pending: [{ threadId: 'thread-2', taskId: 'analysis', attemptKey: 'attempt-1' }],
    });
    expect(getMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        user: scope.userId,
        'subagentTask.parentRunId': scope.parentResponseMessageId,
      }),
      expect.stringContaining('+subagentTask'),
      expect.objectContaining({ limit: 257 }),
    );
  });

  it('recognizes completed receipts but never authorizes replay', async () => {
    const rows = [start('research', 'thread-1'), terminal('research', 'thread-1')];
    await expect(run(rows).result).resolves.toMatchObject({
      status: 'settled',
      executionAuthorized: false,
      completed: 1,
      pending: [],
    });
  });

  it('refuses missing original mission and a false model-only claim', async () => {
    const rows = [start('research', 'thread-1')];
    const missing = { getMissionOrigin: jest.fn().mockResolvedValue(null) };
    await expect(run(rows, missing).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_ORIGIN_UNVERIFIED',
    });
    const changed = { ...origin, capabilityAttestation: { mode: 'model_only' } };
    const altered = { getMissionOrigin: jest.fn().mockResolvedValue(changed) };
    await expect(run(rows, altered).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_ORIGIN_UNVERIFIED',
    });
  });

  it('refuses a different tenant or parent conversation on the child', async () => {
    const rows = [start('research', 'thread-1')];
    const crossTenant = jest.fn(async (_user, id) =>
      id === 'thread-1' ? { ...convo(id), tenantId: 'other' } : convo(id),
    );
    await expect(run(rows, { getConvo: crossTenant }).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_THREAD_UNVERIFIED',
    });
    const wrongParent = jest.fn(async (_user, id) =>
      id === 'thread-1'
        ? {
            ...convo(id),
            subagentThread: { ...convo(id).subagentThread, parentMessageId: 'foreign' },
          }
        : convo(id),
    );
    await expect(run(rows, { getConvo: wrongParent }).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_THREAD_UNVERIFIED',
    });
  });

  it('refuses a child whose executable agent is outside the original plan', async () => {
    const rows = [start('analysis', 'thread-2')];
    const foreign = jest.fn(async (_user, id) =>
      id === 'thread-2'
        ? { ...convo(id), agent_id: 'foreign-agent' }
        : convo(id),
    );
    await expect(run(rows, { getConvo: foreign }).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_THREAD_UNVERIFIED',
    });
  });

  it('refuses original plans lacking a binding for the parent', async () => {
    const altered = {
      ...origin,
      plan: {
        planId: origin.planId,
        tasks: [{ nodeId: 'specialist', agentId: 'ci-specialist-agent' }],
      },
    };
    const getMissionOrigin = jest.fn().mockResolvedValue(altered);
    await expect(
      run([start('research', 'thread-1')], { getMissionOrigin }).result,
    ).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_AGENT_PLAN_UNVERIFIED',
    });
  });

  it('never matches terminal proof from another attempt', async () => {
    const rows = [
      start('research', 'thread-1', 'first'),
      terminal('research', 'thread-1', 'completed', 'second'),
    ];
    await expect(run(rows).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_ORPHAN_TERMINAL',
    });
  });

  it.each(['error', 'cancelled'])('refuses %s results', async (status) => {
    const rows = [start('analysis', 'thread-2'), terminal('analysis', 'thread-2', status)];
    await expect(run(rows).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_FAILED_CHILD',
    });
  });

  it('refuses missing, saturated or duplicate receipts', async () => {
    await expect(run(null).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_INCOMPLETE',
    });
    await expect(run(Array(257).fill(start('research', 'thread-1'))).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_INCOMPLETE',
    });
    const duplicate = [start('research', 'thread-1'), start('research', 'thread-1')];
    await expect(run(duplicate).result).rejects.toMatchObject({
      code: 'NATIVE_CHILD_COLD_INVENTORY_DUPLICATE',
    });
  });

  it('propagates Mongo read errors instead of assuming permission', async () => {
    const getMessages = jest.fn().mockRejectedValue(new Error('Mongo unavailable'));
    await expect(run([], { getMessages }).result).rejects.toThrow('Mongo unavailable');
  });
});
