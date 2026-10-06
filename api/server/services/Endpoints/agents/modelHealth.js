const mongoose = require('mongoose');

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_RECEIPTS = 200;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const MIN_SIGNAL_SAMPLES = 2;

const cache = new Map();

function boundedRate(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : undefined;
}

function boundedLatency(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 600000
    ? Math.round(value)
    : undefined;
}

function keyFor(provider, model) {
  if (typeof provider !== 'string' || typeof model !== 'string') return undefined;
  const p = provider.trim().toLowerCase();
  const m = model.trim();
  if (!p || !m) return undefined;
  return p + '\0' + m;
}

function percentile(values, ratio) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function createBucket(provider, model) {
  return {
    provider,
    model,
    sampleCount: 0,
    latencies: [],
    selectedAttempts: 0,
    selectedSuccesses: 0,
    fallbackCount: 0,
  };
}

function deriveHealthSignals(receipts) {
  const buckets = new Map();

  const bucketFor = (provider, model) => {
    const key = keyFor(provider, model);
    if (!key) return undefined;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = createBucket(provider.toLowerCase(), model);
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const row of receipts ?? []) {
    const receipt = row?.hostModelUsage ?? row?.metadata?.hostModelUsage ?? row;
    if (!receipt || typeof receipt !== 'object') continue;

    const selectedProvider =
      typeof receipt.selectedProvider === 'string'
        ? receipt.selectedProvider.toLowerCase()
        : undefined;
    const selectedModel =
      typeof receipt.selectedModel === 'string' ? receipt.selectedModel : undefined;
    const selectedBucket = bucketFor(selectedProvider, selectedModel);
    if (selectedBucket) {
      selectedBucket.selectedAttempts += 1;
      if (receipt.fallbackUsed === true) selectedBucket.fallbackCount += 1;
    }

    const calls = Array.isArray(receipt.modelCalls) ? receipt.modelCalls : [];
    let selectedSucceeded = false;
    for (const call of calls) {
      const provider = typeof call?.provider === 'string' ? call.provider.toLowerCase() : undefined;
      const model = typeof call?.usageModel === 'string' ? call.usageModel : undefined;
      const bucket = bucketFor(provider, model);
      if (!bucket) continue;
      bucket.sampleCount += 1;
      const latency = boundedLatency(call.latencyMs);
      if (latency != null) bucket.latencies.push(latency);
      if (provider === selectedProvider && model === selectedModel) {
        selectedSucceeded = true;
      }
    }
    if (selectedBucket && selectedSucceeded) selectedBucket.selectedSuccesses += 1;
  }

  const byProviderModel = {};
  for (const [key, bucket] of buckets) {
    const signals = { sampleCount: bucket.sampleCount };
    if (bucket.latencies.length >= MIN_SIGNAL_SAMPLES) {
      signals.latencyMs = percentile(bucket.latencies, 0.5);
      signals.latencyP95Ms = percentile(bucket.latencies, 0.95);
    }
    if (bucket.selectedAttempts >= MIN_SIGNAL_SAMPLES) {
      signals.successRate = boundedRate(bucket.selectedSuccesses / bucket.selectedAttempts);
      signals.fallbackRate = boundedRate(bucket.fallbackCount / bucket.selectedAttempts);
    }
    byProviderModel[key] = signals;
  }
  return byProviderModel;
}

async function readModelHealthState({
  userId,
  now = new Date(),
  aggregate,
  windowMs = DEFAULT_WINDOW_MS,
  maxReceipts = DEFAULT_MAX_RECEIPTS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  useCache = true,
}) {
  const safeUserId = String(userId);
  const cacheKey = safeUserId + ':' + windowMs + ':' + maxReceipts;
  const nowMs = now.getTime();
  const cached = cache.get(cacheKey);
  if (useCache && cached && cached.expiresAt > nowMs) return cached.value;

  const since = new Date(nowMs - windowMs);
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
        user: safeUserId,
        isCreatedByUser: false,
        createdAt: { $gte: since, $lte: now },
        'metadata.hostModelUsage': { $exists: true },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: Math.min(Math.max(maxReceipts, 1), DEFAULT_MAX_RECEIPTS) },
    {
      $project: {
        _id: 0,
        createdAt: 1,
        hostModelUsage: '$metadata.hostModelUsage',
      },
    },
  ]);

  const value = {
    windowStart: since.toISOString(),
    asOf: now.toISOString(),
    receiptCount: Array.isArray(rows) ? rows.length : 0,
    byProviderModel: deriveHealthSignals(Array.isArray(rows) ? rows : []),
  };

  if (useCache) {
    cache.set(cacheKey, { expiresAt: nowMs + Math.max(cacheTtlMs, 1), value });
  }
  return value;
}

function getModelHealthSignals(state, provider, model) {
  const key = keyFor(provider, model);
  if (!key) return undefined;
  return state?.byProviderModel?.[key];
}

function clearModelHealthCache() {
  cache.clear();
}

module.exports = {
  readModelHealthState,
  getModelHealthSignals,
  deriveHealthSignals,
  clearModelHealthCache,
};
