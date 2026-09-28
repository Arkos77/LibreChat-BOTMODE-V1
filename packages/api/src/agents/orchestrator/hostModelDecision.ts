import type { AgentInputs } from '@librechat/agents';
import { createDecisionRecord, fromDecisionRecord, type DecisionRecord } from './decision';
import { routeAuthorizedModelBindings, type AuthorizedModelCandidate } from './routing';

type Input = {
  agentId: string;
  provider: string;
  currentModel: string;
  resolvedOptions: Record<string, unknown>;
  resolvedAlternatives: ReadonlyArray<{ model: string; options: Record<string, unknown> }>;
  authorizedModels: readonly string[];
  availableModels: readonly string[];
  preferredModel?: string;
  traceId: string;
  timestamp: string;
  decisionId: string;
  traceEventId: string;
};

/** A host-authorized OpenRouter pool; selection never grants access or schedules an SDK fallback. */
export async function decideHostModel(input: Input): Promise<{
  selectedModel: string;
  modelParameters: Record<string, unknown>;
  record: DecisionRecord;
  event: ReturnType<typeof fromDecisionRecord>;
}> {
  const { authorizedModels, currentModel, resolvedOptions, preferredModel } = input;
  if (input.provider.toLowerCase() !== 'openrouter') {
    throw new Error('Host model selection supports only an OpenRouter endpoint');
  }
  if (!input.agentId || !input.traceId || !input.decisionId || !input.traceEventId) {
    throw new Error('Host model decision requires agent, trace and decision identities');
  }
  if (
    authorizedModels.length < 2 ||
    authorizedModels.length > 4 ||
    authorizedModels.some((m) => !m)
  ) {
    throw new Error('Host model decision requires two to four authorized models');
  }
  if (new Set(authorizedModels).size !== authorizedModels.length) {
    throw new Error('Host model decision contains duplicate models');
  }
  if (authorizedModels[0] !== currentModel || resolvedOptions.model !== currentModel) {
    throw new Error('Host model decision must include the resolved current model first');
  }
  if (!authorizedModels.includes(preferredModel ?? currentModel)) {
    throw new Error('Preferred model is not authorized');
  }
  if (authorizedModels.some((model) => !input.availableModels.includes(model))) {
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
  if (
    [...optionsByModel.values()].some(
      (options) => Array.isArray(options.fallbacks) && options.fallbacks.length > 0,
    )
  ) {
    throw new Error('Host model decision rejects hidden native fallbacks');
  }
  const candidates: AuthorizedModelCandidate[] = authorizedModels.map((model) => ({
    id: model,
    executionMode: 'model',
    providerId: input.provider,
    modelId: model,
    signals: { available: true },
    binding: {
      agentId: input.agentId,
      provider: 'openrouter',
      clientOptions: optionsByModel.get(model),
    } as unknown as AgentInputs,
  }));
  const selected = preferredModel ?? currentModel;
  const routing = await routeAuthorizedModelBindings(
    candidates,
    {},
    {
      id: 'RuleDecisionProvider',
      decide: () => [selected],
    },
  );
  const record = createDecisionRecord({
    decisionId: input.decisionId,
    question: 'Which authorized model should this agent use?',
    options: authorizedModels.map((model) => ({
      id: model,
      description: 'Host-authorized OpenRouter model',
    })),
    selectedOption: routing.selectedCandidateId,
    provider: 'RuleDecisionProvider',
    context: { traceId: input.traceId, agentId: input.agentId },
    timestamp: input.timestamp,
  });
  const event = fromDecisionRecord(record, input.traceEventId);
  // Do not install the router's native fallbacks: each later model invocation
  // needs its own budget/authorization check before it may execute.
  return {
    selectedModel: routing.selectedCandidateId,
    modelParameters: { ...optionsByModel.get(routing.selectedCandidateId) },
    record,
    event,
  };
}
