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
        },
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
    expect(deps.getConvosByCursor).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ projectId: projectA }),
    );
  });

  it('isolates two concurrent project projections', async () => {
    const deps = makeDeps();
    const [a, b] = await Promise.all([
      createBotModeProjectProjection({ userId: 'owner', projectId: projectA, deps }),
      createBotModeProjectProjection({ userId: 'owner', projectId: projectB, deps }),
    ]);
    expect(a.conversations.map((c) => c.conversationId)).toEqual(['conv-a']);
    expect(b.conversations.map((c) => c.conversationId)).toEqual(['conv-b']);
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
