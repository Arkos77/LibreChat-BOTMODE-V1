const {
  createImprovementEvidenceContext,
  createToolEvidenceDistillRequest,
} = require('@librechat/api');

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ImprovementToolEvidence ${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

/**
 * Bridges a native LibreChat tool-end event into the pure P10 evidence
 * composition path. Only explicit host-owned identities are admitted.
 * Raw tool output, arguments and artifacts are intentionally excluded.
 */
function createImprovementToolEvidenceRequest({
  toolEndData,
  metadata,
  taskId,
  traceId,
  producerAgentId,
  candidate,
  declarations,
}) {
  const context = createImprovementEvidenceContext({
    toolName: requiredText('toolName', toolEndData?.output?.name),
    toolCallId: requiredText('toolCallId', toolEndData?.output?.tool_call_id),
    producerAgentId: requiredText('producerAgentId', producerAgentId),
    taskId: requiredText('taskId', taskId),
    toolAgentId: optionalText(metadata?.executingAgentId),
    traceId: optionalText(traceId),
    runId: optionalText(metadata?.run_id),
    threadId: optionalText(metadata?.thread_id),
  });

  return createToolEvidenceDistillRequest({
    taskId: context.taskId,
    producerAgentId: context.producerAgentId,
    candidate,
    toolName: context.toolName,
    toolCallId: context.toolCallId,
    ...(context.toolAgentId == null ? {} : { toolAgentId: context.toolAgentId }),
    ...(context.runId == null ? {} : { runId: context.runId }),
    declarations,
  });
}

module.exports = { createImprovementToolEvidenceRequest };
