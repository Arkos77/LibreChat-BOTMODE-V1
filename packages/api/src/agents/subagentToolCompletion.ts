import type { SubagentUpdateEvent } from '@librechat/agents';

export interface SubagentToolCompletion {
  taskId: string;
  toolCallId: string;
  toolName: string;
  executingAgentId?: string;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Native child progress projection. Raw args, output and artifacts never cross. */
export function projectSubagentToolCompletion(
  taskId: string,
  event: SubagentUpdateEvent,
): SubagentToolCompletion | undefined {
  const nativeTaskId = nonEmpty(taskId);
  if (nativeTaskId == null || event.phase !== 'run_step_completed') return undefined;
  const data = event.data as
    | { result?: { type?: unknown; tool_call?: { id?: unknown; name?: unknown } } }
    | undefined;
  if (data?.result?.type !== 'tool_call') return undefined;
  const toolCallId = nonEmpty(data.result.tool_call?.id);
  const toolName = nonEmpty(data.result.tool_call?.name);
  if (toolCallId == null || toolName == null) return undefined;
  let agentIdentity: unknown;
  if (event.subagentKind === 'graph') {
    agentIdentity = event.memberAgentId;
  } else if (event.subagentKind === 'agent') {
    agentIdentity = event.subagentAgentId;
  }
  const executingAgentId = nonEmpty(agentIdentity);
  return {
    taskId: nativeTaskId,
    toolCallId,
    toolName,
    ...(executingAgentId == null ? {} : { executingAgentId }),
  };
}
