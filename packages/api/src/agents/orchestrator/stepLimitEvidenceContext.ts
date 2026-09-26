export interface StepLimitEvidenceContextInput {
  traceId: string;
  responseMessageId: string;
  taskId?: string;
  producerAgentId?: string;
  toolCallId?: string;
  toolName?: string;
  toolAgentId?: string;
  runId?: string;
  threadId?: string;
}

export interface StepLimitEvidenceContext {
  source: 'native_step_limit';
  signal: 'tool_call_limit';
  traceId: string;
  responseMessageId: string;
  taskId?: string;
  producerAgentId?: string;
  toolCallId?: string;
  toolName?: string;
  toolAgentId?: string;
  runId?: string;
  threadId?: string;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`StepLimitEvidenceContext ${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

/**
 * Builds a bounded step-limit observation from explicit host-owned identities.
 * Optional identities remain absent when unavailable and are never derived from
 * trace, task, response, run, thread, tool-call or agent identifiers.
 */
export function createStepLimitEvidenceContext(
  input: StepLimitEvidenceContextInput,
): StepLimitEvidenceContext {
  const traceId = requiredText('traceId', input.traceId);
  const responseMessageId = requiredText('responseMessageId', input.responseMessageId);
  const taskId = optionalText(input.taskId);
  const producerAgentId = optionalText(input.producerAgentId);
  const toolCallId = optionalText(input.toolCallId);
  const toolName = optionalText(input.toolName);
  const toolAgentId = optionalText(input.toolAgentId);
  const runId = optionalText(input.runId);
  const threadId = optionalText(input.threadId);

  return {
    source: 'native_step_limit',
    signal: 'tool_call_limit',
    traceId,
    responseMessageId,
    ...(taskId == null ? {} : { taskId }),
    ...(producerAgentId == null ? {} : { producerAgentId }),
    ...(toolCallId == null ? {} : { toolCallId }),
    ...(toolName == null ? {} : { toolName }),
    ...(toolAgentId == null ? {} : { toolAgentId }),
    ...(runId == null ? {} : { runId }),
    ...(threadId == null ? {} : { threadId }),
  };
}
