const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));

const {
  observeStepLimitImprovementCandidate,
} = require('~/server/services/Endpoints/agents/improvementCandidate');

describe('step-limit improvement candidate observation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates only a proposal-only workflow candidate from the native step-limit signal', () => {
    const candidate = observeStepLimitImprovementCandidate({
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
      '[BOT MODE P10] workflow improvement candidate',
      candidate,
    );
  });

  it('emits a bounded MTO CANDIDATE event correlated to the native observation', () => {
    const mtoEventSink = jest.fn();

    const candidate = observeStepLimitImprovementCandidate({
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

  it('contains an MTO sink failure without affecting candidate creation', () => {
    const mtoEventSink = jest.fn(() => {
      throw new Error('sink unavailable');
    });

    const candidate = observeStepLimitImprovementCandidate({
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
      '[BOT MODE P10] workflow improvement candidate',
      candidate,
    );
  });

  it('fails closed without a durable trace or response identity', () => {
    expect(
      observeStepLimitImprovementCandidate({ traceId: '', responseMessageId: 'response-1' }),
    ).toBeNull();
    expect(
      observeStepLimitImprovementCandidate({ traceId: 'trace-1', responseMessageId: '' }),
    ).toBeNull();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
