const { createToolEvidenceDistillRequest } = require('@librechat/api');

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ImprovementToolEvidence ${name} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Host-owned normalization seam for an already-observed native tool-end event.
 * It preserves native identities and explicit declarations only; it does not
 * inspect raw tool content/artifacts or invoke Oracle.
 */
function createImprovementToolEvidenceRequest({
  toolEndData,
  metadata,
  taskId,
  producerAgentId,
  candidate,
  declarations,
}) {
  const toolName = requiredText('toolName', toolEndData?.output?.name);
  const toolCallId = requiredText('toolCallId', toolEndData?.output?.tool_call_id);
  const executingAgentId =
    typeof metadata?.executingAgentId === 'string' && metadata.executingAgentId.trim() !== ''
      ? metadata.executingAgentId.trim()
      : undefined;
  const runId =
    typeof metadata?.run_id === 'string' && metadata.run_id.trim() !== ''
      ? metadata.run_id.trim()
      : undefined;

  return createToolEvidenceDistillRequest({
    taskId,
    producerAgentId,
    candidate,
    toolName,
    toolCallId,
    ...(executingAgentId == null ? {} : { toolAgentId: executingAgentId }),
    ...(runId == null ? {} : { runId }),
    declarations,
  });
}

module.exports = { createImprovementToolEvidenceRequest };
