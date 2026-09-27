const {
  createMtoEvent,
  createImprovementCandidate,
  createStepLimitEvidenceContext,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

/**
 * Convert the native, explicit tool-call-limit terminal signal into a bounded
 * workflow improvement proposal and persist its immutable snapshot before
 * exposing the CANDIDATE observation. Persistence remains auxiliary to the
 * already-durable terminal response: a store failure is contained and returns
 * null rather than changing terminal execution.
 */
async function observeStepLimitImprovementCandidate({
  traceId,
  responseMessageId,
  taskId,
  eventActorTaskId,
  producerAgentId,
  user,
  tenantId,
  conversationId,
  createdAt,
  persistCandidate,
  mtoEventSink,
}) {
  if (typeof traceId !== 'string' || traceId.trim() === '') {
    return null;
  }
  if (typeof responseMessageId !== 'string' || responseMessageId.trim() === '') {
    return null;
  }
  if (user == null || (typeof user === 'string' && user.trim() === '')) {
    return null;
  }
  if (typeof conversationId !== 'string' || conversationId.trim() === '') {
    return null;
  }
  if (typeof persistCandidate !== 'function') {
    return null;
  }

  try {
    const normalizedTraceId = traceId.trim();
    const normalizedResponseMessageId = responseMessageId.trim();
    const normalizedConversationId = conversationId.trim();
    const timestamp = createdAt ?? new Date().toISOString();
    const stepLimitContext = createStepLimitEvidenceContext({
      traceId: normalizedTraceId,
      responseMessageId: normalizedResponseMessageId,
      ...(typeof taskId === 'string' && taskId.trim() !== '' ? { taskId: taskId.trim() } : {}),
      ...(typeof producerAgentId === 'string' && producerAgentId.trim() !== ''
        ? { producerAgentId: producerAgentId.trim() }
        : {}),
    });

    const observation = createMtoEvent(
      'OBSERVED',
      {
        traceId: stepLimitContext.traceId,
        traceEventId: `step-limit:${stepLimitContext.responseMessageId}`,
        ...(stepLimitContext.taskId == null ? {} : { taskId: stepLimitContext.taskId }),
        timestamp,
      },
      'host',
      { signal: stepLimitContext.signal },
    );
    const candidate = createImprovementCandidate({
      candidateId: `workflow-step-limit:${stepLimitContext.traceId}${stepLimitContext.taskId == null ? '' : `:${stepLimitContext.taskId}`}`,
      target: 'workflow',
      title: 'Review workflow after tool call limit',
      summary:
        'The generation exhausted its native per-turn tool-call budget before completion; review workflow structure or bounded execution policy before changing limits.',
      traceId: stepLimitContext.traceId,
      observations: [observation],
      createdAt: timestamp,
    });

    await persistCandidate({
      user,
      ...(typeof tenantId === 'string' && tenantId.trim() !== ''
        ? { tenantId: tenantId.trim() }
        : {}),
      conversationId: normalizedConversationId,
      candidate,
    });

    logger.debug('[BOT MODE P10] durable workflow improvement candidate', candidate);
    if (typeof mtoEventSink === 'function') {
      try {
        await mtoEventSink(
          createMtoEvent(
            'CANDIDATE',
            {
              traceId: stepLimitContext.traceId,
              traceEventId: `candidate:${candidate.candidateId}`,
              causedByTraceEventId: observation.identity.traceEventId,
              ...(stepLimitContext.taskId == null ? {} : { taskId: stepLimitContext.taskId }),
              ...(typeof eventActorTaskId === 'string' && eventActorTaskId.trim() !== ''
                ? { eventActorTaskId: eventActorTaskId.trim() }
                : {}),
              ...(stepLimitContext.producerAgentId == null
                ? {}
                : { agentId: stepLimitContext.producerAgentId }),
              timestamp,
            },
            'host',
          ),
        );
      } catch (error) {
        try {
          logger.warn(
            '[BOT MODE P10] Failed to emit durable workflow improvement candidate observation',
            error,
          );
        } catch (_) {
          // MTO observation must never affect the durable candidate or terminal execution.
        }
      }
    }
    return candidate;
  } catch (error) {
    try {
      logger.warn('[BOT MODE P10] Failed to persist workflow improvement candidate', error);
    } catch (_) {
      // Candidate persistence must never affect the already-durable terminal response.
    }
    return null;
  }
}

module.exports = {
  observeStepLimitImprovementCandidate,
};
