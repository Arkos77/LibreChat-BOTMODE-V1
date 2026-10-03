import type { AgentInputs } from '@librechat/agents';
import { createDecisionRecord, fromDecisionRecord, type DecisionRecord } from './decision';
import { routeAuthorizedModelBindings, type AuthorizedModelCandidate } from './routing';

type LegacyInput = {
  agentId: string;
  provider: string;
  currentModel: string;
  resolvedOptions: Record<string, unknown>;
  resolvedContextWindow?: number;
  resolvedAlternatives: ReadonlyArray<{
    model: string;
    options: Record<string, unknown>;
    contextWindow?: number;
  }>;
  authorizedModels: readonly string[];
  availableModels: readonly string[];
  preferredModel?: string;
  routingConstraints?: import('./routing').RoutingConstraints;
  routingSignals?: Record<string, import('./routing').AuthorizedResourceSignals>;
  allowFailover?: boolean;
  traceId: string;
  timestamp: string;
  decisionId: string;
  traceEventId: string;
};

type BindingInput = {
  agentId: string;
  bindings: ReadonlyArray<{
    id: string;
    provider: string;
    model: string;
    options: Record<string, unknown>;
    contextWindow?: number;
    signals?: import('./routing').AuthorizedResourceSignals;
  }>;
  preferredBindingId?: string;
  routingConstraints?: import('./routing').RoutingConstraints;
  allowFailover?: boolean;
  traceId: string;
  timestamp: string;
  decisionId: string;
  traceEventId: string;
};

type Input = LegacyInput | BindingInput;

type NormalizedBinding = {
  id: string;
  provider: string;
  model: string;
  options: Record<string, unknown>;
  contextWindow?: number;
};

function hasBindingInput(input: Input): input is BindingInput {
  return 'bindings' in input;
}

function normalizeBindings(input: Input): {
  bindings: NormalizedBinding[];
  preferredBindingId?: string;
  routingConstraints?: import('./routing').RoutingConstraints;
  allowFailover: boolean;
} {
  if (hasBindingInput(input)) {
    const bindings = input.bindings.map((binding) => ({
      id: binding.id,
      provider: binding.provider,
      model: binding.model,
      options: binding.options,
      contextWindow: binding.contextWindow,
      signals: binding.signals,
    }));
    if (
      bindings.length < 2 ||
      bindings.length > 4 ||
      bindings.some(
        (binding) =>
          !binding.id ||
          !binding.provider ||
          !binding.model ||
          binding.options?.model !== binding.model,
      )
    ) {
      throw new Error('Host model decision requires two to four resolved bindings');
    }
    if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length) {
      throw new Error('Host model decision contains duplicate binding ids');
    }
    if (
      bindings.some(
        (binding) =>
          Array.isArray(binding.options.fallbacks) && binding.options.fallbacks.length > 0,
      )
    ) {
      throw new Error('Host model decision rejects hidden native fallbacks');
    }
    const preferredBindingId = input.preferredBindingId;
    if (
      preferredBindingId != null &&
      !bindings.some((binding) => binding.id === preferredBindingId)
    ) {
      throw new Error('Preferred binding is not authorized');
    }
    return {
      bindings,
      preferredBindingId,
      routingConstraints: input.routingConstraints,
      allowFailover: input.allowFailover === true,
    };
  }

  const {
    authorizedModels,
    currentModel,
    resolvedOptions,
    preferredModel,
    provider,
    availableModels,
    routingConstraints,
    allowFailover = false,
  } = input;
  if (provider.toLowerCase() !== 'openrouter') {
    throw new Error('Host model selection supports only an OpenRouter endpoint');
  }
  if (
    authorizedModels.length < 2 ||
    authorizedModels.length > 4 ||
    authorizedModels.some((model) => !model)
  ) {
    throw new Error('Host model decision requires two to four authorized models');
  }
  if (new Set(authorizedModels).size !== authorizedModels.length) {
    throw new Error('Host model decision contains duplicate models');
  }
  if (authorizedModels[0] !== currentModel || resolvedOptions.model !== currentModel) {
    throw new Error('Host model decision must include the resolved current model first');
  }
  if (preferredModel != null && !authorizedModels.includes(preferredModel)) {
    throw new Error('Preferred model is not authorized');
  }
  if (authorizedModels.some((model) => !availableModels.includes(model))) {
    throw new Error('Authorized model is not available');
  }
  if (input.resolvedAlternatives.length !== authorizedModels.length - 1) {
    throw new Error('Every alternative needs a separately resolved binding');
  }
  const optionsByModel = new Map<string, Record<string, unknown>>([
    [currentModel, resolvedOptions],
    ...input.resolvedAlternatives.map(({ model, options }): [string, Record<string, unknown>] => [
      model,
      options,
    ]),
  ]);
  if (
    optionsByModel.size !== authorizedModels.length ||
    authorizedModels.some((model) => optionsByModel.get(model)?.model !== model)
  ) {
    throw new Error('Alternative model binding mismatch');
  }
  const contextByModel = new Map<string, number | undefined>([
    [currentModel, input.resolvedContextWindow],
    ...input.resolvedAlternatives.map(
      ({ model, contextWindow }) => [model, contextWindow] as const,
    ),
  ]);
  const bindings = authorizedModels.map((model) => ({
    id: model,
    provider,
    model,
    options: optionsByModel.get(model)!,
    contextWindow: contextByModel.get(model),
  }));
  if (
    bindings.some(
      (binding) => Array.isArray(binding.options.fallbacks) && binding.options.fallbacks.length > 0,
    )
  ) {
    throw new Error('Host model decision rejects hidden native fallbacks');
  }
  return { bindings, preferredBindingId: preferredModel, routingConstraints, allowFailover };
}

/** A host-authorized model pool; selection never grants access. Controlled SDK failover is opt-in and binding-scoped. */
export async function decideHostModel(input: Input): Promise<{
  selectedBindingId: string;
  selectedProvider: string;
  selectedModel: string;
  modelParameters: Record<string, unknown>;
  record: DecisionRecord;
  event: ReturnType<typeof fromDecisionRecord>;
}> {
  if (!input.agentId || !input.traceId || !input.decisionId || !input.traceEventId) {
    throw new Error('Host model decision requires agent, trace and decision identities');
  }

  const { bindings, preferredBindingId, routingConstraints, allowFailover } =
    normalizeBindings(input);
  const candidates: AuthorizedModelCandidate[] = bindings.map((binding) => ({
    id: binding.id,
    executionMode: 'model',
    providerId: binding.provider,
    modelId: binding.model,
    signals: {
      available: true,
      ...(binding.signals ?? (hasBindingInput(input) ? {} : input.routingSignals?.[binding.id])),
      ...(binding.contextWindow != null &&
      Number.isFinite(binding.contextWindow) &&
      binding.contextWindow > 0
        ? { contextWindow: binding.contextWindow }
        : {}),
    },
    binding: {
      agentId: input.agentId,
      provider: binding.provider,
      clientOptions: binding.options,
    } as unknown as AgentInputs,
  }));
  const routing = await routeAuthorizedModelBindings(
    candidates,
    { constraints: routingConstraints },
    {
      id: 'RuleDecisionProvider',
      decide: () => (preferredBindingId == null ? [] : [preferredBindingId]),
    },
  );
  const selected = bindings.find((binding) => binding.id === routing.selectedCandidateId);
  if (!selected) {
    throw new Error('Selected host model binding is unavailable');
  }
  const record = createDecisionRecord({
    decisionId: input.decisionId,
    question: 'Which authorized model binding should this agent use?',
    options: bindings.map((binding) => ({
      id: binding.id,
      description: 'Host-authorized model binding',
    })),
    selectedOption: routing.selectedCandidateId,
    provider: 'RuleDecisionProvider',
    context: { traceId: input.traceId, agentId: input.agentId },
    timestamp: input.timestamp,
  });
  const event = fromDecisionRecord(record, input.traceEventId);
  // Native fallbacks are installed only when the host explicitly enables controlled failover.
  // Every fallback is already resolved/authorized and inherits binding-specific admission callbacks.
  return {
    selectedBindingId: selected.id,
    selectedProvider: selected.provider,
    selectedModel: selected.model,
    modelParameters: {
      ...selected.options,
      ...(allowFailover
        ? {
            fallbacks: routing.orderedCandidateIds
              .filter((id) => id !== selected.id)
              .map((id) => {
                const binding = bindings.find((item) => item.id === id)!;
                return {
                  provider: binding.provider,
                  clientOptions: { ...binding.options },
                  ...(binding.contextWindow != null
                    ? { maxContextTokens: binding.contextWindow }
                    : {}),
                };
              }),
          }
        : {}),
    },
    record,
    event,
  };
}
