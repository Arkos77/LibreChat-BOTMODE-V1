const {
  createDistillValidationRequest,
  createImprovementDisposition,
  deterministicOracle,
  fromOracleEvent,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function warnObservation(error) {
  try {
    logger.warn('[BOT MODE P10] Failed to emit Oracle observation', error);
  } catch (_) {
    // Logging is observational.
  }
}

/** QA for a persisted, typed native child step limit. Never authorizes a mutation. */
async function validateStepLimitImprovementCandidate({
  candidate,
  traceId,
  taskId,
  producerAgentId,
  responseMessageId,
  user,
  tenantId,
  persistLifecycleEvent,
  mtoEventSink,
}) {
  const nativeTaskId = nonEmpty(taskId);
  const producer = nonEmpty(producerAgentId);
  const trace = nonEmpty(traceId);
  const response = nonEmpty(responseMessageId);
  if (
    !nativeTaskId ||
    !producer ||
    !trace ||
    !response ||
    response !== `${nativeTaskId}:assistant` ||
    candidate?.target !== 'workflow' ||
    candidate.status !== 'CANDIDATE' ||
    candidate.traceId !== trace ||
    candidate.candidateId !== `workflow-step-limit:${trace}:${nativeTaskId}` ||
    !candidate.traceEventIds?.includes(`step-limit:${response}`) ||
    candidate.publication?.path !== 'proposal-only' ||
    !user ||
    typeof persistLifecycleEvent !== 'function'
  )
    return null;

  const scope = {
    user,
    ...(nonEmpty(tenantId) == null ? {} : { tenantId: nonEmpty(tenantId) }),
  };
  const context = {
    traceId: trace,
    taskId: nativeTaskId,
  };
  const emit = (event) => {
    if (typeof mtoEventSink !== 'function') return;
    try {
      const sent = mtoEventSink(
        fromOracleEvent(event, {
          ...context,
          traceEventId: `oracle:${candidate.candidateId}:${event.phase.toLowerCase()}`,
        }),
      );
      if (sent != null) {
        void Promise.resolve(sent).catch((error) => {
          warnObservation(error);
        });
      }
    } catch (error) {
      warnObservation(error);
    }
  };
  const record = (type, actorType, actorId) =>
    persistLifecycleEvent({
      ...scope,
      event: {
        eventId: `${type.toLowerCase()}:${candidate.candidateId}`,
        candidateId: candidate.candidateId,
        traceId: trace,
        type,
        actor: { id: actorId, type: actorType },
        occurredAt: candidate.createdAt,
      },
    });

  try {
    const request = createDistillValidationRequest({
      taskId: nativeTaskId,
      producerAgentId: producer,
      candidate,
      evidence: [
        {
          id: `native-step-limit:${response}`,
          criterionId: 'target',
          value: 'workflow',
          source: { id: response, type: 'source' },
        },
      ],
    });
    await record('VALIDATING', 'host', 'librechat:native-step-limit');
    emit({ phase: 'VALIDATING', input: request.oracleInput });
    const verdict = await deterministicOracle.validate(request.oracleInput);
    const decision = {
      VERIFIED: 'ACCEPT',
      REJECTED: 'REJECT',
      UNKNOWN: 'DEFER',
      HUMAN_REVIEW: 'REQUEST_HUMAN_REVIEW',
    }[verdict.status];
    const terminal = { phase: verdict.status, verdict, decision };
    await record(verdict.status, 'oracle', verdict.validator.id);
    emit(terminal);
    const disposition = createImprovementDisposition({ candidate, oracle: terminal });
    if (disposition.disposition === 'PROPOSAL_ONLY') {
      await record('PROPOSAL_ONLY', 'host', 'librechat:improvement-disposition');
    }
    return disposition;
  } catch (error) {
    try {
      logger.warn('[BOT MODE P10] Failed to validate durable child improvement', error);
    } catch (_) {
      // QA observation never changes the already-durable terminal result.
    }
    return null;
  }
}

module.exports = { validateStepLimitImprovementCandidate };
