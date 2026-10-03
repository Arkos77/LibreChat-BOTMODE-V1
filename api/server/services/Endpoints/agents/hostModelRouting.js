function sameProvider(left, right) {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function normalizePolicy(policy, originalAgent) {
  if (Array.isArray(policy?.bindings)) {
    const bindings = policy.bindings.map((binding) => ({
      id: binding?.id,
      provider: binding?.provider,
      model: binding?.model,
      signals: binding?.signals,
    }));
    if (
      bindings.length < 2 ||
      bindings.length > 4 ||
      bindings.some((binding) => !binding.id || !binding.provider || !binding.model)
    ) {
      throw new Error('Host model routing requires two to four explicit bindings');
    }
    if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length) {
      throw new Error('Host model routing contains duplicate binding ids');
    }
    const primary = bindings[0];
    if (
      !sameProvider(primary.provider, originalAgent.provider) ||
      primary.model !== originalAgent.model
    ) {
      throw new Error('Host model routing must start with the saved provider/model binding');
    }
    const preferredBindingId = policy.preferredBindingId;
    if (
      preferredBindingId != null &&
      !bindings.some((binding) => binding.id === preferredBindingId)
    ) {
      throw new Error('Preferred host model binding is not authorized');
    }
    return {
      bindings,
      preferredBindingId,
      explicitBindings: true,
      routingConstraints: policy.routingConstraints,
      allowFailover: policy.allowFailover === true,
    };
  }

  if (originalAgent.provider?.toLowerCase() !== 'openrouter') {
    throw new Error('Host model routing requires an OpenRouter agent');
  }
  if (policy.models?.[0] !== originalAgent.model) {
    throw new Error('Host model routing must start with the saved model');
  }
  const bindings = (policy.models ?? []).map((model) => ({
    id: model,
    provider: originalAgent.provider,
    model,
    signals: policy.routingSignals?.[model],
  }));
  return {
    bindings,
    preferredBindingId: policy.preferredModel ?? originalAgent.model,
    explicitBindings: false,
    routingConstraints: policy.routingConstraints,
    allowFailover: policy.allowFailover === true,
  };
}

/** Host adapter for explicitly configured, separately resolved model/provider choices. */
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
  if (!traceId || !user || typeof persist !== 'function') {
    throw new Error('Host model routing requires durable decision provenance');
  }

  const { bindings, preferredBindingId, explicitBindings, routingConstraints, allowFailover } =
    normalizePolicy(policy, originalAgent);
  if (
    bindings.length < 2 ||
    bindings.length > 4 ||
    primaryConfig?.id !== originalAgent.id ||
    primaryConfig.model !== originalAgent.model ||
    !sameProvider(primaryConfig.provider, bindings[0].provider)
  ) {
    throw new Error('Primary native model binding mismatch');
  }

  const resolvedBindings = [
    {
      id: bindings[0].id,
      provider: bindings[0].provider,
      model: bindings[0].model,
      options: primaryConfig.model_parameters,
      contextWindow: primaryConfig.maxContextTokens,
      ...(bindings[0].signals ? { signals: bindings[0].signals } : {}),
    },
  ];
  const configurations = new Map([[bindings[0].id, primaryConfig]]);

  for (const binding of bindings.slice(1)) {
    const sameProviderAsPrimary = sameProvider(binding.provider, originalAgent.provider);
    const agent = {
      ...originalAgent,
      provider: binding.provider,
      model: binding.model,
      model_parameters: sameProviderAsPrimary
        ? { ...(originalAgent.model_parameters ?? {}), model: binding.model }
        : { model: binding.model },
    };
    const validation = await validate(agent);
    if (!validation?.isValid) {
      throw new Error('Host model routing alternative failed native validation');
    }
    const resolved = await initialize(agent);
    if (
      resolved?.id !== primaryConfig.id ||
      resolved?.model !== binding.model ||
      !sameProvider(resolved?.provider, binding.provider) ||
      resolved?.model_parameters?.model !== binding.model
    ) {
      throw new Error('Host model routing alternative has a mismatched resolved binding');
    }
    configurations.set(binding.id, resolved);
    resolvedBindings.push({
      id: binding.id,
      provider: binding.provider,
      model: binding.model,
      options: resolved.model_parameters,
      contextWindow: resolved.maxContextTokens,
      ...(binding.signals ? { signals: binding.signals } : {}),
    });
  }

  const decision = explicitBindings
    ? await decide({
        agentId: originalAgent.id,
        bindings: resolvedBindings,
        preferredBindingId,
        routingConstraints,
        allowFailover,
        traceId,
        timestamp,
        decisionId,
        traceEventId,
      })
    : await decide({
        agentId: originalAgent.id,
        provider: originalAgent.provider,
        currentModel: originalAgent.model,
        resolvedOptions: primaryConfig.model_parameters,
        resolvedContextWindow: primaryConfig.maxContextTokens,
        resolvedAlternatives: resolvedBindings
          .slice(1)
          .map(({ model, options, contextWindow }) => ({
            model,
            options,
            contextWindow,
          })),
        authorizedModels: bindings.map((binding) => binding.model),
        availableModels: resolvedBindings.map((binding) => binding.model),
        preferredModel: policy.preferredModel,
        routingSignals: Object.fromEntries(
          resolvedBindings.map((binding) => [binding.id, binding.signals ?? {}]),
        ),
        routingConstraints,
        allowFailover,
        traceId,
        timestamp,
        decisionId,
        traceEventId,
      });

  const selectedBindingId = decision.selectedBindingId ?? decision.selectedModel;
  const selected = configurations.get(selectedBindingId);
  const selectedBinding = resolvedBindings.find((binding) => binding.id === selectedBindingId);
  const event = decision.event;
  if (
    !selected ||
    !selectedBinding ||
    event?.type !== 'DECIDED' ||
    event.identity?.traceId !== traceId ||
    event.identity?.traceEventId !== traceEventId ||
    event.payload?.selectedOption !== selectedBindingId
  ) {
    throw new Error('Host model routing decision does not match a resolved binding');
  }
  if (
    decision.selectedProvider != null &&
    !sameProvider(decision.selectedProvider, selectedBinding.provider)
  ) {
    throw new Error('Host model routing decision provider does not match resolved binding');
  }
  if (decision.selectedModel != null && decision.selectedModel !== selectedBinding.model) {
    throw new Error('Host model routing decision model does not match resolved binding');
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

  const authorizedBindings = resolvedBindings.map((binding) => ({
    bindingId: binding.id,
    provider: binding.provider,
    model: binding.model,
  }));
  const hostModelDecision = {
    traceId,
    decisionId,
    selectedBindingId,
    selectedProvider: selectedBinding.provider,
    selectedModel: selectedBinding.model,
    agentId: originalAgent.id,
    authorizedBindings,
  };

  return {
    ...selected,
    ...(decision.modelParameters
      ? {
          model_parameters: {
            ...(selected.model_parameters ?? {}),
            ...decision.modelParameters,
          },
        }
      : {}),
    hostModelDecision,
  };
}
module.exports = { resolveHostModelRouting };
