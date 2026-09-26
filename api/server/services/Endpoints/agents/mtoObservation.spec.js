const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

const {
  observeMtoEvent,
  projectMtoObservation,
} = require('~/server/services/Endpoints/agents/mtoObservation');

describe('MTO host observation sink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('projects only bounded subagent activity fields', () => {
    const event = {
      type: 'OBSERVED',
      source: 'subagent-activity',
      timestamp: '2026-09-26T12:00:00.000Z',
      identity: {
        traceId: 'trace-1',
        traceEventId: 'event-1',
        runId: 'run-1',
        secretIdentity: 'drop-me',
      },
      payload: {
        phase: 'run_step_closed',
        subagentType: 'researcher',
        depth: 1,
        data: { reasoning: 'never log raw reasoning' },
        secretPayload: 'drop-me',
      },
      raw: 'drop-me',
    };

    expect(projectMtoObservation(event)).toEqual({
      type: 'OBSERVED',
      source: 'subagent-activity',
      timestamp: '2026-09-26T12:00:00.000Z',
      identity: {
        traceId: 'trace-1',
        traceEventId: 'event-1',
        runId: 'run-1',
      },
      payload: {
        phase: 'run_step_closed',
        subagentType: 'researcher',
        depth: 1,
      },
    });
  });

  it('logs a bounded observation and ignores malformed events', () => {
    const event = {
      type: 'OBSERVED',
      source: 'subagent-usage',
      timestamp: '2026-09-26T12:00:00.000Z',
      identity: { traceId: 'trace-2', traceEventId: 'event-2' },
      payload: {
        usage: { input_tokens: 4, output_tokens: 2 },
        model: 'model-1',
        provider: 'provider-1',
        subagentType: 'writer',
        rawPrompt: 'drop-me',
      },
    };

    observeMtoEvent(event);
    observeMtoEvent({ source: 'subagent-activity' });

    expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[BOT MODE MTO] observation',
      expect.objectContaining({
        source: 'subagent-usage',
        identity: { traceId: 'trace-2', traceEventId: 'event-2' },
        payload: expect.objectContaining({ usage: { input_tokens: 4, output_tokens: 2 } }),
      }),
    );
    expect(JSON.stringify(mockLogger.debug.mock.calls[0])).not.toContain('rawPrompt');
  });

  it('contains logger failures', () => {
    mockLogger.debug.mockImplementationOnce(() => {
      throw new Error('logger failed');
    });

    expect(() =>
      observeMtoEvent({
        type: 'OBSERVED',
        source: 'subagent-activity',
        timestamp: '2026-09-26T12:00:00.000Z',
        identity: { traceId: 'trace-3', traceEventId: 'event-3' },
        payload: { phase: 'run_step_closed', subagentType: 'researcher' },
      }),
    ).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });
});
