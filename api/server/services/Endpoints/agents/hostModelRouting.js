/** Host adapter for explicitly configured, separately resolved OpenRouter model choices. */
async function resolveHostModelRouting({
  config,
  originalAgent,
  primaryConfig,
  validate,
  initialize,
  decide,
  persist,
  sink,
  traceId,
  user,
  tenantId,
  timestamp,
  decisionId,
  traceEventId,
}) {
  const entries = config?.filter((entry) => entry.agentId === originalAgent.id) ?? [];
  if (entries.length === 0) return primaryConfig;
  if (entries.length !== 1) throw new Error('Duplicate host model routing policies for agent');
  const [policy] = entries;
  if (originalAgent.provider?.toLowerCase() !== 'openrouter') {
    throw new Error('Host model routing requires an OpenRouter agent');
  }
  if (!traceId || !user || typeof persist !== 'function') {
    throw new Error('Host model routing requires durable decision provenance');
  }
  if (policy.models?.[0] !== originalAgent.model) {
    throw new Error('Host model routing must start with the saved model');
  }
  if (primaryConfig?.id !== originalAgent.id || primaryConfig.model !== originalAgent.model) {
    throw new Error('Primary native model binding mismatch');
  }
  const resolvedAlternatives = [];
  const validatedModels = [originalAgent.model];
  const configurations = new Map([[originalAgent.model, primaryConfig]]);
  for (const model of policy.models.slice(1)) {
    const agent = {
      ...originalAgent,
      model,
      model_parameters: { ...(originalAgent.model_parameters ?? {}), model },
    };
    const validation = await validate(agent);
    if (!validation?.isValid)
      throw new Error('Host model routing alternative failed native validation');
    const resolved = await initialize(agent);
    if (
      resolved?.id !== primaryConfig.id ||
      resolved?.model !== model ||
      resolved?.provider !== primaryConfig.provider ||
      resolved?.model_parameters?.model !== model
    ) {
      throw new Error('Host model routing alternative has a mismatched resolved binding');
    }
    configurations.set(model, resolved);
    validatedModels.push(model);
    resolvedAlternatives.push({ model, options: resolved.model_parameters });
  }
  const { selectedModel, event } = await decide({
    agentId: originalAgent.id,
    provider: originalAgent.provider,
    currentModel: originalAgent.model,
    resolvedOptions: primaryConfig.model_parameters,
    resolvedAlternatives,
    authorizedModels: policy.models,
    availableModels: validatedModels,
    preferredModel: policy.preferredModel,
    traceId,
    timestamp,
    decisionId,
    traceEventId,
  });
  const selected = configurations.get(selectedModel);
  if (
    !selected ||
    event?.type !== 'DECIDED' ||
    event.identity?.traceId !== traceId ||
    event.identity?.traceEventId !== traceEventId ||
    event.payload?.selectedOption !== selectedModel
  ) {
    throw new Error('Host model routing decision does not match a resolved binding');
  }
  await persist({
    user,
    ...(tenantId ? { tenantId } : {}),
    event: {
      traceId: event.identity.traceId,
      traceEventId: event.identity.traceEventId,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp,
      payload: {
        decisionId: event.payload.decisionId,
        selectedOption: event.payload.selectedOption,
        provider: event.payload.provider,
        ...(event.payload.confidence === undefined ? {} : { confidence: event.payload.confidence }),
      },
    },
  });
  if (typeof sink === 'function') {
    try {
      await sink(event);
    } catch (_) {
      // Durable provenance already succeeded; a logging failure does not change the choice.
    }
  }
  return selected;
}
module.exports = { resolveHostModelRouting };
