const { projectHostModelUsage } = require('./hostModelUsage');

describe('P11 model invocation evidence', () => {
  const decision = {
    traceId: 'trace-1',
    decisionId: 'decision-1',
    selectedModel: 'b:free',
    agentId: 'agent-primary',
  };
  it('links the durable decision to bounded primary provider usage', () => {
    const result = projectHostModelUsage(decision, [
      {
        agentId: 'agent-primary',
        model: 'b:free',
        provider: 'openrouter',
        input_tokens: 14,
        output_tokens: 3,
        cost: 0.0017,
        latency_ms: 420,
        input_token_details: { cache_read: 6, cache_creation: 2 },
      },
      { model: 'other', provider: 'openrouter', usage_type: 'subagent', input_tokens: 80 },
    ]);
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'b:free',
      selectedProvider: 'openrouter',
      resolvedProvider: 'openrouter',
      resolvedModel: 'b:free',
      fallbackUsed: false,
      authorizedBindings: [{ provider: 'openrouter', model: 'b:free' }],
      modelCalls: [
        {
          usageModel: 'b:free',
          provider: 'openrouter',
          inputTokens: 14,
          outputTokens: 3,
          costUsd: 0.0017,
          latencyMs: 420,
          cacheReadTokens: 6,
          cacheWriteTokens: 2,
        },
      ],
      total: {
        inputTokens: 14,
        outputTokens: 3,
        costUsd: 0.0017,
        costKnown: true,
        latencyMs: 420,
        latencyKnown: true,
        cacheReadTokens: 6,
        cacheReadKnown: true,
        cacheWriteTokens: 2,
        cacheWriteKnown: true,
      },
    });
  });
  it('attributes explicit cross-provider usage to the selected provider', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        selectedModel: 'claude-sonnet',
        selectedProvider: 'anthropic',
        authorizedBindings: [
          { bindingId: 'primary', provider: 'anthropic', model: 'claude-sonnet' },
          { bindingId: 'fallback', provider: 'openrouter', model: 'claude-sonnet' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'claude-sonnet',
          provider: 'anthropic',
          input_tokens: 21,
          output_tokens: 5,
          cost: 0.0026,
          latency_ms: 310,
        },
        {
          agentId: 'agent-primary',
          model: 'claude-sonnet',
          provider: 'openrouter',
          input_tokens: 999,
          latency_ms: 125,
        },
      ],
    );
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'claude-sonnet',
      selectedProvider: 'anthropic',
      resolvedProvider: 'openrouter',
      resolvedModel: 'claude-sonnet',
      fallbackUsed: true,
      authorizedBindings: [
        { provider: 'anthropic', model: 'claude-sonnet' },
        { provider: 'openrouter', model: 'claude-sonnet' },
      ],
      modelCalls: [
        {
          usageModel: 'claude-sonnet',
          provider: 'anthropic',
          inputTokens: 21,
          outputTokens: 5,
          costUsd: 0.0026,
          latencyMs: 310,
        },
        {
          usageModel: 'claude-sonnet',
          provider: 'openrouter',
          inputTokens: 999,
          latencyMs: 125,
        },
      ],
      total: {
        inputTokens: 1020,
        outputTokens: 5,
        costUsd: 0.0026,
        costKnown: false,
        latencyMs: 435,
        latencyKnown: true,
        cacheReadTokens: 0,
        cacheReadKnown: false,
        cacheWriteTokens: 0,
        cacheWriteKnown: false,
      },
    });
  });

  it('attributes only primary calls from the selected agent', () => {
    const observed = projectHostModelUsage({ ...decision, agentId: 'agent-primary' }, [
      { agentId: 'agent-connected', model: 'other', provider: 'openrouter', input_tokens: 99 },
      { agentId: 'agent-primary', model: 'b:free', provider: 'openrouter', input_tokens: 14 },
    ]);
    expect(observed.modelCalls).toEqual([
      { usageModel: 'b:free', provider: 'openrouter', inputTokens: 14 },
    ]);
  });
  it('adds bounded routing context to the same usage receipt without secrets', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        selectedBindingId: 'free-primary',
        routingMode: 'adaptive',
        spendingPolicy: 'free_first',
        authorizedBindings: [
          { bindingId: 'free-primary', provider: 'openrouter', model: 'b:free' },
          { bindingId: 'fallback', provider: 'Gemini', model: 'models/gemini-3.5-flash' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'b:free',
          provider: 'openrouter',
          input_tokens: 7,
          output_tokens: 2,
          cost: 0,
        },
      ],
    );

    expect(result).toMatchObject({
      selectedBindingId: 'free-primary',
      routingMode: 'adaptive',
      spendingPolicy: 'free_first',
      total: {
        inputTokens: 7,
        outputTokens: 2,
        costUsd: 0,
        costKnown: true,
        latencyMs: 0,
        latencyKnown: false,
        cacheReadTokens: 0,
        cacheReadKnown: false,
        cacheWriteTokens: 0,
        cacheWriteKnown: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });

  it('keeps a mismatch visible and excludes secrets and unbounded values', () => {
    const result = projectHostModelUsage(
      {
        ...decision,
        authorizedBindings: [
          { bindingId: 'selected', provider: 'openrouter', model: 'provider-alias' },
        ],
      },
      [
        {
          agentId: 'agent-primary',
          model: 'provider-alias',
          provider: 'openrouter',
          input_tokens: 2,
          apiKey: 'secret',
        },
        { model: 'x'.repeat(300), provider: 'openrouter', input_tokens: 9 },
      ],
    );
    expect(result.modelCalls).toEqual([
      { usageModel: 'provider-alias', provider: 'openrouter', inputTokens: 2 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(projectHostModelUsage(decision, [])).toBeUndefined();
  });
});
