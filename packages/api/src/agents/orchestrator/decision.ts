import { createMtoEvent, type MtoEvent } from './mto';

export interface DecisionOption {
  id: string;
  description: string;
}

export interface DecisionContext {
  traceId: string;
  taskId?: string;
  agentId?: string;
  objective?: string;
  policyContext?: string;
}

export interface DecisionDistributionEntry {
  optionId: string;
  probability: number;
}

export interface DecisionRecord {
  decisionId: string;
  question: string;
  options: DecisionOption[];
  selectedOption: string;
  provider: string;
  model?: string;
  version?: string;
  confidence?: number;
  threshold?: number;
  distribution?: DecisionDistributionEntry[];
  context: DecisionContext;
  timestamp: string;
}

export function createDecisionRecord(input: DecisionRecord): DecisionRecord {
  if (
    typeof input.decisionId !== 'string' ||
    input.decisionId.trim() === '' ||
    typeof input.question !== 'string' ||
    input.question.trim() === '' ||
    typeof input.provider !== 'string' ||
    input.provider.trim() === ''
  ) {
    throw new Error('DecisionRecord requires decisionId, question and provider');
  }

  if (typeof input.context?.traceId !== 'string' || input.context.traceId.trim() === '') {
    throw new Error('DecisionRecord requires traceId');
  }

  const optionIds = new Set<string>();
  for (const option of input.options) {
    if (
      typeof option.id !== 'string' ||
      option.id.trim() === '' ||
      typeof option.description !== 'string' ||
      option.description.trim() === '' ||
      optionIds.has(option.id)
    ) {
      throw new Error('DecisionRecord requires unique non-empty options');
    }
    optionIds.add(option.id);
  }

  if (!optionIds.has(input.selectedOption)) {
    throw new Error('DecisionRecord selectedOption must be one of the options');
  }

  if (
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
  ) {
    throw new Error('DecisionRecord confidence must be between 0 and 1');
  }

  if (
    input.threshold !== undefined &&
    (!Number.isFinite(input.threshold) || input.threshold < 0 || input.threshold > 1)
  ) {
    throw new Error('DecisionRecord threshold must be between 0 and 1');
  }

  return {
    decisionId: input.decisionId,
    question: input.question,
    options: input.options.map(({ id, description }) => ({ id, description })),
    selectedOption: input.selectedOption,
    provider: input.provider,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
    ...(input.distribution === undefined
      ? {}
      : { distribution: validateDecisionDistribution(input.options, input.distribution) }),
    context: {
      traceId: input.context.traceId,
      ...(input.context.taskId === undefined ? {} : { taskId: input.context.taskId }),
      ...(input.context.agentId === undefined ? {} : { agentId: input.context.agentId }),
      ...(input.context.objective === undefined ? {} : { objective: input.context.objective }),
      ...(input.context.policyContext === undefined
        ? {}
        : { policyContext: input.context.policyContext }),
    },
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

export interface MtoDecisionObservation {
  decisionId: string;
  selectedOption: string;
  provider: string;
  confidence?: number;
}

export function fromDecisionRecord(
  input: DecisionRecord,
  traceEventId: string,
): MtoEvent<MtoDecisionObservation> {
  const record = createDecisionRecord(input);
  return createMtoEvent(
    'DECIDED',
    {
      traceId: record.context.traceId,
      traceEventId,
      taskId: record.context.taskId,
      agentId: record.context.agentId,
      timestamp: record.timestamp,
    },
    'host',
    {
      decisionId: record.decisionId,
      selectedOption: record.selectedOption,
      provider: record.provider,
      ...(record.confidence === undefined ? {} : { confidence: record.confidence }),
    },
  );
}

function validateDecisionDistribution(
  options: DecisionOption[],
  distribution: DecisionDistributionEntry[],
): DecisionDistributionEntry[] {
  if (!Array.isArray(distribution) || distribution.length !== options.length) {
    throw new Error('DecisionRecord distribution must cover every option');
  }
  const optionIds = new Set(options.map((option) => option.id));
  const seen = new Set<string>();
  let total = 0;
  const copy = distribution.map((entry) => {
    if (
      entry == null ||
      typeof entry.optionId !== 'string' ||
      !optionIds.has(entry.optionId) ||
      seen.has(entry.optionId) ||
      !Number.isFinite(entry.probability) ||
      entry.probability < 0 ||
      entry.probability > 1
    ) {
      throw new Error('DecisionRecord distribution contains an invalid option or probability');
    }
    seen.add(entry.optionId);
    total += entry.probability;
    return { optionId: entry.optionId, probability: entry.probability };
  });
  if (Math.abs(total - 1) > 1e-6) {
    throw new Error('DecisionRecord distribution probabilities must sum to one');
  }
  return copy;
}
