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
      },
      { model: 'other', provider: 'openrouter', usage_type: 'subagent', input_tokens: 80 },
    ]);
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'b:free',
      modelCalls: [
        {
          usageModel: 'b:free',
          provider: 'openrouter',
          inputTokens: 14,
          outputTokens: 3,
          costUsd: 0.0017,
        },
      ],
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
        },
        {
          agentId: 'agent-primary',
          model: 'claude-sonnet',
          provider: 'openrouter',
          input_tokens: 999,
        },
      ],
    );
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'claude-sonnet',
      modelCalls: [
        {
          usageModel: 'claude-sonnet',
          provider: 'anthropic',
          inputTokens: 21,
          outputTokens: 5,
          costUsd: 0.0026,
        },
        {
          usageModel: 'claude-sonnet',
          provider: 'openrouter',
          inputTokens: 999,
        },
      ],
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
