const boundedText = (value) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= 256 ? value : undefined;
const tokenCount = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);
const usdCost = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const latencyMs = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 600000
    ? Math.round(value)
    : undefined;

/** Persist a small projection of actual primary model-end usage for an opted-in P11 decision. */
function projectHostModelUsage(decision, usageEvents) {
  const traceId = boundedText(decision?.traceId);
  const decisionId = boundedText(decision?.decisionId);
  const selectedModel = boundedText(decision?.selectedModel);
  const selectedProvider = boundedText(decision?.selectedProvider) ?? 'openrouter';
  const agentId = boundedText(decision?.agentId);
  const authorizedBindings = Array.isArray(decision?.authorizedBindings)
    ? decision.authorizedBindings
        .map((binding) => ({
          provider: boundedText(binding?.provider),
          model: boundedText(binding?.model),
        }))
        .filter((binding) => binding.provider && binding.model)
    : [{ provider: selectedProvider, model: selectedModel }];
  if (authorizedBindings.length === 0) return undefined;
  if (!traceId || !decisionId || !selectedModel || !agentId || !Array.isArray(usageEvents))
    return undefined;
  const modelCalls = [];
  for (const event of usageEvents) {
    if (modelCalls.length >= 16) break;
    if (
      event?.usage_type != null ||
      event?.agentId !== agentId ||
      typeof event?.provider !== 'string'
    )
      continue;
    const usageModel = boundedText(event.model);
    const normalizedProvider = event.provider.toLowerCase();
    if (
      !usageModel ||
      !authorizedBindings.some(
        (binding) =>
          binding.provider.toLowerCase() === normalizedProvider && binding.model === usageModel,
      )
    )
      continue;
    const inputTokens = tokenCount(event.input_tokens);
    const outputTokens = tokenCount(event.output_tokens);
    const costUsd = usdCost(event.cost);
    const observedLatencyMs = latencyMs(event.latency_ms);
    const cacheReadTokens = tokenCount(
      event?.input_token_details?.cache_read ?? event?.cache_read_input_tokens,
    );
    const cacheWriteTokens = tokenCount(
      event?.input_token_details?.cache_creation ??
        event?.input_token_details?.cache_write_tokens ??
        event?.cache_creation_input_tokens ??
        event?.cache_write_tokens,
    );
    if (inputTokens == null && outputTokens == null) continue;
    modelCalls.push({
      usageModel,
      provider: event.provider.toLowerCase(),
      ...(inputTokens == null ? {} : { inputTokens }),
      ...(outputTokens == null ? {} : { outputTokens }),
      ...(costUsd == null ? {} : { costUsd }),
      ...(observedLatencyMs == null ? {} : { latencyMs: observedLatencyMs }),
      ...(cacheReadTokens == null ? {} : { cacheReadTokens }),
      ...(cacheWriteTokens == null ? {} : { cacheWriteTokens }),
    });
  }
  if (!modelCalls.length) return undefined;

  const total = modelCalls.reduce(
    (acc, call) => {
      acc.inputTokens += call.inputTokens ?? 0;
      acc.outputTokens += call.outputTokens ?? 0;
      if (call.costUsd == null) {
        acc.costKnown = false;
      } else {
        acc.costUsd += call.costUsd;
      }
      if (call.latencyMs == null) {
        acc.latencyKnown = false;
      } else {
        acc.latencyMs += call.latencyMs;
      }
      if (call.cacheReadTokens == null) {
        acc.cacheReadKnown = false;
      } else {
        acc.cacheReadTokens += call.cacheReadTokens;
      }
      if (call.cacheWriteTokens == null) {
        acc.cacheWriteKnown = false;
      } else {
        acc.cacheWriteTokens += call.cacheWriteTokens;
      }
      return acc;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costKnown: true,
      latencyMs: 0,
      latencyKnown: true,
      cacheReadTokens: 0,
      cacheReadKnown: true,
      cacheWriteTokens: 0,
      cacheWriteKnown: true,
    },
  );

  const fallbackUsed = modelCalls.some(
    (call) => call.provider !== selectedProvider.toLowerCase() || call.usageModel !== selectedModel,
  );
  const resolvedCall = modelCalls[modelCalls.length - 1];

  return {
    traceId,
    decisionId,
    selectedModel,
    selectedProvider,
    resolvedProvider: resolvedCall.provider,
    resolvedModel: resolvedCall.usageModel,
    fallbackUsed,
    ...(boundedText(decision?.selectedBindingId)
      ? { selectedBindingId: boundedText(decision.selectedBindingId) }
      : {}),
    ...(boundedText(decision?.routingMode)
      ? { routingMode: boundedText(decision.routingMode) }
      : {}),
    ...(boundedText(decision?.spendingPolicy)
      ? { spendingPolicy: boundedText(decision.spendingPolicy) }
      : {}),
    authorizedBindings,
    modelCalls,
    total,
  };
}
module.exports = { projectHostModelUsage };
