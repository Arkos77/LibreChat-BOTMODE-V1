const {
  readModelHealthState,
  getModelHealthSignals,
  deriveHealthSignals,
  clearModelHealthCache,
} = require('./modelHealth');

describe('BOT MODE model health signals', () => {
  beforeEach(() => clearModelHealthCache());

  it('derives bounded latency and selected-model reliability from persisted receipts', () => {
    const byProviderModel = deriveHealthSignals([
      {
        hostModelUsage: {
          selectedProvider: 'OpenRouter',
          selectedModel: 'free-a',
          fallbackUsed: false,
          modelCalls: [{ provider: 'openrouter', usageModel: 'free-a', latencyMs: 100 }],
        },
      },
      {
        hostModelUsage: {
          selectedProvider: 'openrouter',
          selectedModel: 'free-a',
          fallbackUsed: true,
          modelCalls: [
            { provider: 'openrouter', usageModel: 'free-a', latencyMs: 300 },
            { provider: 'Gemini', usageModel: 'flash', latencyMs: 80 },
          ],
        },
      },
      {
        hostModelUsage: {
          selectedProvider: 'openrouter',
          selectedModel: 'free-a',
          fallbackUsed: false,
          modelCalls: [{ provider: 'openrouter', usageModel: 'free-a', latencyMs: 200 }],
        },
      },
    ]);

    expect(byProviderModel['openrouter\0free-a']).toEqual({
      sampleCount: 3,
      latencyMs: 200,
      latencyP95Ms: 300,
      successRate: 1,
      fallbackRate: 1 / 3,
    });
    expect(byProviderModel['gemini\0flash']).toEqual({
      sampleCount: 1,
    });
  });

  it('waits for at least two samples before publishing health ranking signals', () => {
    const byProviderModel = deriveHealthSignals([
      {
        selectedProvider: 'openrouter',
        selectedModel: 'single',
        fallbackUsed: true,
        modelCalls: [{ provider: 'openrouter', usageModel: 'single', latencyMs: 999 }],
      },
    ]);
    expect(byProviderModel['openrouter\0single']).toEqual({ sampleCount: 1 });
  });

  it('keeps provider/model identities distinct', () => {
    const byProviderModel = deriveHealthSignals([
      {
        selectedProvider: 'openrouter',
        selectedModel: 'same',
        fallbackUsed: false,
        modelCalls: [{ provider: 'openrouter', usageModel: 'same', latencyMs: 10 }],
      },
      {
        selectedProvider: 'anthropic',
        selectedModel: 'same',
        fallbackUsed: false,
        modelCalls: [{ provider: 'anthropic', usageModel: 'same', latencyMs: 20 }],
      },
    ]);
    expect(Object.keys(byProviderModel).sort()).toEqual(['anthropic\0same', 'openrouter\0same']);
  });

  it('reads only a bounded recent projection and caches the result briefly', async () => {
    const aggregate = jest.fn(async () => [
      {
        hostModelUsage: {
          selectedProvider: 'openrouter',
          selectedModel: 'free-a',
          fallbackUsed: false,
          modelCalls: [
            { provider: 'openrouter', usageModel: 'free-a', latencyMs: 120 },
            { provider: 'openrouter', usageModel: 'free-a', latencyMs: 180 },
          ],
        },
      },
    ]);
    const now = new Date('2026-10-06T18:00:00.000Z');

    const first = await readModelHealthState({
      userId: 'u1',
      now,
      aggregate,
      cacheTtlMs: 60000,
    });
    const second = await readModelHealthState({
      userId: 'u1',
      now: new Date(now.getTime() + 1000),
      aggregate,
      cacheTtlMs: 60000,
    });

    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.receiptCount).toBe(1);
    expect(getModelHealthSignals(first, 'OpenRouter', 'free-a')).toMatchObject({
      sampleCount: 2,
      latencyMs: 120,
      latencyP95Ms: 180,
    });
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ $limit: 200 }),
        expect.objectContaining({
          $project: expect.objectContaining({
            hostModelUsage: '$metadata.hostModelUsage',
          }),
        }),
      ]),
    );
  });

  it('can bypass cache for deterministic tests and maintenance reads', async () => {
    const aggregate = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await readModelHealthState({ userId: 'u2', aggregate, useCache: false });
    await readModelHealthState({ userId: 'u2', aggregate, useCache: false });
    expect(aggregate).toHaveBeenCalledTimes(2);
  });
});
