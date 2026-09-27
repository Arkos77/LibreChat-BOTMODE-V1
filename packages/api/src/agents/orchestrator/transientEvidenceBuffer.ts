export interface TransientToolEvidenceObservationInput {
  toolCallId: string;
  toolName: string;
  producerAgentId: string;
  toolAgentId?: string;
  taskId?: string;
  traceId?: string;
  runId?: string;
  threadId?: string;
  criterionId?: string;
  value?: string | number | boolean | null;
}

export interface TransientToolEvidenceObservation {
  source: 'native_tool_end';
  toolCallId: string;
  toolName: string;
  producerAgentId: string;
  toolAgentId?: string;
  taskId?: string;
  traceId?: string;
  runId?: string;
  threadId?: string;
  criterionId?: string;
  value?: string | number | boolean | null;
}

export interface TransientEvidenceBuffer {
  readonly capacity: number;
  append(input: TransientToolEvidenceObservationInput): TransientToolEvidenceObservation;
  snapshot(): readonly TransientToolEvidenceObservation[];
  consume(): readonly TransientToolEvidenceObservation[];
  clear(): void;
  readonly size: number;
}

const DEFAULT_CAPACITY = 32;
const MAX_CAPACITY = 256;

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`TransientEvidenceBuffer ${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

function normalizeCapacity(capacity: number | undefined): number {
  if (capacity == null) {
    return DEFAULT_CAPACITY;
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new Error(
      `TransientEvidenceBuffer capacity must be an integer between 1 and ${MAX_CAPACITY}`,
    );
  }
  return capacity;
}

function observationKey(observation: TransientToolEvidenceObservation): string {
  return JSON.stringify([observation.taskId ?? null, observation.toolCallId]);
}

function cloneObservation(
  observation: TransientToolEvidenceObservation,
): TransientToolEvidenceObservation {
  return { ...observation };
}

function createObservation(
  input: TransientToolEvidenceObservationInput,
): TransientToolEvidenceObservation {
  const toolCallId = requiredText('toolCallId', input.toolCallId);
  const toolName = requiredText('toolName', input.toolName);
  const producerAgentId = requiredText('producerAgentId', input.producerAgentId);
  const toolAgentId = optionalText(input.toolAgentId);
  const taskId = optionalText(input.taskId);
  const traceId = optionalText(input.traceId);
  const runId = optionalText(input.runId);
  const threadId = optionalText(input.threadId);
  const criterionId = optionalText(input.criterionId);

  return {
    source: 'native_tool_end',
    toolCallId,
    toolName,
    producerAgentId,
    ...(toolAgentId == null ? {} : { toolAgentId }),
    ...(taskId == null ? {} : { taskId }),
    ...(traceId == null ? {} : { traceId }),
    ...(runId == null ? {} : { runId }),
    ...(threadId == null ? {} : { threadId }),
    ...(criterionId == null ? {} : { criterionId }),
    ...(input.value === undefined ? {} : { value: input.value }),
  };
}

/**
 * Request/run-local observation buffer only. It is deliberately in-memory,
 * bounded, append-only until consume/clear, and carries no Oracle verdict,
 * authorization, publication state, raw tool output, arguments or reasoning.
 */
export function createTransientEvidenceBuffer(capacity?: number): TransientEvidenceBuffer {
  const normalizedCapacity = normalizeCapacity(capacity);
  const observations: TransientToolEvidenceObservation[] = [];
  const seenToolCalls = new Set<string>();

  return {
    capacity: normalizedCapacity,

    append(input) {
      const observation = createObservation(input);
      const key = observationKey(observation);
      if (seenToolCalls.has(key)) {
        return cloneObservation(
          observations.find(
            (item) => observationKey(item) === key,
          ) as TransientToolEvidenceObservation,
        );
      }

      observations.push(observation);
      seenToolCalls.add(key);
      if (observations.length > normalizedCapacity) {
        const removed = observations.shift();
        if (removed != null) {
          seenToolCalls.delete(observationKey(removed));
        }
      }
      return cloneObservation(observation);
    },

    snapshot() {
      return observations.map(cloneObservation);
    },

    consume() {
      const result = observations.map(cloneObservation);
      observations.length = 0;
      seenToolCalls.clear();
      return result;
    },

    clear() {
      observations.length = 0;
      seenToolCalls.clear();
    },

    get size() {
      return observations.length;
    },
  };
}
