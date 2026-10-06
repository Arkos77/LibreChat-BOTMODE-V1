const boundedText = (value) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= 256 ? value : undefined;
const tokenCount = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);
const usdCost = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

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
    if (inputTokens == null && outputTokens == null) continue;
    modelCalls.push({
      usageModel,
      provider: event.provider.toLowerCase(),
      ...(inputTokens == null ? {} : { inputTokens }),
      ...(outputTokens == null ? {} : { outputTokens }),
      ...(costUsd == null ? {} : { costUsd }),
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
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true },
  );

  return {
    traceId,
    decisionId,
    selectedModel,
    selectedProvider,
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
