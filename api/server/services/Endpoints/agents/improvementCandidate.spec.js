const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));

const {
  observeStepLimitImprovementCandidate,
} = require('~/server/services/Endpoints/agents/improvementCandidate');

describe('step-limit improvement candidate observation', () => {
  const durableInput = {
    user: '507f1f77bcf86cd799439011',
    conversationId: 'conversation-1',
    persistCandidate: jest.fn(async ({ candidate }) => ({
      record: candidate,
      replayed: false,
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates only a proposal-only workflow candidate from the native step-limit signal', async () => {
    const candidate = await observeStepLimitImprovementCandidate({
      ...durableInput,
      traceId: 'trace-step-limit-1',
      responseMessageId: 'response-1',
      createdAt: '2026-09-26T12:00:00.000Z',
    });

    expect(candidate).toEqual(
      expect.objectContaining({
        candidateId: 'workflow-step-limit:trace-step-limit-1',
        target: 'workflow',
        status: 'CANDIDATE',
        traceId: 'trace-step-limit-1',
        traceEventIds: ['step-limit:response-1'],
        publication: expect.objectContaining({
          path: 'proposal-only',
          requiresAuthorization: true,
          requiresOracle: true,
        }),
      }),
    );
    expect(candidate).not.toHaveProperty('payloadDigest');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[BOT MODE P10] durable workflow improvement candidate',
      candidate,
    );
  });

  it('emits a bounded MTO CANDIDATE event correlated to the native observation', async () => {
    const mtoEventSink = jest.fn();

    const candidate = await observeStepLimitImprovementCandidate({
      ...durableInput,
      traceId: 'trace-step-limit-mto',
      responseMessageId: 'response-mto',
      createdAt: '2026-09-26T12:30:00.000Z',
      mtoEventSink,
    });

    expect(candidate).not.toBeNull();
    expect(mtoEventSink).toHaveBeenCalledTimes(1);
    expect(mtoEventSink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CANDIDATE',
        source: 'host',
        timestamp: '2026-09-26T12:30:00.000Z',
        identity: expect.objectContaining({
          traceId: 'trace-step-limit-mto',
          traceEventId: 'candidate:workflow-step-limit:trace-step-limit-mto',
          causedByTraceEventId: 'step-limit:response-mto',
        }),
      }),
    );
    expect(mtoEventSink.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  it('contains an MTO sink failure without affecting candidate creation', async () => {
    const mtoEventSink = jest.fn(() => {
      throw new Error('sink unavailable');
    });

    const candidate = await observeStepLimitImprovementCandidate({
      ...durableInput,
      traceId: 'trace-step-limit-sink-failure',
      responseMessageId: 'response-sink-failure',
      createdAt: '2026-09-26T12:31:00.000Z',
      mtoEventSink,
    });

    expect(candidate).toEqual(
      expect.objectContaining({
        target: 'workflow',
        status: 'CANDIDATE',
        traceId: 'trace-step-limit-sink-failure',
      }),
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[BOT MODE P10] durable workflow improvement candidate',
      candidate,
    );
  });

  it('fails closed without a durable trace or response identity', async () => {
    await expect(
      observeStepLimitImprovementCandidate({
        ...durableInput,
        traceId: '',
        responseMessageId: 'response-1',
      }),
    ).resolves.toBeNull();
    await expect(
      observeStepLimitImprovementCandidate({
        ...durableInput,
        traceId: 'trace-1',
        responseMessageId: '',
      }),
    ).resolves.toBeNull();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
  it('persists before emitting the MTO CANDIDATE event', async () => {
    const order = [];
    const persistCandidate = jest.fn(async ({ candidate, user, tenantId, conversationId }) => {
      order.push('persist');
      expect(user).toBe('507f1f77bcf86cd799439011');
      expect(tenantId).toBe('tenant-1');
      expect(conversationId).toBe('conversation-1');
      return { record: candidate, replayed: false };
    });
    const mtoEventSink = jest.fn(() => order.push('mto'));

    const candidate = await observeStepLimitImprovementCandidate({
      traceId: 'trace-durable',
      responseMessageId: 'response-durable',
      user: '507f1f77bcf86cd799439011',
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      persistCandidate,
      mtoEventSink,
    });

    expect(candidate?.candidateId).toBe('workflow-step-limit:trace-durable');
    expect(persistCandidate).toHaveBeenCalledTimes(1);
    expect(mtoEventSink).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['persist', 'mto']);
  });

  it('emits the MTO CANDIDATE event after an idempotent durable replay', async () => {
    const persistCandidate = jest.fn(async ({ candidate }) => ({
      record: candidate,
      replayed: true,
    }));
    const mtoEventSink = jest.fn();

    const candidate = await observeStepLimitImprovementCandidate({
      traceId: 'trace-replay',
      responseMessageId: 'response-replay',
      user: '507f1f77bcf86cd799439011',
      conversationId: 'conversation-1',
      persistCandidate,
      mtoEventSink,
    });

    expect(candidate?.candidateId).toBe('workflow-step-limit:trace-replay');
    expect(mtoEventSink).toHaveBeenCalledTimes(1);
  });

  it('contains durable persistence failure and does not emit MTO CANDIDATE', async () => {
    const persistCandidate = jest.fn(async () => {
      throw new Error('mongo unavailable');
    });
    const mtoEventSink = jest.fn();

    await expect(
      observeStepLimitImprovementCandidate({
        traceId: 'trace-store-fail',
        responseMessageId: 'response-store-fail',
        user: '507f1f77bcf86cd799439011',
        conversationId: 'conversation-1',
        persistCandidate,
        mtoEventSink,
      }),
    ).resolves.toBeNull();
    expect(mtoEventSink).not.toHaveBeenCalled();
  });
});
