const { createImprovementPayloadDigest } = require('@librechat/api');
const { recordSkillImprovementProposal } = require('./improvementSkillProposal');

const update = { body: '# Improved skill', description: 'Revised skill description.' };
function input(overrides = {}) {
  return {
    req: { user: { id: 'user-1' } },
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    traceId: 'trace-1',
    taskId: 'task-native',
    producerAgentId: 'agent-native-child',
    proposal: {
      toolCallId: 'call-native',
      skillId: 'skill-1',
      expectedVersion: 3,
      update,
      diff: '-old\n+new',
    },
    persistProposal: jest.fn(async (arg) => ({
      record: { proposal: arg.proposal, persistedAt: new Date('2026-09-28T00:00:00.000Z') },
      replayed: false,
    })),
    persistCandidate: jest.fn(async () => ({ replayed: false })),
    persistLifecycleEvent: jest.fn(async () => ({})),
    getHostTests: jest.fn(() => undefined),
    mtoEventSink: jest.fn(async () => undefined),
    ...overrides,
  };
}
describe('native child skill proposal capture', () => {
  it('persists exact content before bounded candidate and emits only bounded metadata', async () => {
    const request = input();
    const result = await recordSkillImprovementProposal(request);
    expect(result.candidateId).toBe('skill:task-native:call-native');
    const stored = request.persistProposal.mock.calls[0][0];
    expect(stored.proposal).toMatchObject({
      ...request.proposal,
      taskId: 'task-native',
      traceId: 'trace-1',
      payloadDigest: createImprovementPayloadDigest(update),
    });
    expect(request.persistCandidate.mock.invocationCallOrder[0]).toBeGreaterThan(
      request.persistProposal.mock.invocationCallOrder[0],
    );
    const candidate = request.persistCandidate.mock.calls[0][0].candidate;
    expect(candidate).toMatchObject({
      candidateId: result.candidateId,
      target: 'skill',
      payloadDigest: stored.proposal.payloadDigest,
      publication: { requiresHumanReview: true },
    });
    expect(JSON.stringify(candidate)).not.toContain('# Improved skill');
    expect(JSON.stringify(request.mtoEventSink.mock.calls)).not.toContain('# Improved skill');
  });
  it('rejects an unidentifiable child producer before writing', async () => {
    const request = input({ producerAgentId: undefined });
    await expect(recordSkillImprovementProposal(request)).rejects.toThrow(/producer/i);
    expect(request.persistProposal).not.toHaveBeenCalled();
    expect(request.persistCandidate).not.toHaveBeenCalled();
  });

  it('runs configured host tests after durable candidate capture', async () => {
    const request = input({
      getHostTests: jest.fn(() => [
        { id: 'evidence', field: 'body', operator: 'includes', expected: 'Improved' },
      ]),
    });
    await recordSkillImprovementProposal(request);
    expect(request.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'VALIDATING',
      'VERIFIED',
    ]);
    expect(request.persistLifecycleEvent.mock.invocationCallOrder[0]).toBeGreaterThan(
      request.persistCandidate.mock.invocationCallOrder[0],
    );
  });

  it('requires a real child task and leaves both stores untouched otherwise', async () => {
    const request = input({ taskId: undefined });
    await expect(recordSkillImprovementProposal(request)).rejects.toThrow(/task/i);
    expect(request.persistProposal).not.toHaveBeenCalled();
    expect(request.persistCandidate).not.toHaveBeenCalled();
  });
});
