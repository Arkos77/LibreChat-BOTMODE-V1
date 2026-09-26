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
