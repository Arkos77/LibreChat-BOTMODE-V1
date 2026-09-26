const { createMtoEvent, createImprovementCandidate } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

/**
 * Convert the native, explicit tool-call-limit terminal signal into a bounded
 * workflow improvement proposal. This is observation/proposal only: it does
 * not invoke Oracle, authorize anything, mutate runtime limits, publish an
 * improvement, persist a candidate, or settle task state.
 */
function observeStepLimitImprovementCandidate({
  traceId,
  responseMessageId,
  createdAt,
  mtoEventSink,
}) {
  if (typeof traceId !== 'string' || traceId.trim() === '') {
    return null;
  }
  if (typeof responseMessageId !== 'string' || responseMessageId.trim() === '') {
    return null;
  }

  try {
    const normalizedTraceId = traceId.trim();
    const normalizedResponseMessageId = responseMessageId.trim();
    const timestamp = createdAt ?? new Date().toISOString();
    const observation = createMtoEvent(
      'OBSERVED',
      {
        traceId: normalizedTraceId,
        traceEventId: `step-limit:${normalizedResponseMessageId}`,
        timestamp,
      },
      'host',
      { signal: 'tool_call_limit' },
    );
    const candidate = createImprovementCandidate({
      candidateId: `workflow-step-limit:${normalizedTraceId}`,
      target: 'workflow',
      title: 'Review workflow after tool call limit',
      summary:
        'The generation exhausted its native per-turn tool-call budget before completion; review workflow structure or bounded execution policy before changing limits.',
      traceId: normalizedTraceId,
      observations: [observation],
      createdAt: timestamp,
    });

    logger.debug('[BOT MODE P10] workflow improvement candidate', candidate);
    if (typeof mtoEventSink === 'function') {
      try {
        mtoEventSink(
          createMtoEvent(
            'CANDIDATE',
            {
              traceId: normalizedTraceId,
              traceEventId: `candidate:${candidate.candidateId}`,
              causedByTraceEventId: observation.identity.traceEventId,
              timestamp,
            },
            'host',
          ),
        );
      } catch (error) {
        try {
          logger.warn(
            '[BOT MODE P10] Failed to emit workflow improvement candidate observation',
            error,
          );
        } catch (_) {
          // MTO observation must never affect candidate creation or terminal execution.
        }
      }
    }
    return candidate;
  } catch (error) {
    try {
      logger.warn('[BOT MODE P10] Failed to create workflow improvement candidate', error);
    } catch (_) {
      // Candidate observation must never affect terminal response persistence.
    }
    return null;
  }
}

module.exports = {
  observeStepLimitImprovementCandidate,
};
