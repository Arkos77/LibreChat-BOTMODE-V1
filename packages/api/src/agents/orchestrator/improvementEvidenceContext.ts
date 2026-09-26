export interface ImprovementEvidenceContextInput {
  toolCallId: string;
  toolName: string;
  producerAgentId: string;
  toolAgentId?: string;
  taskId?: string;
  traceId?: string;
  runId?: string;
  threadId?: string;
}

export interface ImprovementEvidenceContext {
  source: 'native_tool_end';
  toolCallId: string;
  toolName: string;
  producerAgentId: string;
  toolAgentId?: string;
  taskId?: string;
  traceId?: string;
  runId?: string;
  threadId?: string;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ImprovementEvidenceContext ${name} must be a non-empty string`);
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
 * Builds a bounded observation context only from host-supplied native identities.
 * It never derives task, trace, run, thread, producer or checker identity from
 * another identifier and never inspects raw tool output or reasoning.
 */
export function createImprovementEvidenceContext(
  input: ImprovementEvidenceContextInput,
): ImprovementEvidenceContext {
  const toolCallId = requiredText('toolCallId', input.toolCallId);
  const toolName = requiredText('toolName', input.toolName);
  const producerAgentId = requiredText('producerAgentId', input.producerAgentId);
  const toolAgentId = optionalText(input.toolAgentId);
  const taskId = optionalText(input.taskId);
  const traceId = optionalText(input.traceId);
  const runId = optionalText(input.runId);
  const threadId = optionalText(input.threadId);

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
  };
}
