const { resolveHostModelRouting } = require('./hostModelRouting');

const base = () => ({
  config: [{ agentId: 'agent-one', models: ['a:free', 'b:free'], preferredModel: 'b:free' }],
  originalAgent: { id: 'agent-one', name: 'Agent One', provider: 'OpenRouter', model: 'a:free' },
  primaryConfig: {
    id: 'agent-one',
    model: 'a:free',
    provider: 'openrouter',
    model_parameters: { model: 'a:free', apiKey: 'secret' },
    maxContextTokens: 8192,
  },
  validate: jest.fn(async () => ({ isValid: true })),
  resolveRuntimeProvider: jest.fn((provider) => provider),
  initialize: jest.fn(async (agent) => ({
    id: agent.id,
    model: agent.model,
    provider: 'openrouter',
    model_parameters: { model: agent.model, apiKey: 'secret' },
    maxContextTokens: 16384,
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
    expect(result.hostModelDecision).toEqual(
      expect.objectContaining({
        traceId: 'trace',
        decisionId: 'decision',
        selectedModel: 'b:free',
        agentId: 'agent-one',
      }),
    );
    expect(request.validate).toHaveBeenCalledWith(expect.objectContaining({ model: 'b:free' }));
    expect(request.initialize).toHaveBeenCalledWith(expect.objectContaining({ model: 'b:free' }));
    expect(request.decide.mock.calls[0][0].resolvedContextWindow).toBe(8192);
    expect(request.decide.mock.calls[0][0].resolvedAlternatives[0]).toMatchObject({
      model: 'b:free',
      contextWindow: 16384,
      options: { model: 'b:free' },
    });
    expect(request.persist).toHaveBeenCalledTimes(1);
    expect(request.sink).toHaveBeenCalledTimes(1);
  });

  it('matches a stable agentName selector without requiring a machine-local agent id', async () => {
    const request = base();
    request.config = [
      {
        agentName: 'Agent One',
        models: ['a:free', 'b:free'],
        preferredModel: 'b:free',
      },
    ];

    const result = await resolveHostModelRouting(request);

    expect(result.model).toBe('b:free');
    expect(result.hostModelDecision.agentId).toBe('agent-one');
  });

  it('resolves an explicitly authorized cross-provider binding without inheriting the primary provider', async () => {
    const request = base();
    request.config = [
      {
        agentId: 'agent-one',
        bindings: [
          { id: 'primary', provider: 'OpenRouter', model: 'a:free' },
          { id: 'anthropic-b', provider: 'anthropic', model: 'shared-model' },
        ],
        preferredBindingId: 'anthropic-b',
      },
    ];
    request.validate.mockImplementation(async (agent) => ({
      isValid: agent.provider === 'anthropic',
    }));
    request.initialize.mockImplementation(async (agent) => ({
      id: agent.id,
      model: agent.model,
      provider: agent.provider,
      model_parameters: { model: agent.model, providerMarker: agent.provider },
      endpointTokenConfig: { selectedFor: `${agent.provider}:${agent.model}` },
      maxContextTokens: 32768,
    }));
    request.decide.mockImplementation(async ({ bindings, preferredBindingId }) => ({
      selectedBindingId: preferredBindingId,
      selectedProvider: 'anthropic',
      selectedModel: 'shared-model',
      event: {
        type: 'DECIDED',
        identity: { traceId: 'trace', traceEventId: 'event' },
        source: 'host',
        timestamp: '2026-10-02T12:00:00.000Z',
        payload: {
          decisionId: 'decision',
          selectedOption: preferredBindingId,
          provider: 'RuleDecisionProvider',
        },
      },
      bindings,
    }));

    const result = await resolveHostModelRouting(request);

    expect(request.validate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', model: 'shared-model' }),
    );
    expect(request.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', model: 'shared-model' }),
    );
    expect(request.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredBindingId: 'anthropic-b',
        bindings: expect.arrayContaining([
          expect.objectContaining({
            id: 'anthropic-b',
            provider: 'anthropic',
            model: 'shared-model',
            contextWindow: 32768,
          }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      provider: 'anthropic',
      model: 'shared-model',
      endpointTokenConfig: { selectedFor: 'anthropic:shared-model' },
      hostModelDecision: {
        traceId: 'trace',
        decisionId: 'decision',
        selectedBindingId: 'anthropic-b',
        selectedProvider: 'anthropic',
        selectedModel: 'shared-model',
        agentId: 'agent-one',
      },
    });
  });

  it('keeps a custom logical provider while using its canonical runtime provider', async () => {
    const request = base();
    request.config = [
      {
        agentId: 'agent-one',
        bindings: [
          { id: 'primary', provider: 'OpenRouter', model: 'a:free' },
          { id: 'gemini-free', provider: 'Gemini', model: 'models/gemini-3.5-flash' },
        ],
        preferredBindingId: 'gemini-free',
        allowFailover: true,
      },
    ];
    request.resolveRuntimeProvider.mockImplementation((provider) =>
      provider === 'Gemini' ? 'openAI' : provider,
    );
    request.initialize.mockImplementation(async (agent) => ({
      id: agent.id,
      model: agent.model,
      provider: agent.provider === 'Gemini' ? 'openAI' : agent.provider,
      model_parameters: {
        model: agent.model,
        apiKey: 'secret',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      },
      maxContextTokens: 32768,
    }));
    request.decide.mockImplementation(async ({ bindings, preferredBindingId }) => ({
      selectedBindingId: preferredBindingId,
      selectedProvider: 'Gemini',
      selectedModel: 'models/gemini-3.5-flash',
      modelParameters: {
        model: 'models/gemini-3.5-flash',
        fallbacks: [
          {
            provider: 'openrouter',
            clientOptions: { model: 'a:free' },
            retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
          },
        ],
      },
      event: {
        type: 'DECIDED',
        identity: { traceId: 'trace', traceEventId: 'event' },
        source: 'host',
        timestamp: '2026-10-06T12:00:00.000Z',
        payload: {
          decisionId: 'decision',
          selectedOption: preferredBindingId,
          provider: 'RuleDecisionProvider',
        },
      },
      bindings,
    }));

    const result = await resolveHostModelRouting(request);

    expect(request.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            id: 'gemini-free',
            provider: 'Gemini',
            runtimeProvider: 'openAI',
            model: 'models/gemini-3.5-flash',
          }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      provider: 'openAI',
      model: 'models/gemini-3.5-flash',
      hostModelDecision: {
        selectedProvider: 'Gemini',
        selectedModel: 'models/gemini-3.5-flash',
      },
    });
  });

  it('passes host routing signals and hard constraints into the decision layer', async () => {
    const request = base();
    request.config = [
      {
        agentId: 'agent-one',
        models: ['a:free', 'b:free'],
        preferredModel: undefined,
        routingSignals: {
          'a:free': { qualityScore: 0.4, estimatedCost: 1, latencyMs: 90 },
          'b:free': { qualityScore: 0.9, estimatedCost: 2, latencyMs: 80 },
        },
        routingMode: 'adaptive',
        requestTimeoutMs: 15000,
        routingConstraints: { maxEstimatedCost: 3, maxLatencyMs: 100 },
      },
    ];
    request.decide.mockImplementation(async (input) => ({
      selectedModel: 'b:free',
      event: {
        type: 'DECIDED',
        identity: { traceId: 'trace', traceEventId: 'event' },
        source: 'host',
        timestamp: '2026-10-03T12:00:00.000Z',
        payload: {
          decisionId: 'decision',
          selectedOption: 'b:free',
          provider: 'RuleDecisionProvider',
        },
      },
      input,
    }));

    const result = await resolveHostModelRouting(request);

    expect(request.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredModel: undefined,
        routingMode: 'adaptive',
        requestTimeoutMs: 15000,
        routingConstraints: { maxEstimatedCost: 3, maxLatencyMs: 100 },
        routingSignals: {
          'a:free': { qualityScore: 0.4, estimatedCost: 1, latencyMs: 90 },
          'b:free': { qualityScore: 0.9, estimatedCost: 2, latencyMs: 80 },
        },
      }),
    );
    expect(result.model).toBe('b:free');
  });

  it('merges recent observed health into adaptive routing signals before decision', async () => {
    const request = base();
    request.config = [
      {
        agentId: 'agent-one',
        models: ['a:free', 'b:free'],
        preferredModel: undefined,
        routingMode: 'adaptive',
        routingSignals: {
          'a:free': { qualityScore: 0.8, latencyMs: 900 },
          'b:free': { qualityScore: 0.8, latencyMs: 100 },
        },
      },
    ];
    request.modelHealthState = {
      byProviderModel: {
        'openrouter\0a:free': {
          sampleCount: 5,
          latencyMs: 120,
          successRate: 0.98,
          fallbackRate: 0.02,
        },
        'openrouter\0b:free': {
          sampleCount: 5,
          latencyMs: 80,
          successRate: 0.6,
          fallbackRate: 0.4,
        },
      },
    };
    request.decide.mockImplementation(async (input) => ({
      selectedModel: 'a:free',
      event: {
        type: 'DECIDED',
        identity: { traceId: 'trace', traceEventId: 'event' },
        source: 'host',
        timestamp: '2026-10-06T12:00:00.000Z',
        payload: {
          decisionId: 'decision',
          selectedOption: 'a:free',
          provider: 'deterministic',
        },
      },
      input,
    }));

    await resolveHostModelRouting(request);

    expect(request.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        routingSignals: {
          'a:free': {
            qualityScore: 0.8,
            latencyMs: 120,
            successRate: 0.98,
            fallbackRate: 0.02,
            sampleCount: 5,
          },
          'b:free': {
            qualityScore: 0.8,
            latencyMs: 80,
            successRate: 0.6,
            fallbackRate: 0.4,
            sampleCount: 5,
          },
        },
      }),
    );
  });

  it('returns controlled native fallbacks only when host failover is explicitly enabled', async () => {
    const request = base();
    request.config = [
      {
        agentId: 'agent-one',
        models: ['a:free', 'b:free'],
        preferredModel: 'a:free',
        allowFailover: true,
      },
    ];
    request.decide.mockImplementation(async () => ({
      selectedModel: 'a:free',
      modelParameters: {
        model: 'a:free',
        fallbacks: [
          { provider: 'openrouter', clientOptions: { model: 'b:free', apiKey: 'secret' } },
        ],
      },
      event: {
        type: 'DECIDED',
        identity: { traceId: 'trace', traceEventId: 'event' },
        source: 'host',
        timestamp: '2026-10-03T12:00:00.000Z',
        payload: {
          decisionId: 'decision',
          selectedOption: 'a:free',
          provider: 'RuleDecisionProvider',
        },
      },
    }));
    const result = await resolveHostModelRouting(request);
    expect(result.model_parameters.fallbacks).toEqual([
      {
        provider: 'openrouter',
        clientOptions: { model: 'b:free', apiKey: 'secret' },
      },
    ]);
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
