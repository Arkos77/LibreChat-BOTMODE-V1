const { projectHostModelUsage } = require('./hostModelUsage');

describe('P11 model invocation evidence', () => {
  const decision = { traceId: 'trace-1', decisionId: 'decision-1', selectedModel: 'b:free' };
  it('links the durable decision to bounded primary provider usage', () => {
    const result = projectHostModelUsage(decision, [
      { model: 'b:free', provider: 'openrouter', input_tokens: 14, output_tokens: 3 },
      { model: 'other', provider: 'openrouter', usage_type: 'subagent', input_tokens: 80 },
    ]);
    expect(result).toEqual({
      traceId: 'trace-1',
      decisionId: 'decision-1',
      selectedModel: 'b:free',
      modelCalls: [
        { usageModel: 'b:free', provider: 'openrouter', inputTokens: 14, outputTokens: 3 },
      ],
    });
  });
  it('keeps a mismatch visible and excludes secrets and unbounded values', () => {
    const result = projectHostModelUsage(decision, [
      { model: 'provider-alias', provider: 'openrouter', input_tokens: 2, apiKey: 'secret' },
      { model: 'x'.repeat(300), provider: 'openrouter', input_tokens: 9 },
    ]);
    expect(result.modelCalls).toEqual([
      { usageModel: 'provider-alias', provider: 'openrouter', inputTokens: 2 },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(projectHostModelUsage(decision, [])).toBeUndefined();
  });
});
