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
  if (!traceId || !decisionId || !selectedModel || !agentId || !Array.isArray(usageEvents))
    return undefined;
  const modelCalls = [];
  for (const event of usageEvents) {
    if (modelCalls.length >= 16) break;
    if (
      event?.usage_type != null ||
      event?.agentId !== agentId ||
      typeof event?.provider !== 'string' ||
      event.provider.toLowerCase() !== selectedProvider.toLowerCase()
    )
      continue;
    const usageModel = boundedText(event.model);
    if (!usageModel) continue;
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
  return modelCalls.length ? { traceId, decisionId, selectedModel, modelCalls } : undefined;
}
module.exports = { projectHostModelUsage };
