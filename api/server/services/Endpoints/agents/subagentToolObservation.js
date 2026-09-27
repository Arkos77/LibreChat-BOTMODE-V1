const { createMtoEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

/** Operational provenance only. No tool output, criterion, value or verdict. */
function observeSubagentToolCompletion(completion, sink) {
  if (typeof completion?.traceId !== 'string' || completion.traceId.trim() === '') return null;
  if (typeof sink !== 'function') return null;
  try {
    const event = createMtoEvent(
      'OBSERVED',
      {
        traceId: completion.traceId.trim(),
        traceEventId: `tool:${completion.toolCallId}`,
        taskId: completion.taskId,
        ...(completion.executingAgentId == null ? {} : { agentId: completion.executingAgentId }),
      },
      'subagent-tool-completion',
      { toolCallId: completion.toolCallId, toolName: completion.toolName },
    );
    const sent = sink(event);
    if (sent != null) {
      void Promise.resolve(sent).catch((error) => {
        logger.warn('[BOT MODE P10] Failed to emit child tool observation', error);
      });
    }
    return event;
  } catch (error) {
    try {
      logger.warn('[BOT MODE P10] Failed to emit child tool observation', error);
    } catch (_) {
      // Observations must never affect task execution.
    }
    return null;
  }
}

module.exports = { observeSubagentToolCompletion };
