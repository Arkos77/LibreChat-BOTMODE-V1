const { readModelBudgetState, mergeBudgetRoutingConstraints } = require('./modelBudget');

describe('BOT MODE model budget', () => {
  it('aggregates persisted USD cost and remains free-first below the threshold', async () => {
    const aggregate = jest.fn(async () => [{ dailyUsd: 0.4, monthlyUsd: 4 }]);
    const state = await readModelBudgetState({
      userId: 'user-one',
      config: { dailyUsd: 2, monthlyUsd: 20, freeOnlyRatio: 0.95 },
      now: new Date('2026-10-06T16:00:00.000Z'),
      aggregate,
    });

    expect(state).toMatchObject({
      enabled: true,
      spendingPolicy: 'free_first',
      utilizationRatio: 0.2,
      daily: { spentUsd: 0.4, limitUsd: 2, ratio: 0.2 },
      monthly: { spentUsd: 4, limitUsd: 20, ratio: 0.2 },
    });
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('switches to free-only when either configured period reaches the threshold', async () => {
    const state = await readModelBudgetState({
      userId: 'user-one',
      config: { dailyUsd: 1, monthlyUsd: 20, freeOnlyRatio: 0.95 },
      aggregate: async () => [{ dailyUsd: 0.96, monthlyUsd: 2 }],
    });
    expect(state.spendingPolicy).toBe('free_only');
    expect(state.utilizationRatio).toBeCloseTo(0.96);
  });

  it('still exposes observed spend without enforcing a configured limit', async () => {
    const aggregate = jest.fn(async () => [{ dailyUsd: 0.12, monthlyUsd: 1.5 }]);
    const state = await readModelBudgetState({
      userId: 'user-one',
      config: undefined,
      aggregate,
    });
    expect(state).toMatchObject({
      enabled: false,
      spendingPolicy: 'free_first',
      utilizationRatio: 0,
      daily: { spentUsd: 0.12 },
      monthly: { spentUsd: 1.5 },
    });
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('merges only the spending policy into existing router constraints', () => {
    expect(
      mergeBudgetRoutingConstraints(
        { maxLatencyMs: 100 },
        { enabled: true, spendingPolicy: 'free_only' },
      ),
    ).toEqual({ maxLatencyMs: 100, spendingPolicy: 'free_only' });
  });
});
