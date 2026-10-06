const { createBotModeProjectProjection } = require('../botModeProjectProjection');

const projectA = '111111111111111111111111';
const projectB = '222222222222222222222222';

const observation = (traceId, traceEventId, type) => ({
  traceId,
  traceEventId,
  type,
  source: 'host',
  timestamp: '2026-10-02T19:00:00.000Z',
  identity: { agentId: 'agent-1' },
  payload: { decision: 'ALLOW' },
  user: 'private-user',
  tenantKey: 'private-tenant-key',
  eventDigest: 'private-digest',
  persistedAt: new Date('2026-10-02T19:00:01.000Z'),
});

function makeDeps() {
  const convosByProject = {
    [projectA]: [{ conversationId: 'conv-a' }],
    [projectB]: [{ conversationId: 'conv-b' }],
  };
  const messagesByConvo = {
    'conv-a': [
      {
        messageId: 'msg-a',
        conversationId: 'conv-a',
        isCreatedByUser: false,
        metadata: {
          mtoTraceId: 'trace-a',
          botModePlan: {
            planId: 'plan-a',
            planVersion: 2,
            strategy: 'PARALLEL',
            objective: 'Deliver project A',
            tasks: [
              {
                taskId: 'root-a/research',
                parentTaskId: 'root-a',
                objective: 'Research sources',
                requiredCapabilities: ['research'],
                dependsOn: [],
                canRunInParallel: true,
                agentId: 'private-agent-id',
                nodeId: 'private-node-id',
              },
            ],
          },
          usage: { input: 10, output: 4, cacheWrite: 1, cacheRead: 2, cost: 0.25 },
          hostModelUsage: {
            selectedProvider: 'OpenRouter',
            selectedModel: 'free-a',
            resolvedProvider: 'openrouter',
            resolvedModel: 'free-b',
            fallbackUsed: true,
            routingMode: 'adaptive',
            spendingPolicy: 'free_first',
            apiKey: 'private-model-key',
            authorizedBindings: [{ apiKey: 'private-binding-key' }],
            total: {
              inputTokens: 14,
              outputTokens: 3,
              costUsd: 0.0017,
              costKnown: true,
              latencyMs: 420,
              latencyKnown: true,
            },
          },
        },
      },
    ],
    'conv-b': [
      {
        messageId: 'msg-b',
        conversationId: 'conv-b',
        isCreatedByUser: false,
        metadata: {
          mtoTraceId: 'trace-b',
          usage: { input: 20, output: 8, cacheWrite: 0, cacheRead: 3, cost: 0.5 },
        },
      },
    ],
  };

  return {
    getChatProject: jest.fn(async (user, projectId) =>
      user === 'owner' && convosByProject[projectId] ? { _id: projectId, user } : null,
    ),
    getConvosByCursor: jest.fn(async (user, { projectId }) => ({
      conversations: user === 'owner' ? (convosByProject[projectId] ?? []) : [],
      nextCursor: null,
    })),
    getMessages: jest.fn(async (filter) => messagesByConvo[filter.conversationId] ?? []),
    getConvoFiles: jest.fn(async (conversationId) =>
      conversationId === 'conv-a' ? ['file-a'] : ['file-b'],
    ),
    getFiles: jest.fn(async ({ file_id, user }) => {
      if (user !== 'owner') return [];
      const ids = file_id?.$in ?? [];
      return ids.map((id) =>
        id === 'file-a'
          ? { file_id: 'file-a', filename: 'research-a.pdf', type: 'application/pdf', size: 1234 }
          : { file_id: 'file-b', filename: 'research-b.pdf', type: 'application/pdf', size: 2345 },
      );
    }),
    getUserMemories: jest.fn(async ({ userId, projectId }) =>
      userId === 'owner' && projectId === projectA
        ? [
            {
              _id: { toString: () => 'memory-a' },
              key: 'project-focus',
              value: 'Project A only',
              updated_at: new Date('2026-10-02'),
            },
          ]
        : [],
    ),
    listMtoObservations: jest.fn(async ({ traceId }) => [
      observation(traceId, `${traceId}-event`, 'AUTHORIZED'),
    ]),
  };
}

describe('createBotModeProjectProjection', () => {
  it('projects only owned project messages, usage and bounded public MTO evidence', async () => {
    const deps = makeDeps();
    const projection = await createBotModeProjectProjection({
      userId: 'owner',
      tenantId: undefined,
      projectId: projectA,
      deps,
    });

    expect(projection).toEqual({
      projectId: projectA,
      conversations: [
        {
          conversationId: 'conv-a',
          usage: {
            input: 10,
            output: 4,
            cacheWrite: 1,
            cacheRead: 2,
            cost: 0.25,
            costKnown: true,
          },
          traces: [
            {
              messageId: 'msg-a',
              traceId: 'trace-a',
              observations: [
                {
                  traceId: 'trace-a',
                  traceEventId: 'trace-a-event',
                  type: 'AUTHORIZED',
                  source: 'host',
                  timestamp: '2026-10-02T19:00:00.000Z',
                  identity: { agentId: 'agent-1' },
                  payload: { decision: 'ALLOW' },
                },
              ],
            },
          ],
          plans: [
            {
              messageId: 'msg-a',
              plan: {
                planId: 'plan-a',
                planVersion: 2,
                strategy: 'PARALLEL',
                objective: 'Deliver project A',
                tasks: [
                  {
                    taskId: 'root-a/research',
                    parentTaskId: 'root-a',
                    objective: 'Research sources',
                    requiredCapabilities: ['research'],
                    dependsOn: [],
                    canRunInParallel: true,
                  },
                ],
              },
            },
          ],
          results: [],
          modelReceipts: [
            {
              messageId: 'msg-a',
              receipt: {
                selectedProvider: 'OpenRouter',
                selectedModel: 'free-a',
                resolvedProvider: 'openrouter',
                resolvedModel: 'free-b',
                fallbackUsed: true,
                routingMode: 'adaptive',
                spendingPolicy: 'free_first',
                total: {
                  inputTokens: 14,
                  outputTokens: 3,
                  costUsd: 0.0017,
                  costKnown: true,
                  latencyMs: 420,
                  latencyKnown: true,
                  cacheReadTokens: 0,
                  cacheReadKnown: false,
                  cacheWriteTokens: 0,
                  cacheWriteKnown: false,
                },
              },
            },
          ],
        },
      ],
      memories: [
        {
          id: 'memory-a',
          key: 'project-focus',
          value: 'Project A only',
          updatedAt: new Date('2026-10-02'),
        },
      ],
      sources: [
        { fileId: 'file-a', filename: 'research-a.pdf', type: 'application/pdf', size: 1234 },
      ],
      totals: {
        input: 10,
        output: 4,
        cacheWrite: 1,
        cacheRead: 2,
        cost: 0.25,
        costKnown: true,
      },
      nextCursor: null,
    });
    expect(JSON.stringify(projection)).not.toContain('private');
    expect(projection.memories).toEqual([
      expect.objectContaining({ id: 'memory-a', key: 'project-focus', value: 'Project A only' }),
    ]);
    expect(projection.sources).toEqual([
      expect.objectContaining({ fileId: 'file-a', filename: 'research-a.pdf' }),
    ]);
    expect(deps.getConvosByCursor).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ projectId: projectA }),
    );
  });

  it('projects only public text results and excludes internal reasoning/tool payloads', async () => {
    const deps = makeDeps();
    deps.getMessages.mockResolvedValueOnce([
      {
        messageId: 'msg-result',
        conversationId: 'conv-a',
        isCreatedByUser: false,
        content: [
          { type: 'text', text: 'Conclusion publique.' },
          { type: 'thinking', text: 'private chain of thought' },
          { type: 'tool', toolName: 'web_search', input: 'private query' },
        ],
        metadata: {
          botModePlan: {
            planId: 'plan-result',
            planVersion: 3,
            strategy: 'SEQUENTIAL',
            objective: 'Result',
            tasks: [],
          },
        },
      },
    ]);
    const projection = await createBotModeProjectProjection({
      userId: 'owner',
      projectId: projectA,
      deps,
    });
    expect(projection.conversations[0].results).toEqual([
      { messageId: 'msg-result', content: 'Conclusion publique.' },
    ]);
    expect(JSON.stringify(projection)).not.toContain('private chain of thought');
    expect(JSON.stringify(projection)).not.toContain('private query');
  });

  it('isolates two concurrent project projections', async () => {
    const deps = makeDeps();
    const [a, b] = await Promise.all([
      createBotModeProjectProjection({ userId: 'owner', projectId: projectA, deps }),
      createBotModeProjectProjection({ userId: 'owner', projectId: projectB, deps }),
    ]);
    expect(a.conversations.map((c) => c.conversationId)).toEqual(['conv-a']);
    expect(b.conversations.map((c) => c.conversationId)).toEqual(['conv-b']);
    expect(a.memories).toHaveLength(1);
    expect(a.sources.map((s) => s.fileId)).toEqual(['file-a']);
    expect(b.memories).toHaveLength(0);
    expect(b.sources.map((s) => s.fileId)).toEqual(['file-b']);
    expect(a.totals.cost).toBe(0.25);
    expect(a.totals.costKnown).toBe(true);
    expect(b.totals.cost).toBe(0.5);
    expect(b.totals.costKnown).toBe(true);
  });

  it('marks project cost unknown when any projected assistant usage omits authoritative cost', async () => {
    const deps = makeDeps();
    deps.getMessages.mockResolvedValueOnce([
      {
        messageId: 'msg-a-unknown-cost',
        conversationId: 'conv-a',
        isCreatedByUser: false,
        metadata: {
          mtoTraceId: 'trace-a',
          usage: { input: 3, output: 2, cacheWrite: 0, cacheRead: 1 },
        },
      },
    ]);

    const projection = await createBotModeProjectProjection({
      userId: 'owner',
      projectId: projectA,
      deps,
    });

    expect(projection.conversations[0].usage).toEqual({
      input: 3,
      output: 2,
      cacheWrite: 0,
      cacheRead: 1,
      cost: 0,
      costKnown: false,
    });
    expect(projection.totals).toEqual({
      input: 3,
      output: 2,
      cacheWrite: 0,
      cacheRead: 1,
      cost: 0,
      costKnown: false,
    });
  });

  it('returns null when the project is not owned by the requesting user', async () => {
    const deps = makeDeps();
    const projection = await createBotModeProjectProjection({
      userId: 'other-user',
      projectId: projectA,
      deps,
    });
    expect(projection).toBeNull();
    expect(deps.getConvosByCursor).not.toHaveBeenCalled();
  });
});
