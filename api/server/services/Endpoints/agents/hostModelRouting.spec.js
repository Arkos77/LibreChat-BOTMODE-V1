const { resolveHostModelRouting } = require('./hostModelRouting');

const base = () => ({
  config: [{ agentId: 'agent-one', models: ['a:free', 'b:free'], preferredModel: 'b:free' }],
  originalAgent: { id: 'agent-one', provider: 'OpenRouter', model: 'a:free' },
  primaryConfig: {
    id: 'agent-one',
    model: 'a:free',
    provider: 'openrouter',
    model_parameters: { model: 'a:free', apiKey: 'secret' },
  },
  validate: jest.fn(async () => ({ isValid: true })),
  initialize: jest.fn(async (agent) => ({
    id: agent.id,
    model: agent.model,
    provider: 'openrouter',
    model_parameters: { model: agent.model, apiKey: 'secret' },
  })),
  decide: jest.fn(async ({ resolvedAlternatives }) => ({
    selectedModel: 'b:free',
    event: {
      type: 'DECIDED',
      identity: { traceId: 'trace', traceEventId: 'event' },
      source: 'host',
      timestamp: '2026-09-28T12:00:00.000Z',
      payload: {
        decisionId: 'decision',
        selectedOption: 'b:free',
        provider: 'RuleDecisionProvider',
      },
    },
    resolvedAlternatives,
  })),
  persist: jest.fn(async () => ({})),
  sink: jest.fn(async () => ({})),
  traceId: 'trace',
  user: 'user-one',
  timestamp: '2026-09-28T12:00:00.000Z',
  decisionId: 'decision',
  traceEventId: 'event',
});

describe('host model routing', () => {
  it('resolves and validates each alternative, then persists the bounded decision', async () => {
    const request = base();
    const result = await resolveHostModelRouting(request);
    expect(result.model_parameters.model).toBe('b:free');
    expect(result.hostModelDecision).toEqual({
      traceId: 'trace',
      decisionId: 'decision',
      selectedModel: 'b:free',
      agentId: 'agent-one',
    });
    expect(request.validate).toHaveBeenCalledWith(expect.objectContaining({ model: 'b:free' }));
    expect(request.initialize).toHaveBeenCalledWith(expect.objectContaining({ model: 'b:free' }));
    expect(request.decide.mock.calls[0][0].resolvedAlternatives[0].options.model).toBe('b:free');
    expect(request.persist).toHaveBeenCalledTimes(1);
    expect(request.sink).toHaveBeenCalledTimes(1);
  });
  it('blocks a model switch if durable provenance fails', async () => {
    const request = base();
    request.persist.mockRejectedValue(new Error('store unavailable'));
    await expect(resolveHostModelRouting(request)).rejects.toThrow('store unavailable');
    expect(request.sink).not.toHaveBeenCalled();
  });

  it('leaves the run alone without an opt-in and fails before decision on invalid model', async () => {
    const request = base();
    expect(await resolveHostModelRouting({ ...request, config: undefined })).toBe(
      request.primaryConfig,
    );
    request.validate.mockResolvedValue({ isValid: false });
    await expect(resolveHostModelRouting(request)).rejects.toThrow(/validation/i);
    expect(request.decide).not.toHaveBeenCalled();
  });
});
