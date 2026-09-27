const { createImprovementCandidate, createMtoEvent } = require('@librechat/api');
const { validateStepLimitImprovementCandidate } = require('./improvementValidation');

const candidate = createImprovementCandidate({
  candidateId: 'workflow-step-limit:trace-1:task-1',
  target: 'workflow',
  title: 'Review workflow',
  summary: 'Native step limit',
  traceId: 'trace-1',
  observations: [
    createMtoEvent(
      'OBSERVED',
      { traceId: 'trace-1', traceEventId: 'step-limit:task-1:assistant' },
      'host',
      { signal: 'tool_call_limit' },
    ),
  ],
  createdAt: '2026-09-27T18:00:00.000Z',
});

function input(overrides = {}) {
  return {
    candidate,
    traceId: 'trace-1',
    taskId: 'task-1',
    producerAgentId: 'producer-1',
    responseMessageId: 'task-1:assistant',
    user: '507f1f77bcf86cd799439011',
    persistLifecycleEvent: jest.fn(async () => ({ replayed: false })),
    mtoEventSink: jest.fn(),
    ...overrides,
  };
}

describe('durable native child workflow validation', () => {
  it('validates host native step-limit evidence and records proposal-only disposition', async () => {
    const request = input();
    const result = await validateStepLimitImprovementCandidate(request);
    expect(result).toMatchObject({
      oracleDecision: 'ACCEPT',
      disposition: 'PROPOSAL_ONLY',
      authorized: false,
      publishable: false,
    });
    expect(request.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event.type)).toEqual([
      'VALIDATING',
      'VERIFIED',
      'PROPOSAL_ONLY',
    ]);
    const records = request.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event);
    expect(
      records.every(
        (event) =>
          event.candidateId === candidate.candidateId && event.traceId === candidate.traceId,
      ),
    ).toBe(true);
    expect(request.mtoEventSink).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'oracle', type: 'VERIFIED' }),
    );
    const oracleEvents = request.mtoEventSink.mock.calls.map(([event]) => event);
    expect(oracleEvents.map((event) => event.type)).toEqual(['VALIDATING', 'VERIFIED']);
    expect(new Set(oracleEvents.map((event) => event.identity.traceEventId)).size).toBe(2);
    expect(JSON.stringify(records)).not.toContain('Native step limit');
  });

  it('fails closed without native child identity or matching durable response', async () => {
    for (const overrides of [
      { producerAgentId: undefined },
      { taskId: undefined },
      { responseMessageId: 'other:assistant' },
    ]) {
      const request = input(overrides);
      expect(await validateStepLimitImprovementCandidate(request)).toBeNull();
      expect(request.persistLifecycleEvent).not.toHaveBeenCalled();
    }
  });

  it('keeps lifecycle identities stable on replay and ignores MTO sink failures', async () => {
    const first = input({
      mtoEventSink: jest.fn(() => {
        throw new Error('sink unavailable');
      }),
    });
    const replay = input();
    expect((await validateStepLimitImprovementCandidate(first)).disposition).toBe('PROPOSAL_ONLY');
    expect((await validateStepLimitImprovementCandidate(replay)).disposition).toBe('PROPOSAL_ONLY');
    expect(first.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event)).toEqual(
      replay.persistLifecycleEvent.mock.calls.map(([arg]) => arg.event),
    );
  });

  it('assigns stable distinct Oracle trace identities to replayed phases', async () => {
    const request = input();
    await validateStepLimitImprovementCandidate(request);
    const ids = request.mtoEventSink.mock.calls.map(([event]) => event.identity.traceEventId);
    expect(ids).toEqual([
      `oracle:${candidate.candidateId}:validating`,
      `oracle:${candidate.candidateId}:verified`,
    ]);
  });

  it('does not advance when lifecycle persistence fails', async () => {
    const request = input({
      persistLifecycleEvent: jest.fn().mockRejectedValue(new Error('store unavailable')),
    });
    expect(await validateStepLimitImprovementCandidate(request)).toBeNull();
    expect(request.mtoEventSink).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VERIFIED' }),
    );
  });
});
