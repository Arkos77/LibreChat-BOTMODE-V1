const mongoose = require('mongoose');

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function ratio(spent, limit) {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? spent / limit : 0;
}

function startOfUtcDay(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function readModelBudgetState({ userId, config, now = new Date(), aggregate }) {
  const budgetConfig = config ?? {};
  const enabled = budgetConfig.dailyUsd != null || budgetConfig.monthlyUsd != null;

  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const runAggregate =
    aggregate ??
    ((pipeline) => {
      const Message = mongoose.models.Message;
      if (!Message) throw new Error('Message model is unavailable');
      return Message.aggregate(pipeline);
    });

  const rows = await runAggregate([
    {
      $match: {
        user: String(userId),
        isCreatedByUser: false,
        createdAt: { $gte: monthStart, $lte: now },
        'metadata.usage.cost': { $type: 'number' },
      },
    },
    {
      $group: {
        _id: null,
        monthlyUsd: { $sum: '$metadata.usage.cost' },
        dailyUsd: {
          $sum: {
            $cond: [{ $gte: ['$createdAt', dayStart] }, '$metadata.usage.cost', 0],
          },
        },
      },
    },
  ]);

  const spentDailyUsd = finiteNonNegative(rows?.[0]?.dailyUsd);
  const spentMonthlyUsd = finiteNonNegative(rows?.[0]?.monthlyUsd);
  const dailyRatio = ratio(spentDailyUsd, budgetConfig.dailyUsd);
  const monthlyRatio = ratio(spentMonthlyUsd, budgetConfig.monthlyUsd);
  const utilizationRatio = Math.max(dailyRatio, monthlyRatio);
  const freeOnlyRatio =
    typeof budgetConfig.freeOnlyRatio === 'number' && Number.isFinite(budgetConfig.freeOnlyRatio)
      ? Math.min(Math.max(budgetConfig.freeOnlyRatio, 0), 1)
      : 0.95;
  const spendingPolicy = enabled && utilizationRatio >= freeOnlyRatio ? 'free_only' : 'free_first';

  return {
    enabled,
    spendingPolicy,
    utilizationRatio,
    freeOnlyRatio,
    daily: {
      spentUsd: spentDailyUsd,
      ...(budgetConfig.dailyUsd == null
        ? {}
        : { limitUsd: budgetConfig.dailyUsd, ratio: dailyRatio }),
    },
    monthly: {
      spentUsd: spentMonthlyUsd,
      ...(budgetConfig.monthlyUsd == null
        ? {}
        : { limitUsd: budgetConfig.monthlyUsd, ratio: monthlyRatio }),
    },
    period: {
      dayStart: dayStart.toISOString(),
      monthStart: monthStart.toISOString(),
      asOf: now.toISOString(),
    },
  };
}

function mergeBudgetRoutingConstraints(constraints, budgetState) {
  if (!budgetState?.enabled) return constraints;
  return {
    ...(constraints ?? {}),
    spendingPolicy: budgetState.spendingPolicy,
  };
}

module.exports = {
  readModelBudgetState,
  mergeBudgetRoutingConstraints,
};
