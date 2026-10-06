import { decideHostModel } from './hostModelDecision';

const input = {
  agentId: 'agent-one',
  provider: 'OpenRouter',
  currentModel: 'model-a:free',
  resolvedOptions: {
    model: 'model-a:free',
    apiKey: 'secret',
    configuration: { baseURL: 'https://example.test' },
  },
  authorizedModels: ['model-a:free', 'model-b:free'],
  resolvedAlternatives: [
    { model: 'model-b:free', options: { model: 'model-b:free', apiKey: 'other-secret' } },
  ],
  availableModels: ['model-a:free', 'model-b:free'],
  preferredModel: 'model-b:free',
  traceId: 'trace-one',
  timestamp: '2026-09-28T12:00:00.000Z',
  decisionId: 'decision-one',
  traceEventId: 'event-one',
};

describe('host P11 model decision', () => {
  it('selects an explicitly authorized and available resolved model without leaking credentials', async () => {
    const result = await decideHostModel(input);
    expect(result.selectedModel).toBe('model-b:free');
    expect(result.modelParameters).toMatchObject({ model: 'model-b:free', apiKey: 'other-secret' });
    expect(result.event.type).toBe('DECIDED');
    expect(result.event.payload).toMatchObject({
      selectedOption: 'model-b:free',
      provider: 'RuleDecisionProvider',
    });
    expect(JSON.stringify(result.event)).not.toContain('secret');
    expect(JSON.stringify(result.record)).not.toContain('secret');
    expect(input.resolvedOptions.model).toBe('model-a:free');
    expect(input.resolvedAlternatives[0].options.model).toBe('model-b:free');
    expect(result.modelParameters).not.toHaveProperty('fallbacks');
  });

  it('selects an explicitly authorized cross-provider binding by stable non-secret binding id', async () => {
    const result = await decideHostModel({
      agentId: 'agent-one',
      bindings: [
        {
          id: 'primary',
          provider: 'OpenRouter',
          model: 'shared-model',
          options: { model: 'shared-model', apiKey: 'primary-secret' },
        },
        {
          id: 'alternate',
          provider: 'anthropic',
          model: 'shared-model',
          options: { model: 'shared-model', apiKey: 'alternate-secret' },
        },
      ],
      preferredBindingId: 'alternate',
      traceId: 'trace-multi-provider',
      timestamp: '2026-10-02T12:00:00.000Z',
      decisionId: 'decision-multi-provider',
      traceEventId: 'event-multi-provider',
    });

    expect(result).toMatchObject({
      selectedBindingId: 'alternate',
      selectedProvider: 'anthropic',
      selectedModel: 'shared-model',
    });
    expect(result.event.payload.selectedOption).toBe('alternate');
    expect(JSON.stringify(result.event)).not.toContain('secret');
    expect(JSON.stringify(result.record)).not.toContain('secret');
  });

  it('uses runtime provider only for SDK fallback while preserving logical provider provenance', async () => {
    const result = await decideHostModel({
      agentId: 'agent-one',
      bindings: [
        {
          id: 'openrouter-primary',
          provider: 'OpenRouter',
          runtimeProvider: 'openrouter',
          model: 'model-a:free',
          options: { model: 'model-a:free', apiKey: 'primary-secret' },
        },
        {
          id: 'gemini-free',
          provider: 'Gemini',
          runtimeProvider: 'openAI',
          model: 'models/gemini-3.5-flash',
          options: {
            model: 'models/gemini-3.5-flash',
            apiKey: 'gemini-secret',
            configuration: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
          },
        },
      ],
      preferredBindingId: 'openrouter-primary',
      allowFailover: true,
      traceId: 'trace-runtime-provider',
      timestamp: '2026-10-06T12:00:00.000Z',
      decisionId: 'decision-runtime-provider',
      traceEventId: 'event-runtime-provider',
    });

    expect(result).toMatchObject({
      selectedProvider: 'OpenRouter',
      selectedModel: 'model-a:free',
      modelParameters: {
        fallbacks: [
          expect.objectContaining({
            provider: 'openAI',
            retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
            clientOptions: expect.objectContaining({
              model: 'models/gemini-3.5-flash',
            }),
          }),
        ],
      },
    });
    expect(result.event.payload.selectedOption).toBe('openrouter-primary');
    expect(JSON.stringify(result.event)).not.toContain('gemini-secret');
  });

  it('fails closed on unavailable, duplicate or unauthorized alternatives', async () => {
    await expect(decideHostModel({ ...input, availableModels: ['model-a:free'] })).rejects.toThrow(
      /available/i,
    );
    await expect(
      decideHostModel({ ...input, authorizedModels: ['model-a:free', 'model-a:free'] }),
    ).rejects.toThrow(/duplicate/i);
    await expect(decideHostModel({ ...input, preferredModel: 'model-c:free' })).rejects.toThrow(
      /authorized/i,
    );
  });

  it('uses explicit host signals for deterministic pre-run selection when no preference is supplied', async () => {
    const result = await decideHostModel({
      ...input,
      preferredModel: undefined,
      routingSignals: {
        'model-a:free': { qualityScore: 0.4, estimatedCost: 0.5, latencyMs: 120 },
        'model-b:free': { qualityScore: 0.9, estimatedCost: 2, latencyMs: 250 },
      },
      routingConstraints: { maxEstimatedCost: 3, maxLatencyMs: 500 },
    });

    expect(result.selectedModel).toBe('model-b:free');
    expect(result.event.payload.selectedOption).toBe('model-b:free');
  });

  it('keeps static preference semantics by default', async () => {
    const result = await decideHostModel({
      ...input,
      preferredModel: 'model-b:free',
      routingSignals: {
        'model-a:free': {
          pricingTier: 'free',
          qualityScore: 1,
          estimatedCost: 0,
          latencyMs: 10,
        },
        'model-b:free': {
          pricingTier: 'paid',
          qualityScore: 0.1,
          estimatedCost: 10,
          latencyMs: 1000,
        },
      },
      routingConstraints: { spendingPolicy: 'free_first' },
    });

    expect(result.selectedModel).toBe('model-b:free');
    expect(result.record.provider).toBe('RuleDecisionProvider');
  });

  it('uses adaptive deterministic routing instead of static preference', async () => {
    const result = await decideHostModel({
      ...input,
      preferredModel: 'model-b:free',
      routingMode: 'adaptive',
      routingSignals: {
        'model-a:free': {
          pricingTier: 'free',
          qualityScore: 0.6,
          estimatedCost: 0,
          latencyMs: 20,
        },
        'model-b:free': {
          pricingTier: 'paid',
          qualityScore: 0.99,
          estimatedCost: 0.01,
          latencyMs: 5,
        },
      },
      routingConstraints: { spendingPolicy: 'free_first' },
    });

    expect(result.selectedModel).toBe('model-a:free');
    expect(result.record.provider).toBe('deterministic');
    expect(result.event.payload.provider).toBe('deterministic');
  });

  it('uses retryable zero-chunk fallbacks and a bounded timeout only in adaptive mode', async () => {
    const result = await decideHostModel({
      ...input,
      routingMode: 'adaptive',
      requestTimeoutMs: 15000,
      allowFailover: true,
      preferredModel: undefined,
      routingSignals: {
        'model-a:free': { pricingTier: 'free' },
        'model-b:free': { pricingTier: 'free' },
      },
      routingConstraints: { spendingPolicy: 'free_first' },
    });

    expect(result.modelParameters).toEqual(
      expect.objectContaining({
        model: 'model-a:free',
        timeout: 15000,
        fallbacks: [
          expect.objectContaining({
            provider: 'OpenRouter',
            clientOptions: expect.objectContaining({
              model: 'model-b:free',
              timeout: 15000,
            }),
            retryOn: 'MODEL_RETRYABLE_ZERO_CHUNK',
          }),
        ],
      }),
    );
  });

  it('keeps strict rate-limit-only failover in static mode', async () => {
    const result = await decideHostModel({
      ...input,
      routingMode: 'static',
      requestTimeoutMs: 15000,
      allowFailover: true,
      preferredModel: 'model-a:free',
    });

    expect(result.modelParameters.timeout).toBeUndefined();
    expect(result.modelParameters.fallbacks).toEqual([
      expect.objectContaining({
        retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
      }),
    ]);
    expect(result.modelParameters.fallbacks[0].clientOptions.timeout).toBeUndefined();
  });

  it('fails closed when free_only has no free admissible model', async () => {
    await expect(
      decideHostModel({
        ...input,
        routingMode: 'adaptive',
        preferredModel: undefined,
        routingSignals: {
          'model-a:free': { pricingTier: 'paid' },
          'model-b:free': { pricingTier: 'paid' },
        },
        routingConstraints: { spendingPolicy: 'free_only' },
      }),
    ).rejects.toThrow('No admissible authorized resource candidates');
  });

  it('installs only host-authorized resolved fallbacks when controlled failover is enabled', async () => {
    const result = await decideHostModel({
      ...input,
      preferredModel: 'model-a:free',
      allowFailover: true,
    });

    expect(result.modelParameters).toMatchObject({
      model: 'model-a:free',
      fallbacks: [
        {
          provider: 'OpenRouter',
          clientOptions: { model: 'model-b:free' },
          retryOn: 'MODEL_RATE_LIMIT_ZERO_CHUNK',
        },
      ],
    });
  });

  it('requires a trace and rejects a hidden native fallback', async () => {
    await expect(decideHostModel({ ...input, traceId: '' })).rejects.toThrow(/trace/i);
    await expect(
      decideHostModel({
        ...input,
        resolvedAlternatives: [
          { model: 'model-b:free', options: { model: 'model-b:free', fallbacks: [{}] } },
        ],
      }),
    ).rejects.toThrow(/fallback/i);
  });
});
