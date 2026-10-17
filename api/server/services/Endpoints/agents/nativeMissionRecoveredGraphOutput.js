'use strict';

/**
 * Read the real, terminal LangGraph checkpoint's task outputs.
 *
 * Multi-agent native graphs persist the explicit agentOutputs channel. A
 * one-task StandardGraph in the pinned SDK persists its final AIMessage in
 * messages instead; it never allocates agentOutputs. Only a previously
 * attested ORIGINAL model-only single task may use that fallback. Never
 * manufacture an output from request text, a tool result, or Redis metadata.
 */
function readNativeMissionRecoveredGraphOutputs({ state, plan, originalModelOnly }) {
  if (
    !state ||
    typeof state !== 'object' ||
    !Array.isArray(state.next) ||
    state.next.length !== 0 ||
    !Array.isArray(state.tasks) ||
    state.tasks.length !== 0 ||
    !Array.isArray(plan?.tasks) ||
    plan.tasks.length === 0
  ) {
    throw new Error('NATIVE_RECOVERY_ORACLE_GRAPH_NOT_TERMINAL');
  }
  const explicit = state.values?.agentOutputs;
  if (explicit != null) {
    if (typeof explicit !== 'object' || Array.isArray(explicit)) {
      throw new Error('NATIVE_RECOVERY_ORACLE_OUTPUTS_INVALID');
    }
    return explicit;
  }
  if (
    originalModelOnly !== true ||
    plan.tasks.length !== 1 ||
    typeof plan.tasks[0]?.nodeId !== 'string' ||
    !plan.tasks[0].nodeId ||
    !Array.isArray(state.values?.messages)
  ) {
    throw new Error('NATIVE_RECOVERY_ORACLE_GRAPH_NOT_TERMINAL');
  }
  const messages = state.values.messages;
  const last = messages[messages.length - 1];
  let type;
  try {
    type = typeof last?._getType === 'function' ? last._getType() : last?.type;
  } catch {
    throw new Error('NATIVE_RECOVERY_ORACLE_OUTPUTS_INVALID');
  }
  if (
    type !== 'ai' ||
    typeof last?.content !== 'string' ||
    !last.content.trim() ||
    (last.tool_calls?.length ?? 0) > 0 ||
    (last.invalid_tool_calls?.length ?? 0) > 0 ||
    (last.additional_kwargs?.tool_calls?.length ?? 0) > 0 ||
    (last.tool_call_chunks?.length ?? 0) > 0
  ) {
    throw new Error('NATIVE_RECOVERY_ORACLE_OUTPUTS_INVALID');
  }
  // Only return content from a checkpointed AIMessage produced by the single
  // planned standard graph task. No new persistence or grant occurs here.
  return Object.freeze({
    [plan.tasks[0].nodeId]: Object.freeze({ content: last.content }),
  });
}

module.exports = { readNativeMissionRecoveredGraphOutputs };
