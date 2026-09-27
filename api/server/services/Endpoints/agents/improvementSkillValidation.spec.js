const { createImprovementPayloadDigest } = require('@librechat/api');
const { validateSkillImprovementCandidate } = require('./improvementSkillValidation');
const update = { body: '# New\nEvidence required', description: 'A revised skill.' };
const digest = createImprovementPayloadDigest(update);
function input(overrides = {}) {
  return {
    candidate: {
      candidateId: 'skill:task:call',
      target: 'skill',
      traceId: 'trace',
      payloadDigest: digest,
      createdAt: '2026-09-28T00:00:00.000Z',
      publication: { requiresHumanReview: true },
    },
    proposal: {
      candidateId: 'skill:task:call',
      traceId: 'trace',
      taskId: 'task',
      producerAgentId: 'agent-producer',
      payloadDigest: digest,
      update,
    },
    user: 'user-1',
    tenantId: 'tenant-1',
    tests: [{ id: 'evidence', field: 'body', operator: 'includes', expected: 'Evidence' }],
    persistLifecycleEvent: jest.fn(async () => ({})),
    ...overrides,
  };
}
describe('independent skill content validation', () => {
  it('persists bounded test results tied to the candidate digest', async () => {
    const request = input();
    const result = await validateSkillImprovementCandidate(request);
    expect(result).toMatchObject({ status: 'VERIFIED', payloadDigest: digest });
    expect(request.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'VALIDATING',
      'VERIFIED',
    ]);
    expect(JSON.stringify(request.persistLifecycleEvent.mock.calls)).not.toContain('# New');
  });
  it('rejects missing tests and mismatched producer payload before any verdict', async () => {
    const missing = input({ tests: undefined });
    await expect(validateSkillImprovementCandidate(missing)).rejects.toThrow(/test/i);
    expect(missing.persistLifecycleEvent).not.toHaveBeenCalled();
    const mismatch = input({
      proposal: { ...input().proposal, update: { ...update, body: '# Altered' } },
    });
    await expect(validateSkillImprovementCandidate(mismatch)).rejects.toThrow(/digest/i);
    expect(mismatch.persistLifecycleEvent).not.toHaveBeenCalled();
  });
});
